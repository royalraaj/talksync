use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State, WebviewWindow};

use crate::audio::{self, AudioCaptureState};
use crate::stealth;

/// Managed state wrapper
pub struct AppState {
    pub audio: Arc<Mutex<AudioCaptureState>>,
}

/// Start capturing system audio (WASAPI loopback)
#[tauri::command]
pub fn start_capture(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    audio::start_capture(app, state.audio.clone())?;
    Ok("Audio capture started".to_string())
}

/// Stop capturing system audio
#[tauri::command]
pub fn stop_capture(state: State<'_, AppState>) -> Result<String, String> {
    audio::stop_capture(state.audio.clone())?;
    Ok("Audio capture stopped".to_string())
}

/// List available audio output devices
#[tauri::command]
pub fn list_devices() -> Vec<String> {
    audio::list_output_devices()
}

/// Enable stealth mode (hide from screen capture + Alt-Tab)
#[tauri::command]
pub fn set_stealth(window: WebviewWindow, enabled: bool) -> Result<String, String> {
    let hwnd = window.hwnd()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    
    if enabled {
        stealth::enable_stealth(hwnd.0 as isize)?;
        Ok("Stealth mode enabled".to_string())
    } else {
        stealth::disable_stealth(hwnd.0 as isize)?;
        Ok("Stealth mode disabled".to_string())
    }
}
