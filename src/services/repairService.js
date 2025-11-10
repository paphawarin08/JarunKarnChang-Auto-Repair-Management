// src/services/repairService.js
// service หลักของ “งานซ่อม” ครบวงจร: สร้าง/อัปเดต/สถานะ/ตัดสต๊อก/คืนสต๊อก/ลบงาน ฯลฯ
// *** ย้ำ: ไม่แก้ไขการทำงานเดิม เพิ่มเฉพาะคอมเม้นเพื่ออธิบายโค้ดให้เข้าใจง่าย ***

import {
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, getDoc,
  serverTimestamp, runTransaction, query, orderBy, getDocs, deleteDoc,
  where, Timestamp 
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { increment } from "firebase/firestore";

// ใช้ฟังก์ชันจัดการสต๊อกจาก partService (ตัด FIFO, ปรับสต๊อก, คืนเข้าล็อตเดิม)
import { sellPartFIFO, adjustStock, adjustStockWithAllocations } from "./partService"; // ⬅️ สำคัญ

/** refs/collections ที่ใช้บ่อย */
const repairsCol = collection(db, "repairs");
const seqRef = doc(db, "sequences", "repairs");
const partsUsedCol = (repairId) => collection(db, "repairs", repairId, "partsUsed");
const inspectionsCol = (repairId) => collection(db, "repairs", repairId, "inspections");
const problemsCol = (repairId) => collection(db, "repairs", repairId, "problems");
const statusLogsCol = (repairId) => collection(db, "repairs", repairId, "statusLogs");
const chargesCol = (repairId) => collection(db, "repairs", repairId, "charges");
const finishLogsCol = collection(db, "repairFinishes");

/** helper ภายใน: genRepairCode
 * - รันใน transaction เพื่อกันชนกัน → อ่าน seq แล้ว +1
 * - ได้รหัสรูปแบบ R00001
 */
async function genRepairCode(tx) {
  const snap = await tx.get(seqRef);
  let next = 1;
  if (snap.exists()) next = Number(snap.data().next || 1);
  const code = `R${String(next).padStart(5, "0")}`;
  tx.set(seqRef, { next: next + 1 }, { merge: true });
  return code;
}

/** ฟังก์ชันหลัก #1: addRepair
 * - สร้างงานซ่อมใหม่แบบ draft พร้อมรหัสงาน + denorm ข้อมูลลูกค้า/รถไว้โชว์
 * - เขียน status log แรก (สถานะเริ่มต้น) ภายใน transaction เดียวกัน
 */
export async function addRepair(initial = {}, userId = null) {
  return runTransaction(db, async (tx) => {
    const code = await genRepairCode(tx);
    const ref = doc(repairsCol);
    const data = {
      code,
      status: initial.status || "รับรถเข้าร้าน",
      isDraft: true,
      customerRef: initial.customerRef || null,
      vehicleRef: initial.vehicleRef || null,

      // denorm fields ไว้แสดงผลในตาราง/การ์ด
      customerName: initial.customerName || "",
      customerPhone: initial.customerPhone || "",
      customerEmail: initial.customerEmail || "",
      customerLineId: initial.customerLineId || "",
      customerAddress: initial.customerAddress || "",

      vehicleTitle: initial.vehicleTitle || "",
      vehiclePlate: initial.vehiclePlate || "",
      vehicleType: initial.vehicleType || "",
      vehicleMileage: initial.vehicleMileage || "",
      vehicleImage: initial.vehicleImage || "",
      vehicleTransmission: initial.vehicleTransmission || "",
      vehicleColor: initial.vehicleColor || "",

      employees: Array.isArray(initial.employees) ? initial.employees : [],
      note: initial.note || "",

      createdAt: serverTimestamp(),
      createdBy: userId || null,
      updatedAt: serverTimestamp(),
    };
    tx.set(ref, data);

    // status log แรก (บันทึกตอนรับรถ)
    const logRef = doc(statusLogsCol(ref.id));
    tx.set(logRef, {
      status: data.status,
      note: initial.note || "",
      userId: userId || null,
      createdAt: serverTimestamp(),
    });

    return { id: ref.id, code };
  });
}

/** ฟังก์ชันหลัก #2: subscribeRepair
 * - ติดตามงานซ่อมเดี่ยวๆ แบบเรียลไทม์ (ไว้ใช้ในหน้าแก้ไขงาน)
 */
export function subscribeRepair(repairId, cb) {
  const ref = doc(db, "repairs", repairId);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? ({ _id: snap.id, ...snap.data() }) : null));
}

/** ฟังก์ชันหลัก #3: subscribePartsUsed
 * - ติดตามรายการอะไหล่ที่ใช้ในงาน (ข้ามแถวที่ถูก soft delete)
 * - map ฟิลด์ partsUsedId ให้ใช้งานง่ายขึ้น
 */
export function subscribePartsUsed(repairId, cb) {
  const qy = query(partsUsedCol(repairId), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => {
      const x = d.data();
      if (x.deletedAt) return; // ข้ามที่ลบ
      arr.push({ partsUsedId: d.id, ...x });
    });
    cb(arr);
  });
}

/** ฟังก์ชันหลัก #4: subscribeProblems
 * - ติดตามรายการบันทึกปัญหาในงาน
 */
export function subscribeProblems(repairId, cb) {
  const qy = query(problemsCol(repairId), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ฟังก์ชันหลัก #5: subscribeInspections
 * - ติดตามใบตรวจ/เช็กลิสต์ในงาน
 */
export function subscribeInspections(repairId, cb) {
  const qy = query(inspectionsCol(repairId), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ฟังก์ชันหลัก #6: updateRepair
 * - อัปเดตฟิลด์ทั่วไปของงาน พร้อม updatedAt
 */
export async function updateRepair(repairId, patch) {
  const ref = doc(db, "repairs", repairId);
  const safe = { ...patch, updatedAt: serverTimestamp() };
  await updateDoc(ref, safe);
}

/** ฟังก์ชันหลัก #7: finalizeRepair
 * - ปิด draft = false เมื่อกรอกข้อมูลครบ
 */
export async function finalizeRepair(repairId) {
  const ref = doc(db, "repairs", repairId);
  await updateDoc(ref, { isDraft: false, updatedAt: serverTimestamp() });
}

/** ฟังก์ชันหลัก #8: addInspection
 * - เพิ่มใบตรวจในงานซ่อม (รูป/วันที่/เช็กลิสต์)
 */
export async function addInspection(repairId, { date, images, checklist }) {
  const col = inspectionsCol(repairId);
  await addDoc(col, {
    date: date || "",
    images: Array.isArray(images) ? images : [],
    checklist: checklist || {},
    createdAt: serverTimestamp(),
  });
}

/** ฟังก์ชันหลัก #9: addProblemReport
 * - เพิ่มบันทึกอาการ/สาเหตุ/แนวทางแก้ ของงานนี้
 */
export async function addProblemReport(repairId, { symptom, cause, solution }) {
  const col = problemsCol(repairId);
  await addDoc(col, {
    symptom: symptom || "",
    cause: cause || "",
    solution: solution || "",
    createdAt: serverTimestamp(),
  });
}

/** ฟังก์ชันหลัก #10: addPartToRepair
 * - ใช้อะไหล่กับงานซ่อม: ตัดสต๊อกแบบ FIFO + ทำ ledger + บันทึก partsUsed
 * - เก็บ allocations (lotId/useQty/unitCost) ไว้ เพื่อรองรับ “คืนเข้าล็อตเดิม” ภายหลัง
 */
export async function addPartToRepair(repairId, { partId, qty }, userId = null) {
  if (!partId || !qty) throw new Error("invalid part/qty");

  // รหัสงานไว้ใส่ในหมายเหตุ ledger
  const repSnap = await getDoc(doc(db, "repairs", repairId));
  const repCode = repSnap.exists() ? (repSnap.data().code || repairId) : repairId;

  // ดึงรายละเอียดอะไหล่ (denorm ลง partsUsed ให้เพียงพอสำหรับใบเสร็จ)
  const partSnap = await getDoc(doc(db, "parts", partId));
  if (!partSnap.exists()) throw new Error("Part not found");
  const p = partSnap.data();
  const name = p?.name || "";
  const brand = p?.brand || "";
  const grade = p?.grade || "";
  const unitPrice = Number(p?.sellPrice ?? p?.avgCost ?? 0);

  // 1) ตัดสต๊อก FIFO พร้อมบันทึก ledger ภาษาไทย
  const sellRes = await sellPartFIFO(
    partId,
    { qty, note: `ใช้ในงานซ่อม ${repCode}`, refType: "repair_use", refCode: repCode },
    userId || null
  );
  const allocations = Array.isArray(sellRes?.breakdown) ? sellRes.breakdown : [];

  // 2) partsUsed — เก็บ allocations ไว้ใช้ตอน “คืนของ”
  const ref = await addDoc(partsUsedCol(repairId), {
    partId,
    name, brand, grade,
    unitPrice,
    qty: Number(qty),
    allocations, // ⬅️ สำคัญ
    userId: userId || null,
    createdAt: serverTimestamp(),
  });

  return { partsUsedId: ref.id };
}

/** ฟังก์ชันหลัก #11: removePartFromRepair
 * - ยกเลิกการใช้อะไหล่ 1 รายการ
 * - ถ้ามี allocations → คืนเข้าล็อตเดิม (แม่นยำ)
 * - ถ้าไม่มี → fallback เป็น adjust (+qty)
 * - มาร์กแถว partsUsed ว่าถูกลบ (soft delete) เผื่ออ้างอิงทีหลัง
 */
export async function removePartFromRepair(repairId, partsUsedId, userId = null) {
  if (!repairId || !partsUsedId) return;

  const rowRef = doc(db, "repairs", repairId, "partsUsed", partsUsedId);
  const snap = await getDoc(rowRef);
  if (!snap.exists()) return;

  const row = snap.data();
  const partId = row.partId;
  const qty = Number(row.qty || 0);

  const repSnap = await getDoc(doc(db, "repairs", repairId));
  const repCode = repSnap.exists() ? (repSnap.data().code || repairId) : repairId;

  // มี allocations → คืนเข้าล็อตเดิมทีละ lot
  if (Array.isArray(row.allocations) && row.allocations.length > 0) {
    const mapped = row.allocations.map(a => ({ lotId: a.lotId, qty: Number(a.useQty || a.qty || 0) }));
    await adjustStockWithAllocations(
      partId,
      { allocations: mapped, note: `คืนจากงานซ่อม ${repCode}`, refType: "repair_return", refCode: repCode },
      userId || null
    );
  } else {
    // legacy: ไม่มี allocations → คืนแบบ ADJ (+qty)
    await adjustStock(
      partId,
      { diffQty: qty, note: `คืนจากงานซ่อม ${repCode}`, refType: "repair_return", refCode: repCode },
      userId || null
    );
  }

  // มาร์กลบแถว partsUsed (soft)
  await setDoc(rowRef, { ...row, deletedAt: serverTimestamp(), deletedBy: userId || null }, { merge: true });
}

/** ฟังก์ชันหลัก #12: subscribeRepairs
 * - ติดตามงานซ่อมทั้งหมดแบบเรียลไทม์ (เรียงล่าสุดก่อน) ข้ามตัวที่ถูกลบ
 */
export function subscribeRepairs(cb) {
  const qy = query(repairsCol, orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => {
      const data = d.data();
      if (data?.deletedAt) return;
      arr.push({ _id: d.id, ...data });
    });
    cb(arr);
  });
}

/** ฟังก์ชันหลัก #13: updateRepairStatus
 * - เปลี่ยนสถานะงาน + เขียน status log
 * - ถ้า “เพิ่งเปลี่ยนเป็น ซ่อมเสร็จสิ้น” และยังไม่เคยนับ → อัปเดตสถิติให้พนักงานที่ถูก assign
 */
export async function updateRepairStatus(repairId, { status, note, userId }) {
  const ref = doc(db, "repairs", repairId);

  // อ่านงานปัจจุบัน ดูว่าก่อนหน้า/หลังจากนี้เป็น “ซ่อมเสร็จสิ้น” ไหม
  const currSnap = await getDoc(ref);
  if (!currSnap.exists()) return;
  const curr = currSnap.data();
  const wasFinished = curr.status === "ซ่อมเสร็จสิ้น";
  const willBeFinished = status === "ซ่อมเสร็จสิ้น";

  // อัปเดตสถานะหลัก
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });

  // เขียน status log
  const logRef = await addDoc(statusLogsCol(repairId), {
    status: status || "",
    note: note || "",
    userId: userId || null,
    createdAt: serverTimestamp(),
  });

  // ถ้าเพิ่ง “เสร็จสิ้น” ครั้งแรก → เพิ่มสถิติ totalDone ให้ทุก emp ในงานนี้
  if (!wasFinished && willBeFinished && !curr.finishedCounted) {
    const assignees = Array.isArray(curr.employees) ? curr.employees : [];
    for (const empId of assignees) {
      const statRef = doc(db, "employee_stats", String(empId));
      await setDoc(
        statRef,
        {
          totalDone: increment(1),
          lastFinishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await updateDoc(ref, { finishedCounted: true, updatedAt: serverTimestamp() });
  }

  return { logId: logRef.id };
}

/** ฟังก์ชันหลัก #14: subscribeFinishLogsRange
 * - subscribe finish logs ตามช่วง start/end (เป็น Date) เรียงเวลา asc
 */
export function subscribeFinishLogsRange({ start, end }, cb) {
  const conds = [];
  if (start) conds.push(where("finishedAt", ">=", Timestamp.fromDate(start)));
  if (end)   conds.push(where("finishedAt", "<=", Timestamp.fromDate(end)));

  const qy = conds.length
    ? query(finishLogsCol, ...conds, orderBy("finishedAt", "asc"))
    : query(finishLogsCol, orderBy("finishedAt", "asc"));

  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ _id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ฟังก์ชันหลัก #15: fetchAllPartsUsed
 * - ดึง partsUsed ทั้งหมดของงาน (ข้ามแถวที่ลบ) ไว้ใช้คืนสต๊อกตอนลบงานทั้งงาน
 */
export async function fetchAllPartsUsed(repairId) {
  const snap = await getDocs(partsUsedCol(repairId));
  const arr = [];
  snap.forEach(d => {
    const x = d.data();
    if (x.deletedAt) return;
    arr.push({ partsUsedId: d.id, ...x });
  });
  return arr;
}

/** ฟังก์ชันหลัก #16: deleteRepair
 * - ลบงานซ่อมทั้งงาน
 * - ถ้างาน “ยังไม่เสร็จสิ้น” → คืนสต๊อกอะไหล่ที่เคยใช้ทั้งหมดก่อน แล้วค่อยลบ subcollections และตัวงาน
 */
export async function deleteRepair(repairId, userId = null) {
  if (!repairId) return { restocked: false };

  const repRef = doc(db, "repairs", repairId);
  const repSnap = await getDoc(repRef);
  if (!repSnap.exists()) return { restocked: false };

  const rep = repSnap.data();
  const isFinished = rep.status === "ซ่อมเสร็จสิ้น";
  const repCode = rep.code || repairId;
  let restocked = false;

  // 1) ยังไม่เสร็จสิ้น → คืนสต๊อกอะไหล่ทั้งหมดที่ยัง active
  if (!isFinished) {
    const usedSnap = await getDocs(collection(db, "repairs", repairId, "partsUsed"));
    for (const d of usedSnap.docs) {
      const row = d.data();
      if (row?.deletedAt) continue;
      const partId = row.partId;
      const qty = Number(row.qty || 0);

      if (partId && qty > 0) {
        if (Array.isArray(row.allocations) && row.allocations.length > 0) {
          const mapped = row.allocations.map(a => ({ lotId: a.lotId, qty: Number(a.useQty || a.qty || 0) }));
          await adjustStockWithAllocations(
            partId,
            { allocations: mapped, note: `คืนจากยกเลิกงานซ่อม ${repCode}`, refType: "repair_delete", refCode: repCode },
            userId || null
          );
        } else {
          await adjustStock(
            partId,
            { diffQty: qty, note: `คืนจากยกเลิกงานซ่อม ${repCode}`, refType: "repair_delete", refCode: repCode },
            userId || null
          );
        }
        restocked = true;
      }
      // ลบ partsUsed (จริง) ให้โล่ง
      await deleteDoc(d.ref);
    }
  } else {
    // ถ้าเสร็จแล้ว ก็เคลียร์ partsUsed ทิ้งให้หมดเฉยๆ
    const usedSnap = await getDocs(collection(db, "repairs", repairId, "partsUsed"));
    for (const d of usedSnap.docs) await deleteDoc(d.ref);
  }

  // 2) ลบ subcollections อื่น ๆ (inspections, problems, statusLogs, charges)
  const subNames = ["inspections", "problems", "statusLogs", "charges"];
  for (const sub of subNames) {
    const colSnap = await getDocs(collection(db, "repairs", repairId, sub));
    for (const docSnap of colSnap.docs) {
      await deleteDoc(docSnap.ref);
    }
  }

  // 3) ลบ doc งานซ่อมจริง
  await deleteDoc(repRef);

  return { restocked };
}

/** ฟังก์ชันหลัก #17: subscribeCharges
 * - ติดตามค่าใช้จ่าย/ค่าช่างของงาน (เรียงเวลา asc) ข้ามแถวที่ถูกลบ
 */
export function subscribeCharges(repairId, cb) {
  const qy = query(chargesCol(repairId), orderBy("createdAt", "asc"));
  return onSnapshot(qy, (snap) => {
    const arr = [];
    snap.forEach(d => {
      const x = d.data();
      if (x?.deletedAt) return; // ข้ามที่ถูกลบ
      arr.push({ _id: d.id, ...x });
    });
    cb(arr);
  });
}

/** ฟังก์ชันหลัก #18: addCharge
 * - เพิ่มรายการค่าใช้จ่าย/ค่าช่างในงาน (type: labor/other/payment etc.)
 */
export async function addCharge(repairId, { name, amount = 0, type = "other", paid = false }, userId = null) {
  await addDoc(chargesCol(repairId), {
    name: name || (type === "labor" ? "ค่าช่าง" : "ค่าใช้จ่ายอื่น ๆ"),
    type,
    amount: Number(amount || 0),
    paid: !!paid,
    userId: userId || null,
    createdAt: serverTimestamp(),
  });
}

/** ฟังก์ชันหลัก #19: removeCharge
 * - ลบค่าใช้จ่ายแบบ soft delete (เก็บร่องรอยเวลาไว้)
 */
export async function removeCharge(repairId, rowId) {
  const ref = doc(db, "repairs", repairId, "charges", rowId);
  await setDoc(ref, { deletedAt: serverTimestamp() }, { merge: true });
}

/** ฟังก์ชันหลัก #20: setChargePaid
 * - เปลี่ยนสถานะชำระของค่าใช้จ่าย (paid true/false)
 */
export async function setChargePaid(repairId, rowId, paid = true) {
  const ref = doc(db, "repairs", repairId, "charges", rowId);
  await updateDoc(ref, { paid: !!paid, updatedAt: serverTimestamp() });
}
