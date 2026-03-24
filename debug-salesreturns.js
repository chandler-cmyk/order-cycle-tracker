require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID } = process.env;

async function getToken() {
  const r = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET, refresh_token: ZOHO_REFRESH_TOKEN }),
  });
  const d = await r.json();
  return d.access_token;
}

(async () => {
  const token = await getToken();

  // Try the salesreturns endpoint
  const url = `https://www.zohoapis.com/inventory/v1/salesreturns?organization_id=${ZOHO_ORG_ID}&per_page=5&page=1`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const data = await res.json();
  console.log('HTTP:', res.status);
  console.log('code:', data.code, '| message:', data.message);
  console.log('keys:', Object.keys(data));

  const returns = data.salesreturns || data.sales_returns || [];
  console.log('Sales returns count (page 1):', returns.length);
  if (data.page_context) console.log('page_context:', data.page_context);

  if (returns.length > 0) {
    console.log('\nFirst return keys:', Object.keys(returns[0]));
    console.log('First return:', JSON.stringify(returns[0], null, 2));

    // Fetch detail of first return
    const id = returns[0].salesreturn_id || returns[0].sales_return_id;
    if (id) {
      const r2 = await fetch(`https://www.zohoapis.com/inventory/v1/salesreturns/${id}?organization_id=${ZOHO_ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const d2 = await r2.json();
      console.log('\nDetail keys:', Object.keys(d2));
      const sr = d2.salesreturn || d2.sales_return;
      if (sr) {
        console.log('SR detail keys:', Object.keys(sr));
        console.log('line_items count:', sr.line_items?.length);
        if (sr.line_items?.[0]) console.log('First line item:', JSON.stringify(sr.line_items[0], null, 2));
      }
    }
  }
})();
