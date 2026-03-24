import { useState, memo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { C, fmtRevLabel, fmtCurrency } from '../utils';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// Full state name → abbreviation
const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
  'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
  'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
  'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
  'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
  'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  'District of Columbia':'DC',
};

function blueRamp(t) {
  // Interpolate from #e8f4ff (near-white blue) to #1a5fa8 (deep blue)
  const r = Math.round(232 + (26  - 232) * t);
  const g = Math.round(244 + (95  - 244) * t);
  const b = Math.round(255 + (168 - 255) * t);
  return `rgb(${r},${g},${b})`;
}

const MapChart = memo(({ stateRevMap, maxRevenue, selectedState, onHover, onStateClick }) => (
  <ComposableMap
    projection="geoAlbersUsa"
    style={{ width: '100%', height: '100%' }}
  >
    <Geographies geography={GEO_URL}>
      {({ geographies }) =>
        geographies.map(geo => {
          const name     = geo.properties.name;
          const abbr     = STATE_ABBR[name] || name;
          const rev      = stateRevMap[abbr] || 0;
          const t        = maxRevenue > 0 ? Math.pow(rev / maxRevenue, 0.5) : 0;
          const isSelected = selectedState === abbr;
          const fill     = isSelected ? '#f59e0b' : rev > 0 ? blueRamp(t) : '#f1f5f9';
          const stroke   = isSelected ? '#b45309' : '#ffffff';
          const strokeW  = isSelected ? 2 : 0.8;
          return (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeW}
              style={{
                default:  { outline: 'none' },
                hover:    { outline: 'none', fill: isSelected ? '#fbbf24' : rev > 0 ? blueRamp(Math.min(1, t + 0.2)) : '#e2e8f0', cursor: rev > 0 ? 'pointer' : 'default' },
                pressed:  { outline: 'none' },
              }}
              onMouseEnter={() => onHover({ abbr, name, revenue: rev })}
              onMouseLeave={() => onHover(null)}
              onClick={() => { if (rev > 0) onStateClick({ abbr, name, revenue: rev }); }}
            />
          );
        })
      }
    </Geographies>
  </ComposableMap>
));

export default function StateMap({ data, loading, height = 440, showTable = true, selectedState, onStateClick, compact = false }) {
  const [tooltip, setTooltip] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const stateRevMap = {};
  (data || []).forEach(d => { stateRevMap[d.state] = d.revenue; });
  const maxRevenue = Math.max(...(data || []).map(d => d.revenue), 1);

  // Sort states by revenue for the legend table
  const sorted = [...(data || [])].sort((a, b) => b.revenue - a.revenue);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: compact ? '12px 16px' : '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
        Revenue by State
      </div>
      <div style={{ fontSize: 12, color: C.textMute, marginBottom: compact ? 8 : 16 }}>
        Based on shipping address · {sorted.length} states
      </div>

      {loading ? (
        <div style={{ height: height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: showTable ? '1fr 220px' : '1fr', gap: 20 }}>
          {/* Map */}
          <div
            style={{ position: 'relative', height: height }}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
          >
            <MapChart stateRevMap={stateRevMap} maxRevenue={maxRevenue} selectedState={selectedState} onHover={setTooltip} onStateClick={onStateClick || (() => {})} />

            {/* Tooltip */}
            {tooltip && (
              <div style={{
                position: 'absolute',
                left: Math.min(mousePos.x + 12, 300),
                top: Math.max(0, mousePos.y - 50),
                background: C.text, color: '#fff',
                borderRadius: 6, padding: '7px 12px',
                fontSize: 12, pointerEvents: 'none', zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}>
                <div style={{ fontWeight: 700 }}>{tooltip.abbr} — {tooltip.name}</div>
                <div style={{ color: '#93c5fd', marginTop: 2 }}>{fmtCurrency(tooltip.revenue)}</div>
              </div>
            )}

            {/* Color legend */}
            <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.textMute }}>Low</span>
              <div style={{
                width: 80, height: 8, borderRadius: 4,
                background: `linear-gradient(to right, ${blueRamp(0)}, ${blueRamp(1)})`,
                border: `1px solid ${C.border}`,
              }} />
              <span style={{ fontSize: 10, color: C.textMute }}>High</span>
              {onStateClick && (
                <span style={{ fontSize: 10, color: C.textMute, marginLeft: 8 }}>· Click a state to see customers</span>
              )}
            </div>
          </div>

          {/* State table — hidden when showTable=false */}
          {showTable && <div style={{ overflowY: 'auto', maxHeight: height }}>
            {sorted.length === 0 ? (
              <div style={{ color: C.textMute, fontSize: 12, paddingTop: 16 }}>No geographic data</div>
            ) : (
              sorted.map((d, i) => (
                <div key={d.state} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: i < sorted.length - 1 ? `1px solid ${C.borderSub}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 20, borderRadius: 3, flexShrink: 0,
                      background: blueRamp(Math.pow(d.revenue / maxRevenue, 0.5)),
                      border: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: d.revenue / maxRevenue > 0.4 ? '#fff' : C.text,
                    }}>
                      {d.state}
                    </div>
                    <span style={{ fontSize: 12, color: C.textSub }}>{d.orderCount} orders</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {fmtRevLabel(d.revenue)}
                  </span>
                </div>
              ))
            )}
          </div>}
        </div>
      )}
    </div>
  );
}
