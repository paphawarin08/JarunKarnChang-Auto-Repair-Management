// services/userService.js
// ===============================================
// บทบาท: รวมฟังก์ชันเกี่ยวกับ "ผู้ใช้ระบบ" ฝั่ง client
// - อ่าน role จาก Firestore เพื่อกำหนดสิทธิ์เข้าเมนู
// - สร้าง/แก้ไข/ลบ user (2 โหมด)
//    1) ผ่าน Cloud Functions (เหมาะกับ Blaze/Production)
//    2) โหมดฟรี Spark: ใช้ secondary app สร้าง user โดยไม่ทำให้แอดมินหลุดล็อกอิน
// - ส่งอีเมลรีเซ็ตรหัสผ่าน
// *** เน้นคอมเม้นอธิบาย ไม่เปลี่ยนการทำงานเดิม ***
// ===============================================

import { db, app as mainApp } from "../firebase/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  initializeApp,
  deleteApp,
} from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

// ตั้งค่า region ของ Cloud Functions ให้ชัดเจน (ตรงกับฝั่งเซิร์ฟเวอร์)
const functions = getFunctions(mainApp, "asia-southeast1");

// ====== ของเดิม (คงไว้) : ใช้ได้เมื่อมี Cloud Functions / Blaze ======

/**
 * ฟังก์ชันหลัก #1: getUserRole
 * - อ่านเอกสาร users/{uid} เพื่อดู role และ employeeId
 * - ถ้า role เป็น "admin" → เข้าระบบได้เลย (ไม่ต้องผูกพนักงาน)
 * - ถ้าไม่ใช่ admin → ตรวจต่อว่ามี employeeId และเอกสารถูกผูกกับ user นี้จริงไหม
 *   (อ่าน employees/{employeeId} แล้วเช็คว่า userId === uid)
 * - คืนค่า: "admin" | "staff" | null (ถ้าไม่ผ่านเงื่อนไข)
 */
export async function getUserRole(uid) {
  // อ่าน users/{uid}
  const uRef = doc(db, "users", uid);
  const uSnap = await getDoc(uRef);
  if (!uSnap.exists()) return null;
  const u = uSnap.data();
  const role = u?.role ?? null;
  const employeeId = u?.employeeId || null;

  // แอดมินข้ามการตรวจผูกพนักงานได้
  if (role === "admin") {
    return "admin";
  }

  // ถ้าไม่มี employeeId = ยังไม่ผูก → ไม่อนุญาต
  if (!employeeId) return null;

  // ยืนยันความสัมพันธ์: employees/{employeeId}.userId ต้องตรงกับ uid
  const eSnap = await getDoc(doc(db, "employees", employeeId));
  if (!eSnap.exists()) return null;
  const e = eSnap.data();
  if (e?.userId !== uid) return null;

  // ผ่านทุกเงื่อนไข → คืน role (เช่น "staff")
  return role;
}

/**
 * ฟังก์ชันหลัก #2: createUserForEmployee
 * - โหมด Cloud Functions: ให้ฝั่ง server ทำการสร้าง user + set custom claims + upsert Firestore
 * - เหมาะเมื่อโปรเจ็กต์เปิดใช้ Blaze/Functions แล้ว
 * - ส่งกลับ { uid }
 */
export async function createUserForEmployee({ employeeId, email, password, displayName, role = "staff" }) {
  const callable = httpsCallable(functions, "createUserForEmployee");
  const res = await callable({ employeeId, email, password, displayName, role });
  return res.data; // { uid }
}

/**
 * ฟังก์ชันหลัก #3: updateUserForEmployee
 * - โหมด Cloud Functions: อัปเดตข้อมูลผู้ใช้ (email/password/role/displayName/disabled)
 * - ฝั่ง server จะจัดการทั้ง Auth และ Firestore ให้สอดคล้อง
 */
export async function updateUserForEmployee({ uid, email, password, role, displayName, disabled }) {
  const callable = httpsCallable(functions, "updateUserForEmployee");
  const res = await callable({ uid, email, password, role, displayName, disabled });
  return res.data; // { ok: true }
}

/**
 * ฟังก์ชันหลัก #4: deleteUserForEmployee
 * - โหมด Cloud Functions: ลบผู้ใช้ใน Auth + เอกสาร Firestore ที่เกี่ยวข้อง
 */
export async function deleteUserForEmployee(uid) {
  const callable = httpsCallable(functions, "deleteUserForEmployee");
  const res = await callable({ uid });
  return res.data; // { ok: true }
}

// ====== ใหม่ (โหมดฟรีบน Spark) : Fallback เมื่อไม่มี Functions / Blaze ======

/**
 * ฟังก์ชันหลัก #5: createUserForEmployeeClient
 * - ใช้ Secondary App (ชื่อ "admin-helper") เพื่อสร้าง user ใหม่ โดยไม่ทำให้ session ของแอดมินหลุด
 * - ขั้นตอน:
 *   1) initializeApp ด้วย config เดิม แต่คนละชื่อ (secondary)
 *   2) ใช้ tempAuth.createUserWithEmailAndPassword สร้าง user
 *   3) เขียนเอกสาร users/{uid} (role/employeeId/email/createdAt)
 *   4) ผูก employees/{employeeId} ← { userId, userEmail }
 *   5) signOut(tempAuth) และ deleteApp(secondary) เพื่อเคลียร์
 * - ถ้าเกิด error จะพยายาม signOut + deleteApp ให้ก่อน แล้วค่อย throw ต่อ
 */
export async function createUserForEmployeeClient({
  employeeId,
  email,
  password,
  displayName = "",
  role = "staff",
}) {
  if (!employeeId || !email || !password) {
    throw new Error("employeeId, email, password required");
  }

  // ใช้ config จาก mainApp แต่ตั้งชื่อแอปต่างหาก (secondary app)
  const cfg = mainApp.options;
  const tempApp = initializeApp(cfg, "admin-helper");
  const tempAuth = getAuth(tempApp);

  try {
    // กันไว้: เซสชันของ secondary app ไม่ต้องไปยุ่งกับ main (ตั้ง persistence ไว้)
    await setPersistence(tempAuth, browserLocalPersistence);

    // สร้าง user ใหม่ (บน secondary app เท่านั้น)
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = cred.user.uid;

    // upsert เอกสาร users/{uid}
    await setDoc(doc(db, "users", uid), {
      email,
      displayName: displayName || null,
      role,
      employeeId,
      createdAt: serverTimestamp(),
    }, { merge: true });

    // ผูก employees/{employeeId}
    await setDoc(doc(db, "employees", employeeId), {
      userId: uid,
      userEmail: email,
    }, { merge: true });

    // เคลียร์ secondary app ให้สะอาด
    await signOut(tempAuth);
    await deleteApp(tempApp);

    return { uid };
  } catch (err) {
    // ถ้าเกิด error ให้พยายามเคลียร์ให้เรียบร้อยก่อน
    try { await signOut(tempAuth); } catch {}
    try { await deleteApp(tempApp); } catch {}
    throw err;
  }
}

/**
 * ฟังก์ชันหลัก #6: sendResetEmailForEmployee
 * - ส่งอีเมลรีเซ็ตรหัสผ่านให้ผู้ใช้ (ทำได้บน Spark)
 * - ใช้ Auth ของแอปหลัก (main app)
 */
export async function sendResetEmailForEmployee(email) {
  if (!email) throw new Error("email required");
  const mainAuth = getAuth(); // ใช้ auth ของแอปหลัก
  await sendPasswordResetEmail(mainAuth, email);
  return { ok: true };
}
