import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { C, fmtCurrency } from '../utils';

const BRAND_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function RevenueBrandChart({ data, loading }) {
  const rows = (data || []).filter(r => r.brand);
  const total = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20 }}>Revenue by Brand</div>

      {loading ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute, fontSize: 13 }}>
          No data for selected range
        </div>
      ) : (
        <div>
          <ResponsiveContainer width="100%" height={Math.max(100, rows.length * 52)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 80, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSub} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={fmtCurrency}
                tick={{ fontSize: 11, fill: C.textMute }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="brand"
                tick={{ fontSize: 12, fill: C.text, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={150}
              />
              <Tooltip
                formatter={(v, _name, props) => [fmtCurrency(v), props.payload.brand]}
                contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}
              />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: fmtCurrency, fontSize: 12, fill: C.textSub, fontWeight: 600 }}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r, i) => {
              const pct = total > 0 ? (r.revenue / total) * 100 : 0;
              return (
                <div key={r.brand}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: BRAND_COLORS[i % BRAND_COLORS.length], fontWeight: 600 }}>{r.brand}</span>
                    <span style={{ fontSize: 12, color: C.textSub }}>
                      {pct.toFixed(1)}% · {r.units?.toLocaleString()} units
                    </span>
                  </div>
                  <div style={{ height: 5, background: C.borderSub, borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: BRAND_COLORS[i % BRAND_COLORS.length], borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
