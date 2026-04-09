import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Inject auth token into same-origin API requests only
const _fetch = window.fetch;
window.fetch = (input, opts = {}) => {
  const requestUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input && typeof input.url === 'string' ? input.url : '');

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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
