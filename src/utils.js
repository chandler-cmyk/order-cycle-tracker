export const STATUS_CONFIG = {
  overdue:      { label: 'Overdue',    color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  due_soon:     { label: 'Due Soon',   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  on_track:     { label: 'On Track',   color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
  new_customer: { label: 'New',        color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
  inactive:     { label: 'Inactive',   color: '#6b7280', bg: '#f9fafb', border: '#d1d5db' },
};

export const INACTIVE_DAYS = 180;

// Add sub-customer names here (case-insensitive match against reference_number).
// Example: 'Eagle Wholesale', 'Corner Store LLC'
export const SUB_CUSTOMERS = [
  'J&A Greensboro',
  'S&A Wholesale',
  'M&A Distro',
  'Eagle Wholesale',
  'Quality Distribution',
  'Magical Vapors',
  'High Altitude Wholesale',
  'Sunrise Wholesale',
  'Eagle Highborn',
  'Kali King',
  'Novelty King',
  'Malani Enterprise',
  'TN Smoke',
  'Cryptic Trading',
  'Big Z Distribution',
  'Music City Imports',
  'ARC Wholesale',
  'Down South Distro',
  'ARC Wholesale',
  'Aimrock Distributors',
  'Zee Hot Spot',
  'MDK Family Inc',
  'Wholesale Outlet',
  'MAG Industries',
  'Tri State Distro',
  'BNC Distribution Inc',
  'Skokie Wholesale',
  'Good Price Wholesale',
  'Global Cash & Carry Inc',
  'Loop Distribution',
  'Wiseman Wholesale',
  'Kriaa Wholesale',
  'A2Z Charlotte',
  'AAA Houston',
  'AAA Wholesale Supply',
  'Labib Wilmington',
  'RAM Wholesale',
  'Center Point Distribution'
];

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtCurrency(v) {
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    ? new Date(lastOrderDate.getTime() + avgCadenceDays * 86400000)
    : null;

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
    ? Math.round(last3.reduce((s, o) => s + o.value, 0) / last3.length * 100) / 100
    : null;
  const estOrderQty = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.qty, 0) / last3.length)
    : null;

  return {
    id: c.id, name: c.name, orderCount: sorted.length, lastOrderDate,
    avgCadenceDays, nextExpected, daysOverdue, daysUntilNext,
    daysSinceLastOrder, totalValue: c.totalValue, skus: Array.from(c.skus),
    lastOrderStatus: lastOrder?.status || '', cycleStatus,
    estOrderValue, estOrderQty,
    isSubCustomer: c.isSubCustomer || false,
    viaCustomer: c.viaCustomer || null,
  };
}

export function processOrders(salesOrders) {
  const customerMap = {};
  const subCustomerMap = {};

  // Lowercase lookup for fast matching
  const subLower = SUB_CUSTOMERS.map((s) => ({ canonical: s, lower: s.toLowerCase() }));

  salesOrders.forEach((order) => {
    const id = order.customer_id;
    const name = order.customer_name;
    const date = new Date(order.date + 'T00:00:00');
    const value = parseFloat(order.total) || 0;
    const items = (order.line_items || []).map((li) => li.name || li.item_name || 'Unknown');
    const qty = parseFloat(order.quantity) || 0;
    const ref = (order.reference_number || '').toLowerCase();

    if (!customerMap[id]) {
      customerMap[id] = { id, name, orders: [], totalValue: 0, skus: new Set() };
    }
    customerMap[id].orders.push({ date, value, qty, items, status: order.order_status });
    customerMap[id].totalValue += value;
    items.forEach((i) => customerMap[id].skus.add(i));

    // Check if reference number contains a known sub-customer name
    if (ref) {
      const match = subLower.find((s) => ref.includes(s.lower));
      if (match) {
        const subId = `sub_${match.lower}`;
        if (!subCustomerMap[subId]) {
          subCustomerMap[subId] = {
            id: subId, name: match.canonical, orders: [], totalValue: 0,
            skus: new Set(), isSubCustomer: true, viaCustomer: name,
          };
        }
        subCustomerMap[subId].orders.push({ date, value, qty, items, status: order.order_status });
        subCustomerMap[subId].totalValue += value;
        items.forEach((i) => subCustomerMap[subId].skus.add(i));
      }
    }
  });

  const regularCustomers = Object.values(customerMap).map(buildCustomerStats);
  const subCustomers = Object.values(subCustomerMap).map(buildCustomerStats);
  return [...regularCustomers, ...subCustomers];
}
