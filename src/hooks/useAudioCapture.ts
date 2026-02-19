// Hook: manages audio capture via Tauri IPC commands
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useAudioCapture() {
    const [isCapturing, setIsCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startCapture = useCallback(async () => {
        try {
            setError(null);
            await invoke('start_capture');
            setIsCapturing(true);
        } catch (err) {
            setError(String(err));
            console.error('[AudioCapture] Start failed:', err);
        }
    }, []);

    const stopCapture = useCallback(async () => {
        try {
            await invoke('stop_capture');
            setIsCapturing(false);
        } catch (err) {
            setError(String(err));
            console.error('[AudioCapture] Stop failed:', err);
        }
    }, []);

    const listDevices = useCallback(async (): Promise<string[]> => {
        try {
            return await invoke('list_devices');
        } catch (err) {
            console.error('[AudioCapture] List devices failed:', err);
            return [];
        }
    }, []);

    return { isCapturing, error, startCapture, stopCapture, listDevices };
}
