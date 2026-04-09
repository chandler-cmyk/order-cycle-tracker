import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Inject auth token into same-origin API requests only
const _fetch = window.fetch;
window.fetch = (url, opts = {}) => {
  const token = localStorage.getItem('auth_token');
  const isLocal = typeof url === 'string' && (url.startsWith('/') || url.startsWith(window.location.origin));
  if (token && isLocal) {
    opts = { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } };
  }
  return _fetch(url, opts).then(res => {
    // If any API call comes back unauthorized, clear the stale token and reload to show login
    if (res.status === 401 && isLocal && !url.includes('/api/login')) {
      localStorage.removeItem('auth_token');
      window.location.reload();
    }
    return res;
  });
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
