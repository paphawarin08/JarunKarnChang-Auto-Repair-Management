// src/services/customerService.js
// service ฝั่งลูกค้า (customers) ทำงานกับ Firestore ล้วน ๆ
// โค้ดเดิมคงไว้ทั้งหมด เพิ่มแค่คอมเม้นท์อธิบายเหมือนเด็กมหาลัยเล่าให้เพื่อนฟัง 😄

import { db } from "../firebase/firebase";
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, writeBatch, Timestamp, getDocs, limit
} from "firebase/firestore";

// อ้างอิง collection หลักของลูกค้า
const colRef = collection(db, "customers");

/** ฟังก์ชันหลัก #1: subscribeCustomers
 * - สมัครฟังรายการลูกค้าแบบเรียลไทม์ (Realtime updates)
 * - เรียงจาก "dateAdded" ใหม่ล่าสุดอยู่บน
 * - map เอกสารให้มี _id = doc.id เพื่อใช้ง่ายใน UI
 * - คืนฟังก์ชัน unsubscribe ให้ไปเรียกตอน unmount
 */
export function subscribeCustomers(callback) {
  // ลิสต์เรียลไทม์ เรียงตามวันที่เพิ่ม ล่าสุดอยู่บน
  const q = query(colRef, orderBy("dateAdded", "desc"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ _id: d.id, ...d.data() }));
    callback(items);
  });
}

/** ฟังก์ชันหลัก #2: addCustomer
 * - เพิ่มลูกค้าใหม่
 * - auto-gen รหัสลูกค้า (id) ถ้าไม่ส่งมาเอง โดยดู id สูงสุดก่อนหน้าแล้ว +1
 *   เช่น "005" -> ใบถัดไป "006" (เก็บเป็นสตริง 3 หลัก)
 * - ใส่ dateAdded เป็น serverTimestamp() ให้ด้วย
 */
export async function addCustomer(data, createdBy) {
  // ดึงข้อมูลลูกค้าเรียงตาม id ล่าสุด
  const q = query(colRef, orderBy("id", "desc"), limit(1));
  const snap = await getDocs(q);

  let newIdNumber = 1;
  if (!snap.empty) {
    const last = snap.docs[0].data().id;
    // แปลงเป็นตัวเลข เช่น "005" → 5
    const lastNum = parseInt(last, 10);
    if (!isNaN(lastNum)) {
      newIdNumber = lastNum + 1;
    }
  }

  // แปลงกลับเป็น string แบบ 3 หลัก เช่น 001, 002
  const generatedId = String(newIdNumber).padStart(3, "0");

  const payload = {
    ...data,
    id: data.id?.toString().trim() || generatedId, // ถ้าไม่ใส่ ใช้ auto
    dateAdded: serverTimestamp(),
    createdBy: createdBy || null,
  };

  return addDoc(colRef, payload);
}

/** ฟังก์ชันหลัก #3: updateCustomer
 * - อัปเดตฟิลด์ลูกค้าที่ส่งมา (partial update)
 * - ใช้ docId เพื่อเจาะจงเอกสาร
 */
export async function updateCustomer(docId, data) {
  // data: ฟิลด์ที่อนุญาตให้แก้ไข เช่น name, phone, ...
  return updateDoc(doc(db, "customers", docId), data);
}

/** ฟังก์ชันหลัก #4: deleteCustomer
 * - ลบลูกค้าจาก collection ตาม docId
 */
export async function deleteCustomer(docId) {
  return deleteDoc(doc(db, "customers", docId));
}

/** ฟังก์ชันหลัก #5: importCustomersBatch
 * - นำเข้าลูกค้าเป็นชุดใหญ่แบบ batch (เร็วและประหยัดรอบ network)
 * - จะลองหา id ล่าสุด แล้ว gen ต่อเนื่องให้ (ถ้า row ไหนไม่ได้ใส่ id มา)
 * - จำกัดจำนวนต่อ batch ที่ 500 รายการ (กันเกิน quota/limit)
 * - dateAdded: ถ้า row มีค่าเดิม (เช่นจากไฟล์) จะ new Date(row.dateAdded)
 *              ถ้าไม่มี จะใช้ serverTimestamp() ให้
 */
export async function importCustomersBatch(list, createdBy) {
  if (!Array.isArray(list) || !list.length) return { imported: 0, skipped: 0 };

  const q = query(colRef, orderBy("id", "desc"), limit(1));
  const snap = await getDocs(q);

  let startNum = 1;
  if (!snap.empty) {
    const lastId = snap.docs[0].data().id;
    const lastNum = parseInt(lastId, 10);
    if (!isNaN(lastNum)) startNum = lastNum + 1;
  }

  const batch = writeBatch(db);
  let count = 0;

  list.forEach((row, idx) => {
    if (count >= 500) return; // limit (ป้องกัน batch ใหญ่เกิน)
    const docRef = doc(colRef);
    const newId = String(startNum + idx).padStart(3, "0");

    batch.set(docRef, {
      ...row,
      id: row.id?.toString().trim() || newId,
      // ถ้าไฟล์มี dateAdded แปลงเป็น Date ปกติ (ฝั่ง server จะตีความเป็น timestamp ได้)
      // ถ้าไม่มี ใช้ serverTimestamp() ให้
      dateAdded: row.dateAdded ? new Date(row.dateAdded) : serverTimestamp(),
      createdBy: createdBy || null,
    });
    count++;
  });

  await batch.commit();
  return { imported: count, skipped: list.length - count };
}

/** ฟังก์ชันหลัก #6: fetchCustomerIndex
 * - ดึง index ง่าย ๆ ของลูกค้าทั้งหมด เพื่อเอาไว้ "เช็คซ้ำ" ตอน import
 * - คืน Set ของ id และเบอร์โทร (normalize ให้เหลือแค่ตัวเลข/เครื่องหมาย +)
 *   -> เอาไปเช็คว่ามีอยู่แล้วหรือยังได้เร็ว ๆ
 */
export async function fetchCustomerIndex() {
  const snap = await getDocs(collection(db, "customers"));
  const idSet = new Set();
  const phoneSet = new Set();
  const normPhone = (p) =>
    (p ?? "").toString().replace(/[^\d+]/g, ""); // เก็บเฉพาะตัวเลขและ +
  snap.forEach((d) => {
    const x = d.data();
    if (x?.id) idSet.add(String(x.id).trim().toLowerCase());
    if (x?.phone) phoneSet.add(normPhone(x.phone));
  });
  return { idSet, phoneSet };
}
