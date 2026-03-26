import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Inject auth token into every API request
const _fetch = window.fetch;
window.fetch = (url, opts = {}) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    opts = { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } };
  }
  return _fetch(url, opts);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
