import { useState } from 'react';
import { C, fmtCurrency, fmtNumber, fmtPct } from '../utils';

const th = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: C.textMute, textTransform: 'uppercase', letterSpacing: '0.07em',
  background: C.bg, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  cursor: 'pointer', userSelect: 'none',
};
const td = {
  padding: '10px 14px', fontSize: 13, color: C.textSub,
  borderBottom: `1px solid ${C.borderSub}`, whiteSpace: 'nowrap',
};

export default function ProductTable({ data, loading, onSortChange, sort, order, page, pageSize, onPageChange }) {
  const { items = [], total = 0 } = data || {};
  const totalPages = Math.ceil(total / pageSize);

  function SortHeader({ col, children }) {
    const active = sort === col;
    return (
      <th
        style={{ ...th, color: active ? C.accent : C.textMute }}
        onClick={() => onSortChange(col, active && order === 'desc' ? 'asc' : 'desc')}
      >
        {children}
        <span style={{ marginLeft: 4, fontSize: 9 }}>
          {active ? (order === 'desc' ? '▼' : '▲') : '↕'}
        </span>
      </th>
    );
  }

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Product Breakdown</div>
          {!loading && <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>{total.toLocaleString()} products</div>}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.textMute, fontSize: 13 }}>No products found</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>SKU</th>
                  <th style={th}>Item Name</th>
                  <th style={th}>Brand</th>
                  <th style={th}>Category</th>
                  <SortHeader col="units">Units Sold</SortHeader>
                  <SortHeader col="revenue">Total Revenue</SortHeader>
                  <th style={th}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={`${item.sku}-${i}`} style={{ background: i % 2 === 0 ? C.surface : C.bg }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: C.textMute }}>
                      {item.sku || '—'}
                    </td>
                    <td style={{ ...td, color: C.text, fontWeight: 500, maxWidth: 280 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name || '—'}
                      </div>
                    </td>
                    <td style={td}>{item.brand || <span style={{ color: C.textMute }}>—</span>}</td>
                    <td style={td}>{item.category || <span style={{ color: C.textMute }}>—</span>}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtNumber(item.units)}</td>
                    <td style={{ ...td, fontWeight: 600, color: C.text, textAlign: 'right' }}>
                      {fmtCurrency(item.revenue)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <div style={{
                          height: 6, width: 48, background: C.borderSub, borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', width: `${Math.min(100, item.pctOfTotal)}%`,
                            background: C.accent, borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{fmtPct(item.pctOfTotal)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.textMute }}>
              Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <PageBtn disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</PageBtn>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <PageBtn key={p} active={p === page} onClick={() => onPageChange(p)}>
                    {p}
                  </PageBtn>
                );
              })}
              <PageBtn disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</PageBtn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PageBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px', borderRadius: 6, fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentBg : C.surface,
        color: active ? C.accent : disabled ? C.textMute : C.textSub,
        fontWeight: active ? 700 : 400,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
