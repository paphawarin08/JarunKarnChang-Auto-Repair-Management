// functions/index.js

// ใช้ Firebase Functions (ฝั่ง backend) + Firebase Admin SDK
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// เปิดใช้แอปแอดมิน 1 ครั้งเพื่อให้เรียก auth/firestore ได้
admin.initializeApp();

// ช็อตคัตอ็อบเจ็กต์ Firestore
const db = admin.firestore();

/**
 * assertAdmin(context)
 * - เอาไว้เช็คว่า request นี้ถูกเรียกโดย "ผู้ใช้ที่ล็อกอิน" และมีสิทธิ์ admin เท่านั้น
 * - ถ้าไม่ผ่านจะโยน HttpsError ให้ฝั่ง client จัดการเอง
 */
async function assertAdmin(context) {
  if (!context.auth) {
    // ยังไม่ได้ล็อกอินเลย
    throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  }
  // เราใช้ custom claims บน token: { role: 'admin' }
  // (จะ set ตอนสร้าง/อัปเดตผู้ใช้ในฟังก์ชันด้านล่าง)
  const token = context.auth.token || {};
  if (token.role !== "admin") {
    // ไม่ใช่แอดมิน → ไม่ให้ผ่าน
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
}

/**
 * createUserForEmployee
 * - รับข้อมูลพนักงาน (employeeId + email + password)
 * - สร้างผู้ใช้ใน Firebase Auth
 * - ใส่ custom claims (role)
 * - บันทึก users/{uid} และเชื่อม employees/{employeeId} กับ userId ที่สร้าง
 */
exports.createUserForEmployee = functions.https.onCall(async (data, context) => {
  await assertAdmin(context); // ต้องเป็น admin เท่านั้นถึงจะเรียกได้

  const {
    employeeId,
    email,
    password,
    displayName = "",
    role = "staff", // เริ่มต้นเป็น "staff" (หรือระบบคุณอาจใช้ "employee")
  } = data || {};

  // เช็คพารามิเตอร์ที่ต้องมี
  if (!employeeId || !email || !password) {
    throw new functions.https.HttpsError("invalid-argument", "employeeId, email, password required");
  }

  // 1) สร้างผู้ใช้ใน Auth
  const user = await admin.auth().createUser({ email, password, displayName, disabled: false });

  // 2) ใส่ custom claims -> { role }
  await admin.auth().setCustomUserClaims(user.uid, { role });

  // 3) upsert เอกสาร users/{uid}
  await db.doc(`users/${user.uid}`).set(
    {
      email,
      displayName: displayName || null,
      role,
      employeeId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // 4) อัปเดต employees/{employeeId} ให้รู้ว่าลิงก์กับ user ไหน
  await db.doc(`employees/${employeeId}`).set(
    { userId: user.uid, userEmail: email },
    { merge: true }
  );

  return { uid: user.uid }; // ส่ง uid กลับไปให้ client ใช้งานต่อ
});

/**
 * updateUserForEmployee
 * - อัปเดตข้อมูลผู้ใช้ใน Auth/Firestore
 * - เปลี่ยนอีเมล, ชื่อ, ปิด/เปิดการใช้งาน, รีเซ็ตรหัสผ่าน และ/หรือ role (custom claims)
 * - ทุกอันเป็นออปชันนัล จะอัปเดตเฉพาะที่ส่งมา
 */
exports.updateUserForEmployee = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { uid, email, password, role, displayName, disabled } = data || {};
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid required");
  }

  // เตรียม payload สำหรับ admin.auth().updateUser
  const updates = {};
  if (typeof email === "string" && email) updates.email = email;
  if (typeof displayName === "string") updates.displayName = displayName;
  if (typeof disabled === "boolean") updates.disabled = disabled;

  // 1) อัปเดตฟิลด์ทั่วไปใน Auth (ยกเว้นรหัสผ่าน)
  if (Object.keys(updates).length) {
    await admin.auth().updateUser(uid, updates);
  }

  // 2) ถ้ามี password → อัปเดตรหัสผ่านแยกอีกครั้ง
  if (typeof password === "string" && password) {
    await admin.auth().updateUser(uid, { password });
  }

  // 3) ถ้ามี role → set custom claims + อัปเดต users/{uid}.role
  if (typeof role === "string" && role) {
    await admin.auth().setCustomUserClaims(uid, { role });
    await db.doc(`users/${uid}`).set({ role }, { merge: true });
  }

  // 4) sync อีเมล/ชื่อ ไปที่ users/{uid} ด้วย (ถ้าส่งมา)
  if (email) {
    await db.doc(`users/${uid}`).set({ email }, { merge: true });
  }
  if (displayName !== undefined) {
    await db.doc(`users/${uid}`).set({ displayName: displayName || null }, { merge: true });
  }

  return { ok: true };
});

/**
 * deleteUserForEmployee
 * - ลบผู้ใช้ทั้งใน Auth และ Firestore
 * - ก่อนลบจะอ่าน users/{uid} เพื่อรู้ว่า linked กับ employees/{employeeId} ไหม
 *   ถ้ามีก็เคลียร์ฟิลด์ userId/userEmail ใน employees/{employeeId} ออกให้ด้วย
 */
exports.deleteUserForEmployee = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { uid } = data || {};
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "uid required");

  // 1) หา employeeId จาก users/{uid} เพื่อจะได้ไปเคลียร์ลิงก์ที่ employees/*
  const uDoc = await db.doc(`users/${uid}`).get();
  const employeeId = uDoc.exists ? uDoc.data().employeeId : null;

  // 2) ลบใน Auth
  await admin.auth().deleteUser(uid);

  // 3) ลบเอกสาร users/{uid}
  await db.doc(`users/${uid}`).delete();

  // 4) ถ้าผูกกับพนักงานอยู่ → เคลียร์ฟิลด์ลิงก์ออก
  if (employeeId) {
    await db.doc(`employees/${employeeId}`).set(
      {
        userId: admin.firestore.FieldValue.delete(),
        userEmail: admin.firestore.FieldValue.delete()
      },
      { merge: true }
    );
  }
  return { ok: true };
});
