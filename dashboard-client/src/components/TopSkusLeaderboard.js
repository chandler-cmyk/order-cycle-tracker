import { useState, useEffect } from 'react';
import { C, fmtCurrency, fmtNumber } from '../utils';

const th = {
  padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em',
  background: C.bg, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
};
const td = {
  padding: '9px 14px', fontSize: 13, color: C.textSub,
  borderBottom: `1px solid ${C.borderSub}`, whiteSpace: 'nowrap',
};

export default function TopSkusLeaderboard({ dateRange, filters }) {
  const [sortBy, setSortBy]   = useState('revenue');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateRange.start)       p.set('start',      dateRange.start);
    if (dateRange.end)         p.set('end',        dateRange.end);
    if (filters.brands.length) p.set('brands',     filters.brands.join(','));
    if (filters.categories.length) p.set('categories', filters.categories.join(','));
    if (filters.sku)           p.set('sku',        filters.sku);
    p.set('sort',     sortBy);
    p.set('order',    'desc');
    p.set('page',     '1');
    p.set('pageSize', '15');
    fetch(`/api/dashboard/products?${p.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateRange, filters, sortBy]);

  const items = data?.items || [];

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Top 15 Products</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['revenue', 'units'].map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
                border:      `1px solid ${sortBy === s ? C.accent : C.border}`,
                background:  sortBy === s ? C.accentBg : C.surface,
                color:       sortBy === s ? C.accent   : C.textMute,
              }}
            >
              {s === 'revenue' ? 'By Revenue' : 'By Units'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMute, fontSize: 13 }}>No products found</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 32 }}>#</th>
              <th style={th}>Product</th>
              <th style={{ ...th, textAlign: 'right' }}>Units</th>
              <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${item.sku}-${i}`}>
                <td style={{ ...td, color: C.textMute, fontWeight: 700, fontSize: 12 }}>{i + 1}</td>
                <td style={{ ...td, maxWidth: 260 }}>
                  <div style={{ fontWeight: 500, color: C.text, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name || item.sku || '—'}
                  </div>
                  {item.sku && (
                    <div style={{ fontSize: 10, color: C.textMute, fontFamily: 'monospace', marginTop: 1 }}>{item.sku}</div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtNumber(item.units)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.text }}>{fmtCurrency(item.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
