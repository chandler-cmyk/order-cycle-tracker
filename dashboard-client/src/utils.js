export const C = {
  accent:     '#6366f1',
  accentDark: '#4f46e5',
  accentBg:   '#eef2ff',
  bg:         '#f8fafc',
  surface:    '#ffffff',
  border:     '#e2e8f0',
  borderSub:  '#f1f5f9',
  text:       '#0f172a',
  textSub:    '#475569',
  textMute:   '#94a3b8',
  // aliases used in inline components
  card:       '#ffffff',
  muted:      '#94a3b8',
};

export function fmtCurrency(v) {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v).toFixed(2)}`;
}

export function fmtRevLabel(v) {
  if (v == null || v === 0) return '';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtNumber(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

export function fmtPct(p) {
  if (p == null) return '—';
  return `${Number(p).toFixed(1)}%`;
}

// Date range preset helpers
export function getPresetRange(preset) {
  const today = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const fmt   = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end   = fmt(today);

  if (preset === '7D') {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: fmt(s), end };
  }
  if (preset === '30D') {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { start: fmt(s), end };
  }
  if (preset === '90D') {
    const s = new Date(today); s.setDate(s.getDate() - 89);
    return { start: fmt(s), end };
  }
  if (preset === 'MTD') {
    return { start: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, end };
  }
  if (preset === 'QTD') {
    const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    return { start: fmt(qStart), end };
  }
  if (preset === 'YTD') {
    return { start: `${today.getFullYear()}-01-01`, end };
  }
  if (preset === 'Last Month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last  = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: fmt(first), end: fmt(last) };
  }
  if (preset === 'Last Quarter') {
    const q     = Math.floor(today.getMonth() / 3);
    const first = new Date(today.getFullYear(), (q - 1) * 3, 1);
    const last  = new Date(today.getFullYear(), q * 3, 0);
    return { start: fmt(first), end: fmt(last) };
  }
  if (preset === 'Last Year') {
    const y = today.getFullYear() - 1;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return { start: fmt(today), end };
}

export function exportToCsv(filename, headers, rows) {
  const escape = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildQuery(dateRange, filters) {
  const p = new URLSearchParams();
  if (dateRange.start) p.set('start', dateRange.start);
  if (dateRange.end)   p.set('end',   dateRange.end);
  if (filters.brands.length)     p.set('brands',     filters.brands.join(','));
  if (filters.categories.length) p.set('categories', filters.categories.join(','));
  if (filters.sku)               p.set('sku',         filters.sku);
  return p.toString() ? `?${p.toString()}` : '';
}
