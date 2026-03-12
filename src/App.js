import { useState, useEffect, useCallback } from 'react';
import { STATUS_CONFIG, INACTIVE_DAYS, fmtDate, fmtCurrency, processOrders } from './utils';

// ─── Shared Styles ────────────────────────────────────────────────────────────
const td = {
  padding: '12px 16px', fontSize: 13, color: '#374151',
  borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap',
};
const dlabel = {
  fontSize: 11, color: '#9ca3af', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};
const dval = { fontSize: 13, color: '#111827', fontWeight: 500 };

const CHURN_COLORS = {
  Low:    { color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
  Medium: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  High:   { color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: '20px 24px', borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#111827', fontFamily: "'Syne', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.on_track;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, letterSpacing: '0.03em',
    }}>
      {cfg.label}
    </span>
  );
}

function ChurnRiskBadge({ risk }) {
  const cfg = CHURN_COLORS[risk] || { color: '#9ca3af', bg: '#f9fafb', border: '#d1d5db' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, letterSpacing: '0.03em',
    }}>
      {risk}
    </span>
  );
}

function CustomerRow({ customer, index }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cfg = STATUS_CONFIG[customer.cycleStatus];
  const base = index % 2 === 0 ? '#fafafa' : '#fff';

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: 'pointer',
          background: hovered ? '#f0f9ff' : base,
          borderLeft: `3px solid ${expanded ? cfg.color : 'transparent'}`,
          transition: 'background 0.12s',
        }}
      >
        <td style={td}><StatusBadge status={customer.cycleStatus} /></td>
        <td style={td}><ChurnRiskBadge risk={customer.churnRisk} /></td>
        <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
          {customer.name}
          {customer.viaCustomer && (
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginTop: 2 }}>via {customer.viaCustomer}</div>
          )}
        </td>
        <td style={td}>{customer.orderCount}</td>
        <td style={td}>{customer.lastOrderDate ? fmtDate(customer.lastOrderDate) : '—'}</td>
        <td style={td}>{customer.avgCadenceDays ? `Every ${customer.avgCadenceDays}d` : '—'}</td>
        <td style={td}>
          {customer.cycleStatus === 'inactive'
            ? <span style={{ color: '#6b7280' }}>{customer.daysSinceLastOrder}d ago</span>
            : customer.daysOverdue != null
            ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{customer.daysOverdue}d overdue</span>
            : customer.daysUntilNext != null
            ? <span style={{ color: '#10b981', fontWeight: 600 }}>In {customer.daysUntilNext}d</span>
            : <span style={{ color: '#9ca3af' }}>—</span>}
        </td>
        <td style={td}>{fmtCurrency(customer.totalValue)}</td>
        <td style={td}>{customer.estOrderValue != null ? fmtCurrency(customer.estOrderValue) : <span style={{ color: '#9ca3af' }}>—</span>}</td>
        <td style={td}>{customer.estOrderQty != null ? `${customer.estOrderQty} units` : <span style={{ color: '#9ca3af' }}>—</span>}</td>
        <td style={{ ...td, color: '#9ca3af', fontSize: 10 }}>{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr style={{ background: '#f8faff' }}>
          <td colSpan={11} style={{ padding: '14px 24px 18px' }}>
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', marginBottom: 20 }}>
              <div>
                <div style={dlabel}>Next Expected Order</div>
                <div style={dval}>{customer.nextExpected ? fmtDate(customer.nextExpected) : 'Not enough order history'}</div>
              </div>
              <div>
                <div style={dlabel}>Avg Order Cadence</div>
                <div style={dval}>{customer.avgCadenceDays ? `${customer.avgCadenceDays} days` : '—'}</div>
              </div>
              <div>
                <div style={dlabel}>Est. Order Value</div>
                <div style={dval}>{customer.estOrderValue != null ? fmtCurrency(customer.estOrderValue) : '—'}</div>
              </div>
              <div>
                <div style={dlabel}>Est. Order Qty</div>
                <div style={dval}>{customer.estOrderQty != null ? `${customer.estOrderQty} units` : '—'}</div>
              </div>
              <div>
                <div style={dlabel}>Churn Risk Score</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ChurnRiskBadge risk={customer.churnRisk} />
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{customer.churnScore}/100</span>
                </div>
              </div>
              <div>
                <div style={dlabel}>Total Lifetime Value</div>
                <div style={dval}>{customer.orderCount} orders · {fmtCurrency(customer.totalValue)}</div>
              </div>
            </div>

            {/* Per-SKU Breakdown */}
            <div>
              <div style={dlabel}>SKU / Flavor Breakdown</div>
              {customer.skus.length === 0 ? (
                <span style={{ color: '#9ca3af', fontSize: 13 }}>No SKU data — line items not available from Zoho list API</span>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        {['SKU / Flavor', 'Last Order', 'Avg Cadence', 'Next Expected', 'Status', 'Avg Qty (last 3)'].map((h) => (
                          <th key={h} style={{
                            padding: '7px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                            color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em',
                            borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customer.skus.map((sku) => (
                        <tr key={sku.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#111827' }}>{sku.name}</td>
                          <td style={{ padding: '7px 12px', color: '#374151' }}>{sku.lastOrderDate ? fmtDate(sku.lastOrderDate) : '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#374151' }}>{sku.avgCadenceDays ? `${sku.avgCadenceDays}d` : '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#374151' }}>{sku.nextExpected ? fmtDate(sku.nextExpected) : '—'}</td>
                          <td style={{ padding: '7px 12px' }}>
                            {sku.daysOverdue != null
                              ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{sku.daysOverdue}d overdue</span>
                              : sku.daysUntilNext != null
                              ? <span style={{ color: '#10b981', fontWeight: 600 }}>In {sku.daysUntilNext}d</span>
                              : <StatusBadge status={sku.cycleStatus} />}
                          </td>
                          <td style={{ padding: '7px 12px', color: '#374151' }}>{sku.avgQty != null ? `${sku.avgQty} units` : '—'}</td>
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
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
    setProgress('Connecting to server...');
    try {
      setProgress('Loading orders from Zoho Inventory...');
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

  const activeCustomers = customers.filter((c) => c.cycleStatus !== 'inactive');
  const inactiveCustomers = customers.filter((c) => c.cycleStatus === 'inactive');

  const sortFn = (a, b) => {
    if (sortBy === 'overdue') return (b.daysOverdue || -999) - (a.daysOverdue || -999);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'value') return b.totalValue - a.totalValue;
    if (sortBy === 'orders') return b.orderCount - a.orderCount;
    if (sortBy === 'churn') return b.churnScore - a.churnScore;
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

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ background: '#0f172a', padding: '22px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            📦 Order Cycle Tracker
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
            {lastRefresh
              ? `${fromCache ? '📋 Cached data · ' : '🔄 Live data · '}Last synced ${lastRefresh.toLocaleTimeString()}`
              : 'Connecting...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => fetchData(false)} disabled={loading}
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Use Cache
          </button>
          <button onClick={() => fetchData(true)} disabled={loading}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            {loading ? 'Loading...' : '↻ Refresh Live'}
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 20, color: '#dc2626', fontSize: 13 }}>
            <strong>⚠ Error:</strong> {error}
            <div style={{ marginTop: 6, color: '#9ca3af', fontSize: 12 }}>
              Make sure the backend server is running: open a terminal in VS Code and run <code>node server.js</code>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '48px 32px', textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>{progress || 'Loading...'}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Token refresh is automatic — no action needed</div>
          </div>
        )}

        {/* Stat Cards */}
        {!loading && customers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Customers" value={customers.length} sub={`${fmtCurrency(totalRevenue)} total revenue`} accent="#6366f1" />
            <StatCard label="Overdue" value={counts.overdue} sub="Past reorder date" accent="#ef4444" />
            <StatCard label="Due This Week" value={counts.due_soon} sub="Reorder within 7 days" accent="#f59e0b" />
            <StatCard label="On Track" value={counts.on_track} sub="No action needed" accent="#10b981" />
            <StatCard label="New Customers" value={counts.new_customer} sub="Not enough history yet" accent="#6366f1" />
            <StatCard label="Inactive" value={counts.inactive} sub={`No orders in ${INACTIVE_DAYS}+ days`} accent="#6b7280" />
            <StatCard label="High Risk" value={counts.highRisk} sub="High churn probability" accent="#ef4444" />
          </div>
        )}

        {/* Filters */}
        {!loading && customers.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Row 1: search + status filters + inactive toggle + sort */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Search customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 14px', fontSize: 13, outline: 'none', width: 200 }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['all', 'overdue', 'due_soon', 'on_track', 'new_customer'].map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const active = filterStatus === s;
                  return (
                    <button key={s} onClick={() => setFilterStatus(s)} style={{
                      padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: active ? `1px solid ${cfg?.color || '#6366f1'}` : '1px solid #e5e7eb',
                      background: active ? (cfg?.bg || '#eef2ff') : '#fff',
                      color: active ? (cfg?.color || '#6366f1') : '#6b7280',
                    }}>
                      {s === 'all' ? 'All' : cfg?.label}
                    </button>
                  );
                })}
                <span style={{ width: 1, background: '#e5e7eb', margin: '0 4px' }} />
                <button onClick={() => setShowInactive(!showInactive)} style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: showInactive ? `1px solid ${STATUS_CONFIG.inactive.color}` : '1px solid #e5e7eb',
                  background: showInactive ? STATUS_CONFIG.inactive.bg : '#fff',
                  color: showInactive ? STATUS_CONFIG.inactive.color : '#6b7280',
                }}>
                  Inactive ({counts.inactive})
                </button>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Sort:</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }}>
                  <option value="overdue">Most Overdue</option>
                  <option value="churn">Highest Churn Risk</option>
                  <option value="name">Name A–Z</option>
                  <option value="value">Highest Revenue</option>
                  <option value="orders">Most Orders</option>
                </select>
              </div>
            </div>

            {/* Row 2: churn risk filters */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Churn Risk:</span>
              {['all', 'Low', 'Medium', 'High'].map((r) => {
                const active = filterChurnRisk === r;
                const cfg = CHURN_COLORS[r];
                return (
                  <button key={r} onClick={() => setFilterChurnRisk(r)} style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: active ? `1px solid ${cfg?.color || '#6366f1'}` : '1px solid #e5e7eb',
                    background: active ? (cfg?.bg || '#eef2ff') : '#fff',
                    color: active ? (cfg?.color || '#6366f1') : '#6b7280',
                  }}>
                    {r === 'all' ? 'All Risk' : r}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && customers.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                No customers match your current filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                      {['Status', 'Churn Risk', 'Customer', 'Orders', 'Last Order', 'Cadence', 'Next Order', 'Revenue', 'Est. Order Value', 'Est. Qty', ''].map((h) => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
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
          <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
            Showing {filtered.length} of {activeCustomers.length} active customers · Click any row to expand details
          </div>
        )}

        {/* Inactive Customers Section */}
        {!loading && showInactive && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: '#374151' }}>
                Inactive Customers
              </div>
              <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                {filteredInactive.length}
              </span>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No orders in {INACTIVE_DAYS}+ days</div>
            </div>
            {filteredInactive.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                No inactive customers match your search.
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', opacity: 0.85 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                        {['Status', 'Churn Risk', 'Customer', 'Orders', 'Last Order', 'Cadence', 'Last Ordered', 'Revenue', 'Est. Order Value', 'Est. Qty', ''].map((h) => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
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
