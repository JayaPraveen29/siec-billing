// Hook that owns all the logic for importing a PO sheet from Excel:
// creating items in bulk, mapping Excel Sr.No -> generated item id, and
// creating each invoice with its allocations. Kept out of POSheet.jsx so
// that component only needs a button + a modal render.

import { useState, useRef, useEffect, useCallback } from "react";
import { addItemsBulk, addInvoice, updatePOSheet } from "../services/poService";

/**
 * @param {string} poId
 * @param {Array}  items  - the live `items` array for this PO (from subscribeItems),
 *                          used as a fallback to resolve item ids if addItemsBulk
 *                          doesn't resolve with the created docs.
 */
export function usePOImport(poId, items) {
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Keep a ref in sync with the latest `items` so the async import flow can
  // poll for newly-created items without capturing a stale closure.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const waitForItems = useCallback((wantedSrNos, timeoutMs = 8000) => {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const have = (itemsRef.current || []).filter((it) => wantedSrNos.has(String(it.srNo)));
        if (have.length >= wantedSrNos.size || Date.now() - start > timeoutMs) {
          resolve(have);
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }, []);

  const handleImportPOSheet = useCallback(
    async (parsed) => {
      // 1. Optionally overwrite PO header settings with detected values
      if (parsed.overwriteHeader) {
        await updatePOSheet(poId, {
          unitRate: parsed.unitRate,
          gstPercent: parsed.gstPercent,
          tdsPercent: parsed.tdsPercent,
          matAdvPercent: parsed.matAdvPercent,
          openingMatAdvance: parsed.openingMatAdvance,
        });
      }

      // 2. Bulk-create items
      const created = await addItemsBulk(
        poId,
        parsed.items.map(({ srNo, description, weightKg }) => ({
          srNo: Number(srNo) || 0,
          description,
          weightKg,
        }))
      );

      // 3. Map srNo -> item id (fast path if addItemsBulk returns docs,
      //    fallback path polls the live subscription otherwise)
      const srNoToId = {};
      if (Array.isArray(created) && created.length && created[0]?.id) {
        created.forEach((it) => {
          srNoToId[String(it.srNo)] = it.id;
        });
      } else {
        const wantedSrNos = new Set(parsed.items.map((i) => String(i.srNo)));
        const found = await waitForItems(wantedSrNos);
        found.forEach((it) => {
          srNoToId[String(it.srNo)] = it.id;
        });
      }

      // 4. Create each invoice with allocations remapped to item ids
      for (const inv of parsed.invoices) {
        const allocations = {};
        Object.entries(inv.allocationsByItemSrNo).forEach(([srNo, qty]) => {
          const itemId = srNoToId[srNo];
          if (itemId) allocations[itemId] = qty;
        });
        if (Object.keys(allocations).length === 0 && !inv.paymentReceived) continue;

        await addInvoice(poId, {
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          allocations,
          paymentReceived: inv.paymentReceived || 0,
        });
      }

      setImportModalOpen(false);
    },
    [poId, waitForItems]
  );

  return {
    importModalOpen,
    openImportModal: () => setImportModalOpen(true),
    closeImportModal: () => setImportModalOpen(false),
    handleImportPOSheet,
  };
}