// Check what fields a credit note detail contains — specifically, does it have invoice_id?
require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const db = require('better-sqlite3')('./data/invoices.db', { readonly: true });

const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID } = process.env;

async function getToken() {
  const r = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET, refresh_token: ZOHO_REFRESH_TOKEN }),
  });
  return (await r.json()).access_token;
}

(async () => {
  const token = await getToken();

  // Pick a recent CN from our DB to inspect
  const recentCNs = db.prepare(`SELECT creditnote_id, creditnote_number, date FROM credit_notes ORDER BY date DESC LIMIT 3`).all();
  console.log('Checking these CNs:', recentCNs.map(r => r.creditnote_number).join(', '));

  for (const cn of recentCNs) {
    const res = await fetch(`https://www.zohoapis.com/inventory/v1/creditnotes/${cn.creditnote_id}?organization_id=${ZOHO_ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await res.json();
    const detail = data.creditnote;
    if (!detail) { console.log('No detail for', cn.creditnote_number); continue; }

    console.log(`\n=== ${cn.creditnote_number} (${cn.date}) ===`);
    // Show all top-level keys
    console.log('Keys:', Object.keys(detail).join(', '));
    // Specifically look for invoice references
    const invoiceFields = Object.entries(detail).filter(([k]) => k.toLowerCase().includes('invoice'));
    console.log('Invoice-related fields:', invoiceFields.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', '));
    break; // just check one
  }

  db.close();
})();
