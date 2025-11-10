// services/authService.js
// ไฟล์ service เอาไว้คุยกับ Firebase Auth เรื่อง login/logout โดยตรง
// โค้ดสั้น ๆ แต่สำคัญ ใช้ทุกหน้าที่ต้องยืนยันตัวตน

import { auth } from "../firebase/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";

/**
 * login(email, password)
 * - ฟังก์ชันหลัก #1: ล็อกอินด้วยอีเมล/รหัสผ่านผ่าน Firebase Auth
 * - ถ้าสำเร็จ: คืน { success: true, user }
 * - ถ้าพลาด (เช่น รหัสผิด): คืน { success: false, error: <ข้อความ> }
 * - ทำแบบนี้เพื่อให้ฝั่ง UI เช็คได้ง่าย ๆ โดยไม่ต้อง try/catch ทุกที่
 */
export async function login(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: cred.user };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * logout()
 * - ฟังก์ชันหลัก #2: ออกจากระบบ
 * - เรียก signOut(auth) แล้วให้หน้าอื่นจัดการ redirect ต่อเอง
 */
export function logout() {
  return signOut(auth);
}
