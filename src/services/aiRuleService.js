// src/services/aiRuleService.js
// service สำหรับจัดการ "กฎ AI" และ "feedback" ใน Firestore
// โทนคอมเม้นแบบเพื่อนอธิบายเพื่อน: ไฟล์นี้ไม่มี UI มีแต่ logic ล้วน ๆ

import { db } from "../firebase/firebase";
import { collection, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";

// ===== คอลเลกชันที่ใช้งานหลัก ๆ =====
// rulesCol: เก็บกฎ AI แต่ละข้อ เช่น { keys:[], cause, fix:[], tags:[], enabled, hits, ... }
// feedbackCol: เก็บฟีดแบ็กเวลาผู้ใช้กดว่าอาการนี้แก้ได้/ไม่ได้ ฯลฯ
const rulesCol = collection(db, "ai_rules");      // {keys[], cause, fix[], tags[], enabled, hits, ...}
const feedbackCol = collection(db, "ai_feedback"); // {symptom, cause, solution, ruleId?, ...}

/**
 * subscribeAIRules(cb)
 * - ฟังก์ชันหลัก #1: ฟังข้อมูลกฎแบบเรียลไทม์จาก Firestore
 * - จะกรอง rule ที่ถูกปิดใช้งาน (enabled === false) ออก
 * - แล้วยิง callback(cb) กลับไปด้วย array ของกฎ
 * - return: ฟังก์ชัน unsubscribe (อย่าลืมเรียกตอน unmount)
 */
export function subscribeAIRules(cb) {
  return onSnapshot(rulesCol, (snap) => {
    const arr = [];
    snap.forEach(d => {
      const x = d.data();
      // ดีเทลเล็ก ๆ: ถ้า enabled === false หนึ่งจุด ไม่เอาเข้าลิสต์ (ถือว่า disable)
      if (x.enabled !== false) arr.push({ _id: d.id, ...x });
    });
    cb(arr);
  });
}

/**
 * addAIRule(rule, uid)
 * - ฟังก์ชันหลัก #2: เพิ่มกฎใหม่ลงคอลเลกชัน ai_rules
 * - จุดสำคัญ: field `fix` ต้องเป็น array เสมอ (กัน data shape เพี้ยน)
 * - จะใส่ createdBy, createdAt, hits เริ่มต้น = 0 ให้อัตโนมัติ
 */
export async function addAIRule(rule, uid) {
  const data = {
    keys: Array.isArray(rule.keys) ? rule.keys : [],
    cause: rule.cause || "",
    fix: Array.isArray(rule.fix) ? rule.fix : [],  // <<— สำคัญ ต้องเป็น array
    tags: Array.isArray(rule.tags) ? rule.tags : [],
    createdBy: uid || null,
    createdAt: serverTimestamp(),                  // เวลา server (กัน timezone)
    hits: 0,                                       // เริ่มนับการถูกใช้งานที่ 0
  };
  await addDoc(collection(db, 'ai_rules'), data);
}

/**
 * logAIFeedback({ symptom, cause, solution, ruleId }, userId)
 * - ฟังก์ชันหลัก #3: เก็บฟีดแบ็กของผู้ใช้ลงคอลเลกชัน ai_feedback
 * - ใช้เวลาจริงของ serverTimestamp และผูก userId ถ้ามี
 * - ruleId เป็น optional เผื่อมีเคสที่คำแนะนำไม่ได้มาจาก rule โดยตรง
 */
export async function logAIFeedback({ symptom, cause, solution, ruleId=null }, userId=null) {
  return addDoc(feedbackCol, {
    symptom, cause, solution, ruleId: ruleId || null,
    createdAt: serverTimestamp(), userId: userId || null
  });
}

/**
 * incrementRuleHit(ruleId)
 * - ฟังก์ชันหลัก #4: เพิ่มตัวนับการถูกใช้งาน (hits) ของ rule
 * - เช็คก่อนว่าได้ ruleId มาจริงไหม ถ้าไม่มีจะไม่ทำอะไร (กัน error เงียบ ๆ)
 * - ใช้ increment(1) ของ Firestore ให้ atomic และปลอดภัยเวลา concurrent
 */
export async function incrementRuleHit(ruleId) {
  if (!ruleId) return;
  await updateDoc(doc(db, "ai_rules", ruleId), { hits: increment(1) });
}
