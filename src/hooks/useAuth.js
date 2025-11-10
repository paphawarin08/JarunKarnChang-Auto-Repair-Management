// src/hooks/useAuth.js

// สร้าง Context สำหรับเก็บสถานะผู้ใช้ล็อกอิน (user), บทบาท (role), และสถานะโหลด (loading)
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

// ค่าเริ่มต้นของ Context:
// - user: undefined = กำลังเช็คสถานะ (ยังไม่รู้ว่าใครล็อกอินไหม)
// - role: null = ยังไม่มีบทบาท (เพราะยังไม่รู้ user หรือยังไม่ได้โหลดจาก Firestore)
// - loading: true = กำลังโหลดข้อมูลอยู่
const AuthContext = createContext({ user: undefined, role: null, loading: true });

export function AuthProvider({ children }) {
  // state หลักของ auth
  // - user: undefined ตอนแรก (กำลังตรวจ), null ถ้าไม่ล็อกอิน, หรือเป็นออบเจ็กต์ user ถ้าล็อกอินแล้ว
  const [user, setUser] = useState(undefined); // undefined = กำลังเช็ค, null = ไม่ล็อกอิน
  const [role, setRole] = useState(null);      // เก็บบทบาทจากเอกสาร users/{uid}
  const [loading, setLoading] = useState(true);// เอาไว้บอก UI ให้อดใจรอระหว่างโหลด

  useEffect(() => {
    // subscribe การเปลี่ยนแปลงสถานะล็อกอินจาก Firebase Auth แบบ real-time
    const unsub = onAuthStateChanged(auth, async (u) => {
      // เคส: ยังไม่มีใครล็อกอิน
      if (!u) {
        setUser(null);    // บอกว่าไม่มี user
        setRole(null);    // ก็เลยไม่มี role
        setLoading(false);// เลิกโหลดแล้ว
        return;
      }

      // เคส: มีผู้ใช้ล็อกอินแล้ว → เก็บ user ไว้ก่อน
      setUser(u);

      // แล้วไปโหลด role จาก Firestore: users/{uid}.role
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        // ถ้ามีเอกสารก็เอา role ถ้าไม่มีหรือไม่มีฟิลด์ก็ให้เป็น null
        setRole(snap.exists() ? snap.data()?.role ?? null : null);
      } finally {
        // ไม่ว่าผลจะเป็นยังไง ก็หยุดสถานะโหลด
        setLoading(false);
      }
    });

    // cleanup: ยกเลิก subscribe ตอน component unmount
    return () => unsub();
  }, []);

  // ส่งค่าทั้งหมดให้ลูกหลานผ่าน Context
  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ฮุคช่วยเอาค่า auth ที่แชร์ไว้ใน Context ไปใช้ในหน้า/คอมโพเนนต์อื่น
export function useAuth() {
  return useContext(AuthContext);
}
