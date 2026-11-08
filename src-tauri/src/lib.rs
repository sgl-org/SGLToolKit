// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize};

// 将 sgl_font_conv.exe 嵌入到主程序中（编译时嵌入到二进制中）
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
static SGL_FONT_CONV_EXE: &[u8] = include_bytes!("../binaries/sgl_font_conv-x86_64-pc-windows-msvc.exe");

#[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
static SGL_FONT_CONV_EXE: &[u8] = &[];

// 内置图标字体：编译期一起打进 exe，运行时释放到临时目录后即可被前端与取模工具读取。
// 新增字体时，把文件放进 binaries/ 并在下面数组里加一行即可（tauri.conf.json 的 resources 同步补一份）。
static BUILTIN_ICON_FONTS: &[(&str, &[u8])] = &[
    ("FontAwesome.otf", include_bytes!("../binaries/FontAwesome.otf")),
    ("Blockheads United.ttf", include_bytes!("../binaries/Blockheads United.ttf")),
    ("CatgirlSystemFont-Regular.otf", include_bytes!("../binaries/CatgirlSystemFont-Regular.otf")),
    ("Floralia Dingbat.ttf", include_bytes!("../binaries/Floralia Dingbat.ttf")),
    ("HazardSigns.ttf", include_bytes!("../binaries/HazardSigns.ttf")),
    ("Herlora Floral Dingbat.ttf", include_bytes!("../binaries/Herlora Floral Dingbat.ttf")),
    ("MaterialIcons-Regular.ttf", include_bytes!("../binaries/MaterialIcons-Regular.ttf")),
    ("MaterialIconsOutlined-Regular.otf", include_bytes!("../binaries/MaterialIconsOutlined-Regular.otf")),
    ("MaterialIconsRound-Regular.otf", include_bytes!("../binaries/MaterialIconsRound-Regular.otf")),
    ("MaterialIconsSharp-Regular.otf", include_bytes!("../binaries/MaterialIconsSharp-Regular.otf")),
    ("MaterialIconsTwoTone-Regular.otf", include_bytes!("../binaries/MaterialIconsTwoTone-Regular.otf")),
    ("Numberpile.otf", include_bytes!("../binaries/Numberpile.otf")),
    ("Oil Crisis A.otf", include_bytes!("../binaries/Oil Crisis A.otf")),
    ("Oil Crisis B.otf", include_bytes!("../binaries/Oil Crisis B.otf")),
    ("Type Icons.ttf", include_bytes!("../binaries/Type Icons.ttf")),
    ("icon-works-webfont.ttf", include_bytes!("../binaries/icon-works-webfont.ttf")),
];

// 提取嵌入的 exe 到临时目录，返回 exe 路径
fn extract_embedded_exe() -> Result<std::path::PathBuf, String> {
    use std::io::Write;
    
    let temp_dir = std::env::temp_dir().join("sgltoolkit_sidecar");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
    
    let exe_path = temp_dir.join("sgl_font_conv.exe");
    
    // 内容一致才复用（只比大小会漏掉体积相同的旧版本，导致新参数不生效）
    if let Ok(existing) = std::fs::read(&exe_path) {
        if existing.as_slice() == SGL_FONT_CONV_EXE {
            return Ok(exe_path);
        }
    }
    
    let mut file = std::fs::File::create(&exe_path).map_err(|e| format!("创建临时文件失败: {}", e))?;
    file.write_all(SGL_FONT_CONV_EXE).map_err(|e| format!("写入临时文件失败: {}", e))?;
    
    Ok(exe_path)
}

// ---------- 内置图标字体（随程序打包，用户可直接选用） ----------

#[derive(Clone, serde::Serialize)]
struct BuiltinIconFont {
    /// 面向用户的显示名
    name: String,
    /// 文件名
    file: String,
    /// 释放后的磁盘绝对路径
    path: String,
}

/// 把内嵌字体释放到与 sidecar 相同的临时目录，内容一致则直接复用。
/// 返回绝对路径：前端用它解析预览，C 取模工具可直接作为 --font 参数读取。
fn extract_builtin_font(file_name: &str, data: &[u8]) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("sgltoolkit_sidecar");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let path = temp_dir.join(file_name);
    if let Ok(existing) = std::fs::read(&path) {
        if existing.as_slice() == data {
            return Ok(path.to_string_lossy().into_owned());
        }
    }
    std::fs::write(&path, data).map_err(|e| format!("写入内置字体失败: {}", e))?;
    Ok(path.to_string_lossy().into_owned())
}

/// 列出随工具打包的全部内置图标字体，供「图标字体文件」处逐个添加到预览。
/// 显示名直接读字体的 name 表（与系统字体一致），解析失败时回退到文件名。
#[tauri::command]
fn list_builtin_icon_fonts() -> Result<Vec<BuiltinIconFont>, String> {
    let mut fonts = Vec::with_capacity(BUILTIN_ICON_FONTS.len());
    for (file, data) in BUILTIN_ICON_FONTS {
        let path = extract_builtin_font(file, data)?;
        let fallback = std::path::Path::new(file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(file)
            .to_string();
        let name = font_name_from_file(std::path::Path::new(&path))
            .map(|(family, style)| {
                let regular = style.is_empty()
                    || matches!(
                        style.to_ascii_lowercase().as_str(),
                        "regular" | "normal" | "book" | "roman" | "常规" | "标准" | "正常"
                    );
                if regular { family } else { format!("{} {}", family, style) }
            })
            .unwrap_or(fallback);
        fonts.push(BuiltinIconFont {
            name,
            file: (*file).to_string(),
            path,
        });
    }
    Ok(fonts)
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

// ---------- Windows 本地系统字体库 ----------

#[derive(Clone, serde::Serialize)]
struct SystemFont {
    /// 面向用户的显示名（字体家族 + 非默认样式）
    name: String,
    /// 字体文件名，便于区分同一家族的不同字重
    file: String,
    /// 字体文件完整路径，可直接传给 sgl_font_conv
    path: String,
}

/// 解析 sfnt（TTF/OTF/TTC）的 name 表，返回 (家族名, 样式名)。
/// 只按字节偏移读取表目录与 name 表，不整文件载入，几百个系统字体也能快速枚举。
fn font_name_from_file(path: &std::path::Path) -> Option<(String, String)> {
    use std::io::{Read, Seek, SeekFrom};

    fn read_at(f: &mut std::fs::File, off: u64, len: usize) -> Option<Vec<u8>> {
        f.seek(SeekFrom::Start(off)).ok()?;
        let mut buf = vec![0u8; len];
        f.read_exact(&mut buf).ok()?;
        Some(buf)
    }
    fn u16be(b: &[u8], i: usize) -> u16 {
        u16::from_be_bytes([b[i], b[i + 1]])
    }
    fn u32be(b: &[u8], i: usize) -> u32 {
        u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
    }
    fn decode(platform: u16, raw: &[u8]) -> String {
        if platform == 0 || platform == 3 {
            // Windows / Unicode 平台：UTF-16BE
            let units: Vec<u16> = raw
                .chunks_exact(2)
                .map(|c| u16::from_be_bytes([c[0], c[1]]))
                .collect();
            String::from_utf16_lossy(&units)
        } else {
            // Macintosh 平台按单字节处理，中文名在 Windows 字体里基本都另有 Unicode 记录
            raw.iter().map(|&b| b as char).collect()
        }
    }

    let mut f = std::fs::File::open(path).ok()?;
    let head = read_at(&mut f, 0, 12)?;
    // TTC 字体集合：第一个 face 的表目录偏移位于 12..16
    let dir_off = if head.starts_with(b"ttcf") {
        let t = read_at(&mut f, 12, 4)?;
        u32be(&t, 0) as u64
    } else {
        0
    };

    let ot = read_at(&mut f, dir_off, 12)?;
    let count = u16be(&ot, 4) as usize;
    if count == 0 || count > 512 {
        return None;
    }
    let records = read_at(&mut f, dir_off + 12, count * 16)?;
    let mut name_off = 0u32;
    let mut name_len = 0u32;
    for i in 0..count {
        let r = &records[i * 16..i * 16 + 16];
        if r.starts_with(b"name") {
            name_off = u32be(r, 8);
            name_len = u32be(r, 12);
            break;
        }
    }
    if name_off == 0 || name_len == 0 || name_len > 4 * 1024 * 1024 {
        return None;
    }

    let nb = read_at(&mut f, name_off as u64, name_len as usize)?;
    if nb.len() < 6 {
        return None;
    }
    let n = u16be(&nb, 2) as usize;
    let str_base = u16be(&nb, 4) as usize;
    if n == 0 || n > 4096 {
        return None;
    }

    // 同一 nameID 会有多语言记录：优先简中，其次其它中文、英文，最后其它
    let mut family: Option<(i32, String)> = None;
    let mut style: Option<(i32, String)> = None;
    for i in 0..n {
        let p = 6 + i * 12;
        if p + 12 > nb.len() {
            break;
        }
        let rec = &nb[p..p + 12];
        let name_id = u16be(rec, 6);
        if name_id != 1 && name_id != 2 {
            continue; // 1 = Family, 2 = Subfamily
        }
        let platform = u16be(rec, 0);
        let lang = u16be(rec, 4);
        let len = u16be(rec, 8) as usize;
        let off = str_base + u16be(rec, 10) as usize;
        if off + len > nb.len() {
            continue;
        }
        let text = decode(platform, &nb[off..off + len]).trim().to_string();
        if text.is_empty() {
            continue;
        }
        let score = match (platform, lang) {
            (3, 0x0804) => 100,                            // 简体中文
            (3, 0x0404) | (3, 0x0C04) | (3, 0x1004) => 90, // 繁体中文
            (3, 0x0409) => 80,                             // 英文（美国）
            (3, _) => 60,
            (0, _) => 50,
            (1, _) => 40,
            _ => 20,
        };
        let slot = if name_id == 1 { &mut family } else { &mut style };
        if slot.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
            *slot = Some((score, text));
        }
    }

    family.map(|(_, f)| (f, style.map(|(_, s)| s).unwrap_or_default()))
}

/// 枚举本机安装的字体：系统字体目录 + 当前用户字体目录（Windows 10+ 免管理员安装的字体）
fn collect_system_fonts() -> Vec<SystemFont> {
    use std::path::{Path, PathBuf};

    let mut dirs: Vec<PathBuf> = Vec::new();
    match std::env::var("WINDIR") {
        Ok(windir) => dirs.push(Path::new(&windir).join("Fonts")),
        Err(_) if cfg!(windows) => dirs.push(PathBuf::from(r"C:\Windows\Fonts")),
        Err(_) => {}
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        dirs.push(Path::new(&local).join("Microsoft").join("Windows").join("Fonts"));
    }

    let mut seen = std::collections::HashSet::new();
    let mut fonts: Vec<SystemFont> = Vec::new();
    for dir in dirs {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // 目录不存在或不可读时跳过
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            // .fon 是位图字体，FreeType 转换器无法使用，这里不列出
            if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "otc") {
                continue;
            }
            if !seen.insert(path.to_string_lossy().to_ascii_lowercase()) {
                continue;
            }
            let file = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let fallback = if stem.is_empty() { file.clone() } else { stem };
            let (family, style) =
                font_name_from_file(&path).unwrap_or_else(|| (fallback, String::new()));
            let is_regular = style.is_empty()
                || matches!(
                    style.to_ascii_lowercase().as_str(),
                    "regular" | "normal" | "book" | "roman" | "常规" | "标准" | "正常"
                );
            let name = if is_regular {
                family
            } else {
                format!("{} {}", family, style)
            };
            fonts.push(SystemFont {
                name,
                file,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    fonts.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.file.cmp(&b.file))
    });
    fonts
}

/// 扫描放到阻塞线程池执行，避免大字体目录拖慢 WebView 主线程
#[tauri::command]
async fn list_system_fonts() -> Vec<SystemFont> {
    tauri::async_runtime::spawn_blocking(collect_system_fonts)
        .await
        .unwrap_or_default()
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

#[cfg(test)]
mod tests {
    #[test]
    fn builtin_icon_fonts_are_embedded_and_extractable() {
        let fonts = super::list_builtin_icon_fonts().unwrap();
        assert_eq!(fonts.len(), super::BUILTIN_ICON_FONTS.len());
        assert!(fonts.len() >= 16);
        for (i, font) in fonts.iter().enumerate() {
            let (expected_file, expected_bytes) = super::BUILTIN_ICON_FONTS[i];
            assert_eq!(font.file, expected_file);
            assert!(!font.name.is_empty());
            let extracted = std::fs::read(&font.path).unwrap();
            assert_eq!(extracted.as_slice(), expected_bytes);
            println!("内置图标字体: {} ({}) -> {}", font.name, font.file, font.path);
        }
    }

    #[test]
    fn system_fonts_available() {
        if cfg!(windows) {
            let fonts = super::collect_system_fonts();
            assert!(!fonts.is_empty(), "应至少枚举到一个系统字体");
            assert!(fonts.iter().all(|f| !f.name.is_empty() && !f.path.is_empty()));
            println!("系统字体数量: {}", fonts.len());
            for f in fonts.iter().take(3) {
                println!("{} -> {}", f.name, f.path);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, run_shell_command, get_file_size, list_system_fonts, list_builtin_icon_fonts, move_file, remove_file, run_ffmpeg_with_progress, read_file_as_base64, save_file, write_file, write_bin_file, write_file_chunk, write_bin_file_chunk, zip_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
