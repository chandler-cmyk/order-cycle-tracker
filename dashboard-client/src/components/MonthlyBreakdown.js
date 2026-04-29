import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { C, fmtCurrency } from '../utils';

function formatMonth(m) {
  if (!m) return '';
  const [year, month] = m.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function MonthlyBreakdown({ data, loading }) {
  const rows = data || [];
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const topMonths = new Set(sorted.slice(0, 5).map(r => r.month));
  const maxRevenue = rows.reduce((m, r) => Math.max(m, r.revenue), 0);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Monthly Revenue</div>
          <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>
            All time · {rows.length} months · top 5 highlighted
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute, fontSize: 13 }}>
          No data
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 28 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.borderSub} vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fontSize: 10, fill: C.textMute }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={v => {
                    if (v >= 1000) return `$${Math.round(v / 1000)}K`;
                    return `$${v}`;
                  }}
                  tick={{ fontSize: 11, fill: C.textMute }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(v) => [fmtCurrency(v), 'Revenue']}
                  labelFormatter={formatMonth}
                  contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}
                />
                <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                  {rows.map((r) => (
                    <Cell
                      key={r.month}
                      fill={topMonths.has(r.month) ? C.accent : C.accentBg}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ width: 188, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMute, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Top Months
            </div>
            {sorted.slice(0, 5).map((r, i) => (
              <div key={r.month} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: C.accentBg, color: C.accent,
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{formatMonth(r.month)}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: C.textMute, fontWeight: 600 }}>{fmtCurrency(r.revenue)}</span>
                    <span style={{ fontSize: 11, color: C.textMute }}>{r.orders} orders</span>
                  </div>
                  <div style={{ marginTop: 3, height: 3, background: C.borderSub, borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${maxRevenue > 0 ? (r.revenue / maxRevenue) * 100 : 0}%`, background: C.accent, borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
