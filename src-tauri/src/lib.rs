// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize};

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
async fn run_shell_command(cmd: String, args: Vec<String>) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("Command failed with status: {}\nStdout: {}\nStderr: {}", 
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
        .invoke_handler(tauri::generate_handler![greet, run_shell_command, read_file_as_base64, save_file, write_file, write_bin_file, zip_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
