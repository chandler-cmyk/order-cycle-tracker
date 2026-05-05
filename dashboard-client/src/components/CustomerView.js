import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import { C, fmtCurrency, fmtNumber, fmtDate, buildQuery, exportToCsv } from '../utils';

const th = {
  padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em',
  background: C.bg, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
};
const td = {
  padding: '9px 14px', fontSize: 13, color: C.textSub,
  borderBottom: `1px solid ${C.borderSub}`,
};

const STATUS_BADGES = {
  paid:            { label: 'Paid',     color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  closed:          { label: 'Closed',   color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  overdue:         { label: 'Overdue',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  sent:            { label: 'Open',     color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  partially_paid:  { label: 'Partial',  color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  draft:           { label: 'Draft',    color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
  void:            { label: 'Void',     color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
};

const CYCLE_STATUS_CFG = {
  overdue:      { label: 'Overdue',   color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  due_soon:     { label: 'Due Soon',  color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  on_track:     { label: 'On Track',  color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
  new_customer: { label: 'New',       color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
  inactive:     { label: 'Inactive',  color: '#6b7280', bg: '#f9fafb', border: '#d1d5db' },
};

const CHURN_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };

function StatusBadge({ status }) {
  const cfg = STATUS_BADGES[status] || { label: status, color: C.textMute, bg: C.bg, border: C.border };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      fontSize: 11, fontWeight: 600,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function CycleBadge({ status }) {
  const cfg = CYCLE_STATUS_CFG[status];
  if (!cfg) return <span style={{ color: C.textMute, fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      fontSize: 11, fontWeight: 600,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function fmtShortDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Customer detail panel ──────────────────────────────────────────────────────
function CustomerDetail({ customer, dateRange, filters, cycleData, subAccounts, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = buildQuery(dateRange, filters);
    fetch(`/api/dashboard/customers/${encodeURIComponent(customer.customer_id)}${q}`)
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [customer.customer_id, dateRange, filters]);

  const trendData = (detail?.trend || []).map(d => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div>
      {/* Back button + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: `1px solid ${C.border}`,
            background: C.surface, color: C.textSub,
          }}
        >
          ← Back
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{customer.customer_name}</div>
          <div style={{ fontSize: 12, color: C.textMute }}>
            {fmtNumber(customer.orderCount)} invoices · {fmtCurrency(customer.revenue)} revenue
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: 20, fontSize: 13 }}>{error}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Reorder Intelligence */}
          {cycleData && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Reorder Intelligence</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Order Status</div>
                  <CycleBadge status={cycleData.cycleStatus} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Avg Reorder Cycle</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    {cycleData.avgCadenceDays ? `Every ${cycleData.avgCadenceDays} days` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    {cycleData.daysOverdue ? 'Days Overdue' : 'Next Expected'}
                  </div>
                  {cycleData.daysOverdue ? (
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{cycleData.daysOverdue} days late</div>
                  ) : cycleData.nextExpected ? (
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtShortDate(cycleData.nextExpected)}</div>
                      {cycleData.daysUntilNext != null && (
                        <div style={{ fontSize: 11, color: C.textMute, marginTop: 2 }}>in {cycleData.daysUntilNext} days</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textMute }}>—</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Churn Risk</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: CHURN_COLORS[cycleData.churnRisk] || C.textMute }}>
                      {cycleData.churnScore}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: CHURN_COLORS[cycleData.churnRisk] || C.textMute }}>{cycleData.churnRisk}</div>
                      <div style={{ width: 48, height: 4, borderRadius: 2, background: C.border, marginTop: 3 }}>
                        <div style={{ width: `${cycleData.churnScore}%`, height: '100%', borderRadius: 2, background: CHURN_COLORS[cycleData.churnRisk] || C.textMute }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-accounts */}
              {subAccounts && subAccounts.length > 0 && (
                <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    Sub-Accounts ({subAccounts.length})
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Name</th>
                        <th style={th}>Status</th>
                        <th style={{ ...th, textAlign: 'right' }}>Orders</th>
                        <th style={th}>Avg Cycle</th>
                        <th style={th}>Next Expected</th>
                        <th style={{ ...th, textAlign: 'right' }}>Churn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subAccounts.map((sub, i) => (
                        <tr key={sub.id} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                          <td style={{ ...td, fontWeight: 600, color: C.text, fontSize: 12 }}>{sub.name}</td>
                          <td style={td}><CycleBadge status={sub.cycleStatus} /></td>
                          <td style={{ ...td, textAlign: 'right' }}>{sub.orderCount}</td>
                          <td style={td}>{sub.avgCadenceDays ? `${sub.avgCadenceDays}d` : '—'}</td>
                          <td style={td}>
                            {sub.daysOverdue
                              ? <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 12 }}>{sub.daysOverdue}d late</span>
                              : sub.nextExpected
                                ? fmtShortDate(sub.nextExpected)
                                : '—'
                            }
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: CHURN_COLORS[sub.churnRisk] || C.textMute }}>
                            {sub.churnScore}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Revenue over time */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Revenue Over Time</div>
            {trendData.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.textMute, fontSize: 13 }}>No revenue data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.accent} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.borderSub} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.textMute }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => fmtCurrency(v)} tick={{ fontSize: 11, fill: C.textMute }} axisLine={false} tickLine={false} width={68} />
                  <Tooltip
                    content={({ active, payload }) => active && payload?.length ? (
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: 11, color: C.textMute }}>{payload[0]?.payload?.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>{fmtCurrency(payload[0]?.value)}</div>
                      </div>
                    ) : null}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={C.accent} strokeWidth={2} fill="url(#custGrad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Top SKUs */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Top SKUs</div>
              </div>
              {(detail?.topSkus || []).length === 0 ? (
                <div style={{ padding: 24, color: C.textMute, fontSize: 13 }}>No SKU data</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Item</th>
                      <th style={{ ...th, textAlign: 'right' }}>Units</th>
                      <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail?.topSkus || []).map((s, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                        <td style={{ ...td, borderBottom: i === (detail?.topSkus?.length || 1) - 1 ? 'none' : undefined }}>
                          <div style={{ fontWeight: 500, color: C.text, fontSize: 12 }}>{s.name || s.sku || '—'}</div>
                          {s.sku && <div style={{ fontSize: 10, color: C.textMute, fontFamily: 'monospace', marginTop: 1 }}>{s.sku}</div>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', borderBottom: i === (detail?.topSkus?.length || 1) - 1 ? 'none' : undefined }}>{fmtNumber(s.units)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.text, borderBottom: i === (detail?.topSkus?.length || 1) - 1 ? 'none' : undefined }}>{fmtCurrency(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Invoice + Credit Note + Sales Return history */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Invoice History</div>
                {((detail?.creditNotes || []).length + (detail?.salesReturns || []).length) > 0 && (
                  <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                    {(detail?.creditNotes || []).length + (detail?.salesReturns || []).length} return{((detail?.creditNotes || []).length + (detail?.salesReturns || []).length) > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {(detail?.invoices || []).length === 0 ? (
                <div style={{ padding: 24, color: C.textMute, fontSize: 13 }}>No invoices found</div>
              ) : (
                <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Doc #</th>
                        <th style={th}>Date</th>
                        <th style={th}>Status</th>
                        <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Invoices */}
                      {(detail?.invoices || []).map((inv, i) => (
                        <tr key={inv.invoice_id} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{inv.invoice_number || inv.invoice_id}</td>
                          <td style={td}>{fmtDate(inv.date)}</td>
                          <td style={td}><StatusBadge status={inv.status} /></td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.text }}>{fmtCurrency(inv.total)}</td>
                        </tr>
                      ))}
                      {/* Credit notes */}
                      {(detail?.creditNotes || []).map(cn => (
                        <tr key={cn.creditnote_id} style={{ background: '#fff5f5' }}>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#dc2626' }}>
                            {cn.creditnote_number || cn.creditnote_id}
                            <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 5px' }}>CN</span>
                          </td>
                          <td style={td}>{fmtDate(cn.date)}</td>
                          <td style={td}><StatusBadge status={cn.status} /></td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>−{fmtCurrency(cn.total)}</td>
                        </tr>
                      ))}
                      {/* Sales returns */}
                      {(detail?.salesReturns || []).map(sr => (
                        <tr key={sr.salesreturn_id} style={{ background: '#fff5f5' }}>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#dc2626' }}>
                            {sr.salesreturn_number || sr.salesreturn_id}
                            <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 5px' }}>RMA</span>
                          </td>
                          <td style={td}>{fmtDate(sr.date)}</td>
                          <td style={td}><StatusBadge status={sr.status} /></td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>−{fmtCurrency(sr.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SEGMENT_CFG = {
  new:       { label: 'New',       color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  returning: { label: 'Returning', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  at_risk:   { label: 'At Risk',   color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
};

function SegmentBadge({ segment }) {
  const cfg = SEGMENT_CFG[segment];
  if (!cfg) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 5,
      fontSize: 10, fontWeight: 700,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Customer list ──────────────────────────────────────────────────────────────
export default function CustomerView({ dateRange, filters, filterOptions, onFiltersChange }) {
  const [customers, setCustomers]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [selected, setSelected]             = useState(null);
  const [search, setSearch]                 = useState('');
  const [segmentFilter, setSegmentFilter]   = useState('all');
  const [cycleFilter, setCycleFilter]       = useState('all');
  const [orderCycles, setOrderCycles]       = useState({ map: {}, subsByParent: {} });
  const [cyclesLoading, setCyclesLoading]   = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = buildQuery(dateRange, filters);
    fetch(`/api/dashboard/customers${q}`)
      .then(r => r.json())
      .then(d => { setCustomers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateRange, filters]);

  useEffect(() => { load(); setSelected(null); }, [load]);

  // Load order cycle data once on mount — not date-range dependent
  useEffect(() => {
    setCyclesLoading(true);
    fetch('/api/dashboard/order-cycles')
      .then(r => r.json())
      .then(d => {
        const all = d.customers || [];
        const map = {};
        const subsByParent = {};
        all.forEach(c => {
          const key = (c.name || '').toLowerCase();
          if (c.isSubCustomer) {
            const parentKey = (c.viaCustomer || '').toLowerCase();
            if (!subsByParent[parentKey]) subsByParent[parentKey] = [];
            subsByParent[parentKey].push(c);
          } else {
            map[key] = c;
          }
        });
        setOrderCycles({ map, subsByParent });
        setCyclesLoading(false);
      })
      .catch(() => setCyclesLoading(false));
  }, []);

  if (selected) {
    const cycleKey = (selected.customer_name || '').toLowerCase();
    return (
      <CustomerDetail
        customer={selected}
        dateRange={dateRange}
        filters={filters}
        cycleData={orderCycles.map[cycleKey]}
        subAccounts={orderCycles.subsByParent[cycleKey] || []}
        onBack={() => setSelected(null)}
      />
    );
  }

  const counts = { all: customers.length, new: 0, returning: 0, at_risk: 0 };
  customers.forEach(c => { if (counts[c.segment] != null) counts[c.segment]++; });

  const filtered = customers.filter(c => {
    if (search && !c.customer_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (segmentFilter !== 'all' && c.segment !== segmentFilter) return false;
    if (cycleFilter !== 'all') {
      const cycle = orderCycles.map[(c.customer_name || '').toLowerCase()];
      if (!cycle || cycle.cycleStatus !== cycleFilter) return false;
    }
    return true;
  });

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Customer Revenue</div>
          {!loading && <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>{customers.length} customers — click any row to drill in</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!loading && customers.length > 0 && (
            <button
              onClick={() => exportToCsv(
                'customers.csv',
                ['Customer Name', 'Invoices', 'Revenue'],
                customers.map(c => [c.customer_name, c.orderCount, c.revenue?.toFixed(2)])
              )}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${C.border}`,
                background: C.surface, color: C.textSub, whiteSpace: 'nowrap',
              }}
            >
              ↓ Export CSV
            </button>
          )}
          <input
            placeholder="Search customers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px',
              fontSize: 12, outline: 'none', color: C.text, background: C.bg, width: 200,
            }}
          />
        </div>
      </div>

      {/* Filters row */}
      {!loading && customers.length > 0 && (
        <div style={{ padding: '8px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Segment tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'all',       label: 'All' },
              { key: 'new',       label: 'New' },
              { key: 'returning', label: 'Returning' },
              { key: 'at_risk',   label: 'At Risk' },
            ].map(({ key, label }) => {
              const active = segmentFilter === key;
              const cfg    = SEGMENT_CFG[key];
              return (
                <button key={key} onClick={() => setSegmentFilter(key)} style={{
                  padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border:     `1px solid ${active ? (cfg?.color || C.accent) : C.border}`,
                  background: active ? (cfg?.bg || C.accentBg) : C.surface,
                  color:      active ? (cfg?.color || C.accent) : C.textMute,
                }}>
                  {label} <span style={{ opacity: 0.7 }}>({counts[key]})</span>
                </button>
              );
            })}
          </div>

          {/* Cycle status filter */}
          {!cyclesLoading && Object.keys(orderCycles.map).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: C.textMute, fontWeight: 600 }}>Order Status:</span>
              <select
                value={cycleFilter}
                onChange={e => setCycleFilter(e.target.value)}
                style={{
                  border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 8px',
                  fontSize: 11, color: C.text, background: C.surface, cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="due_soon">Due Soon</option>
                <option value="on_track">On Track</option>
                <option value="new_customer">New</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.textMute, fontSize: 13 }}>No customers found</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Customer</th>
              <th style={th}>Segment</th>
              <th style={{ ...th, textAlign: 'right' }}>Invoices</th>
              <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
              <th style={th}>Last Order</th>
              <th style={th}>Order Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Churn Risk</th>
              <th style={th}>Next Expected</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <CustomerRow
                key={c.customer_id}
                rank={i + 1}
                customer={c}
                cycleData={orderCycles.map[(c.customer_name || '').toLowerCase()]}
                onClick={() => setSelected(c)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CustomerRow({ rank, customer, cycleData, onClick }) {
  const [hovered, setHovered] = useState(false);

  const nextExpectedDisplay = () => {
    if (!cycleData) return '—';
    if (cycleData.daysOverdue) return (
      <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 12 }}>{cycleData.daysOverdue}d late</span>
    );
    if (cycleData.nextExpected) return fmtShortDate(cycleData.nextExpected);
    return '—';
  };

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer', background: hovered ? '#f0f7ff' : C.surface, transition: 'background 0.1s' }}
    >
      <td style={{ ...td, color: C.textMute, width: 40, fontVariantNumeric: 'tabular-nums' }}>{rank}</td>
      <td style={{ ...td, color: C.text, fontWeight: 600 }}>{customer.customer_name || '—'}</td>
      <td style={td}><SegmentBadge segment={customer.segment} /></td>
      <td style={{ ...td, textAlign: 'right' }}>{fmtNumber(customer.orderCount)}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.text }}>{fmtCurrency(customer.revenue)}</td>
      <td style={{ ...td, fontSize: 12 }}>
        {fmtShortDate(cycleData?.lastOrderDate || customer.lastOrderDate)}
      </td>
      <td style={td}>
        {cycleData ? <CycleBadge status={cycleData.cycleStatus} /> : <span style={{ color: C.textMute, fontSize: 12 }}>—</span>}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        {cycleData ? (
          <span style={{ fontWeight: 700, color: CHURN_COLORS[cycleData.churnRisk] || C.textMute }}>
            {cycleData.churnScore}
          </span>
        ) : <span style={{ color: C.textMute, fontSize: 12 }}>—</span>}
      </td>
      <td style={{ ...td, fontSize: 12 }}>{nextExpectedDisplay()}</td>
      <td style={{ ...td, color: C.textMute, fontSize: 11 }}>
        {hovered && <span style={{ color: C.accent }}>View details →</span>}
      </td>
    </tr>
  );
}
