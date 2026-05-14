const db = require('./db');

const INACTIVE_DAYS = 180;

const SUB_CUSTOMERS = [
  'J&A Greensboro', 'S&A Wholesale', 'M&A Distro', 'Eagle Wholesale',
  'Quality Distribution', 'Magical Vapors', 'High Altitude Wholesale',
  'Sunrise Wholesale', 'Eagle Highborn', 'Kali King', 'Novelty King',
  'Malani Enterprise', 'TN Smoke', 'Cryptic Trading', 'Big Z Distribution',
  'Music City Imports', 'ARC Wholesale', 'Down South Distro',
  'Aimrock Distributors', 'Zee Hot Spot', 'MDK Family Inc',
  'Wholesale Outlet', 'MAG Industries', 'Tri State Distro',
  'BNC Distribution Inc', 'Skokie Wholesale', 'Good Price Wholesale',
  'Global Cash & Carry Inc', 'Loop Distribution', 'Wiseman Wholesale',
  'Kriaa Wholesale', 'A2Z Charlotte', 'AAA Houston', 'AAA Wholesale Supply',
  'Labib Wilmington', 'RAM Wholesale', 'Center Point Distribution',
];

function buildSkuStats(sku) {
  const sorted = sku.orders.slice().sort((a, b) => a.date - b.date);
  const lastOrderDate = sorted[sorted.length - 1]?.date || null;

  let avgCadenceDays = null;
  if (sorted.length >= 2) {
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].date - sorted[i - 1].date) / 86400000);
    }
    avgCadenceDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const nextExpected = lastOrderDate && avgCadenceDays
    ? new Date(lastOrderDate.getTime() + avgCadenceDays * 86400000) : null;

  const today = new Date();
  const daysOverdue = nextExpected && nextExpected < today
    ? Math.round((today - nextExpected) / 86400000) : null;
  const daysUntilNext = nextExpected && nextExpected >= today
    ? Math.round((nextExpected - today) / 86400000) : null;
  const daysSinceLastOrder = lastOrderDate
    ? Math.round((today - lastOrderDate) / 86400000) : null;

  let cycleStatus = 'new_customer';
  if (daysSinceLastOrder != null && daysSinceLastOrder >= INACTIVE_DAYS) {
    cycleStatus = 'inactive';
  } else if (lastOrderDate && avgCadenceDays) {
    if (daysOverdue != null) cycleStatus = 'overdue';
    else if (daysUntilNext != null && daysUntilNext <= 7) cycleStatus = 'due_soon';
    else cycleStatus = 'on_track';
  }

  const last3 = sorted.slice(-3);
  const avgQty = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.qty, 0) / last3.length) : null;

  return {
    name: sku.name, orderCount: sorted.length, lastOrderDate, avgCadenceDays,
    nextExpected, daysOverdue, daysUntilNext, daysSinceLastOrder, cycleStatus, avgQty,
  };
}

function buildCustomerStats(c) {
  const sorted = c.orders.sort((a, b) => a.date - b.date);
  const lastOrder = sorted[sorted.length - 1];
  const lastOrderDate = lastOrder?.date || null;

  let avgCadenceDays = null;
  if (sorted.length >= 2) {
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].date - sorted[i - 1].date) / 86400000);
    }
    avgCadenceDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const nextExpected = lastOrderDate && avgCadenceDays
    ? new Date(lastOrderDate.getTime() + avgCadenceDays * 86400000) : null;

  const today = new Date();
  const daysOverdue = nextExpected && nextExpected < today
    ? Math.round((today - nextExpected) / 86400000) : null;
  const daysUntilNext = nextExpected && nextExpected >= today
    ? Math.round((nextExpected - today) / 86400000) : null;
  const daysSinceLastOrder = lastOrderDate
    ? Math.round((today - lastOrderDate) / 86400000) : null;

  let cycleStatus = 'new_customer';
  if (daysSinceLastOrder != null && daysSinceLastOrder >= INACTIVE_DAYS) {
    cycleStatus = 'inactive';
  } else if (lastOrderDate && avgCadenceDays) {
    if (daysOverdue != null) cycleStatus = 'overdue';
    else if (daysUntilNext != null && daysUntilNext <= 7) cycleStatus = 'due_soon';
    else cycleStatus = 'on_track';
  }

  const last3 = sorted.slice(-3);
  const estOrderValue = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.value, 0) / last3.length * 100) / 100 : null;
  const estOrderQty = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.qty, 0) / last3.length) : null;

  let churnScore = 0;
  let churnRisk = 'Low';

  if (cycleStatus === 'inactive') {
    churnScore = 100;
    churnRisk = 'High';
  } else {
    let overdueScore = 0;
    if (daysOverdue != null && avgCadenceDays) {
      overdueScore = Math.min(daysOverdue / avgCadenceDays, 1);
    }

    let freqTrendScore = 0;
    if (sorted.length >= 4) {
      const allGaps = [];
      for (let i = 1; i < sorted.length; i++) {
        allGaps.push((sorted[i].date - sorted[i - 1].date) / 86400000);
      }
      const avgAllGap = allGaps.reduce((a, b) => a + b, 0) / allGaps.length;
      const recentGaps = allGaps.slice(-2);
      const avgRecentGap = recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length;
      if (avgAllGap > 0) {
        const pctIncrease = (avgRecentGap - avgAllGap) / avgAllGap;
        if (pctIncrease > 0.20) {
          freqTrendScore = Math.min((pctIncrease - 0.20) / 0.30, 1);
        }
      }
    } else if (sorted.length < 3) {
      freqTrendScore = 0.5;
    }

    let sizeTrendScore = 0;
    if (sorted.length >= 2) {
      const allAvgValue = sorted.reduce((s, o) => s + o.value, 0) / sorted.length;
      const recentAvgValue = last3.reduce((s, o) => s + o.value, 0) / last3.length;
      if (allAvgValue > 0) {
        const pctDrop = (allAvgValue - recentAvgValue) / allAvgValue;
        if (pctDrop > 0.15) {
          sizeTrendScore = Math.min((pctDrop - 0.15) / 0.25, 1);
        }
      }
    }

    const orderCountScore = sorted.length === 0 ? 1
      : sorted.length <= 2 ? 0.8
      : sorted.length <= 4 ? 0.4
      : 0;

    let recencyScore = 0;
    if (daysSinceLastOrder != null && avgCadenceDays) {
      recencyScore = Math.min(daysSinceLastOrder / (avgCadenceDays * 1.5), 1);
    }

    const rawScore =
      overdueScore    * 30 +
      freqTrendScore  * 25 +
      sizeTrendScore  * 25 +
      orderCountScore * 10 +
      recencyScore    * 10;

    const loyaltyBonus = sorted.length >= 20 ? 18
      : sorted.length >= 15 ? 12
      : sorted.length >= 10 ? 8
      : 0;

    churnScore = Math.max(Math.round(rawScore - loyaltyBonus), 0);
    churnRisk = churnScore >= 67 ? 'High' : churnScore >= 34 ? 'Medium' : 'Low';
  }

  const skus = Object.values(c.skuMap || {}).map(buildSkuStats);

  return {
    id: c.id, name: c.name, orderCount: sorted.length, lastOrderDate,
    avgCadenceDays, nextExpected, daysOverdue, daysUntilNext,
    daysSinceLastOrder, totalValue: c.totalValue,
    lastOrderStatus: lastOrder?.status || '', cycleStatus,
    estOrderValue, estOrderQty,
    isSubCustomer: c.isSubCustomer || false,
    viaCustomer: c.viaCustomer || null,
    churnScore, churnRisk,
    skus,
  };
}

function getOrderCycles() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 18);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const orderRows = db.prepare(`
    SELECT customer_id, customer_name, date, status,
           total AS order_value, quantity AS order_qty, reference_number
    FROM sales_orders
    WHERE date >= ?
      AND status NOT IN ('void', 'cancelled', 'draft')
    ORDER BY customer_id, date
  `).all(cutoffStr);

  const lineItemRows = db.prepare(`
    SELECT so.customer_id, so.reference_number, li.name, so.date,
           li.quantity, li.item_total
    FROM sales_orders so
    JOIN sales_order_line_items li ON li.salesorder_id = so.salesorder_id
    WHERE so.date >= ?
      AND so.status NOT IN ('void', 'cancelled', 'draft')
  `).all(cutoffStr);

  const customerMap = {};
  const subCustomerMap = {};
  const subLower = SUB_CUSTOMERS.map(s => ({ canonical: s, lower: s.toLowerCase() }));

  for (const row of orderRows) {
    if (!customerMap[row.customer_id]) {
      customerMap[row.customer_id] = {
        id: row.customer_id, name: row.customer_name,
        orders: [], totalValue: 0, skuMap: {},
      };
    }
    const c = customerMap[row.customer_id];
    c.orders.push({
      date: new Date(row.date + 'T00:00:00'),
      value: row.order_value,
      qty: row.order_qty,
      status: row.status,
    });
    c.totalValue += row.order_value;

    const ref = (row.reference_number || '').toLowerCase();
    if (ref) {
      const match = subLower.find(s => ref.includes(s.lower));
      if (match) {
        const subId = `sub_${match.lower}`;
        if (!subCustomerMap[subId]) {
          subCustomerMap[subId] = {
            id: subId, name: match.canonical,
            orders: [], totalValue: 0, skuMap: {},
            isSubCustomer: true, viaCustomer: row.customer_name,
          };
        }
        subCustomerMap[subId].orders.push({
          date: new Date(row.date + 'T00:00:00'),
          value: row.order_value,
          qty: row.order_qty,
          status: row.status,
        });
        subCustomerMap[subId].totalValue += row.order_value;
      }
    }
  }

  for (const li of lineItemRows) {
    const c = customerMap[li.customer_id];
    if (c) {
      if (!c.skuMap[li.name]) c.skuMap[li.name] = { name: li.name, orders: [] };
      c.skuMap[li.name].orders.push({
        date: new Date(li.date + 'T00:00:00'),
        qty: li.quantity,
        value: li.item_total,
      });
    }

    const ref = (li.reference_number || '').toLowerCase();
    if (ref) {
      const match = subLower.find(s => ref.includes(s.lower));
      if (match) {
        const sub = subCustomerMap[`sub_${match.lower}`];
        if (sub) {
          if (!sub.skuMap[li.name]) sub.skuMap[li.name] = { name: li.name, orders: [] };
          sub.skuMap[li.name].orders.push({
            date: new Date(li.date + 'T00:00:00'),
            qty: li.quantity,
            value: li.item_total,
          });
        }
      }
    }
  }

  const customers = [
    ...Object.values(customerMap).map(buildCustomerStats),
    ...Object.values(subCustomerMap).map(buildCustomerStats),
  ];
  return { customers, cachedAt: Date.now(), cached: false };
}

module.exports = { getOrderCycles };
