import { C, fmtCurrency, fmtNumber } from '../utils';

function YoYBadge({ current, prev }) {
  if (prev == null || prev === 0) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const up  = pct >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
      background: up ? '#ecfdf5' : '#fef2f2',
      color:      up ? '#059669' : '#dc2626',
      border:     `1px solid ${up ? '#a7f3d0' : '#fecaca'}`,
      marginLeft: 6,
      verticalAlign: 'middle',
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Card({ label, value, accent, yoyCurrent, yoyPrev, prevLabel }) {
  const a = accent || C.accent;
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '22px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
      borderTop: `3px solid ${a}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* radial glow in top-right */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 120, height: 120, borderRadius: '50%',
        background: `radial-gradient(circle, ${a}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        fontSize: 10, color: C.textMute, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: C.text, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {value}
        </span>
        <YoYBadge current={yoyCurrent} prev={yoyPrev} />
      </div>
      {prevLabel != null && yoyPrev != null && yoyPrev !== 0 && (
        <div style={{ fontSize: 11, color: C.textMute, marginTop: 2 }}>
          {prevLabel} prior year
        </div>
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
          borderRadius: 14, padding: '22px 24px', height: 110,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  );

  if (!data) return null;

  const prev = data.prev || {};

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      <Card
        label="Total Revenue"
        value={fmtCurrency(data.totalRevenue)}
        accent={C.accent}
        yoyCurrent={data.totalRevenue}
        yoyPrev={prev.totalRevenue}
        prevLabel={prev.totalRevenue != null ? fmtCurrency(prev.totalRevenue) : null}
      />
      <Card
        label="Order Count"
        value={fmtNumber(data.orderCount)}
        accent="#059669"
        yoyCurrent={data.orderCount}
        yoyPrev={prev.orderCount}
        prevLabel={prev.orderCount != null ? fmtNumber(prev.orderCount) : null}
      />
      <Card
        label="Avg Order Value"
        value={fmtCurrency(data.avgOrderValue)}
        accent="#d97706"
        yoyCurrent={data.avgOrderValue}
        yoyPrev={prev.avgOrderValue}
        prevLabel={prev.avgOrderValue != null ? fmtCurrency(prev.avgOrderValue) : null}
      />
      <Card
        label="Units Sold"
        value={fmtNumber(data.unitsSold)}
        accent="#7c3aed"
        yoyCurrent={data.unitsSold}
        yoyPrev={prev.unitsSold}
        prevLabel={prev.unitsSold != null ? fmtNumber(prev.unitsSold) : null}
      />
    </div>
  );
}
