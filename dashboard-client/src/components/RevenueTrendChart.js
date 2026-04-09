import { useState } from 'react';
import {
  ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, Area, AreaChart,
} from 'recharts';
import { C, fmtCurrency, fmtDate } from '../utils';

function formatPeriod(period, group) {
  if (!period) return '';
  if (group === 'weekly') {
    // period is "YYYY-WW"
    const [year, week] = period.split('-');
    return `Wk ${week} '${String(year).slice(2)}`;
  }
  // daily: YYYY-MM-DD
  const d = new Date(period + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label, group }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontSize: 12, color: C.textMute, marginBottom: 4 }}>
        {group === 'weekly' ? label : fmtDate(payload[0]?.payload?.period)}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.accent }}>
        {fmtCurrency(payload[0]?.value)}
      </div>
      {payload[1] && (
        <div style={{ fontSize: 11, color: C.textMute, marginTop: 2 }}>
          {payload[1]?.value?.toLocaleString()} orders
        </div>
      )}
    </div>
  );
};

export default function RevenueTrendChart({ data, loading, group, onGroupChange }) {
  const chartData = (data || []).map(d => ({
    ...d,
    label: formatPeriod(d.period, group),
  }));

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Revenue Trend</div>
          <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>
            {chartData.length} {group === 'weekly' ? 'weeks' : 'days'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['daily', 'weekly'].map(g => (
            <button
              key={g}
              onClick={() => onGroupChange(g)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: group === g ? 700 : 500,
                cursor: 'pointer', border: `1px solid ${group === g ? C.accent : C.border}`,
                background: group === g ? C.accentBg : C.surface,
                color: group === g ? C.accent : C.textSub,
              }}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute, fontSize: 13 }}>
          No data for selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.accent} stopOpacity={0.18} />
                <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderSub} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: C.textMute }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={v => fmtCurrency(v)}
              tick={{ fontSize: 11, fill: C.textMute }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<CustomTooltip group={group} />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={C.accent}
              strokeWidth={2.5}
              fill="url(#revGradient)"
              dot={chartData.length <= 31 ? { r: 3, fill: C.accent, strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: C.accent }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
