import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    color: '#ff6b6b',
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center'
                }}>
                    <h2>Something went wrong.</h2>
                    <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '20px' }}>
                        {this.state.error?.message}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '8px 16px',
                            background: '#333',
                            border: '1px solid #555',
                            color: 'white',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
