// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, run_shell_command, read_file_as_base64, save_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
