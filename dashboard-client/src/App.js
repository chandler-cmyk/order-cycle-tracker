import { useState, useEffect, useCallback, useRef } from 'react';
import { C, getPresetRange, buildQuery, fmtCurrency, fmtRevLabel } from './utils';
import DateRangePicker from './components/DateRangePicker';
import FilterBar from './components/FilterBar';
import MetricCards from './components/MetricCards';
import RevenueTrendChart from './components/RevenueTrendChart';
import StateMap from './components/StateMap';
import ProductTable from './components/ProductTable';
import CustomerView from './components/CustomerView';
import TopSkusLeaderboard from './components/TopSkusLeaderboard';
import OutstandingInvoicesTile from './components/OutstandingInvoicesTile';
import BrandComparison from './components/BrandComparison';
import ForecastTab from './components/ForecastTab';

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',   label: 'Overview',   icon: '◈' },
  { id: 'trends',     label: 'Revenue Trends', icon: '◷' },
  { id: 'geography',  label: 'Sales by Region', icon: '⬡' },
  { id: 'products',   label: 'Products',   icon: '☰' },
  { id: 'customers',  label: 'Customers',  icon: '◉' },
  { id: 'forecast',   label: 'Forecast',   icon: '◌' },
];

// ── Sync status bar ────────────────────────────────────────────────────────────
function SyncBar({ syncStatus, onSync }) {
  const isSyncing = syncStatus?.syncing;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 16px', background: isSyncing ? '#fffbeb' : C.bg,
      border: `1px solid ${isSyncing ? '#fde68a' : C.border}`,
      borderRadius: 8, fontSize: 11,
    }}>
      {isSyncing ? (
        <>
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid #f59e0b`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ color: '#92400e', fontWeight: 500 }}>{syncStatus.progress || 'Syncing…'}</span>
        </>
      ) : (
        <>
          <span style={{ color: C.textMute }}>
            {syncStatus?.lastSync
              ? `Last sync: ${new Date(syncStatus.lastSync).toLocaleString()}`
              : 'Never synced'}
          </span>
          {syncStatus?.invoiceCount > 0 && (
            <span style={{ color: C.textMute }}>· {syncStatus.invoiceCount.toLocaleString()} invoices</span>
          )}
          {syncStatus?.error && (
            <span style={{ color: '#dc2626', fontWeight: 500 }}>⚠ {syncStatus.error}</span>
          )}
        </>
      )}
      <button
        onClick={onSync}
        disabled={isSyncing}
        style={{
          marginLeft: 8, padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
          cursor: isSyncing ? 'not-allowed' : 'pointer',
          border: `1px solid ${isSyncing ? C.border : C.accent}`,
          background: isSyncing ? C.surface : C.accentBg,
          color: isSyncing ? C.textMute : C.accent,
          opacity: isSyncing ? 0.6 : 1,
        }}
      >
        {isSyncing ? 'Syncing…' : '↻ Sync Now'}
      </button>
    </div>
  );
}

// ── useFetch hook ──────────────────────────────────────────────────────────────
function useFetch(url) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const abortRef = useRef(null);

  const load = useCallback(() => {
    if (!url) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    fetch(url, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { if (e.name !== 'AbortError') { setError(e.message); setLoading(false); } });
  }, [url]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]);

  return { data, loading, error, reload: load };
}

// ── Category Breakdown tile ────────────────────────────────────────────────────
function CategoryBreakdown({ data, loading }) {
  const items = data?.items || [];
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '20px 24px',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>
        Sales by Category
      </div>
      {loading ? (
        <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13 }}>No data</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Category', 'Units', 'Revenue', '% of Sales'].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Category' ? 'left' : 'right',
                  fontSize: 11, fontWeight: 600, color: C.muted,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  padding: '0 8px 10px',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.category} style={{ borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <td style={{ padding: '10px 8px', fontSize: 13, color: C.text, fontWeight: 500 }}>
                  {row.category}
                </td>
                <td style={{ padding: '10px 8px', fontSize: 13, color: C.text, textAlign: 'right' }}>
                  {row.units.toLocaleString()}
                </td>
                <td style={{ padding: '10px 8px', fontSize: 13, color: C.text, textAlign: 'right' }}>
                  {fmtCurrency(row.revenue)}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', minWidth: 140 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <div style={{ flex: 1, maxWidth: 80, background: C.border, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${row.pct}%`, background: C.accent, height: '100%', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 13, color: C.text, minWidth: 38, textAlign: 'right' }}>
                      {row.pct.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Top States tile (used in overview alongside map) ───────────────────────────
function TopStatesTable({ data, loading }) {
  const sorted = [...(data || [])].sort((a, b) => b.revenue - a.revenue).slice(0, 15);
  const maxRevenue = sorted[0]?.revenue || 1;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Top States</div>
      <div style={{ fontSize: 12, color: C.textMute, marginBottom: 16 }}>By net revenue</div>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 13 }}>No data</div>
      ) : (
        <div style={{ overflowY: 'auto' }}>
          {sorted.map((d, i) => (
            <div key={d.state} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0',
              borderBottom: i < sorted.length - 1 ? `1px solid ${C.borderSub}` : 'none',
            }}>
              <span style={{ fontSize: 11, color: C.textMute, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              <div style={{
                width: 30, height: 20, borderRadius: 3, flexShrink: 0,
                background: `hsl(213, ${40 + Math.round(50 * d.revenue / maxRevenue)}%, ${65 - Math.round(35 * d.revenue / maxRevenue)}%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: '#fff',
              }}>{d.state}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: C.textSub }}>{d.orderCount} orders</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmtRevLabel(d.revenue)}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: C.borderSub, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${(d.revenue / maxRevenue) * 100}%`, background: C.accent }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── State customer breakdown panel ─────────────────────────────────────────────
function StateCustomerPanel({ state, dateRange, filters, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const p = new URLSearchParams();
    p.set('state', state.abbr);
    if (dateRange.start) p.set('start', dateRange.start);
    if (dateRange.end)   p.set('end',   dateRange.end);
    if (filters.brands.length)     p.set('brands',     filters.brands.join(','));
    if (filters.categories.length) p.set('categories', filters.categories.join(','));
    if (filters.sku)               p.set('sku',         filters.sku);
    fetch(`/api/dashboard/state-customers?${p.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [state.abbr, dateRange, filters]);

  const rows = data || [];
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {state.name} ({state.abbr}) — Customers
          </div>
          <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>
            {loading ? 'Loading…' : `${rows.length} customers · ${fmtCurrency(totalRev)} total`}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: `1px solid ${C.border}`, background: C.bg, color: C.textSub, cursor: 'pointer',
          }}
        >
          ✕ Close
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No customer data for this state</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Customer', 'Orders', 'Revenue', '% of State'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: h === '#' || h === 'Orders' || h === 'Revenue' || h === '% of State' ? 'right' : 'left',
                    fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: 'uppercase',
                    letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, background: C.bg,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.customer_id} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                  <td style={{ padding: '9px 12px', fontSize: 12, color: C.textMute, textAlign: 'right', width: 36 }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color: C.text, fontWeight: 500 }}>{r.customer_name}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color: C.textSub, textAlign: 'right' }}>{r.orderCount.toLocaleString()}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, color: C.accent, textAlign: 'right' }}>{fmtCurrency(r.revenue)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', minWidth: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <div style={{ width: 80, height: 6, borderRadius: 3, background: C.borderSub, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${(r.revenue / totalRev) * 100}%`, background: C.accent }} />
                      </div>
                      <span style={{ fontSize: 12, color: C.textSub, width: 36, textAlign: 'right' }}>
                        {((r.revenue / totalRev) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── State product breakdown panel ──────────────────────────────────────────────
function StateProductPanel({ state, dateRange, filters }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const p = new URLSearchParams();
    p.set('state', state.abbr);
    if (dateRange.start) p.set('start', dateRange.start);
    if (dateRange.end)   p.set('end',   dateRange.end);
    if (filters.brands.length)     p.set('brands',     filters.brands.join(','));
    if (filters.categories.length) p.set('categories', filters.categories.join(','));
    if (filters.sku)               p.set('sku',        filters.sku);
    fetch(`/api/dashboard/state-products?${p.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [state.abbr, dateRange, filters]);

  const rows = data || [];
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
          {state.name} ({state.abbr}) — Top Products
        </div>
        <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>
          {loading ? 'Loading…' : `${rows.length} products · ${fmtCurrency(totalRev)} total`}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No product data for this state</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Product', 'Units', 'Revenue', '% of State'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px',
                    textAlign: h === 'Product' ? 'left' : 'right',
                    fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: 'uppercase',
                    letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, background: C.bg,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.sku || r.name} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                  <td style={{ padding: '9px 12px', fontSize: 12, color: C.textMute, textAlign: 'right', width: 36 }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color: C.text, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color: C.textSub, textAlign: 'right' }}>{r.units.toLocaleString()}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, color: C.accent, textAlign: 'right' }}>{fmtCurrency(r.revenue)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', minWidth: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <div style={{ width: 80, height: 6, borderRadius: 3, background: C.borderSub, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${r.pct}%`, background: C.accent }} />
                      </div>
                      <span style={{ fontSize: 12, color: C.textSub, width: 36, textAlign: 'right' }}>
                        {r.pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Login Screen ───────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem('auth_token', data.token);
        onLogin();
      } else {
        setError('Incorrect password');
      }
    } catch {
      setError('Connection error');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0c1220 0%, #1a1040 50%, #0c1220 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '44px 48px', width: 400,
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        animation: 'fadeIn 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
          }}>N</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>NYSW</div>
            <div style={{ fontSize: 10, color: '#4b5563', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sales Intelligence</div>
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', marginBottom: 6, letterSpacing: '-0.02em' }}>Welcome back</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 28 }}>Enter your team password to continue</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%', padding: '11px 14px', fontSize: 14,
              border: `1px solid ${error ? '#f87171' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8, outline: 'none', marginBottom: error ? 6 : 12,
              background: 'rgba(255,255,255,0.05)', color: '#f1f5f9',
              boxSizing: 'border-box',
            }}
          />
          {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '11px', fontSize: 14, fontWeight: 600,
              background: loading || !password ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              boxShadow: loading || !password ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
              transition: 'all 0.2s', letterSpacing: '0.01em',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('auth_token'));
  const [activeView, setActiveView] = useState('overview');
  const [dateRange, setDateRange]   = useState(() => {
    const r = getPresetRange('30D');
    return { ...r, preset: '30D' };
  });
  const [filters, setFilters] = useState({ brands: [], categories: [], sku: '' });
  const [trendGroup, setTrendGroup] = useState('daily');
  const [productSort, setProductSort] = useState({ sort: 'revenue', order: 'desc' });
  const [productPage, setProductPage] = useState(1);
  const [syncStatus, setSyncStatus] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ brands: [], categories: [] });
  const [selectedState, setSelectedState] = useState(null); // { abbr, name, revenue }
  const syncPollRef = useRef(null);

  // ── Filter options (brands/categories) ──────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    fetch('/api/dashboard/filters')
      .then(r => r.json())
      .then(d => setFilterOptions(d))
      .catch(() => {});
  }, [authed]);

  // ── Sync status polling ──────────────────────────────────────────────────────
  const pollSync = useCallback(() => {
    fetch('/api/sync/status')
      .then(r => r.json())
      .then(d => {
        setSyncStatus(d);
        if (d.syncing) {
          syncPollRef.current = setTimeout(pollSync, 2000);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!authed) return;
    pollSync();
    return () => clearTimeout(syncPollRef.current);
  }, [pollSync, authed]);

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  const triggerSync = () => {
    fetch('/api/sync', { method: 'POST' })
      .then(() => { setTimeout(pollSync, 500); })
      .catch(() => {});
  };

  // ── Build API query strings ──────────────────────────────────────────────────
  const q = buildQuery(dateRange, filters);

  const trendQ = (() => {
    const p = new URLSearchParams();
    if (dateRange.start) p.set('start', dateRange.start);
    if (dateRange.end)   p.set('end',   dateRange.end);
    if (filters.brands.length)     p.set('brands',     filters.brands.join(','));
    if (filters.categories.length) p.set('categories', filters.categories.join(','));
    if (filters.sku)               p.set('sku',         filters.sku);
    p.set('group', trendGroup);
    return `?${p.toString()}`;
  })();

  const productQ = (() => {
    const p = new URLSearchParams();
    if (dateRange.start) p.set('start', dateRange.start);
    if (dateRange.end)   p.set('end',   dateRange.end);
    if (filters.brands.length)     p.set('brands',     filters.brands.join(','));
    if (filters.categories.length) p.set('categories', filters.categories.join(','));
    if (filters.sku)               p.set('sku',         filters.sku);
    p.set('sort',     productSort.sort);
    p.set('order',    productSort.order);
    p.set('page',     String(productPage));
    p.set('pageSize', '25');
    return `?${p.toString()}`;
  })();

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const metrics    = useFetch(`/api/dashboard/metrics${q}`);
  const trend      = useFetch(`/api/dashboard/trend${trendQ}`);
  const states     = useFetch(`/api/dashboard/states${q}`);
  const products   = useFetch(`/api/dashboard/products${productQ}`);
  const categories = useFetch(`/api/dashboard/categories${q}`);

  // Reset page when filters/sort change
  useEffect(() => { setProductPage(1); }, [filters, dateRange, productSort]);

  // ── Sidebar nav ──────────────────────────────────────────────────────────────
  const sidebar = (
    <div style={{
      width: 220, flexShrink: 0,
      background: '#0c1220',
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      borderRight: '1px solid #1a2235',
    }}>
      {/* Brand */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <img
          src="/logo.png.jpeg"
          alt="F&W Enterprises LLC"
          style={{ width: '100%', maxWidth: 160, display: 'block' }}
        />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px' }}>
        {NAV.map(item => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 1,
                border: 'none', cursor: 'pointer', textAlign: 'left', position: 'relative',
                fontSize: 13, fontWeight: active ? 600 : 400,
                background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: active ? '#a5b4fc' : '#6b7280',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {active && (
                <span style={{
                  position: 'absolute', left: 0, top: '18%', bottom: '18%',
                  width: 3, borderRadius: '0 3px 3px 0', background: '#6366f1',
                }} />
              )}
              <span style={{ fontSize: 13 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 10, color: '#374151', fontWeight: 500, letterSpacing: '0.03em' }}>
          Powered by Zoho Inventory
        </div>
      </div>
    </div>
  );

  // ── Header ────────────────────────────────────────────────────────────────────
  const PAGE_TITLES = {
    overview:  'Overview',
    trends:    'Revenue Trends',
    geography: 'Sales by Region',
    products:  'Products',
    customers: 'Customers',
    forecast:  'Sales Forecast',
  };

  const header = (
    <div style={{
      background: C.surface, borderBottom: `1px solid ${C.border}`,
      padding: '0 24px', display: 'flex', alignItems: 'center',
      height: 56, gap: 16, flexShrink: 0,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', marginRight: 'auto' }}>
        {PAGE_TITLES[activeView] || 'Dashboard'}
      </div>
      <DateRangePicker dateRange={dateRange} onChange={r => { setDateRange(r); setProductPage(1); }} />
      <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />
      <SyncBar syncStatus={syncStatus} onSync={triggerSync} />
    </div>
  );

  // ── Views ─────────────────────────────────────────────────────────────────────
  const filterBar = (
    <FilterBar
      filterOptions={filterOptions}
      filters={filters}
      onChange={f => { setFilters(f); setProductPage(1); }}
    />
  );

  function renderView() {
    switch (activeView) {
      case 'overview': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {filterBar}
          <MetricCards data={metrics.data} loading={metrics.loading} />
          <RevenueTrendChart
            data={trend.data}
            loading={trend.loading}
            group={trendGroup}
            onGroupChange={setTrendGroup}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
            <StateMap data={states.data} loading={states.loading} height={442} showTable={false} compact />
            <TopStatesTable data={states.data} loading={states.loading} />
          </div>
          <CategoryBreakdown data={categories.data} loading={categories.loading} />
          <BrandComparison dateRange={dateRange} filters={filters} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <TopSkusLeaderboard dateRange={dateRange} filters={filters} />
            <OutstandingInvoicesTile />
          </div>
          <ProductTable
            data={products.data}
            loading={products.loading}
            sort={productSort.sort}
            order={productSort.order}
            page={productPage}
            pageSize={25}
            onSortChange={(sort, order) => { setProductSort({ sort, order }); setProductPage(1); }}
            onPageChange={setProductPage}
          />
        </div>
      );

      case 'trends': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {filterBar}
          <RevenueTrendChart
            data={trend.data}
            loading={trend.loading}
            group={trendGroup}
            onGroupChange={setTrendGroup}
          />
          {metrics.data && (
            <MetricCards data={metrics.data} loading={metrics.loading} />
          )}
        </div>
      );

      case 'geography': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {filterBar}
          <StateMap
            data={states.data}
            loading={states.loading}
            height={560}
            selectedState={selectedState?.abbr}
            onStateClick={s => setSelectedState(prev => prev?.abbr === s.abbr ? null : s)}
          />
          {selectedState && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <StateCustomerPanel
                state={selectedState}
                dateRange={dateRange}
                filters={filters}
                onClose={() => setSelectedState(null)}
              />
              <StateProductPanel
                state={selectedState}
                dateRange={dateRange}
                filters={filters}
              />
            </div>
          )}
        </div>
      );

      case 'products': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {filterBar}
          <ProductTable
            data={products.data}
            loading={products.loading}
            sort={productSort.sort}
            order={productSort.order}
            page={productPage}
            pageSize={25}
            onSortChange={(sort, order) => { setProductSort({ sort, order }); setProductPage(1); }}
            onPageChange={setProductPage}
          />
        </div>
      );

      case 'customers': return (
        <CustomerView
          dateRange={dateRange}
          filters={filters}
          filterOptions={filterOptions}
          onFiltersChange={f => { setFilters(f); }}
        />
      );

      case 'forecast': return <ForecastTab />;

      default: return null;
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {/* Sidebar */}
      {sidebar}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {header}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            {renderView()}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}
