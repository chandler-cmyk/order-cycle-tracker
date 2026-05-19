const REPORTABLE_INVOICE_STATUSES = ['sent', 'overdue', 'paid', 'partially_paid'];
const REPORTABLE_CREDIT_NOTE_STATUSES = ['open', 'closed'];
const DEFAULT_TOLERANCE = 0.01;

function sqlList(values) {
  return values.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
}

function invoiceReportStatus(alias = 'i') {
  return `${alias}.status IN (${sqlList(REPORTABLE_INVOICE_STATUSES)})`;
}

function creditNoteReportStatus(alias = 'cn') {
  return `${alias}.status IN (${sqlList(REPORTABLE_CREDIT_NOTE_STATUSES)})`;
}

function invoiceSubtotalExpr(invAlias = 'i') {
  return `(SELECT COALESCE(SUM(li_sub.item_total), 0) FROM line_items li_sub WHERE li_sub.invoice_id = ${invAlias}.invoice_id)`;
}

function invoiceDiscountAllocationExpr(invAlias = 'i', liAlias = 'li') {
  const subtotal = invoiceSubtotalExpr(invAlias);
  return `CASE WHEN COALESCE(${invAlias}.discount_total, 0) > 0 AND ${subtotal} > 0 THEN COALESCE(${invAlias}.discount_total, 0) * ${liAlias}.item_total / ${subtotal} ELSE 0 END`;
}

function invoiceNetAmountExpr(invAlias = 'i', liAlias = 'li') {
  return `(${liAlias}.item_total - ${invoiceDiscountAllocationExpr(invAlias, liAlias)})`;
}

function roundCents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function todayString(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dateString(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function standardPeriods(now = new Date()) {
  const today = todayString(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd = new Date(y, m, 0);
  return [
    { periodKey: 'MTD', label: 'MTD', start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: today },
    { periodKey: 'QTD', label: 'QTD', start: dateString(qStart), end: today },
    { periodKey: 'YTD', label: 'YTD', start: `${y}-01-01`, end: today },
    { periodKey: 'LAST_MONTH', label: 'Last Month', start: dateString(lastMonthStart), end: dateString(lastMonthEnd) },
  ];
}

function loadReference(db, periodKey, start, end) {
  return db.prepare(`
    SELECT period_key AS periodKey, start_date AS start, end_date AS end,
      zoho_revenue AS zohoRevenue, source, notes, updated_at AS updatedAt
    FROM revenue_audit_references
    WHERE period_key = ? AND start_date = ? AND end_date = ?
  `).get(periodKey || 'CUSTOM', start, end) || null;
}

function buildReferenceStatus(netRevenue, reference, tolerance = DEFAULT_TOLERANCE) {
  if (!reference || reference.zohoRevenue == null) {
    return { status: 'unchecked', delta: null, tolerance };
  }
  const delta = roundCents(netRevenue - Number(reference.zohoRevenue));
  return {
    status: Math.abs(delta) <= tolerance ? 'pass' : 'fail',
    delta,
    tolerance,
  };
}

function calculateRevenueAudit(db, opts = {}) {
  const start = opts.start || '2000-01-01';
  const end = opts.end || '2099-12-31';
  const periodKey = opts.periodKey || 'CUSTOM';
  const tolerance = Number.isFinite(Number(opts.tolerance)) ? Number(opts.tolerance) : DEFAULT_TOLERANCE;
  const invoiceNet = invoiceNetAmountExpr();
  const invoiceDiscount = invoiceDiscountAllocationExpr();

  const invoiceReport = db.prepare(`
    SELECT
      COALESCE(SUM(li.item_total), 0) AS itemSubtotal,
      COALESCE(SUM(${invoiceDiscount}), 0) AS discountTotal,
      COALESCE(SUM(${invoiceNet}), 0) AS netRevenue,
      COALESCE(SUM(li.quantity), 0) AS units,
      COUNT(DISTINCT i.invoice_id) AS count
    FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
    WHERE i.date BETWEEN ? AND ? AND ${invoiceReportStatus('i')}
  `).get([start, end]);

  const creditNotes = db.prepare(`
    SELECT
      COALESCE(SUM(cni.item_total), 0) AS total,
      COALESCE(SUM(cni.quantity), 0) AS units,
      COUNT(DISTINCT cn.creditnote_id) AS count
    FROM credit_notes cn JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
    WHERE cn.date BETWEEN ? AND ? AND ${creditNoteReportStatus('cn')}
  `).get([start, end]);

  const salesReturns = db.prepare(`
    SELECT
      COALESCE(SUM(sri.item_total), 0) AS total,
      COALESCE(SUM(sri.quantity), 0) AS units,
      COUNT(DISTINCT sr.salesreturn_id) AS count
    FROM sales_returns sr JOIN sales_return_items sri ON sr.salesreturn_id = sri.salesreturn_id
    WHERE sr.date BETWEEN ? AND ? AND sr.status NOT IN ('void','draft')
  `).get([start, end]);

  const salesReturnCreditOverlap = db.prepare(`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM(total), 0) AS total
    FROM (
      SELECT sr.salesreturn_id, sr_totals.total
      FROM sales_returns sr
      JOIN (
        SELECT salesreturn_id, SUM(item_total) AS total
        FROM sales_return_items
        GROUP BY salesreturn_id
      ) sr_totals ON sr_totals.salesreturn_id = sr.salesreturn_id
      JOIN sales_return_credit_notes srcn ON srcn.salesreturn_id = sr.salesreturn_id
      JOIN credit_notes cn ON cn.creditnote_id = srcn.creditnote_id
      WHERE sr.date BETWEEN ? AND ? AND sr.status NOT IN ('void','draft') AND ${creditNoteReportStatus('cn')}
      GROUP BY sr.salesreturn_id
    )
  `).get([start, end]);

  const excludedInvoicesByStatus = db.prepare(`
    SELECT i.status, COUNT(DISTINCT i.invoice_id) AS count, COALESCE(SUM(${invoiceNet}), 0) AS revenue
    FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
    WHERE i.date BETWEEN ? AND ? AND NOT (${invoiceReportStatus('i')})
    GROUP BY i.status
    ORDER BY ABS(revenue) DESC
  `).all([start, end]);

  const excludedCreditNotesByStatus = db.prepare(`
    SELECT cn.status, COUNT(DISTINCT cn.creditnote_id) AS count, COALESCE(SUM(cni.item_total), 0) AS total
    FROM credit_notes cn JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
    WHERE cn.date BETWEEN ? AND ? AND NOT (${creditNoteReportStatus('cn')})
    GROUP BY cn.status
    ORDER BY ABS(total) DESC
  `).all([start, end]);

  const excludedInvoiceExamples = db.prepare(`
    SELECT i.invoice_number AS number, i.date, i.status, ROUND(SUM(${invoiceNet}), 2) AS amount
    FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
    WHERE i.date BETWEEN ? AND ? AND i.status IN ('approved','pending_approval')
    GROUP BY i.invoice_id
    ORDER BY amount DESC
    LIMIT 25
  `).all([start, end]);

  const excludedCreditNoteExamples = db.prepare(`
    SELECT cn.creditnote_number AS number, cn.date, cn.status, ROUND(SUM(cni.item_total), 2) AS amount
    FROM credit_notes cn JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
    WHERE cn.date BETWEEN ? AND ? AND cn.status IN ('approved','pending_approval')
    GROUP BY cn.creditnote_id
    ORDER BY amount DESC
    LIMIT 25
  `).all([start, end]);

  const dataQuality = {
    missingInvoiceDiscountMetadata: db.prepare(`
      SELECT COUNT(*) AS count
      FROM invoices
      WHERE COALESCE(sales_by_item_sync_version, 0) = 0
    `).get().count,
    reportableCreditNotesWithoutInvoiceLink: db.prepare(`
      SELECT COUNT(DISTINCT cn.creditnote_id) AS count
      FROM credit_notes cn
      WHERE ${creditNoteReportStatus('cn')} AND COALESCE(cn.invoice_id, '') = ''
    `).get().count,
    reportableCreditNotesLinkedToMissingInvoice: db.prepare(`
      SELECT COUNT(DISTINCT cn.creditnote_id) AS count
      FROM credit_notes cn
      LEFT JOIN invoices i ON i.invoice_id = cn.invoice_id
      WHERE ${creditNoteReportStatus('cn')} AND COALESCE(cn.invoice_id, '') != '' AND i.invoice_id IS NULL
    `).get().count,
  };

  const invoiceNetRevenue = roundCents(invoiceReport.netRevenue);
  const creditNoteDeduction = roundCents(creditNotes.total);
  const netRevenue = roundCents(invoiceNetRevenue - creditNoteDeduction);
  const reference = opts.reference || loadReference(db, periodKey, start, end);
  const refStatus = buildReferenceStatus(netRevenue, reference, tolerance);
  const issues = [];

  if (dataQuality.missingInvoiceDiscountMetadata > 0) {
    issues.push({
      severity: 'warn',
      code: 'missing_discount_metadata',
      message: `${dataQuality.missingInvoiceDiscountMetadata} invoices need discount metadata backfill`,
    });
  }
  if (dataQuality.reportableCreditNotesLinkedToMissingInvoice > 0) {
    issues.push({
      severity: 'warn',
      code: 'credit_note_missing_invoice',
      message: `${dataQuality.reportableCreditNotesLinkedToMissingInvoice} reportable credit notes link to missing invoices`,
    });
  }
  if (refStatus.status === 'fail') {
    issues.push({
      severity: 'error',
      code: 'zoho_reference_mismatch',
      message: `Dashboard differs from Zoho reference by ${refStatus.delta}`,
    });
  }

  return {
    period: { periodKey, start, end },
    methodology: {
      invoiceStatuses: REPORTABLE_INVOICE_STATUSES,
      creditNoteStatuses: REPORTABLE_CREDIT_NOTE_STATUSES,
      salesReturnsApplied: false,
      discountHandling: 'invoice_discount_allocated_by_line_item_subtotal',
    },
    components: {
      invoiceItemSubtotal: roundCents(invoiceReport.itemSubtotal),
      invoiceDiscount: roundCents(invoiceReport.discountTotal),
      invoiceNetRevenue,
      invoiceCount: invoiceReport.count || 0,
      unitsSold: roundCents(invoiceReport.units - (creditNotes.units || 0)),
      creditNoteDeduction,
      creditNoteCount: creditNotes.count || 0,
      salesReturnDeductionObserved: roundCents(salesReturns.total),
      salesReturnDeductionApplied: 0,
      salesReturnCount: salesReturns.count || 0,
      salesReturnCreditOverlap: {
        count: salesReturnCreditOverlap.count || 0,
        amount: roundCents(salesReturnCreditOverlap.total),
      },
      netRevenue,
    },
    excluded: {
      invoicesByStatus: excludedInvoicesByStatus.map(r => ({ ...r, revenue: roundCents(r.revenue) })),
      creditNotesByStatus: excludedCreditNotesByStatus.map(r => ({ ...r, total: roundCents(r.total) })),
      invoiceExamples: excludedInvoiceExamples,
      creditNoteExamples: excludedCreditNoteExamples,
    },
    dataQuality,
    reference: reference ? {
      ...reference,
      zohoRevenue: roundCents(reference.zohoRevenue),
    } : null,
    parity: refStatus,
    issues,
    generatedAt: new Date().toISOString(),
  };
}

function saveRevenueReference(db, input) {
  const periodKey = input.periodKey || 'CUSTOM';
  const start = input.start;
  const end = input.end;
  const zohoRevenue = Number(String(input.zohoRevenue ?? '').replace(/,/g, ''));
  if (!start || !end) throw new Error('start and end are required');
  if (!Number.isFinite(zohoRevenue)) throw new Error('zohoRevenue must be a number');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO revenue_audit_references
      (period_key, start_date, end_date, zoho_revenue, source, notes, updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(period_key, start_date, end_date) DO UPDATE SET
      zoho_revenue = excluded.zoho_revenue,
      source = excluded.source,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(periodKey, start, end, roundCents(zohoRevenue), input.source || 'manual', input.notes || '', now);
  return loadReference(db, periodKey, start, end);
}

function saveRevenueAuditRun(db, audit, syncLastSync = null) {
  db.prepare(`
    INSERT INTO revenue_audit_runs
      (period_key, start_date, end_date, dashboard_revenue, zoho_revenue, delta, status, tolerance, source, details_json, sync_last_sync, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    audit.period.periodKey,
    audit.period.start,
    audit.period.end,
    audit.components.netRevenue,
    audit.reference?.zohoRevenue ?? null,
    audit.parity.delta,
    audit.parity.status,
    audit.parity.tolerance,
    audit.reference?.source || null,
    JSON.stringify(audit),
    syncLastSync,
    audit.generatedAt
  );
}

function recordStandardRevenueAudits(db, opts = {}) {
  const periods = standardPeriods(opts.now ? new Date(opts.now) : new Date());
  const results = periods.map(period => {
    const audit = calculateRevenueAudit(db, period);
    saveRevenueAuditRun(db, audit, opts.syncLastSync || null);
    return {
      periodKey: audit.period.periodKey,
      label: period.label,
      start: audit.period.start,
      end: audit.period.end,
      status: audit.parity.status,
      dashboardRevenue: audit.components.netRevenue,
      zohoRevenue: audit.reference?.zohoRevenue ?? null,
      delta: audit.parity.delta,
    };
  });
  const failedCount = results.filter(r => r.status === 'fail').length;
  const uncheckedCount = results.filter(r => r.status === 'unchecked').length;
  return {
    checkedAt: new Date().toISOString(),
    status: failedCount > 0 ? 'fail' : uncheckedCount > 0 ? 'unchecked' : 'pass',
    failedCount,
    uncheckedCount,
    periods: results,
  };
}

function latestAuditSummary(db) {
  const rows = db.prepare(`
    SELECT period_key AS periodKey, start_date AS start, end_date AS end, dashboard_revenue AS dashboardRevenue,
      zoho_revenue AS zohoRevenue, delta, status, created_at AS checkedAt
    FROM revenue_audit_runs
    WHERE id IN (
      SELECT MAX(id) FROM revenue_audit_runs GROUP BY period_key
    )
    ORDER BY period_key
  `).all();
  if (!rows.length) return null;
  const failedCount = rows.filter(r => r.status === 'fail').length;
  const uncheckedCount = rows.filter(r => r.status === 'unchecked').length;
  return {
    checkedAt: rows.reduce((max, row) => row.checkedAt > max ? row.checkedAt : max, rows[0].checkedAt),
    status: failedCount > 0 ? 'fail' : uncheckedCount > 0 ? 'unchecked' : 'pass',
    failedCount,
    uncheckedCount,
    periods: rows,
  };
}

function auditHistory(db, limit = 20) {
  return db.prepare(`
    SELECT id, period_key AS periodKey, start_date AS start, end_date AS end,
      dashboard_revenue AS dashboardRevenue, zoho_revenue AS zohoRevenue,
      delta, status, source, sync_last_sync AS syncLastSync, created_at AS createdAt
    FROM revenue_audit_runs
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.min(100, Math.max(1, Number(limit) || 20)));
}

module.exports = {
  REPORTABLE_INVOICE_STATUSES,
  REPORTABLE_CREDIT_NOTE_STATUSES,
  invoiceReportStatus,
  creditNoteReportStatus,
  invoiceSubtotalExpr,
  invoiceDiscountAllocationExpr,
  invoiceNetAmountExpr,
  calculateRevenueAudit,
  saveRevenueReference,
  saveRevenueAuditRun,
  recordStandardRevenueAudits,
  latestAuditSummary,
  auditHistory,
  standardPeriods,
  roundCents,
};
