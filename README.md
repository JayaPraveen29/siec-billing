# SIEC Ledger — PO & Structural Billing System

A React + Firebase replacement for the manual "PO Data" spreadsheet: one
register of PO sheets, per-PO invoice entry with automatic Basic/GST/TDS/
Material-Advance/Balance calculation, and an auto-generated **ABS (Abstract
of Structural Bills)** report across every PO.

## What it does

- **PO Sheets** — one register per purchase order (matches the old
  `127-57452`, `118-57129`, etc. tabs). Each PO stores its unit rate, GST %,
  TDS %, Material Advance % and opening advance.
- **Items** — the fabrication line items under a PO (description + weight in
  kg), same as column A–C in the spreadsheet.
- **Invoices** — raise an invoice by billing quantity against one or more
  items. Basic Value, GST, Round Off, Total Invoice Value, Material Advance,
  TDS, Net Receivable, running Material Advance balance, and Balance to be
  Received are all **calculated automatically**, the same formulas the
  spreadsheet used (see `src/utils/ledger.js`).
- **ABS Report** (`/abs`) — every invoice across every PO, grouped by PO with
  subtotals and a grand total, refreshed on demand.
- Manual overrides are available per invoice (Material Advance, TDS, Round
  Off) for the odd one-off adjustment, exactly like the hand-edited cells in
  the original sheet.

## Tech stack

- React 18 + Vite
- React Router
- Firebase Auth (email/password) + Firestore (data storage, realtime)
- Tailwind CSS

## 1. Create a Firebase project

1. Go to console.firebase.google.com → **Add project**.
2. In the project, open **Build → Authentication → Sign-in method** and
   enable **Email/Password**.
3. Open **Build → Authentication → Users** and add the user(s) who should be
   able to log in (email + password) — this app has no public sign-up page
   on purpose, since it's an internal billing tool.
4. Open **Build → Firestore Database → Create database** (start in
   production mode, pick your region).
5. In **Project settings → General → Your apps**, click the **Web** icon to
   register a web app, and copy the config values shown.

## 2. Configure the app

```bash
cp .env.example .env
```

Fill in `.env` with the values from step 1.5:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## 3. Deploy Firestore security rules

`firestore.rules` is included and restricts all reads/writes to signed-in
users only. In the Firebase console: **Firestore Database → Rules**, paste
the contents of `firestore.rules`, and click **Publish**.

(If you have the Firebase CLI installed you can instead run
`firebase deploy --only firestore:rules` after `firebase init`.)

## 4. Install and run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`), sign in with the
user you created in step 1.3, and start adding PO sheets.

## 5. Import your real PO data (optional, recommended)

Your original spreadsheet's 9 PO sheets, items, invoices, and payment
history have already been extracted into `seed/po-data.json`. To load them
into Firestore instead of starting empty:

1. Firebase console → **Project settings → Service accounts** → **Generate
   new private key**. Save the downloaded file as
   `scripts/serviceAccountKey.json` (it's already git-ignored).
2. Run:

   ```bash
   npm run seed
   ```

This creates all 9 PO sheets with their items and invoices, including the
payment-received amounts that were in the sheet. Invoice columns that had no
quantity billed against any item (a couple of the original sheets reserved
invoice numbers ahead of time) are skipped. Payment *dates* weren't recorded
per-invoice in the original sheet, so open any invoice afterwards in the app
to add its payment date if you want the "Days to pay" figure in the ABS
report.

The script only adds documents — running it twice will duplicate data, so
delete the PO sheets first (in the app, or in the Firebase console) if you
need to re-seed.

## 6. Build for production

```bash
npm run build
```

The static output is written to `dist/` — deploy it anywhere that serves
static files (Firebase Hosting, Netlify, Vercel, etc.). For Firebase
Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose this project, public dir = dist, single-page app = yes
npm run build
firebase deploy --only hosting
```

## Data model (Firestore)

```
poSheets/{poId}
  code, poNumber, title
  unitRate, gstPercent, tdsPercent, matAdvPercent, openingMatAdvance
  poSheets/{poId}/items/{itemId}
    srNo, description, weightKg
  poSheets/{poId}/invoices/{invoiceId}
    invoiceNo, invoiceDate, allocations: { itemId: qty },
    paymentReceived, paymentDate,
    matAdvanceOverride?, tdsOverride?, roundOffOverride?
```

All totals, balances, and the ABS report are computed on the fly in
`src/utils/ledger.js` — nothing is pre-summed in the database, so editing an
old invoice recalculates every downstream balance instantly.

## Notes

- This is a from-scratch rebuild of the spreadsheet's logic, not a literal
  import of the uploaded `.xlsx` — the workbook's own formulas differ
  slightly PO to PO (a few cells were hand-typed overrides). The app applies
  one consistent formula set per PO and exposes manual overrides for the
  exceptions, so behaviour stays predictable as more POs are added.
