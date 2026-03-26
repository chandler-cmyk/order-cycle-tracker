import { useState, useEffect, useCallback } from 'react';
import { STATUS_CONFIG, INACTIVE_DAYS, fmtDate, fmtCurrency, processOrders } from './utils';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#f8fafc',
  surface:  '#ffffff',
  border:   '#e2e8f0',
  borderSub:'#f1f5f9',
  text:     '#0f172a',
  textSub:  '#475569',
  textMute: '#94a3b8',
  accent:   '#6366f1',
};

const CHURN_COLORS = {
  Low:    { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  Medium: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  High:   { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};

// ─── Shared cell style ────────────────────────────────────────────────────────
const td = {
  padding: '11px 14px', fontSize: 13, color: C.textSub,
  borderBottom: `1px solid ${C.borderSub}`, whiteSpace: 'nowrap',
};
const th = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em',
  whiteSpace: 'nowrap', background: C.bg, borderBottom: `1px solid ${C.border}`,
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: C.surface, borderRadius: 10,
      border: `1px solid ${C.border}`,
      padding: '16px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMute, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Badge({ label, color, bg, border }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 6,
      fontSize: 11, fontWeight: 600, color, background: bg,
      border: `1px solid ${border}`, letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.on_track;
  return <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} border={cfg.border} />;
}

function ChurnRiskBadge({ risk }) {
  const cfg = CHURN_COLORS[risk] || { color: C.textMute, bg: C.borderSub, border: C.border };
  return <Badge label={risk} color={cfg.color} bg={cfg.bg} border={cfg.border} />;
}

function FilterBtn({ active, color, bg, border, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
      cursor: 'pointer', transition: 'all 0.1s',
      border: `1px solid ${active ? (border || C.accent) : C.border}`,
      background: active ? (bg || '#eef2ff') : C.surface,
      color: active ? (color || C.accent) : C.textSub,
    }}>
      {children}
    </button>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function CustomerRow({ customer }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cfg = STATUS_CONFIG[customer.cycleStatus];

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: 'pointer',
          background: expanded ? '#f8faff' : hovered ? '#f8fafc' : C.surface,
          borderLeft: `2px solid ${expanded ? cfg.color : 'transparent'}`,
          transition: 'background 0.1s',
        }}
      >
        <td style={td}><StatusBadge status={customer.cycleStatus} /></td>
        <td style={td}><ChurnRiskBadge risk={customer.churnRisk} /></td>
        <td style={{ ...td, color: C.text, fontWeight: 600 }}>
          {customer.name}
          {customer.viaCustomer && (
            <div style={{ fontSize: 11, color: C.textMute, fontWeight: 400, marginTop: 1 }}>via {customer.viaCustomer}</div>
          )}
        </td>
        <td style={{ ...td, color: C.textSub }}>{customer.orderCount}</td>
        <td style={td}>{customer.lastOrderDate ? fmtDate(customer.lastOrderDate) : <span style={{ color: C.textMute }}>—</span>}</td>
        <td style={td}>{customer.avgCadenceDays ? `${customer.avgCadenceDays}d` : <span style={{ color: C.textMute }}>—</span>}</td>
        <td style={td}>
          {customer.cycleStatus === 'inactive'
            ? <span style={{ color: C.textMute }}>{customer.daysSinceLastOrder}d ago</span>
            : customer.daysOverdue != null
            ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{customer.daysOverdue}d overdue</span>
            : customer.daysUntilNext != null
            ? <span style={{ color: '#059669', fontWeight: 600 }}>in {customer.daysUntilNext}d</span>
            : <span style={{ color: C.textMute }}>—</span>}
        </td>
        <td style={{ ...td, color: C.text, fontWeight: 500 }}>{fmtCurrency(customer.totalValue)}</td>
        <td style={td}>{customer.estOrderValue != null ? fmtCurrency(customer.estOrderValue) : <span style={{ color: C.textMute }}>—</span>}</td>
        <td style={td}>{customer.estOrderQty != null ? `${customer.estOrderQty} units` : <span style={{ color: C.textMute }}>—</span>}</td>
        <td style={{ ...td, color: C.textMute, fontSize: 11, textAlign: 'center' }}>{expanded ? '▲' : '▼'}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={11} style={{ padding: 0, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ background: '#f8faff', borderTop: `1px solid ${C.border}`, padding: '16px 20px' }}>

              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16, marginBottom: 20 }}>
                <DetailItem label="Next Expected" value={customer.nextExpected ? fmtDate(customer.nextExpected) : 'Not enough history'} />
                <DetailItem label="Avg Cadence" value={customer.avgCadenceDays ? `Every ${customer.avgCadenceDays} days` : '—'} />
                <DetailItem label="Est. Order Value" value={customer.estOrderValue != null ? fmtCurrency(customer.estOrderValue) : '—'} />
                <DetailItem label="Est. Order Qty" value={customer.estOrderQty != null ? `${customer.estOrderQty} units` : '—'} />
                <DetailItem label="Lifetime Revenue" value={`${fmtCurrency(customer.totalValue)} · ${customer.orderCount} orders`} />
                <div>
                  <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Churn Risk</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <ChurnRiskBadge risk={customer.churnRisk} />
                    <span style={{ fontSize: 11, color: C.textMute }}>{customer.churnScore}/100</span>
                  </div>
                </div>
              </div>

              {/* SKU table */}
              <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                SKU / Flavor Breakdown
              </div>
              {customer.skus.length === 0 ? (
                <div style={{ color: C.textMute, fontSize: 12, padding: '10px 0' }}>No SKU data available</div>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['SKU / Flavor', 'Last Order', 'Cadence', 'Next Expected', 'Status', 'Avg Qty'].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customer.skus.map((sku, i) => (
                        <tr key={sku.name} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                          <td style={{ ...td, fontWeight: 600, color: C.text, borderBottom: i === customer.skus.length - 1 ? 'none' : undefined }}>{sku.name}</td>
                          <td style={{ ...td, borderBottom: i === customer.skus.length - 1 ? 'none' : undefined }}>{sku.lastOrderDate ? fmtDate(sku.lastOrderDate) : '—'}</td>
                          <td style={{ ...td, borderBottom: i === customer.skus.length - 1 ? 'none' : undefined }}>{sku.avgCadenceDays ? `${sku.avgCadenceDays}d` : '—'}</td>
                          <td style={{ ...td, borderBottom: i === customer.skus.length - 1 ? 'none' : undefined }}>{sku.nextExpected ? fmtDate(sku.nextExpected) : '—'}</td>
                          <td style={{ ...td, borderBottom: i === customer.skus.length - 1 ? 'none' : undefined }}>
                            {sku.daysOverdue != null
                              ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{sku.daysOverdue}d overdue</span>
                              : sku.daysUntilNext != null
                              ? <span style={{ color: '#059669', fontWeight: 600 }}>in {sku.daysUntilNext}d</span>
                              : <StatusBadge status={sku.cycleStatus} />}
                          </td>
                          <td style={{ ...td, borderBottom: i === customer.skus.length - 1 ? 'none' : undefined }}>{sku.avgQty != null ? `${sku.avgQty} units` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
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
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 48px', width: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>Order Cycle Tracker</div>
        <div style={{ fontSize: 13, color: C.textMute, marginBottom: 28 }}>Enter your password to continue</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${error ? '#fca5a5' : C.border}`, borderRadius: 8, outline: 'none', marginBottom: 8, boxSizing: 'border-box', background: C.bg, color: C.text }}
          />
          {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 600, background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: loading || !password ? 'not-allowed' : 'pointer', opacity: loading || !password ? 0.6 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('auth_token'));
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterChurnRisk, setFilterChurnRisk] = useState('all');
  const [sortBy, setSortBy] = useState('overdue');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [progress, setProgress] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setProgress('Connecting...');
    try {
      setProgress('Loading orders...');
      const url = forceRefresh ? '/api/orders?refresh=true' : '/api/orders';
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);
      if (data.error) throw new Error(data.error);
      setProgress(`Processing ${data.orders.length} orders...`);
      const processed = processOrders(data.orders);
      setCustomers(processed);
      setLastRefresh(new Date());
      setFromCache(data.cached);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setProgress('');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  const activeCustomers = customers.filter((c) => c.cycleStatus !== 'inactive');
  const inactiveCustomers = customers.filter((c) => c.cycleStatus === 'inactive');

  const sortFn = (a, b) => {
    if (sortBy === 'overdue') return (b.daysOverdue || -999) - (a.daysOverdue || -999);
    if (sortBy === 'name')    return a.name.localeCompare(b.name);
    if (sortBy === 'value')   return b.totalValue - a.totalValue;
    if (sortBy === 'orders')  return b.orderCount - a.orderCount;
    if (sortBy === 'churn')   return b.churnScore - a.churnScore;
    return 0;
  };

  const filtered = activeCustomers
    .filter((c) => {
      if (filterStatus !== 'all' && c.cycleStatus !== filterStatus) return false;
      if (filterChurnRisk !== 'all' && c.churnRisk !== filterChurnRisk) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort(sortFn);

  const filteredInactive = inactiveCustomers
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.daysSinceLastOrder || 0) - (a.daysSinceLastOrder || 0));

  const counts = {
    overdue:      activeCustomers.filter((c) => c.cycleStatus === 'overdue').length,
    due_soon:     activeCustomers.filter((c) => c.cycleStatus === 'due_soon').length,
    on_track:     activeCustomers.filter((c) => c.cycleStatus === 'on_track').length,
    new_customer: activeCustomers.filter((c) => c.cycleStatus === 'new_customer').length,
    inactive:     inactiveCustomers.length,
    highRisk:     customers.filter((c) => c.churnRisk === 'High').length,
  };
  const totalRevenue = customers.reduce((s, c) => s + c.totalValue, 0);

  const TABLE_HEADERS = ['Status', 'Risk', 'Customer', 'Orders', 'Last Order', 'Cadence', 'Next Order', 'Revenue', 'Est. Value', 'Est. Qty', ''];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#0f172a', padding: '0 32px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
            Order Cycle Tracker
          </span>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: '#475569' }}>
              {fromCache ? 'Cached' : 'Live'} · {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fetchData(false)} disabled={loading} style={{
            background: 'transparent', color: '#64748b', border: '1px solid #1e293b',
            borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
          }}>
            Use Cache
          </button>
          <button onClick={() => fetchData(true)} disabled={loading} style={{
            background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#dc2626', fontSize: 13 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '52px 32px', textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub }}>{progress || 'Loading...'}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Stat Cards */}
        {!loading && customers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Customers" value={customers.length} sub={fmtCurrency(totalRevenue)} color={C.accent} />
            <StatCard label="Overdue" value={counts.overdue} sub="Past reorder date" color="#dc2626" />
            <StatCard label="Due This Week" value={counts.due_soon} sub="Within 7 days" color="#d97706" />
            <StatCard label="On Track" value={counts.on_track} sub="No action needed" color="#059669" />
            <StatCard label="New" value={counts.new_customer} sub="Insufficient history" color={C.accent} />
            <StatCard label="Inactive" value={counts.inactive} sub={`${INACTIVE_DAYS}+ days`} color={C.textMute} />
            <StatCard label="High Risk" value={counts.highRisk} sub="Churn risk" color="#dc2626" />
          </div>
        )}

        {/* Filters */}
        {!loading && customers.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search */}
              <input
                placeholder="Search customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px',
                  fontSize: 13, outline: 'none', width: 190, color: C.text, background: C.bg,
                }}
              />

              {/* Status filters */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['all', 'overdue', 'due_soon', 'on_track', 'new_customer'].map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <FilterBtn key={s} active={filterStatus === s} color={cfg?.color} bg={cfg?.bg} border={cfg?.color} onClick={() => setFilterStatus(s)}>
                      {s === 'all' ? 'All' : cfg?.label}
                    </FilterBtn>
                  );
                })}
              </div>

              <div style={{ width: 1, height: 20, background: C.border, margin: '0 2px' }} />

              {/* Inactive toggle */}
              <FilterBtn
                active={showInactive}
                color={STATUS_CONFIG.inactive.color}
                bg={STATUS_CONFIG.inactive.bg}
                border={STATUS_CONFIG.inactive.color}
                onClick={() => setShowInactive(!showInactive)}
              >
                Inactive ({counts.inactive})
              </FilterBtn>

              {/* Sort */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 11, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{
                  border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px',
                  fontSize: 12, outline: 'none', color: C.textSub, background: C.surface, cursor: 'pointer',
                }}>
                  <option value="overdue">Most Overdue</option>
                  <option value="churn">Highest Churn Risk</option>
                  <option value="name">Name A–Z</option>
                  <option value="value">Highest Revenue</option>
                  <option value="orders">Most Orders</option>
                </select>
              </div>
            </div>

            {/* Churn risk row */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: `1px solid ${C.borderSub}` }}>
              <span style={{ fontSize: 11, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Churn</span>
              {['all', 'Low', 'Medium', 'High'].map((r) => {
                const cfg = CHURN_COLORS[r];
                return (
                  <FilterBtn key={r} active={filterChurnRisk === r} color={cfg?.color} bg={cfg?.bg} border={cfg?.color} onClick={() => setFilterChurnRisk(r)}>
                    {r === 'all' ? 'All' : r}
                  </FilterBtn>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && customers.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: C.textMute, fontSize: 13 }}>
                No customers match your filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {TABLE_HEADERS.map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => <CustomerRow key={c.id} customer={c} index={i} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && customers.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.textMute, textAlign: 'right' }}>
            {filtered.length} of {activeCustomers.length} active customers · click a row to expand
          </div>
        )}

        {/* Inactive section */}
        {!loading && showInactive && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.textSub }}>Inactive Customers</span>
              <span style={{ background: C.borderSub, color: C.textMute, borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 600 }}>
                {filteredInactive.length}
              </span>
              <span style={{ fontSize: 11, color: C.textMute }}>No orders in {INACTIVE_DAYS}+ days</span>
            </div>
            {filteredInactive.length === 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 32, textAlign: 'center', color: C.textMute, fontSize: 13 }}>
                No inactive customers match your search.
              </div>
            ) : (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', opacity: 0.85, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Status', 'Risk', 'Customer', 'Orders', 'Last Order', 'Cadence', 'Last Ordered', 'Revenue', 'Est. Value', 'Est. Qty', ''].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInactive.map((c, i) => <CustomerRow key={c.id} customer={c} index={i} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
