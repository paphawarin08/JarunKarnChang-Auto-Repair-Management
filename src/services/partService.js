// src/services/partService.js
import {
  collection, doc, addDoc, deleteDoc, updateDoc, onSnapshot,
  getDoc, getDocs, query, orderBy, where,
  runTransaction, serverTimestamp, Timestamp, increment // ⬅️ เพิ่ม increment
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const partsCol = collection(db, "parts");
const categoriesCol = collection(db, "part_categories");
const lotsCol   = (partId) => collection(db, "parts", partId, "lots");
const ledgerCol = (partId) => collection(db, "parts", partId, "ledger");
const seqRef = doc(db, "sequences", "parts");

// ==== Helper ====
const deriveStatus = (stockQty, minimumStock) => {
  const s = Number(stockQty || 0);
  const m = Number(minimumStock || 0);
  if (s <= 0) return "หมดสต๊อก";
  if (m > 0 && s < m) return "ใกล้หมด";
  return "มีอยู่ในสต๊อก";
};

/* ---------- Categories ---------- */
export const subscribePartCategories = (cb) =>
  onSnapshot(query(categoriesCol, orderBy("name", "asc")), (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() }));
    cb(arr);
  });

export const addPartCategory = (name, iconBase64, userId) =>
  addDoc(categoriesCol, {
    name: name.trim(),
    icon: iconBase64 || "",
    stockQty: 0,
    createdAt: serverTimestamp(),
    createdBy: userId || null,
  });

export const deletePartCategory = async (catId) => {
  await deleteDoc(doc(db, "part_categories", catId));
};

export const updatePartCategory = async (catId, data) => {
  const payload = {};
  if (data.name != null) payload.name = data.name.trim();
  if (data.icon != null) payload.icon = data.icon;
  payload.updatedAt = serverTimestamp();
  await updateDoc(doc(db, "part_categories", catId), payload);
};

/* ---------- Parts ---------- */
export const subscribePartsByCategory = (categoryId, cb) => {
  const qy = query(
    partsCol,
    where("categoryId", "==", categoryId),
    orderBy("name", "asc")
  );
  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() }));
    cb(arr);
  });
};

export const addPart = async (data, userId) => {
  return runTransaction(db, async (tx) => {
    const seqSnap = await tx.get(seqRef);
    let next = 1;
    if (seqSnap.exists()) next = Number(seqSnap.data().next || 1);
    const generatedCode = String(next).padStart(3, "0");
    tx.set(seqRef, { next: next + 1 }, { merge: true });

    const s = Number(data.stockQty || 0);
    const m = Number(data.minimumStock || 0);

    const newRef = doc(partsCol);
    tx.set(newRef, {
      ...data,
      categoryId: data.categoryId || null,   // ensure category set
      code: (data.code ?? "").toString().trim() || generatedCode,
      stockQty: s,
      avgCost: Number(data.avgCost || 0),
      lastCost: Number(data.lastCost || 0),
      status: data.status || deriveStatus(s, m),
      dateAdded: serverTimestamp(),
      createdBy: userId || null,
      updatedAt: serverTimestamp(),
    });
    return { id: newRef.id, code: generatedCode };
  });
};

export const updatePart = async (docId, data) => {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "parts", docId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Part not found");
    const cur = snap.data();
    const stock = data.stockQty != null ? Number(data.stockQty) : Number(cur.stockQty || 0);
    const min   = data.minimumStock != null ? Number(data.minimumStock) : Number(cur.minimumStock || 0);
    const status = data.status || deriveStatus(stock, min);
    tx.update(ref, { ...data, status, updatedAt: serverTimestamp() });
  });
};

export const deletePart = (docId) => deleteDoc(doc(db, "parts", docId));

/* ---------- Lots / Ledger subscriptions ---------- */
export const subscribeLots = (partId, cb) =>
  onSnapshot(query(lotsCol(partId), orderBy("purchasedAt", "desc")), (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() })); cb(arr);
  });

export const subscribeLedger = (partId, cb) =>
  onSnapshot(query(ledgerCol(partId), orderBy("createdAt", "desc")), (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() })); cb(arr);
  });

/* ---------- Purchase (IN) ---------- */
export async function addPurchaseLot(partId, { qty, unitCost, purchasedAt, supplier, note }, userId, method = "WAC") {
  return runTransaction(db, async (tx) => {
    const partRef = doc(db, "parts", partId);
    const partSnap = await tx.get(partRef);
    if (!partSnap.exists()) throw new Error("Part not found");

    const part = partSnap.data();
    const oldQty = Number(part.stockQty || 0);
    const oldAvg = Number(part.avgCost || 0);
    const q = Number(qty || 0);
    const c = Number(unitCost || 0);
    if (q <= 0 || c < 0) throw new Error("invalid qty/cost");

    const lotRef = doc(lotsCol(partId));
    tx.set(lotRef, {
      qtyPurchased: q, qtyRemaining: q, unitCost: c,
      purchasedAt: purchasedAt ? Timestamp.fromDate(new Date(purchasedAt)) : serverTimestamp(),
      supplier: supplier || "", note: note || "",
      createdBy: userId || null, createdAt: serverTimestamp(),
    });

    let newAvg = oldAvg;
    if (method === "WAC") newAvg = (oldQty * oldAvg + q * c) / (oldQty + q);

    const newStock = oldQty + q;
    const newStatus = deriveStatus(newStock, Number(part.minimumStock || 0));
    tx.update(partRef, {
      stockQty: newStock,
      avgCost: Number.isFinite(newAvg) ? Number(newAvg.toFixed(2)) : 0,
      lastCost: c,
      status: newStatus,
      updatedAt: serverTimestamp(),
    });

    const ledRef = doc(ledgerCol(partId));
    tx.set(ledRef, {
      type: "IN", qtyIn: q, qtyOut: 0, unitCost: c, amount: q * c,
      method, lotRefs: [lotRef.id], refType: "purchase", refCode: "",
      note: note || "ซื้อเข้า",
      createdBy: userId || null, createdAt: serverTimestamp(),
    });
  });
}

/* ---------- Sell / Use (OUT, FIFO) ---------- */
// ✅ คืนค่า breakdown (allocations) และ avgUnitCost ให้ผู้เรียกใช้
export async function sellPartFIFO(partId, { qty, note, refType = "sale", refCode = "" }, userId) {
  return runTransaction(db, async (tx) => {
    const partRef = doc(db, "parts", partId);
    const partSnap = await tx.get(partRef);
    if (!partSnap.exists()) throw new Error("Part not found");

    const part = partSnap.data();
    let remain = Number(qty || 0);
    if (remain <= 0) throw new Error("invalid qty");

    const lotsQ = query(lotsCol(partId), orderBy("purchasedAt", "asc"));
    const lotsSnap = await getDocs(lotsQ);

    const used = [];
    let totalQty = 0;
    let totalCost = 0;
    for (const lot of lotsSnap.docs) {
      if (remain <= 0) break;
      const L = lot.data();
      const left = Number(L.qtyRemaining || 0);
      if (left <= 0) continue;
      const use = Math.min(left, remain);
      remain -= use;
      totalQty += use;
      totalCost += use * Number(L.unitCost);
      tx.update(lot.ref, { qtyRemaining: left - use });
      used.push({ lotId: lot.id, useQty: use, unitCost: Number(L.unitCost || 0) });
    }
    if (remain > 0) throw new Error("stock not enough");

    const newStock = Number(part.stockQty || 0) - Number(qty);
    const newStatus = deriveStatus(newStock, Number(part.minimumStock || 0));
    tx.update(partRef, { stockQty: newStock, status: newStatus, updatedAt: serverTimestamp() });

    const ledRef = doc(ledgerCol(partId));
    tx.set(ledRef, {
      type: "OUT", qtyIn: 0, qtyOut: Number(qty), unitCost: null, amount: totalCost,
      method: "FIFO", lotRefs: used.map(u => u.lotId), breakdown: used,
      refType, refCode, note: note || "",
      createdBy: userId || null, createdAt: serverTimestamp(),
    });

    const avgUnitCost = totalQty > 0 ? totalCost / totalQty : 0;

    // ⬅️ คืน allocations ให้ผู้เรียกไปเก็บต่อ
    return { breakdown: used, avgUnitCost };
  });
}

/* ---------- Sell / Use (OUT, WAC) ---------- */
export async function sellPartWAC(partId, { qty, note, refType = "sale", refCode = "" }, userId) {
  return runTransaction(db, async (tx) => {
    const partRef = doc(db, "parts", partId);
    const partSnap = await tx.get(partRef);
    if (!partSnap.exists()) throw new Error("Part not found");

    const part = partSnap.data();
    const q = Number(qty || 0);
    if (q <= 0) throw new Error("invalid qty");
    if (Number(part.stockQty || 0) < q) throw new Error("stock not enough");

    const cost = Number(part.avgCost || 0) * q;

    tx.update(partRef, { stockQty: Number(part.stockQty || 0) - q, updatedAt: serverTimestamp() });

    const ledRef = doc(ledgerCol(partId));
    tx.set(ledRef, {
      type: "OUT", qtyIn: 0, qtyOut: q, unitCost: Number(part.avgCost || 0), amount: cost,
      method: "WAC", lotRefs: [], refType, refCode, note: note || "",
      createdBy: userId || null, createdAt: serverTimestamp(),
    });
  });
}

/* ---------- Adjust (generic) ---------- */
// (คงไว้ตามเดิม ใช้ได้เป็น fallback/legacy)
export async function adjustStock(partId, { diffQty, note, refType = "adjustment", refCode = "" }, userId) {
  return runTransaction(db, async (tx) => {
    const partRef = doc(db, "parts", partId);
    const snap = await tx.get(partRef);
    if (!snap.exists()) throw new Error("Part not found");

    const part = snap.data();
    const curQty = Number(part.stockQty || 0);
    const delta = Number(diffQty || 0);
    const newQty = curQty + delta;
    if (newQty < 0) throw new Error("stock cannot be negative");

    // 1) ปรับ lots ให้สอดคล้อง
    if (delta > 0) {
      // คืนสต็อก: ใส่เป็น "Adjustment lot" ใหม่
      const lotRef = doc(lotsCol(partId));
      tx.set(lotRef, {
        qtyPurchased: delta,
        qtyRemaining: delta,
        unitCost: Number(part.avgCost ?? part.lastCost ?? 0),
        purchasedAt: serverTimestamp(),
        supplier: "adjustment",
        note: note || "ปรับสต็อก (+)",
        createdBy: userId || null,
        createdAt: serverTimestamp(),
      });
    } else if (delta < 0) {
      // ตัดสต็อก: ลดจาก lots แบบ FIFO
      let remain = Math.abs(delta);
      const lotsQ = query(lotsCol(partId), orderBy("purchasedAt", "asc"));
      const lotsSnap = await getDocs(lotsQ);
      for (const lot of lotsSnap.docs) {
        if (remain <= 0) break;
        const L = lot.data();
        const left = Number(L.qtyRemaining || 0);
        if (left <= 0) continue;
        const use = Math.min(left, remain);
        remain -= use;
        tx.update(lot.ref, { qtyRemaining: left - use });
      }
      if (remain > 0) throw new Error("stock not enough in lots");
    }

    // 2) อัปเดต part doc
    const newStatus = deriveStatus(newQty, Number(part.minimumStock || 0));
    tx.update(partRef, { stockQty: newQty, status: newStatus, updatedAt: serverTimestamp() });

    // 3) Ledger
    const ledRef = doc(ledgerCol(partId));
    tx.set(ledRef, {
      type: "ADJ",
      qtyIn: delta > 0 ? delta : 0,
      qtyOut: delta < 0 ? Math.abs(delta) : 0,
      unitCost: null,
      amount: 0,
      method: null,
      lotRefs: [],
      refType,
      refCode,
      note: note || "ปรับสต๊อก",
      createdBy: userId || null,
      createdAt: serverTimestamp(),
    });
  });
}

/* ---------- Adjust with allocations (คืนเข้าล็อตเดิม) ---------- */
// ✅ ใช้กรณีคืนของจากงานซ่อม เพื่อนำ qty กลับไปยัง lotId เดิม
export async function adjustStockWithAllocations(partId, { allocations, note, refType = "repair_return", refCode = "" }, userId) {
  return runTransaction(db, async (tx) => {
    const partRef = doc(db, "parts", partId);
    const partSnap = await tx.get(partRef);
    if (!partSnap.exists()) throw new Error("Part not found");
    const part = partSnap.data();

    let totalIn = 0;
    for (const a of allocations || []) {
      const lotRef = doc(lotsCol(partId), a.lotId);
      const q = Number(a.qty ?? a.useQty ?? 0);
      if (q <= 0) continue;
      totalIn += q;
      tx.update(lotRef, { qtyRemaining: increment(q) }); // ใส่กลับเข้า lot เดิม
    }

    if (totalIn > 0) {
      const newQty = Number(part.stockQty || 0) + totalIn;
      tx.update(partRef, {
        stockQty: newQty,
        status: deriveStatus(newQty, Number(part.minimumStock || 0)),
        updatedAt: serverTimestamp(),
      });

      const ledRef = doc(ledgerCol(partId));
      tx.set(ledRef, {
        type: "ADJ",
        qtyIn: totalIn,
        qtyOut: 0,
        unitCost: null,
        amount: 0,
        method: "restore-lots",
        lotRefs: (allocations || []).map(a => a.lotId),
        refType,
        refCode,
        note: note || "คืนสต๊อกเข้าล็อตเดิม",
        createdBy: userId || null,
        createdAt: serverTimestamp(),
      });
    }
  });
}

/* ---------- Summary ---------- */
export const subscribePartsSummaryByCategory = (cb) =>
  onSnapshot(collection(db, "parts"), (snap) => {
    const stat = {};
    snap.forEach(d => {
      const p = d.data();
      const cat = p.categoryId || "_";
      if (!stat[cat]) stat[cat] = { itemCount: 0, stockSum: 0 };
      stat[cat].itemCount += 1;
      stat[cat].stockSum += Number(p.stockQty || 0);
    });
    cb(stat);
  });
