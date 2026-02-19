import React from 'react';
import './StatusBar.css';

interface Props {
    audioStatus: boolean;
    sttStatus: string;
    llmStatus: string;
    onStop: () => void;
}

const StatusBar: React.FC<Props> = ({ audioStatus, sttStatus, llmStatus, onStop }) => {
    return (
        <div className="status-bar">
            <div className="status-indicators">
                <div className={`status-dot ${audioStatus ? 'active' : 'inactive'}`}>
                    <span className="dot-indicator"></span>
                    Audio
                </div>
                <div className={`status-dot ${sttStatus === 'connected' ? 'active' : sttStatus === 'connecting' ? 'connecting' : 'inactive'}`}>
                    <span className="dot-indicator"></span>
                    STT
                </div>
                <div className={`status-dot ${llmStatus === 'generating' ? 'active' : 'inactive'}`}>
                    <span className="dot-indicator"></span>
                    AI
                </div>
            </div>
            <div className="status-actions">
                <span className="hotkey-hint">Ctrl+Shift+I</span>
                <button className="stop-btn" onClick={onStop}>✕</button>
            </div>
        </div>
    );
};

export default StatusBar;
