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
        .invoke_handler(tauri::generate_handler![greet, run_shell_command, read_file_as_base64, save_file, write_file, write_bin_file, write_file_chunk, write_bin_file_chunk, zip_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
