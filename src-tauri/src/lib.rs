// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize};

// 将 sgl_font_conv.exe 嵌入到主程序中（编译时嵌入到二进制中）
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
static SGL_FONT_CONV_EXE: &[u8] = include_bytes!("../binaries/sgl_font_conv-x86_64-pc-windows-msvc.exe");

#[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
static SGL_FONT_CONV_EXE: &[u8] = &[];

// 提取嵌入的 exe 到临时目录，返回 exe 路径
fn extract_embedded_exe() -> Result<std::path::PathBuf, String> {
    use std::io::Write;
    
    let temp_dir = std::env::temp_dir().join("sgltoolkit_sidecar");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
    
    let exe_path = temp_dir.join("sgl_font_conv.exe");
    
    // 如果已存在且大小匹配，直接返回（避免重复写入）
    if exe_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&exe_path) {
            if metadata.len() == SGL_FONT_CONV_EXE.len() as u64 {
                return Ok(exe_path);
            }
        }
    }
    
    let mut file = std::fs::File::create(&exe_path).map_err(|e| format!("创建临时文件失败: {}", e))?;
    file.write_all(SGL_FONT_CONV_EXE).map_err(|e| format!("写入临时文件失败: {}", e))?;
    
    Ok(exe_path)
}

#[derive(Deserialize)]
struct ZipFile {
    name: String,
    url: String,
}
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn run_shell_command(_app: tauri::AppHandle, cmd: String, args: Vec<String>) -> Result<String, String> {
    // 打印命令和参数，用于调试
    println!("Executing command: {} with args: {:?}", cmd, args);

    use std::process::Command;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    // 如果是 sgl_font_conv，从嵌入资源中提取 exe
    let exe_to_run = if cmd == "sgl_font_conv" || cmd == "sgl_font_conv.exe" {
        extract_embedded_exe()?
    } else {
        std::path::PathBuf::from(&cmd)
    };

    let mut command = Command::new(&exe_to_run);
    command.args(&args);

    // 设置环境变量，跳过Node.js平台检查
    command.env("NODE_SKIP_PLATFORM_CHECK", "1");

    // 在Windows上隐藏命令窗口
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = command
        .output()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("命令执行失败: {}\nStdout: {}\nStderr: {}",
            output.status, stdout, stderr))
    }
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("读取文件大小失败: {}", e))
}

// 移动/重命名文件（Windows 下目标已存在时直接覆盖）
#[tauri::command]
fn move_file(from: String, to: String) -> Result<(), String> {
    std::fs::rename(&from, &to)
        .map_err(|e| format!("覆盖目标文件失败: {}", e))
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    // 文件不存在时视为成功（清理临时文件的幂等处理）
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("删除文件失败: {}", e)),
    }
}

// ffmpeg 进度事件负载
#[derive(Clone, serde::Serialize)]
struct FfmpegProgressPayload {
    percent: f64,
    time_str: String,
}

// 解析 "HH:MM:SS.xx" 为秒数
fn parse_hms(s: &str) -> Option<f64> {
    let mut parts = s.trim().split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let sec: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + sec)
}

// 从 ffmpeg stderr 中解析 "Duration: 00:01:23.45"
fn parse_ffmpeg_duration(stderr: &str) -> Option<f64> {
    let start = stderr.find("Duration: ")? + "Duration: ".len();
    let raw = stderr.get(start..start + 11)?;
    if raw.starts_with("N/A") {
        return None;
    }
    parse_hms(raw)
}

// 从 ffmpeg 进度行中提取 time= 并向前端发送进度事件
fn emit_ffmpeg_progress(app: &tauri::AppHandle, segment: &[u8], total_secs: Option<f64>) {
    let text = String::from_utf8_lossy(segment);
    let idx = match text.find("time=") {
        Some(i) => i + 5,
        None => return,
    };
    let raw = text[idx..text.len().min(idx + 12)].trim();
    if let Some(secs) = parse_hms(raw) {
        let percent = match total_secs {
            Some(t) if t > 0.0 => ((secs / t) * 100.0).min(100.0),
            _ => 0.0,
        };
        use tauri::Emitter;
        let _ = app.emit(
            "ffmpeg-progress",
            FfmpegProgressPayload {
                percent,
                time_str: raw.to_string(),
            },
        );
    }
}

// 带实时进度的 ffmpeg 转换命令（流式读取 stderr 解析 time=）
#[tauri::command]
async fn run_ffmpeg_with_progress(app: tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let input_path = args
        .iter()
        .position(|a| a == "-i")
        .and_then(|i| args.get(i + 1))
        .cloned()
        .ok_or_else(|| "缺少输入文件参数(-i)".to_string())?;

    // 探测输入时长（ffmpeg -i 会因缺少其他参数报错，但 stderr 包含 Duration）
    let mut probe = Command::new("ffmpeg");
    probe.args(["-i", &input_path]);
    #[cfg(windows)]
    probe.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let probe_output = probe.output().map_err(|e| format!("启动 ffmpeg 失败: {}", e))?;
    let probe_stderr = String::from_utf8_lossy(&probe_output.stderr).to_string();
    let total_secs = parse_ffmpeg_duration(&probe_stderr);

    // 启动转换进程，管道捕获 stderr
    let mut convert = Command::new("ffmpeg");
    convert.args(&args).stdout(Stdio::null()).stderr(Stdio::piped());
    #[cfg(windows)]
    convert.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut child = convert.spawn().map_err(|e| format!("启动 ffmpeg 失败: {}", e))?;

    let stderr_pipe = child.stderr.take().ok_or("无法捕获 ffmpeg 输出")?;
    let mut reader = std::io::BufReader::new(stderr_pipe);

    let mut segment: Vec<u8> = Vec::new();
    let mut err_tail: Vec<u8> = Vec::new(); // 保留末尾输出用于错误报告
    let mut byte = [0u8; 1];
    loop {
        match reader.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                if byte[0] == b'\r' || byte[0] == b'\n' {
                    emit_ffmpeg_progress(&app, &segment, total_secs);
                    segment.clear();
                } else {
                    segment.push(byte[0]);
                }
                err_tail.extend_from_slice(&byte);
                if err_tail.len() > 4096 {
                    let cut = err_tail.len() - 4096;
                    err_tail.drain(..cut);
                }
            }
            Err(_) => break,
        }
    }

    let status = child.wait().map_err(|e| format!("等待 ffmpeg 退出失败: {}", e))?;
    if status.success() {
        Ok("转换完成".to_string())
    } else {
        Err(format!(
            "ffmpeg 退出码 {}: {}",
            status.code().unwrap_or(-1),
            String::from_utf8_lossy(&err_tail)
        ))
    }
}

#[tauri::command]
async fn read_file_as_base64(path: String) -> Result<String, String> {
    use std::fs;
    use base64::{Engine as _, engine::general_purpose};
    
    let content = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let base64 = general_purpose::STANDARD.encode(&content);
    Ok(base64)
}

#[tauri::command]
async fn save_file(_filename: String, _content: String) -> std::collections::HashMap<String, String> {
    let mut result = std::collections::HashMap::new();
    
    // 由于Tauri 2.0中api模块已被移除，我们直接返回错误，让前端降级到浏览器下载
    result.insert("success".to_string(), "false".to_string());
    result.insert("error".to_string(), "Tauri dialog API not available".to_string());
    
    result
}

#[tauri::command]
async fn write_file(path: String, content: String) -> std::collections::HashMap<String, String> {
    use std::fs;
    
    let mut result = std::collections::HashMap::new();
    
    match fs::write(&path, content) {
        Ok(_) => {
            result.insert("success".to_string(), "true".to_string());
            result.insert("path".to_string(), path);
        }
        Err(e) => {
            result.insert("success".to_string(), "false".to_string());
            result.insert("error".to_string(), format!("Failed to write file: {}", e));
        }
    }
    
    result
}

#[tauri::command]
async fn write_bin_file(path: String, content: String) -> std::collections::HashMap<String, String> {
    use std::fs;
    use base64::{Engine as _, engine::general_purpose};
    
    let mut result = std::collections::HashMap::new();
    
    // 解码base64字符串
    match general_purpose::STANDARD.decode(&content) {
        Ok(decoded) => {
            // 写入文件
            match fs::write(&path, decoded) {
                Ok(_) => {
                    result.insert("success".to_string(), "true".to_string());
                    result.insert("path".to_string(), path);
                }
                Err(e) => {
                    result.insert("success".to_string(), "false".to_string());
                    result.insert("error".to_string(), format!("Failed to write file: {}", e));
                }
            }
        }
        Err(e) => {
            result.insert("success".to_string(), "false".to_string());
            result.insert("error".to_string(), format!("Failed to decode base64: {}", e));
        }
    }
    
    result
}

#[tauri::command]
fn write_file_chunk(path: String, content: String, append: bool) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }

    let mut file = options
        .open(&path)
        .map_err(|e| format!("无法打开输出文件: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("无法写入输出文件: {}", e))?;
    file.flush()
        .map_err(|e| format!("无法刷新输出文件: {}", e))
}

#[tauri::command]
fn write_bin_file_chunk(path: String, content: String, append: bool) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    use std::fs::OpenOptions;
    use std::io::Write;

    let decoded = general_purpose::STANDARD
        .decode(content)
        .map_err(|e| format!("无法解码二进制数据块: {}", e))?;
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }

    let mut file = options
        .open(&path)
        .map_err(|e| format!("无法打开输出文件: {}", e))?;
    file.write_all(&decoded)
        .map_err(|e| format!("无法写入输出文件: {}", e))?;
    file.flush()
        .map_err(|e| format!("无法刷新输出文件: {}", e))
}

#[tauri::command]
async fn zip_files(files: Vec<ZipFile>, output_path: String) -> std::collections::HashMap<String, String> {
    use std::fs;
    use std::io::Write;
    use zip::ZipWriter;
    use zip::write::FileOptions;
    use base64::{Engine as _, engine::general_purpose};
    
    let mut result = std::collections::HashMap::new();
    
    // 创建输出目录（如果不存在）
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                result.insert("success".to_string(), "false".to_string());
                result.insert("error".to_string(), format!("Failed to create output directory: {}", e));
                return result;
            }
        }
    }
    
    // 创建ZIP文件
    let file = match fs::File::create(&output_path) {
        Ok(file) => file,
        Err(e) => {
            result.insert("success".to_string(), "false".to_string());
            result.insert("error".to_string(), format!("Failed to create ZIP file: {}", e));
            return result;
        }
    };
    
    let mut zip = ZipWriter::new(file);
    
    // 添加文件到ZIP
    for file in files {
        // 从data URL中提取base64数据
        if let Some(base64_data) = file.url.strip_prefix("data:image/").and_then(|s| s.split(';').nth(1)).and_then(|s| s.strip_prefix("base64,")) {
            // 解码base64数据
            match general_purpose::STANDARD.decode(base64_data) {
                Ok(decoded) => {
                    // 添加文件到ZIP
                    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
                    if let Err(e) = zip.start_file(file.name, options) {
                        result.insert("success".to_string(), "false".to_string());
                        result.insert("error".to_string(), format!("Failed to add file to ZIP: {}", e));
                        return result;
                    }
                    if let Err(e) = zip.write_all(&decoded) {
                        result.insert("success".to_string(), "false".to_string());
                        result.insert("error".to_string(), format!("Failed to write file to ZIP: {}", e));
                        return result;
                    }
                }
                Err(e) => {
                    result.insert("success".to_string(), "false".to_string());
                    result.insert("error".to_string(), format!("Failed to decode base64 data: {}", e));
                    return result;
                }
            }
        } else {
            result.insert("success".to_string(), "false".to_string());
            result.insert("error".to_string(), "Invalid data URL format".to_string());
            return result;
        }
    }
    
    // 完成ZIP文件
    if let Err(e) = zip.finish() {
        result.insert("success".to_string(), "false".to_string());
        result.insert("error".to_string(), format!("Failed to finish ZIP file: {}", e));
        return result;
    }
    
    // 成功
    result.insert("success".to_string(), "true".to_string());
    result.insert("path".to_string(), output_path);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, run_shell_command, get_file_size, move_file, remove_file, run_ffmpeg_with_progress, read_file_as_base64, save_file, write_file, write_bin_file, write_file_chunk, write_bin_file_chunk, zip_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
