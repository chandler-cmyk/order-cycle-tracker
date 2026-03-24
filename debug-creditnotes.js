// Test credit notes API call
require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const {
  ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID
} = process.env;

const BASE = 'https://www.zohoapis.com/inventory/v1';

async function getToken() {
  const r = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  });
  const d = await r.json();
  return d.access_token;
}

(async () => {
  const token = await getToken();
  console.log('Got token:', token ? 'yes' : 'no');

  // Fetch first page of credit notes
  const url = `${BASE}/creditnotes?organization_id=${ZOHO_ORG_ID}&per_page=5&page=1`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const data = await res.json();
  console.log('HTTP status:', res.status);
  console.log('Response keys:', Object.keys(data));
  console.log('code:', data.code, 'message:', data.message);
  const cns = data.creditnotes || data.credit_notes || [];
  console.log('Credit notes count (page 1):', cns.length);
  if (cns.length > 0) {
    console.log('First CN keys:', Object.keys(cns[0]));
    console.log('First CN:', JSON.stringify(cns[0], null, 2));
  }
  console.log('page_context:', data.page_context);
})();
