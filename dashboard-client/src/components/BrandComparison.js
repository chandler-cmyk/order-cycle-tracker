import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { C, fmtCurrency, fmtNumber, fmtDate } from '../utils';

const BRAND_COLORS = {
  lunchboxx: '#6366f1',
  nysw:      '#f59e0b',
};

const BRAND_LABELS = {
  lunchboxx: 'LunchBoxx',
  nysw:      "Not Ya Son's Weed",
};

function formatPeriod(period, group) {
  if (!period) return '';
  if (group === 'weekly') {
    const [year, week] = period.split('-');
    return `Wk ${week} '${String(year).slice(2)}`;
  }
  return new Date(period + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label, group }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontSize: 11, color: C.textMute, marginBottom: 6 }}>
        {group === 'weekly' ? label : fmtDate(payload[0]?.payload?.period)}
      </div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ fontSize: 12, color: C.textSub }}>{BRAND_LABELS[p.dataKey]}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, marginLeft: 'auto', paddingLeft: 16 }}>
            {fmtCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

function SummaryCard({ brand, color }) {
  const totalRev = brand.revenue || 0;
  return (
    <div style={{
      flex: 1, padding: '16px 20px', borderRadius: 10,
      border: `2px solid ${color}22`,
      background: `${color}08`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{brand.name}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Revenue</div>
          <div style={{ fontSize: 20, fontWeight: 800, color }}>{fmtCurrency(totalRev)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Units</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fmtNumber(brand.units)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Orders</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fmtNumber(brand.orderCount)}</div>
        </div>
      </div>
    </div>
  );
}

export default function BrandComparison({ dateRange, filters }) {
  const [group, setGroup]     = useState('daily');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateRange.start) p.set('start', dateRange.start);
    if (dateRange.end)   p.set('end',   dateRange.end);
    p.set('group', group);
    fetch(`/api/dashboard/brand-comparison?${p.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateRange, group]);

  const brands   = data?.brands || [];
  const merged   = (data?.merged || []).map(d => ({ ...d, label: formatPeriod(d.period, group) }));
  const lb       = brands.find(b => b.name === 'LunchBoxx');
  const nysw     = brands.find(b => b.name === "Not Ya Son's Weed");

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Brand Comparison</div>
          <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>Revenue over time by brand</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['daily', 'weekly'].map(g => (
            <button key={g} onClick={() => setGroup(g)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: group === g ? 700 : 500,
              cursor: 'pointer', border: `1px solid ${group === g ? C.accent : C.border}`,
              background: group === g ? C.accentBg : C.surface,
              color: group === g ? C.accent : C.textSub,
            }}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {!loading && lb && nysw && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <SummaryCard brand={lb}   color={BRAND_COLORS.lunchboxx} />
          <SummaryCard brand={nysw} color={BRAND_COLORS.nysw} />
        </div>
      )}

      {loading ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : merged.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute, fontSize: 13 }}>
          No data for selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderSub} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.textMute }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={v => fmtCurrency(v)} tick={{ fontSize: 11, fill: C.textMute }} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<CustomTooltip group={group} />} />
            <Line type="monotone" dataKey="lunchboxx" stroke={BRAND_COLORS.lunchboxx} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="nysw"      stroke={BRAND_COLORS.nysw}      strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
