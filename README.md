# SIEC Ledger — PO & Structural Billing System

A React + Firebase replacement for the manual "PO Data" spreadsheet: one
register of PO sheets, per-PO invoice entry with automatic Basic/GST/TDS/
Material-Advance/Balance calculation, and an auto-generated **ABS (Abstract
of Structural Bills)** report across every PO.


## Tech stack

- React 18 + Vite
- React Router
- Firebase Auth (email/password) + Firestore (data storage, realtime)
- Tailwind CSS


  import of the uploaded `.xlsx` — the workbook's own formulas differ
  slightly PO to PO (a few cells were hand-typed overrides). The app applies
  one consistent formula set per PO and exposes manual overrides for the
  exceptions, so behaviour stays predictable as more POs are added.
