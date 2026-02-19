import React, { useState } from 'react';
import { GlobalSettings } from '../lib/sessionStore';
import './SettingsPanel.css';

interface Props {
    settings: GlobalSettings;
    onSave: (settings: GlobalSettings) => void;
    onBack: () => void;
}

const MODEL_OPTIONS: Record<string, { label: string; models: string[] }> = {
    openai: { label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
    anthropic: { label: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'] },
    gemini: { label: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
    groq: { label: 'Groq ⚡', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
};

const SettingsPanel: React.FC<Props> = ({ settings, onSave, onBack }) => {
    const [deepgramKey, setDeepgramKey] = useState(settings.deepgramKey);
    const [llmProvider, setLlmProvider] = useState<GlobalSettings['llmProvider']>(settings.llmProvider);
    const [llmApiKey, setLlmApiKey] = useState(settings.llmApiKey);
    const [llmModel, setLlmModel] = useState(settings.llmModel);
    const [opacity, setOpacity] = useState(settings.opacity || 0.7);

    const handleProviderChange = (provider: GlobalSettings['llmProvider']) => {
        setLlmProvider(provider);
        setLlmModel(MODEL_OPTIONS[provider].models[0]);
    };

    const handleSave = () => {
        onSave({
            deepgramKey: deepgramKey.trim(),
            llmProvider,
            llmApiKey: llmApiKey.trim(),
            llmModel,
            opacity,
        });
    };

    return (
        <div className="settings-panel">
            <div className="settings-header">
                <button className="back-btn" onClick={onBack}>← Back</button>
                <h2 className="settings-title">⚙️ Settings</h2>
            </div>

            <div className="settings-form">
                <div className="settings-section">
                    <h3 className="section-label">🎤 Speech-to-Text</h3>
                    <label className="field-label">Deepgram API Key</label>
                    <input
                        type="password"
                        className="field-input"
                        value={deepgramKey}
                        onChange={e => setDeepgramKey(e.target.value)}
                        placeholder="Enter Deepgram key..."
                    />
                </div>

                <div className="settings-section">
                    <h3 className="section-label">🤖 LLM Provider</h3>

                    <label className="field-label">Provider</label>
                    <select
                        className="field-select"
                        value={llmProvider}
                        onChange={e => handleProviderChange(e.target.value as GlobalSettings['llmProvider'])}
                    >
                        {Object.entries(MODEL_OPTIONS).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                        ))}
                    </select>

                    <label className="field-label">API Key</label>
                    <input
                        type="password"
                        className="field-input"
                        value={llmApiKey}
                        onChange={e => setLlmApiKey(e.target.value)}
                        placeholder={`Enter ${MODEL_OPTIONS[llmProvider].label} key...`}
                    />

                    <label className="field-label">Model</label>
                    <select
                        className="field-select"
                        value={llmModel}
                        onChange={e => setLlmModel(e.target.value)}
                    >
                        {MODEL_OPTIONS[llmProvider].models.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <div className="settings-section">
                    <h3 className="section-label">🎨 Appearance</h3>
                    <label className="field-label">
                        Window Opacity: {Math.round(opacity * 100)}%
                    </label>
                    <input
                        type="range"
                        className="field-range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={opacity}
                        onChange={e => setOpacity(parseFloat(e.target.value))}
                    />
                </div>
            </div>

            <button className="save-btn" onClick={handleSave}>💾 Save Settings</button>
        </div>
    );
};

export default SettingsPanel;
