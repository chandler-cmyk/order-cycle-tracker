export const C = {
  accent:     '#378ADD',
  accentDark: '#1e6abf',
  accentBg:   '#dbeafe',
  bg:         '#f8fafc',
  surface:    '#ffffff',
  border:     '#e2e8f0',
  borderSub:  '#f1f5f9',
  text:       '#0f172a',
  textSub:    '#475569',
  textMute:   '#94a3b8',
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
  return { start: fmt(today), end };
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
