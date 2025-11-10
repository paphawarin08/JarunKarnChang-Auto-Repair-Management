// src/services/employeeService.js
// service จัดการข้อมูล "พนักงาน" ใน Firestore
// *** ย้ำ: ไม่แก้ logic การทำงานเดิม เพิ่มแค่คอมเม้นอธิบายให้เพื่อนเข้าใจ ***

import { db } from "../firebase/firebase";
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, writeBatch, Timestamp, getDocs, limit
} from "firebase/firestore";

// ชี้ collection หลักของพนักงาน
const colRef = collection(db, "employees");

/** ฟังก์ชันหลัก #1: subscribeEmployees
 * - subscribe เอกสารพนักงานแบบเรียลไทม์ (อัปเดตให้ทันทีเมื่อมีการเปลี่ยนแปลง)
 * - เรียงจาก dateAdded ใหม่สุดอยู่บนสุด
 * - map doc ให้มี _id = doc.id ใช้งานง่ายใน UI
 * - คืนฟังก์ชัน unsubscribe (เอาไปเรียกตอน unmount)
 */
export function subscribeEmployees(callback) {
  const q = query(colRef, orderBy("dateAdded", "desc"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ _id: d.id, ...d.data() }));
    callback(items);
  });
}

/** ฟังก์ชันหลัก #2: addEmployee
 * - เพิ่มพนักงานใหม่
 * - auto-gen id แบบตัวเลข 3 หลักต่อเนื่อง (เช่น 001, 002, ...)
 *   -> หา id ล่าสุดด้วย orderBy("id","desc") แล้ว +1
 * - ใส่ dateAdded เป็น serverTimestamp()
 */
export async function addEmployee(data, createdBy) {
  // ดึงพนักงานล่าสุดตาม id เพื่อนับต่อ
  const q = query(colRef, orderBy("id", "desc"), limit(1));
  const snap = await getDocs(q);

  // ค่าเริ่มต้นกรณียังไม่มีเอกสาร
  let newIdNumber = 1;
  if (!snap.empty) {
    const last = snap.docs[0].data().id;       // ex. "007"
    const lastNum = parseInt(last, 10);        // -> 7
    if (!isNaN(lastNum)) {
      newIdNumber = lastNum + 1;               // -> 8
    }
  }

  // แปลงกลับเป็นสตริง 3 หลัก ("008")
  const generatedId = String(newIdNumber).padStart(3, "0");

  // ตัว payload ที่จะบันทึก (ถ้า data.id ไม่ได้ใส่มา ใช้ generatedId)
  const payload = {
    ...data,
    id: data.id?.toString().trim() || generatedId,
    dateAdded: serverTimestamp(),
    createdBy: createdBy || null,
  };

  // เพิ่มเอกสารเข้า collection
  return addDoc(colRef, payload);
}

/** ฟังก์ชันหลัก #3: updateEmployee
 * - อัปเดตข้อมูลพนักงานแบบ partial (เฉพาะฟิลด์ที่ส่งมา)
 * - รับ docId เพื่อระบุดอกที่ต้องการแก้
 */
export async function updateEmployee(docId, data) {
  return updateDoc(doc(db, "employees", docId), data);
}

/** ฟังก์ชันหลัก #4: deleteEmployee
 * - ลบเอกสารพนักงานออกจากระบบตาม docId
 */
export async function deleteEmployee(docId) {
  return deleteDoc(doc(db, "employees", docId));
}

/** ฟังก์ชันหลัก #5: fetchEmployeeIndex
 * - สร้าง index ง่าย ๆ ไว้เช็คซ้ำก่อน import (กันข้อมูลชน)
 * - คืน Set ของ id (normalize เป็นตัวพิมพ์เล็ก/trim) และ phoneNumber (เก็บเฉพาะตัวเลขกับ +)
 */
export async function fetchEmployeeIndex() {
  const snap = await getDocs(collection(db, "employees"));
  const idSet = new Set();
  const phoneSet = new Set();
  const normPhone = (p) => (p ?? "").toString().replace(/[^\d+]/g, ""); // เหลือเลขกับเครื่องหมาย +
  const toIdKey = (id) => (id ?? "").toString().trim().toLowerCase();    // ทำให้เปรียบเทียบง่าย

  snap.forEach((d) => {
    const v = d.data();
    if (v?.id) idSet.add(toIdKey(v.id));
    if (v?.phoneNumber) phoneSet.add(normPhone(v.phoneNumber));
  });
  return { idSet, phoneSet };
}

/** ฟังก์ชันหลัก #6: importEmployeesBatch
 * - นำเข้าข้อมูลพนักงานครั้งละเยอะ ๆ แบบ batch (เร็วและประหยัดรอบ network)
 * - จำกัดสูงสุด 500 เอกสารต่อ batch (กันเกินลิมิต)
 * - auto-gen id ต่อเนื่องให้ ถ้า row ไหนไม่ได้ส่ง id มา
 * - dateAdded: ถ้ามีค่าเดิมจะ new Date(row.dateAdded) ไม่งั้นใช้ serverTimestamp()
 */
export async function importEmployeesBatch(list, createdBy) {
  if (!Array.isArray(list) || !list.length) return { imported: 0, skipped: 0 };

  // หา id ล่าสุดเพื่อเริ่มนับต่อ
  const q = query(colRef, orderBy("id", "desc"), limit(1));
  const snap = await getDocs(q);

  let startNum = 1;
  if (!snap.empty) {
    const lastId = snap.docs[0].data().id;
    const lastNum = parseInt(lastId, 10);
    if (!isNaN(lastNum)) startNum = lastNum + 1;
  }

  // เตรียม batch เขียนรวดเดียว
  const batch = writeBatch(db);
  let count = 0;

  list.forEach((row, idx) => {
    if (count >= 500) return; // limit กันใหญ่เกิน
    const docRef = doc(colRef);
    const newId = String(startNum + idx).padStart(3, "0");

    batch.set(docRef, {
      ...row,
      id: row.id?.toString().trim() || newId,
      dateAdded: row.dateAdded ? new Date(row.dateAdded) : serverTimestamp(),
      createdBy: createdBy || null,
    });
    count++;
  });

  // commit เดียวจบ
  await batch.commit();
  return { imported: count, skipped: list.length - count };
}
