import { useState } from 'react';
import { C, getPresetRange } from '../utils';

const PRESETS = [
  '7D', '30D', '90D',
  'MTD', 'QTD', 'YTD',
  'Last Month', 'Last Quarter', 'Last Year',
  'Custom',
];

const PRESET_LABELS = {
  '7D': 'Last 7 Days',
  '30D': 'Last 30 Days',
  '90D': 'Last 90 Days',
  'MTD': 'Month to Date',
  'QTD': 'Quarter to Date',
  'YTD': 'Year to Date',
  'Last Month': 'Last Month',
  'Last Quarter': 'Last Quarter',
  'Last Year': 'Last Year',
  'Custom': 'Custom Range',
};

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <select
        value={dateRange.preset || ''}
        onChange={e => selectPreset(e.target.value)}
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '5px 32px 5px 12px',
          fontSize: 13,
          fontWeight: 500,
          color: C.text,
          background: `${C.surface} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E") no-repeat right 10px center`,
          backgroundSize: '10px',
          appearance: 'none',
          WebkitAppearance: 'none',
          cursor: 'pointer',
          outline: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        {PRESETS.map(p => (
          <option key={p} value={p}>{PRESET_LABELS[p]}</option>
        ))}
      </select>

      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
        <span style={{ fontSize: 11, color: C.textMute }}>
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
