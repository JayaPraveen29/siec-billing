import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

const poCol = collection(db, "poSheets");

export function subscribePOSheets(cb) {
  const q = query(poCol, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createPOSheet(data) {
  return addDoc(poCol, { ...data, createdAt: serverTimestamp() });
}

export async function updatePOSheet(id, data) {
  return updateDoc(doc(db, "poSheets", id), data);
}

export async function deletePOSheet(id) {
  return deleteDoc(doc(db, "poSheets", id));
}

// ---- Items ----
export function subscribeItems(poId, cb) {
  const q = query(collection(db, "poSheets", poId, "items"), orderBy("srNo"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addItem(poId, data) {
  return addDoc(collection(db, "poSheets", poId, "items"), data);
}

// Adds many item rows in a single atomic batch — used by the "Bulk Add" paste flow.
export async function addItemsBulk(poId, itemsArray) {
  const batch = writeBatch(db);
  const itemsCol = collection(db, "poSheets", poId, "items");
  itemsArray.forEach((data) => {
    const ref = doc(itemsCol);
    batch.set(ref, data);
  });
  return batch.commit();
}

export async function updateItem(poId, itemId, data) {
  return updateDoc(doc(db, "poSheets", poId, "items", itemId), data);
}

export async function deleteItem(poId, itemId) {
  return deleteDoc(doc(db, "poSheets", poId, "items", itemId));
}

// ---- Invoices ----
export function subscribeInvoices(poId, cb) {
  const q = query(
    collection(db, "poSheets", poId, "invoices"),
    orderBy("invoiceDate")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addInvoice(poId, data) {
  return addDoc(collection(db, "poSheets", poId, "invoices"), data);
}

export async function updateInvoice(poId, invoiceId, data) {
  return updateDoc(doc(db, "poSheets", poId, "invoices", invoiceId), data);
}

export async function deleteInvoice(poId, invoiceId) {
  return deleteDoc(doc(db, "poSheets", poId, "invoices", invoiceId));
}

// ---- Aggregate fetch for ABS report ----
export async function fetchAllPOData() {
  const poSnap = await getDocs(query(poCol, orderBy("createdAt")));
  const result = [];
  for (const poDoc of poSnap.docs) {
    const po = { id: poDoc.id, ...poDoc.data() };
    const [itemsSnap, invoicesSnap] = await Promise.all([
      getDocs(query(collection(db, "poSheets", po.id, "items"), orderBy("srNo"))),
      getDocs(
        query(collection(db, "poSheets", po.id, "invoices"), orderBy("invoiceDate"))
      ),
    ]);
    const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    result.push({ po, items, invoices });
  }
  return result;
}
