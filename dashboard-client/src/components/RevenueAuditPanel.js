import { useCallback, useEffect, useMemo, useState } from 'react';
import { C, fmtCurrency, fmtDate } from '../utils';

const badge = {
  pass: { bg: '#ecfdf5', border: '#bbf7d0', text: '#166534', label: 'PASS' },
  fail: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', label: 'FAIL' },
  unchecked: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'UNCHECKED' },
};

function fmtDelta(v) {
  if (v == null) return 'No reference';
  const sign = v > 0 ? '+' : '';
  return `${sign}${fmtCurrency(v)}`;
}

function numberValue(v) {
  if (v == null || v === '') return '';
  return Number(v).toFixed(2);
}

function shortDateTime(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Card({ label, value, sub, tone }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${tone?.border || C.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      minHeight: 86,
    }}>
      <div style={{ fontSize: 11, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, color: tone?.text || C.text, fontWeight: 750 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textSub, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SimpleTable({ columns, rows, empty }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '8px 10px',
                fontSize: 11,
                color: C.textMute,
                fontWeight: 700,
                textTransform: 'uppercase',
                textAlign: col.align || 'left',
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 16, color: C.textMute, fontSize: 13 }}>{empty || 'No rows'}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={row.id || row.number || `${row.status}-${i}`} style={{ borderBottom: `1px solid ${C.borderSub}` }}>
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '9px 10px',
                  fontSize: 13,
                  color: col.color ? col.color(row) : C.text,
                  textAlign: col.align || 'left',
                  fontWeight: col.bold ? 700 : 500,
                  whiteSpace: col.nowrap ? 'nowrap' : undefined,
                }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RevenueAuditPanel({ dateRange, onDateRangeChange, syncStatus }) {
  const [audit, setAudit] = useState(null);
  const [history, setHistory] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [zohoRevenue, setZohoRevenue] = useState('');
  const [notes, setNotes] = useState('');

  const matchedPeriod = useMemo(() => (
    periods.find(p => p.start === dateRange.start && p.end === dateRange.end)
  ), [periods, dateRange.start, dateRange.end]);
  const periodKey = matchedPeriod?.periodKey || 'CUSTOM';

  const loadAudit = useCallback(() => {
    if (!dateRange.start || !dateRange.end) return;
    const params = new URLSearchParams({ start: dateRange.start, end: dateRange.end, periodKey });
    setLoading(true);
    setError('');
    fetch(`/api/dashboard/revenue-audit?${params.toString()}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Audit request failed');
        return d;
      })
      .then(d => {
        setAudit(d);
        setZohoRevenue(numberValue(d.reference?.zohoRevenue));
        setNotes(d.reference?.notes || '');
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dateRange.start, dateRange.end, periodKey]);

  const loadHistory = useCallback(() => {
    fetch('/api/dashboard/revenue-audit/history?limit=12')
      .then(r => r.json())
      .then(d => setHistory(d.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/dashboard/revenue-audit/periods')
      .then(r => r.json())
      .then(d => setPeriods(d.periods || []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadAudit(); }, [loadAudit]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (!syncStatus?.lastSync) return;
    loadAudit();
    loadHistory();
  }, [syncStatus?.lastSync, loadAudit, loadHistory]);

  function saveReference() {
    setSaving(true);
    setError('');
    fetch('/api/dashboard/revenue-audit/reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodKey,
        start: dateRange.start,
        end: dateRange.end,
        zohoRevenue,
        source: 'manual',
        notes,
      }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Reference save failed');
        return d;
      })
      .then(d => {
        setAudit(d.audit);
        setSaving(false);
        loadHistory();
      })
      .catch(e => { setError(e.message); setSaving(false); });
  }

  function runAudit() {
    setSaving(true);
    setError('');
    fetch('/api/dashboard/revenue-audit/run', { method: 'POST' })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Audit run failed');
        return d;
      })
      .then(() => {
        setSaving(false);
        loadAudit();
        loadHistory();
      })
      .catch(e => { setError(e.message); setSaving(false); });
  }

  const statusTone = badge[audit?.parity?.status] || badge.unchecked;
  const syncAgeMs = syncStatus?.lastSync ? Date.now() - new Date(syncStatus.lastSync).getTime() : null;
  const syncStale = syncAgeMs == null || syncAgeMs > 4 * 60 * 60 * 1000;
  const issues = [...(audit?.issues || [])];
  if (syncStale) {
    issues.push({ code: 'stale_sync', severity: 'warn', message: 'Sync is older than 4 hours' });
  }

  const componentRows = audit ? [
    { label: 'Invoice item subtotal', amount: audit.components.invoiceItemSubtotal },
    { label: 'Invoice discount allocation', amount: -audit.components.invoiceDiscount },
    { label: 'Reportable invoice revenue', amount: audit.components.invoiceNetRevenue },
    { label: 'Open/closed credit notes', amount: -audit.components.creditNoteDeduction },
    { label: 'Sales returns applied separately', amount: -audit.components.salesReturnDeductionApplied },
    { label: 'Net revenue', amount: audit.components.netRevenue, strong: true },
  ] : [];

  const statusRows = audit ? [
    ...(audit.excluded.invoicesByStatus || []).map(r => ({ type: 'Invoice', status: r.status || '(blank)', count: r.count, amount: r.revenue })),
    ...(audit.excluded.creditNotesByStatus || []).map(r => ({ type: 'Credit Note', status: r.status || '(blank)', count: r.count, amount: -r.total })),
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        background: statusTone.bg,
        border: `1px solid ${statusTone.border}`,
        borderRadius: 8,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{ color: statusTone.text, fontSize: 12, fontWeight: 800 }}>{statusTone.label}</div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
          {fmtDate(dateRange.start)} to {fmtDate(dateRange.end)}
        </div>
        <div style={{ color: C.textSub, fontSize: 13, marginRight: 'auto' }}>
          Delta: {fmtDelta(audit?.parity?.delta)}
        </div>
        <button onClick={runAudit} disabled={saving} style={buttonStyle(false)}>
          {saving ? 'Running...' : 'Run Audit'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {periods.map(p => (
          <button
            key={p.periodKey}
            onClick={() => onDateRangeChange({ start: p.start, end: p.end, preset: p.label })}
            style={buttonStyle(p.start === dateRange.start && p.end === dateRange.end)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 600 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <Card label="Dashboard Revenue" value={loading ? 'Loading...' : fmtCurrency(audit?.components?.netRevenue)} sub={`${audit?.components?.invoiceCount || 0} invoices`} />
        <Card label="Zoho Reference" value={audit?.reference ? fmtCurrency(audit.reference.zohoRevenue) : 'Not set'} sub={audit?.reference ? shortDateTime(audit.reference.updatedAt) : 'Manual reference'} />
        <Card label="Delta" value={fmtDelta(audit?.parity?.delta)} sub={`Tolerance ${fmtCurrency(audit?.parity?.tolerance ?? 0.01)}`} tone={audit?.parity?.status === 'fail' ? badge.fail : audit?.parity?.status === 'pass' ? badge.pass : null} />
        <Card label="Sync" value={syncStale ? 'Stale' : 'Current'} sub={shortDateTime(syncStatus?.lastSync)} tone={syncStale ? { border: '#fde68a', text: '#92400e' } : null} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <section style={sectionStyle}>
          <div style={sectionTitle}>Zoho Reference</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Sales by Item Amount</span>
              <input
                value={zohoRevenue}
                onChange={e => setZohoRevenue(e.target.value)}
                inputMode="decimal"
                style={inputStyle}
              />
            </label>
            <button onClick={saveReference} disabled={saving || !zohoRevenue} style={buttonStyle(false)}>
              Save Reference
            </button>
          </div>
          <label style={{ ...fieldStyle, marginTop: 10 }}>
            <span style={labelStyle}>Notes</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} />
          </label>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitle}>Audit Signals</div>
          {issues.length === 0 ? (
            <div style={{ color: C.textSub, fontSize: 13, padding: '8px 0' }}>No active warnings</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {issues.map((issue, i) => (
                <div key={`${issue.code}-${i}`} style={{
                  border: `1px solid ${issue.severity === 'error' ? '#fecaca' : '#fde68a'}`,
                  background: issue.severity === 'error' ? '#fef2f2' : '#fffbeb',
                  color: issue.severity === 'error' ? '#991b1b' : '#92400e',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontWeight: 600,
                }}>{issue.message}</div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section style={sectionStyle}>
        <div style={sectionTitle}>Revenue Bridge</div>
        <SimpleTable
          columns={[
            { key: 'label', label: 'Component' },
            { key: 'amount', label: 'Amount', align: 'right', bold: true, render: r => fmtCurrency(r.amount), color: r => r.strong ? C.accent : C.text },
          ]}
          rows={componentRows}
        />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <section style={sectionStyle}>
          <div style={sectionTitle}>Excluded Statuses</div>
          <SimpleTable
            columns={[
              { key: 'type', label: 'Type' },
              { key: 'status', label: 'Status' },
              { key: 'count', label: 'Count', align: 'right' },
              { key: 'amount', label: 'Amount', align: 'right', render: r => fmtCurrency(r.amount), bold: true },
            ]}
            rows={statusRows}
            empty="No excluded transaction statuses"
          />
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitle}>Recent Checks</div>
          <SimpleTable
            columns={[
              { key: 'periodKey', label: 'Period' },
              { key: 'status', label: 'Status', render: r => String(r.status || '').toUpperCase() },
              { key: 'dashboardRevenue', label: 'Revenue', align: 'right', render: r => fmtCurrency(r.dashboardRevenue), nowrap: true },
              { key: 'delta', label: 'Delta', align: 'right', render: r => fmtDelta(r.delta), nowrap: true },
            ]}
            rows={history}
            empty="No checks recorded"
          />
        </section>
      </div>
    </div>
  );
}

const sectionStyle = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 18,
};

const sectionTitle = {
  fontSize: 15,
  fontWeight: 750,
  color: C.text,
  marginBottom: 14,
};

const labelStyle = {
  fontSize: 11,
  color: C.textMute,
  fontWeight: 700,
  textTransform: 'uppercase',
  marginBottom: 6,
};

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const inputStyle = {
  width: '100%',
  height: 36,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '0 10px',
  fontSize: 13,
  color: C.text,
  outline: 'none',
};

function buttonStyle(active) {
  return {
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accentBg : C.surface,
    color: active ? C.accentDark : C.text,
    borderRadius: 6,
    height: 34,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
