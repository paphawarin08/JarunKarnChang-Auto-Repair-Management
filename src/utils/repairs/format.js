// src/utils/format.js
// ยูทิลสำหรับ format ข้อมูลให้พร้อมโชว์
// อันนี้ “คล้าย” กับฟังก์ชัน formatDate ที่เราเคยเห็นในไฟล์ก่อน ๆ (มีหลายเวอร์ชัน)
// แต่มันทำงานต่างกันนิดหน่อย: ตัวนี้คืนเป็น toLocaleString() (วันที่+เวลาแบบโลคัล)
// สรุป: ถือเป็นหน้าที่ซ้ำซ้อนเชิงแนวคิดกับของเก่า → ผม "ไม่เพิ่มนับ" ฟังก์ชันนี้ในยอดรวม แต่ยังคอมเมนต์ให้เข้าใจ

export function formatDate(val) {
  try {
    if (!val) return "-";
    if (typeof val.toDate === "function") return val.toDate().toLocaleString();
    if (val instanceof Date) return val.toLocaleString();
    if (typeof val === "number") return new Date(val).toLocaleString();
    return String(val);
  } catch {
    return "-";
  }
}

// อันนี้ช่วย format เงินแบบ “1,234.00 บาท”
// ยังไม่เคยมีในไฟล์ก่อนหน้า → นับเป็น “ฟังก์ชันหลัก/ยูทิลสำคัญ” ใหม่ได้
export const baht = (n = 0) =>
  (Number(n) || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " บาท";
