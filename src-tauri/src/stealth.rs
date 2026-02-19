#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity, GetWindowLongW, SetWindowLongW,
    GWL_EXSTYLE, WS_EX_TOOLWINDOW, WINDOW_DISPLAY_AFFINITY,
};

/// WDA_EXCLUDEFROMCAPTURE value — hides window from screen capture, screenshots, recording
#[cfg(target_os = "windows")]
const WDA_EXCLUDEFROMCAPTURE: WINDOW_DISPLAY_AFFINITY = WINDOW_DISPLAY_AFFINITY(0x00000011);

/// WDA_NONE — normal window, visible in screen capture
#[cfg(target_os = "windows")]
const WDA_NONE: WINDOW_DISPLAY_AFFINITY = WINDOW_DISPLAY_AFFINITY(0x00000000);

/// Enable stealth mode: hide window from screen capture + remove from Alt-Tab
#[cfg(target_os = "windows")]
pub fn enable_stealth(hwnd: isize) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd as *mut _);
        
        // 1. Exclude from screen capture (Windows 10 2004+)
        SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
            .map_err(|e| format!("SetWindowDisplayAffinity failed: {}", e))?;
        
        // 2. Add WS_EX_TOOLWINDOW to hide from Alt-Tab
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_TOOLWINDOW.0 as i32);
        
        println!("[Stealth] Enabled — window hidden from capture and Alt-Tab");
        Ok(())
    }
}

/// Disable stealth mode: make window visible in screen capture again
#[cfg(target_os = "windows")]
pub fn disable_stealth(hwnd: isize) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd as *mut _);
        
        SetWindowDisplayAffinity(hwnd, WDA_NONE)
            .map_err(|e| format!("SetWindowDisplayAffinity failed: {}", e))?;
        
        // Remove WS_EX_TOOLWINDOW
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style & !(WS_EX_TOOLWINDOW.0 as i32));
        
        println!("[Stealth] Disabled — window visible again");
        Ok(())
    }
}

/// Fallback for non-Windows platforms
#[cfg(not(target_os = "windows"))]
pub fn enable_stealth(_hwnd: isize) -> Result<(), String> {
    Err("Stealth mode is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn disable_stealth(_hwnd: isize) -> Result<(), String> {
    Err("Stealth mode is only supported on Windows".to_string())
}
