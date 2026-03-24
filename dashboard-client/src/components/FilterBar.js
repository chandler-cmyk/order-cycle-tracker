import { useState, useRef, useEffect } from 'react';
import { C } from '../utils';

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = val => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val];
    onChange(next);
  };

  const hasSelection = selected.length > 0;
  const btnLabel = hasSelection
    ? `${label}: ${selected.length === 1 ? selected[0] : `${selected.length} selected`}`
    : label;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          cursor: 'pointer', whiteSpace: 'nowrap',
          border: `1px solid ${hasSelection ? C.accent : C.border}`,
          background: hasSelection ? C.accentBg : C.surface,
          color: hasSelection ? C.accent : C.textSub,
        }}
      >
        {btnLabel}
        {hasSelection && (
          <span
            onClick={e => { e.stopPropagation(); onChange([]); }}
            style={{ marginLeft: 3, fontSize: 13, lineHeight: 1, opacity: 0.6, cursor: 'pointer' }}
          >
            ×
          </span>
        )}
        <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          minWidth: 180, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
        }}>
          {options.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: C.textMute }}>No options</div>
          )}
          {options.map(opt => {
            const checked = selected.includes(opt);
            return (
              <div
                key={opt}
                onClick={() => toggle(opt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                  background: checked ? C.accentBg : 'transparent',
                  color: checked ? C.accent : C.text,
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `2px solid ${checked ? C.accent : C.border}`,
                  background: checked ? C.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
                </span>
                {opt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ filterOptions, filters, onChange }) {
  const { brands = [], categories = [] } = filterOptions || {};

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '10px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <span style={{ fontSize: 11, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Filters
      </span>

      <MultiSelect
        label="Brand"
        options={brands}
        selected={filters.brands}
        onChange={val => onChange({ ...filters, brands: val })}
      />

      <MultiSelect
        label="Category"
        options={categories}
        selected={filters.categories}
        onChange={val => onChange({ ...filters, categories: val })}
      />

      <div style={{ position: 'relative' }}>
        <input
          placeholder="SKU / Item name…"
          value={filters.sku}
          onChange={e => onChange({ ...filters, sku: e.target.value })}
          style={{
            border: `1px solid ${filters.sku ? C.accent : C.border}`,
            borderRadius: 6, padding: '6px 28px 6px 10px',
            fontSize: 12, outline: 'none',
            color: C.text, background: filters.sku ? C.accentBg : C.surface,
            width: 180,
          }}
        />
        {filters.sku && (
          <span
            onClick={() => onChange({ ...filters, sku: '' })}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              cursor: 'pointer', color: C.textMute, fontSize: 14, lineHeight: 1,
            }}
          >
            ×
          </span>
        )}
      </div>

      {(filters.brands.length > 0 || filters.categories.length > 0 || filters.sku) && (
        <button
          onClick={() => onChange({ brands: [], categories: [], sku: '' })}
          style={{
            marginLeft: 'auto', padding: '5px 11px', borderRadius: 6, fontSize: 12,
            cursor: 'pointer', border: `1px solid ${C.border}`,
            background: 'transparent', color: C.textMute,
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
