import React, { useState } from 'react';
import { GlobalSettings } from '../lib/sessionStore';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { initiateCheckout, validateLicenseKey } from '../lib/payments';
import toast from 'react-hot-toast';
import { getUserSubscription, UserSubscription } from '../lib/subscription';
import { useEffect } from 'react';
import './SettingsPanel.css';
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

    // Temp license key state
    const [licenseKey, setLicenseKey] = useState('');
    const [user] = useAuthState(auth);
    const [sub, setSub] = useState<UserSubscription | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        let unsubscribe: () => void;
        if (user) {
            getUserSubscription(user.uid).then(() => {
                unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        setSub(docSnap.data() as UserSubscription);
                    }
                });
            }).catch(console.error);
        }
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user]);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            // App.tsx handles the actual redirect to AuthScreen via onUserChange
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

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

            <div className="settings-section" style={{ marginTop: '24px', borderTop: '1px solid #333', paddingTop: '16px' }}>
                <h3 className="section-label">🔒 Subscription & Account</h3>
                <div style={{ marginBottom: '16px', color: '#ccc', fontSize: '13px' }}>
                    Logged in as: <strong>{user?.email}</strong>
                    <div style={{ marginTop: '4px' }}>
                        Status: <strong>{sub?.isPro ? <span style={{ color: 'gold' }}>PRO</span> : <span style={{ color: 'orange' }}>FREE</span>}</strong>
                    </div>
                </div>

                {!sub?.isPro && (
                    <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '8px' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#60a5fa' }}>🚀 Upgrade to Pro</h4>
                        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#cbd5e1' }}>Get unlimited interview sessions and priority LLM access.</p>
                        <button
                            style={{ padding: '10px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', width: '100%', fontWeight: 'bold' }}
                            disabled={isProcessing}
                            onClick={async () => {
                                setIsProcessing(true);
                                const toastId = toast.loading('Preparing Checkout...');
                                try {
                                    await initiateCheckout(
                                        () => {
                                            toast.success('Payment successful! Waiting for server confirmation...', { id: toastId });
                                            // The UI will auto-update via the Firestore onSnapshot listener once the webhook finishes
                                        },
                                        (err) => {
                                            toast.error('Payment failed: ' + err, { id: toastId });
                                        },
                                        (msg) => {
                                            toast.loading(msg, { id: toastId });
                                        }
                                    );

                                    // Successfully reached the end of the script, Razorpay is open!
                                    toast.dismiss(toastId);
                                } catch (err: any) {
                                    toast.error(err.message || 'Error occurred', { id: toastId });
                                } finally {
                                    setIsProcessing(false);
                                }
                            }}
                        >
                            {isProcessing ? 'Processing...' : 'Purchase Pro (₹2900)'}
                        </button>
                    </div>
                )}

                <label className="field-label">Manually verify License Key</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input
                        type="text"
                        className="field-input"
                        value={licenseKey}
                        onChange={e => setLicenseKey(e.target.value)}
                        placeholder="Paste your License Key here..."
                        style={{ flex: 1 }}
                    />
                    <button
                        style={{ padding: '8px 12px', background: '#4ade80', color: 'black', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                        disabled={isProcessing || !licenseKey}
                        onClick={async () => {
                            setIsProcessing(true);
                            try {
                                const result = await validateLicenseKey(licenseKey);
                                toast.success(result.message || 'License activated!');
                                setTimeout(() => window.location.reload(), 1500);
                            } catch (err: any) {
                                toast.error(err.message || 'Invalid key');
                            } finally {
                                setIsProcessing(false);
                            }
                        }}
                    >
                        {isProcessing ? '...' : 'Verify'}
                    </button>
                </div>

                <button
                    onClick={handleSignOut}
                    style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                >
                    Sign Out
                </button>
            </div>

            <div style={{ marginTop: '24px' }}>
                <button className="save-btn" onClick={handleSave}>💾 Save Settings</button>
            </div>
        </div>
    );
};

export default SettingsPanel;
