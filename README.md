# Order Cycle Tracker

Tracks customer order cadence using live Zoho Inventory data. Auto-refreshes the Zoho API token — no manual work needed.

---

## First-Time Setup (do this once)

### 1. Open a terminal in VS Code
Press `Ctrl + `` ` (backtick) to open the VS Code terminal.

### 2. Install React dependencies
```
npm install
```

### 3. Install backend server dependencies
```
copy server-package.json package-temp.json
npm install --prefix server-deps express cors dotenv node-fetch
```

Or manually install them:
```
npm install express cors dotenv node-fetch
```

---

## Running the App Every Day

**Option A: Double-click `START.bat`** (easiest)
- Opens two terminal windows automatically
- Browser launches on its own

**Option B: Manual (in VS Code)**

Terminal 1 — Backend server:
```
node server.js
```

Terminal 2 — React frontend:
```
npm start
```

Then open http://localhost:3000 in your browser.

---

## How It Works

- **Token refresh:** Automatic. The backend server handles refreshing the Zoho token every hour using your stored refresh token. You never need to get a new token manually.
- **Order cache:** Orders are cached for 30 minutes. Use "Refresh Live" button to force a fresh pull from Zoho.
- **API calls:** ~5–10 calls per fresh load. Well within Zoho's daily limits.

---

## Files

| File | Purpose |
|------|---------|
| `.env` | Your Zoho credentials (never share this file) |
| `server.js` | Backend — handles token refresh + Zoho API calls |
| `src/App.js` | Frontend dashboard |
| `src/utils.js` | Order processing logic |
| `START.bat` | One-click launcher for Windows |

---

## Updating Your Credentials

If you ever regenerate your Zoho Self Client, update the `.env` file:
```
ZOHO_CLIENT_ID=your_new_client_id
ZOHO_CLIENT_SECRET=your_new_client_secret
ZOHO_REFRESH_TOKEN=your_new_refresh_token
ZOHO_ORG_ID=764936089
```

The refresh token does not expire unless you manually revoke it.
