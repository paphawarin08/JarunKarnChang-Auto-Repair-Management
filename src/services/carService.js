// src/services/carService.js
// Service สำหรับคุยกับ Firestore collection "cars"
// โฟกัสที่ CRUD (subscribe/add/update/delete) ของข้อมูลรถยนต์
// *หมายเหตุ*: เพิ่มคอมเม้นท์อธิบาย แต่ "ไม่เปลี่ยนพฤติกรรม" ของโค้ดเดิม

import { db } from "../firebase/firebase";
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, getDocs, limit
} from "firebase/firestore";

// อ้างอิง collection หลักของรถ
const colRef = collection(db, "cars");

/**
 * subscribeCars(callback)
 * - ฟังก์ชันหลัก #1: subscribe รายการรถแบบเรียลไทม์ (orderBy dateAdded desc)
 * - คืนค่าเป็นฟังก์ชัน unsubscribe ของ onSnapshot (เรียกตอน unmount)
 * - แปลง snapshot -> array ของเอกสาร { _id, ...data() } แล้วโยนให้ callback
 */
export function subscribeCars(callback) {
  const q = query(colRef, orderBy("dateAdded", "desc"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ _id: d.id, ...d.data() }));
    callback(items);
  });
}

/**
 * addCar(data, createdBy)
 * - ฟังก์ชันหลัก #2: เพิ่มข้อมูลรถคันใหม่
 * - ขั้นตอน:
 *    1) ดึงรถที่ id ล่าสุด (orderBy "id" desc limit 1) เพื่อหาเลขรันนิ่ง
 *    2) คำนวณ id ใหม่แบบรัน + pad เป็น 3 หลัก (เช่น "001", "002")
 *    3) สร้าง payload โดย:
 *       - ถ้า data.id มีค่า: ใช้ของเดิม (trim เป็น string)
 *       - ถ้าไม่มี: ใช้ generatedId ที่เพิ่งคำนวณ
 *       - ตั้งค่า owner* และ ownBy (fallback เป็น ownerCode ถ้าไม่มี ownBy)
 *       - ใส่ dateAdded = serverTimestamp()
 *       - ใส่ createdBy (uid) ถ้ามี
 *    4) addDoc เข้า collection
 */
export async function addCar(data, createdBy) {
  // ดึงข้อมูลรถที่ id ล่าสุด
  const q = query(colRef, orderBy("id", "desc"), limit(1));
  const snap = await getDocs(q);

  let newIdNumber = 1;
  if (!snap.empty) {
    const last = snap.docs[0].data().id;
    const lastNum = parseInt(last, 10);
    if (!isNaN(lastNum)) {
      newIdNumber = lastNum + 1;
    }
  }

  // แปลงเป็น string แบบ 3 หลัก เช่น 001, 002
  const generatedId = String(newIdNumber).padStart(3, "0");

  const payload = {
    ...data,
    // ถ้า data.id ว่าง -> ใช้ generatedId
    id: (data.id ?? "").toString().trim() || generatedId,
    // จัดการฟิลด์เจ้าของรถ (กัน null/undefined)
    ownerRefId: data.ownerRefId || "",
    ownerName: data.ownerName || "",
    ownerCode: data.ownerCode || "",
    // ฟิลด์เดิม ownBy (ให้ fallback เป็น ownerCode ถ้าไม่ได้ส่ง ownBy มา)
    ownBy: data.ownBy || data.ownerCode || "",
    // เวลาเพิ่มเอกสาร (ฝั่งเซิร์ฟเวอร์)
    dateAdded: serverTimestamp(),
    createdBy: createdBy || null,
  };

  return addDoc(colRef, payload);
}

/**
 * updateCar(docId, data)
 * - ฟังก์ชันหลัก #3: อัปเดตข้อมูลรถตาม docId
 * - อนุญาตให้แก้ทุกฟิลด์ที่ส่งมา
 * - ซิงก์ฟิลด์ ownBy = data.ownBy || data.ownerCode || "" (กันข้อมูลเก่าๆ ให้ตรง)
 */
export async function updateCar(docId, data) {
  // อนุญาตให้แก้ทุกฟิลด์ที่ส่งมา (รวม owner*)
  return updateDoc(doc(db, "cars", docId), {
    ...data,
    ownBy: data.ownBy || data.ownerCode || "", // sync
  });
}

/**
 * deleteCar(docId)
 * - ฟังก์ชันหลัก #4: ลบรถตาม docId
 * - ใช้ deleteDoc ตรง ๆ ไม่มีเงื่อนไขเพิ่มเติม
 */
export async function deleteCar(docId) {
  return deleteDoc(doc(db, "cars", docId));
}
