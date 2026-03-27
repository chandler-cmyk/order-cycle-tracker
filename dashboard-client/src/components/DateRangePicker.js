import { useState } from 'react';
import { C, getPresetRange } from '../utils';

const PRESETS = ['7D', '30D', '90D', 'MTD', 'QTD', 'YTD', 'Custom'];

export default function DateRangePicker({ dateRange, onChange }) {
  const [showCustom, setShowCustom] = useState(dateRange.preset === 'Custom');

  function selectPreset(preset) {
    if (preset === 'Custom') {
      setShowCustom(true);
      onChange({ ...dateRange, preset: 'Custom' });
    } else {
      setShowCustom(false);
      const range = getPresetRange(preset);
      onChange({ ...range, preset });
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{
        display: 'flex', gap: 2,
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: 3,
      }}>
        {PRESETS.map(p => {
          const active = dateRange.preset === p;
          return (
            <button
              key={p}
              onClick={() => selectPreset(p)}
              style={{
                padding: '4px 11px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                border: 'none',
                background: active ? C.surface : 'transparent',
                color: active ? C.accent : C.textSub,
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.12s',
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <input
            type="date"
            value={dateRange.start || ''}
            onChange={e => onChange({ ...dateRange, start: e.target.value, preset: 'Custom' })}
            style={inputStyle}
          />
          <span style={{ color: C.textMute, fontSize: 12 }}>→</span>
          <input
            type="date"
            value={dateRange.end || ''}
            onChange={e => onChange({ ...dateRange, end: e.target.value, preset: 'Custom' })}
            style={inputStyle}
          />
        </div>
      )}

      {!showCustom && dateRange.start && (
        <span style={{ fontSize: 11, color: C.textMute, marginLeft: 4 }}>
          {dateRange.start} → {dateRange.end}
        </span>
      )}
    </div>
  );
}

const inputStyle = {
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '5px 8px',
  fontSize: 12,
  color: C.text,
  background: C.surface,
  outline: 'none',
};
