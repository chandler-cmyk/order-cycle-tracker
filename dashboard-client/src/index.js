import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Inject auth token into same-origin API requests only
const _fetch = window.fetch;

function getRequestUrl(input) {
  try {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  } catch (_) {}
  return '';
}

window.fetch = (input, opts = {}) => {
  const requestUrl = getRequestUrl(input);

  const token = localStorage.getItem('auth_token');
  const isLocal = !!requestUrl && (requestUrl.startsWith('/') || requestUrl.startsWith(window.location.origin));

  if (token && isLocal) {
    opts = { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } };
  }

  return _fetch(input, opts).then(res => {
    // If any API call comes back unauthorized, clear the stale token and signal the app
    if (res.status === 401 && isLocal && !requestUrl.includes('/api/login')) {
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new Event('auth:logout'));
    }
    return res;
  });
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: 24,
        }}>
          <div style={{ maxWidth: 560, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Dashboard Error</div>
            <div style={{ fontSize: 13, color: '#475569' }}>{this.state.message}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
