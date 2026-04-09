import { useState, useEffect } from 'react';
import { C, fmtCurrency, fmtNumber } from '../utils';

const STATUS_CFG = {
  overdue:        { label: 'Overdue',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  sent:           { label: 'Open',         color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  partially_paid: { label: 'Partial Pay',  color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
};

export default function OutstandingInvoicesTile() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch('/api/dashboard/outstanding')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
        return d;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const rows = Array.isArray(data?.rows) ? data.rows : [];

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Outstanding Invoices</div>
        <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>Current state — not date filtered</div>
      </div>

      {loading ? (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>
      ) : !data ? (
        <div style={{ padding: 20, color: C.textMute, fontSize: 13 }}>No data</div>
      ) : (
        <div style={{ padding: '20px 20px' }}>
          <div style={{ display: 'flex', gap: 32, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Total Outstanding
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>
                {fmtCurrency(data.totalValue)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Invoices
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>
                {fmtNumber(data.totalCount)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(row => {
              const cfg = STATUS_CFG[row.status] || { label: row.status, color: C.textMute, bg: C.bg, border: C.border };
              return (
                <div key={row.status} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8,
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: cfg.color, opacity: 0.75 }}>
                      {fmtNumber(row.count)} invoice{row.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>
                    {fmtCurrency(row.value)}
                  </span>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div style={{ color: C.textMute, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                No outstanding invoices
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
