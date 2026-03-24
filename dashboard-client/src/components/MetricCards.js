import { C, fmtCurrency, fmtNumber } from '../utils';

function Card({ label, value, sub, accent }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      borderTop: `3px solid ${accent || C.accent}`,
    }}>
      <div style={{
        fontSize: 10, color: C.textMute, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: C.text, lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: C.textMute }}>{sub}</div>
      )}
    </div>
  );
}

export default function MetricCards({ data, loading }) {
  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '20px 24px', height: 100,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  );

  if (!data) return null;

  const aov = data.avgOrderValue;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      <Card
        label="Total Revenue"
        value={fmtCurrency(data.totalRevenue)}
        accent={C.accent}
      />
      <Card
        label="Order Count"
        value={fmtNumber(data.orderCount)}
        sub="Invoices (paid/closed)"
        accent="#059669"
      />
      <Card
        label="Avg Order Value"
        value={fmtCurrency(aov)}
        accent="#d97706"
      />
      <Card
        label="Units Sold"
        value={fmtNumber(data.unitsSold)}
        accent="#7c3aed"
      />
    </div>
  );
}
