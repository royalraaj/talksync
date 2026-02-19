use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Holds the active audio capture stream
pub struct AudioCaptureState {
    stream: Option<Stream>,
    is_capturing: bool,
}

impl AudioCaptureState {
    pub fn new() -> Self {
        Self {
            stream: None,
            is_capturing: false,
        }
    }
}

// Required because Stream is !Send, but we manage it carefully via Mutex
unsafe impl Send for AudioCaptureState {}
unsafe impl Sync for AudioCaptureState {}

/// Audio chunk payload sent to frontend via Tauri events
#[derive(Clone, serde::Serialize)]
pub struct AudioChunk {
    /// Base64-encoded PCM audio data (16-bit mono, 16kHz)
    pub data: String,
    /// Sample rate
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
}

/// List available audio output devices (for loopback capture)
pub fn list_output_devices() -> Vec<String> {
    let host = cpal::default_host();
    let mut devices = Vec::new();
    
    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            if let Ok(name) = device.name() {
                devices.push(name);
            }
        }
    }
    
    devices
}

/// Find the default output device for loopback capture
fn get_loopback_device() -> Result<Device, String> {
    let host = cpal::default_host();
    host.default_output_device()
        .ok_or_else(|| "No default output device found".to_string())
}

/// Convert f32 samples to 16-bit PCM integers for Deepgram
fn f32_to_i16_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let clamped = sample.max(-1.0).min(1.0);
        let val = (clamped * 32767.0) as i16;
        bytes.extend_from_slice(&val.to_le_bytes());
    }
    bytes
}

/// Resample audio from source rate to target rate (16kHz) using linear interpolation
/// This is a fast, low-latency resampler suitable for speech
fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return input.to_vec();
    }
    
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (input.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);
    
    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f64;
        
        let sample = if src_idx + 1 < input.len() {
            input[src_idx] as f64 * (1.0 - frac) + input[src_idx + 1] as f64 * frac
        } else if src_idx < input.len() {
            input[src_idx] as f64
        } else {
            0.0
        };
        
        output.push(sample as f32);
    }
    
    output
}

/// Mix multi-channel audio down to mono
fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels == 1 {
        return samples.to_vec();
    }
    
    let ch = channels as usize;
    samples
        .chunks(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Start capturing system audio via WASAPI loopback
/// Emits "audio-chunk" events with base64-encoded 16-bit PCM at 16kHz mono
pub fn start_capture(
    app_handle: AppHandle,
    state: Arc<Mutex<AudioCaptureState>>,
) -> Result<(), String> {
    let device = get_loopback_device()?;
    
    // Get the output config (what's playing on speakers)
    let config = device
        .default_output_config()
        .map_err(|e| format!("Failed to get output config: {}", e))?;
    
    let sample_rate = config.sample_rate().0;
    let channels = config.channels();
    let sample_format = config.sample_format();
    
    println!(
        "[Audio] Capturing: {} @ {}Hz, {} ch, {:?}",
        device.name().unwrap_or_default(),
        sample_rate,
        channels,
        sample_format
    );
    
    let stream_config: StreamConfig = config.into();
    
    // Buffer to accumulate ~100ms of audio before sending (low latency)
    let target_rate: u32 = 16000;
    let chunk_duration_ms: u32 = 100; // Send every 100ms for low latency
    let samples_per_chunk = (sample_rate * chunk_duration_ms / 1000 * channels as u32) as usize;
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(samples_per_chunk)));
    
    let buffer_clone = buffer.clone();
    let app_clone = app_handle.clone();
    
    // Build the input stream with loopback config
    // On Windows, cpal uses WASAPI loopback when using build_input_stream on an output device
    let stream = match sample_format {
        SampleFormat::F32 => {
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let mut buf = buffer_clone.lock().unwrap();
                    buf.extend_from_slice(data);
                    
                    if buf.len() >= samples_per_chunk {
                        // Process: multi-channel -> mono -> resample to 16kHz -> encode
                        let mono = to_mono(&buf, channels);
                        let resampled = resample(&mono, sample_rate, target_rate);
                        let pcm_bytes = f32_to_i16_bytes(&resampled);
                        
                        // Base64 encode for transport
                        let encoded = base64_encode(&pcm_bytes);
                        
                        let chunk = AudioChunk {
                            data: encoded,
                            sample_rate: target_rate,
                            channels: 1,
                        };
                        
                        let _ = app_clone.emit("audio-chunk", chunk);
                        buf.clear();
                    }
                },
                |err| {
                    eprintln!("[Audio] Stream error: {}", err);
                },
                None, // timeout
            )
        }
        SampleFormat::I16 => {
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let float_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                    let mut buf = buffer_clone.lock().unwrap();
                    buf.extend_from_slice(&float_data);
                    
                    if buf.len() >= samples_per_chunk {
                        let mono = to_mono(&buf, channels);
                        let resampled = resample(&mono, sample_rate, target_rate);
                        let pcm_bytes = f32_to_i16_bytes(&resampled);
                        let encoded = base64_encode(&pcm_bytes);
                        
                        let chunk = AudioChunk {
                            data: encoded,
                            sample_rate: target_rate,
                            channels: 1,
                        };
                        
                        let _ = app_clone.emit("audio-chunk", chunk);
                        buf.clear();
                    }
                },
                |err| {
                    eprintln!("[Audio] Stream error: {}", err);
                },
                None,
            )
        }
        _ => return Err(format!("Unsupported sample format: {:?}", sample_format)),
    }
    .map_err(|e| format!("Failed to build loopback stream: {}", e))?;
    
    stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;
    
    let mut capture_state = state.lock().unwrap();
    capture_state.stream = Some(stream);
    capture_state.is_capturing = true;
    
    println!("[Audio] Loopback capture started");
    Ok(())
}

/// Stop audio capture
pub fn stop_capture(state: Arc<Mutex<AudioCaptureState>>) -> Result<(), String> {
    let mut capture_state = state.lock().unwrap();
    capture_state.stream = None;
    capture_state.is_capturing = false;
    println!("[Audio] Capture stopped");
    Ok(())
}

/// Simple base64 encoder (avoid pulling in a full crate)
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        
        let triple = (b0 << 16) | (b1 << 8) | b2;
        
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    
    result
}
