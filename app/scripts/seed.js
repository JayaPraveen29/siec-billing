// One-time import of the original spreadsheet's PO sheets, items, and
// invoices into Firestore, so the app starts populated with real data
// instead of an empty register.
//
// Usage:
//   1. Firebase console → Project settings → Service accounts →
//      "Generate new private key" → save the file as
//      scripts/serviceAccountKey.json (already gitignored).
//   2. node scripts/seed.js
//
// Safe to re-run: it always creates new documents, so running it twice
// will duplicate data. Delete the PO sheets in the app (or in the Firebase
// console) before re-seeding if needed.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));

let serviceAccount;
try {
  serviceAccount = JSON.parse(
    readFileSync(join(__dirname, "serviceAccountKey.json"), "utf-8")
  );
} catch {
  console.error(
    "\nMissing scripts/serviceAccountKey.json.\n" +
      "Download it from Firebase console -> Project settings -> Service accounts\n" +
      "-> Generate new private key, and save it at scripts/serviceAccountKey.json.\n"
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const seedData = JSON.parse(
  readFileSync(join(__dirname, "..", "seed", "po-data.json"), "utf-8")
);

async function seed() {
  for (const [sheetName, po] of Object.entries(seedData)) {
    console.log(`\nSeeding ${sheetName}...`);

    const poRef = await db.collection("poSheets").add({
      code: po.code,
      poNumber: po.poNumber || "",
      title: "",
      unitRate: po.unitRate || 0,
      gstPercent: po.gstPercent ?? 18,
      tdsPercent: po.tdsPercent ?? 0.1,
      matAdvPercent: po.matAdvPercent ?? 20,
      openingMatAdvance: po.openingMatAdvance || 0,
      createdAt: new Date(),
    });

    // Create items first and remember srNo -> Firestore doc id
    const srNoToId = {};
    for (const item of po.items) {
      const itemRef = await poRef.collection("items").add({
        srNo: item.srNo,
        description: item.description,
        weightKg: item.weightKg || 0,
      });
      srNoToId[item.srNo] = itemRef.id;
    }
    console.log(`  ${po.items.length} items`);

    let invoiceCount = 0;
    for (const inv of po.invoices) {
      const allocations = {};
      for (const [srNo, qty] of Object.entries(inv.allocations || {})) {
        const itemId = srNoToId[Number(srNo)] ?? srNoToId[srNo];
        if (itemId) allocations[itemId] = qty;
      }
      // Skip invoice columns that carried no billed quantity at all —
      // these were placeholder invoice numbers in the original sheet.
      if (Object.keys(allocations).length === 0) continue;

      await poRef.collection("invoices").add({
        invoiceNo: String(inv.invoiceNo),
        invoiceDate: inv.invoiceDate || null,
        allocations,
        paymentReceived: inv.paymentReceived || 0,
        paymentDate: null,
      });
      invoiceCount++;
    }
    console.log(`  ${invoiceCount} invoices (with billed quantity)`);
  }

  console.log("\nDone. Payment received amounts were imported from the " +
    "sheet's 'Payment received' row; payment dates weren't stored " +
    "per-invoice in the original sheet, so open each invoice in the app " +
    "and fill in the date if you want the Days-to-pay figure.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
