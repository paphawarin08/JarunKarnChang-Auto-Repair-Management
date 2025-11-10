// src/services/companyProfileService.js
// Service สำหรับจัดการ "โปรไฟล์บริษัท" ใน Firestore
// โครง: เก็บเป็น collection ชื่อ "companyProfile" โดยใช้ doc เดียว (id = "default")
// หมายเหตุ: ใส่คอมเม้นท์เพิ่มเพื่ออธิบาย แต่ "ไม่เปลี่ยนพฤติกรรม" ของโค้ดเดิม

import { db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

// ใช้ doc เดียวทั้งระบบ (สะดวกต่อการอ่าน/เขียน)
export const COMPANY_PROFILE_DOC_ID = "default"; // ใช้ doc ตัวเดียวสำหรับทั้งระบบ

// helper: คืนค่า DocumentReference ไปยัง companyProfile/default
// ใช้ซ้ำในทุกฟังก์ชัน (กันพิมพ์ซ้ำและพลาด)
const companyDocRef = () => doc(db, "companyProfile", COMPANY_PROFILE_DOC_ID);

// ดึงข้อมูลโปรไฟล์บริษัทแบบครั้งเดียว (ไม่ realtime)
// return: object { id, ...data } หรือ null ถ้า doc ยังไม่ถูกสร้าง
export async function fetchCompanyProfile() {
  const snap = await getDoc(companyDocRef());
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// subscribe โปรไฟล์แบบเรียลไทม์: ใช้ในหน้า Home/Login เพื่ออัปเดตรูปโลโก้/ข้อมูลทันที
// พอเรียกแล้วจะได้ unsubscribe function กลับมา (ควรเรียกตอน unmount)
// callback จะได้ object { id, ...data } หรือ null ถ้า doc ไม่มี
export function subscribeCompanyProfile(callback) {
  // ใช้ใน HomePage เพื่ออัปเดตโลโก้แบบเรียลไทม์
  return onSnapshot(companyDocRef(), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// บันทึก/อัปเดตข้อมูลโปรไฟล์ (merge เข้ากับของเดิม ไม่ทับทั้งเอกสาร)
// data ที่รับมาอาจมี: companyName, ownerName, ที่อยู่ต่าง ๆ, logoDataUrl, ฯลฯ
// ระบบจะเติม updatedAt = serverTimestamp() ให้อัตโนมัติ
export async function saveCompanyProfile(data) {
  // data: { companyName, techName, ..., logoDataUrl }
  await setDoc(
    companyDocRef(),
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
