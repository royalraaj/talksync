mod audio;
mod commands;
mod stealth;

use audio::AudioCaptureState;
use commands::AppState;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_google_auth::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            audio: Arc::new(Mutex::new(AudioCaptureState::new())),
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_capture,
            commands::stop_capture,
            commands::list_devices,
            commands::set_stealth,
        ])
        .setup(|_app| {
            // Stealth will be enabled via frontend when session starts
            println!("[InterviewHelper] App started successfully");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
