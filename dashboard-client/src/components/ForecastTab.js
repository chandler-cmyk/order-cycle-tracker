import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { C, fmtCurrency, fmtNumber } from '../utils';

function fmtPeriod(p) {
  if (!p) return '';
  const [y, m] = p.split('-');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1];
  return `${mon} '${y.slice(2)}`;
}

function KpiCard({ label, value, sub, accent }) {
  const a = accent || C.accent;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: '20px 24px', borderTop: `3px solid ${a}`, position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${a}18 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMute, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function GrowthBadge({ rate }) {
  if (rate == null) return null;
  const up = rate >= 0;
  const pct = (Math.abs(rate) * 100).toFixed(1);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      background: up ? '#ecfdf5' : '#fef2f2',
      color: up ? '#059669' : '#dc2626',
      border: `1px solid ${up ? '#a7f3d0' : '#fecaca'}`,
    }}>
      {up ? '▲' : '▼'} {pct}%
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
  const isForecast = d.point != null;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{fmtPeriod(label)}</div>
      {isForecast ? (
        <>
          <div style={{ color: C.accent, fontWeight: 600 }}>Projected: {fmtCurrency(d.point)}</div>
          <div style={{ color: C.textMute, marginTop: 2 }}>90% CI: {fmtCurrency(d.lower)} – {fmtCurrency(d.upper)}</div>
        </>
      ) : (
        <>
          <div style={{ color: C.text }}>Actual: {fmtCurrency(d.revenue)}</div>
          {d.fitted != null && <div style={{ color: C.textMute, marginTop: 2 }}>Model fit: {fmtCurrency(d.fitted)}</div>}
        </>
      )}
    </div>
  );
};

export default function ForecastTab() {
  const [horizon, setHorizon] = useState(6);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/forecast?months=${horizon}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [horizon]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13, color: C.textMute }}>Running forecast model…</div>
      </div>
    </div>
  );

  if (error || !data || data.error) return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: '#dc2626', marginBottom: 6 }}>Forecast unavailable</div>
      <div style={{ fontSize: 12, color: C.textMute }}>{data?.error || error}</div>
    </div>
  );

  const { history, forecast, model, runRate, categories } = data;

  // Show last 18 months of history + all forecast on chart
  const visibleHistory = history.slice(-18);
  const firstForecastPeriod = forecast[0]?.period;

  const chartData = [
    ...visibleHistory.map(h => ({
      period: h.period,
      revenue: h.revenue,
      fitted: h.fitted,
      lower: null, bandWidth: null, point: null,
    })),
    ...forecast.map(f => ({
      period: f.period,
      revenue: null, fitted: null,
      lower: f.lower,
      bandWidth: f.upper - f.lower,
      point: f.point,
    })),
  ];

  const next30  = forecast[0]?.point;
  const next3m  = forecast.slice(0, 3).reduce((s, f) => s + f.point, 0);
  const accuracy = model.mape != null ? Math.max(0, (1 - model.mape) * 100).toFixed(1) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard
          label="Next 30 Days"
          value={fmtCurrency(next30)}
          sub="Projected revenue"
          accent={C.accent}
        />
        <KpiCard
          label="Next Quarter"
          value={fmtCurrency(next3m)}
          sub="Next 3 months combined"
          accent="#059669"
        />
        <KpiCard
          label="Annual Run Rate"
          value={fmtCurrency(runRate.last12m)}
          sub={runRate.prior12m ? `vs ${fmtCurrency(runRate.prior12m)} prior year` : 'Last 12 months'}
          accent="#d97706"
        />
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: '20px 24px', borderTop: `3px solid #7c3aed`, position: 'relative', overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
        }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, #7c3aed18 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 10, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>YoY Run Rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {runRate.growth != null ? `${runRate.growth >= 0 ? '+' : ''}${(runRate.growth * 100).toFixed(1)}%` : '—'}
            </span>
          </div>
          <GrowthBadge rate={runRate.growth} />
        </div>
      </div>

      {/* Main Forecast Chart */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Revenue Forecast</div>
            <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>Historical actuals with model-projected outlook</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[3, 6, 12].map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: horizon === h ? 700 : 500,
                  cursor: 'pointer', border: `1px solid ${horizon === h ? C.accent : C.border}`,
                  background: horizon === h ? C.accentBg : C.bg,
                  color: horizon === h ? C.accent : C.textSub,
                }}
              >
                {h}M
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: C.textMute }}
              tickFormatter={fmtPeriod}
              tickLine={false}
              axisLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 11, fill: C.textMute }}
              tickFormatter={v => v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            {firstForecastPeriod && (
              <ReferenceLine x={firstForecastPeriod} stroke={C.border} strokeDasharray="5 3" label={{ value: 'Forecast →', position: 'insideTopLeft', fontSize: 10, fill: C.textMute }} />
            )}
            {/* Confidence band (stacked areas) */}
            <Area stackId="conf" dataKey="lower" fill="transparent" stroke="none" legendType="none" />
            <Area stackId="conf" dataKey="bandWidth" fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.3)" strokeWidth={1} legendType="none" />
            {/* Historical bars */}
            <Bar dataKey="revenue" fill={C.accent} opacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={28} />
            {/* Model fit line (in-sample) */}
            <Line dataKey="fitted" stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="none" />
            {/* Forecast point line */}
            <Line dataKey="point" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3, fill: C.accent }} activeDot={{ r: 5 }} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 12, fontSize: 11, color: C.textMute }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: C.accent, borderRadius: 2, marginRight: 5, opacity: 0.75 }} />Actual</span>
          <span><span style={{ display: 'inline-block', width: 16, height: 2, background: C.accent, marginRight: 5, verticalAlign: 'middle', borderTop: `2px dashed ${C.accent}` }} />Model fit</span>
          <span><span style={{ display: 'inline-block', width: 16, height: 2, background: C.accent, marginRight: 5, verticalAlign: 'middle' }} />Forecast</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />90% confidence</span>
        </div>
      </div>

      {/* Category Forecasts */}
      {categories.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Category Outlook</div>
          <div style={{ fontSize: 12, color: C.textMute, marginBottom: 20 }}>Last 6 months actual vs next 3 months projected, by product category</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {categories.map(cat => (
              <div key={cat.category} style={{
                border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px',
                background: C.bg,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.category}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Last 6 Months</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{fmtCurrency(cat.last6m)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Next 3 Months</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, letterSpacing: '-0.01em' }}>{fmtCurrency(cat.next3m)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: C.textMute }}>6M trend</span>
                  <GrowthBadge rate={cat.growthRate} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Info */}
      <div style={{ fontSize: 11, color: C.textMute, textAlign: 'center', paddingBottom: 8 }}>
        Holt-Winters Triple Exponential Smoothing (additive, m=12) &nbsp;·&nbsp;
        Optimized α={model.alpha} β={model.beta} γ={model.gamma} &nbsp;·&nbsp;
        RMSE {fmtCurrency(model.rmse)} &nbsp;·&nbsp;
        {accuracy}% in-sample accuracy &nbsp;·&nbsp;
        90% confidence intervals
      </div>
    </div>
  );
}
