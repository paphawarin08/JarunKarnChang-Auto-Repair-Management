// src/utils/printRepairDoc.js
// ฟังก์ชันนี้ “โหดอยู่” เพราะมัน generate HTML ทั้งหน้าแล้วเปิด window.print()
// สรุปคือกดปุ๊บ -> เปิดแท็บใหม่ -> เรนเดอร์ใบประเมิน/สรุปค่าใช้จ่าย -> auto print
// จัดว่าเป็น “ฟังก์ชันหลักที่จำเป็น” ของฟีเจอร์เอกสารในระบบซ่อม

/**
 * ฟังก์ชันหลัก #1: printRepairDoc
 * หน้าที่: รับข้อมูลงานซ่อม + รายการอะไหล่/ค่าใช้จ่าย -> ประกอบเป็น HTML A4 -> เปิดแท็บใหม่แล้วสั่งพิมพ์
 * พารามิเตอร์สำคัญ:
 *  - selected: ข้อมูลงานซ่อม (ใช้หัวกระดาษ เช่น ลูกค้า รถ วันที่)
 *  - partsLines: รายการอะไหล่ที่ใช้ (ชื่อ/จำนวน/ราคาต่อหน่วย/รวม)
 *  - chargeLines: ค่าใช้จ่ายอื่น ๆ เช่น ค่าช่าง มัดจำ ฯลฯ
 *  - subTotal/paidTotal/discount/balance: ตัวเลขสรุป (ถ้าไม่ส่งมาจะคำนวณจาก lines ให้)
 *
 * ระวัง: ห้ามแก้ไข logic เดิม — เพิ่มแต่คอมเม้นเพื่ออธิบาย
 */
export function printRepairDoc({
  selected,
  partsLines,
  chargeLines,
  subTotal,
  paidTotal,
  discount,
  balance,
}) {
  if (!selected) return; // ไม่มีงานซ่อมก็ไม่ทำอะไร

  // แปลงวันที่แบบไทย ๆ (เช่น 5 กันยายน 2025)
  const toThaiDate = (d) => {
    try {
      if (!d) return "-";
      // รองรับทั้ง Firestore Timestamp, Date, และ number/string ที่ new Date ได้
      const dt = typeof d?.toDate === "function" ? d.toDate() : (d instanceof Date ? d : new Date(d));
      return dt.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    } catch { return "-"; }
  };

  // ===== ดึงข้อมูลหัวกระดาษจาก selected (มี fallback เป็น '-') =====
  const createdDate = toThaiDate(selected.createdAt);
  const custName = selected.customerName || "-";
  const custPhone = selected.customerPhone || "-";
  const vehicle = selected.vehicleTitle || "-";
  const plate = selected.vehiclePlate || "-";
  const vType = selected.vehicleType || "-";
  const vColor = selected.vehicleColor || "-";
  const vGear  = selected.vehicleTransmission || "-";

  // ===== ทำให้แน่ใจว่า partsLines มีฟิลด์ครบและเป็นตัวเลข =====
  const safeParts = (partsLines || []).map(p => ({
    name: p.name || p.partName || "-",
    qty: Number(p.qty || p.quantity || 0),
    unit: Number(p.unitPrice || p.price || 0),
    total: Number(p.total || (Number(p.qty || 0) * Number(p.unitPrice || 0))),
  }));

  // ===== และค่าใช้จ่ายอื่น ๆ เช่น ค่าช่าง/มัดจำ =====
  const safeCharges = (chargeLines || []).map(c => ({
    name: c.name || "-",
    type: c.type || "other",
    paid: !!c.paid,
    total: Number(c.total || c.amount || 0),
  }));

  // ===== รวมเป็นรายการเดียว เพื่อไปเรนเดอร์ตาราง =====
  const lines = [
    ...safeParts.map(p => ({
      name: p.name,
      desc: `${p.qty} ชิ้น × ${p.unit.toLocaleString("th-TH")} บาท`,
      amount: p.total,
    })),
    ...safeCharges.map(c => ({
      name: c.name,
      desc:
        (c.type === "labor" ? "ค่าช่าง" :
         c.type === "deposit" ? "เงินมัดจำ" : "ค่าใช้จ่ายอื่นๆ")
        + (c.paid ? " (ชำระแล้ว)" : ""),
      amount: c.total,
    })),
  ];

  // ===== สรุปยอด (ถ้า caller ส่งมาก็ใช้เลย ไม่งั้นคำนวณเองแบบเซฟ ๆ) =====
  const SUM_SUBTOTAL = Number(subTotal || lines.reduce((s, r) => s + Number(r.amount || 0), 0));
  const SUM_DISCOUNT = Number(discount || selected.discount || 0);
  const SUM_PAID     = Number(paidTotal || selected.paidTotal || 0);
  const SUM_BALANCE  = Number(
    typeof balance !== "undefined" ? balance : (SUM_SUBTOTAL - SUM_DISCOUNT - SUM_PAID)
  );

  // ===== HTML ทั้งหน้า (A4) สำหรับพิมพ์ =====
  // หมายเหตุ: อย่าแก้ไข template string นี้ เพราะอาจทำให้การจัดหน้าพิมพ์เพี้ยน
  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8"/><title>ใบประเมินรายการซ่อม ${selected.code || ""}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  /* (สไตล์ยาวหน่อย แต่หลัก ๆ คือจัดหน้า A4 ให้พิมพ์ออกมาสวย ๆ) */
  @page { size: A4 portrait; margin: 12mm; }
  :root { --printable-width: 186mm; }
  *{ box-sizing:border-box; }
  html, body { margin:0; padding:0; height:auto; overflow:visible; }
  body { font-family: 'TH Sarabun New', Tahoma, sans-serif; font-size:16px; line-height:1.35; color:#000; }
  @media screen {
    html, body { height:100%; }
    body{ min-height:100vh; display:flex; justify-content:center; align-items:flex-start; background:#f6f7fb; padding:24px; }
    .page{ width:var(--printable-width); margin:0 auto; background:#fff; box-shadow:0 0 10px rgba(0,0,0,.12); padding:12mm; }
  }
  @media print {
    body { background:none; }
    .page{ width:var(--printable-width); margin-left:auto; margin-right:auto; box-shadow:none; page-break-after:avoid; break-after:avoid-page; }
  }
  .no-break { break-inside:avoid; page-break-inside:avoid; }
  .header-section { border:2px solid #000; margin-bottom:8px; }
  .header-row { display:flex; border-bottom:2px solid #000; }
  .header-left { flex:1; padding:10px 12px; text-align:center; background:#e6f3ff; border-right:2px solid #000; }
  .header-right{ flex:1; padding:10px 12px; background:#e6f3ff; }
  .date-section, .owner-section, .vehicle-section, .mileage-section { padding:8px 12px; border-bottom:2px solid #000; }
  .owner-section, .mileage-section { display:flex; gap:28px; align-items:center; }
  .vehicle-row { display:flex; gap:28px; margin-bottom:6px; }
  .field-group{ display:flex; align-items:center; gap:8px; }
  .field-label{ white-space:nowrap; }
  .field-value{ border-bottom:1px dotted #000; min-width:110px; padding-bottom:2px; }
  .damage-title{ text-align:center; font-weight:800; margin:14px 0 8px; font-size:18px; }
  table.damage-table{ width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:12px; }
  .damage-table th, .damage-table td{ border:1px solid #000; padding:7px 8px; }
  .damage-table th{ background:#f0f0f0; text-align:center; font-weight:800; }
  .center{text-align:center} .right{text-align:right}
  tfoot td { font-weight: 800; background: #fafafa; }
  .payment-info{ margin-top:6px; font-size:15px; }
  .payment-row{ display:flex; gap:28px; margin-bottom:8px; }
  .checkbox{ width:13px; height:13px; border:1.6px solid #000; display:inline-block; margin:0 8px 0 10px; vertical-align:middle; }
  .signature-section{ margin-top:22px; display:flex; gap:18px; }
  .signature-box{ flex:1; text-align:center; }
  .signature-line{ border-bottom:1px dotted #000; margin:22px 0 8px; height:20px; }
  .signature-label{ font-size:14px; margin-bottom:12px; }
  .date-line{ border-bottom:1px dotted #000; display:inline-block; min-width:130px; height:20px; margin-left:8px; }
</style>
</head><body>
<div class="page no-break">
  <!-- ส่วนหัวใบประเมิน -->
  <div class="header-section no-break">
    <div class="header-row">
      <div class="header-left"><div class="shop-name"></div><div class="shop-address"><br/><br/></div></div>
      <div class="header-right"><div style="text-align:right">
        <strong style="font-size:18px">อู่จรัลการช่าง</strong><br/>
        302 ม.11 ต.จอหอ อ.เมือง จ.นครราชสีมา 30310<br/>
        หมายเลขโทรศัพท์ 044-372047, 081-9775429
      </div></div>
    </div>
    <div class="date-section"><div class="field-group"><span class="field-label">วันที่เข้ารับบริการ</span><span class="field-value">${createdDate}</span></div></div>
    <div class="owner-section">
      <div class="field-group"><span class="field-label">ชื่อเจ้าของรถ</span><span class="field-value">${custName}</span></div>
      <div class="field-group"><span class="field-label">หมายเลขโทรศัพท์</span><span class="field-value">${custPhone}</span></div>
    </div>
    <div class="vehicle-section">
      <div class="vehicle-row"><div class="field-group"><span class="field-label">ประเภทรถ</span><span class="field-value">${vType}</span></div></div>
      <div class="vehicle-row"><div class="field-group"><span class="field-label">ชื่อรถ/รุ่น</span><span class="field-value">${vehicle}</span></div></div>
    </div>
    <div class="mileage-section">
      <div class="field-group"><span class="field-label">เลขทะเบียน</span><span class="field-value">${plate}</span></div>
      <div class="field-group"><span class="field-label">สีรถ</span><span class="field-value">${vColor}</span></div>
      <div class="field-group"><span class="field-label">ประเภทเกียร์</span><span class="field-value">${vGear}</span></div>
    </div>
  </div>

  <!-- ตารางรายการความเสียหาย/ค่าใช้จ่าย -->
  <div class="damage-title">รายการความเสียหาย (ประเมิน)</div>
  <table class="damage-table no-break">
    <thead><tr><th style="width:70px">ลำดับ</th><th>รายการ</th><th style="width:300px">ลักษณะความเสียหาย</th><th style="width:150px">จำนวน (เงิน)</th></tr></thead>
    <tbody>
      ${lines.length ? lines.map((r,i)=>`
      <tr><td class="center">${i+1}</td><td>${r.name}</td><td>${r.desc || "-"}</td><td class="right">${(Number(r.amount)||0).toLocaleString("th-TH")}</td></tr>
      `).join("") : `<tr><td class="center">-</td><td colspan="3">ไม่มีรายการ</td></tr>`}
      <tr><td colspan="4" style="border:none;height:8px;"></td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="3" class="right">รวมเป็นจำนวนเงิน</td><td class="right">${Number(SUM_SUBTOTAL).toLocaleString("th-TH")}</td></tr>
      <tr><td colspan="3" class="right">ส่วนลด</td><td class="right">-${Number(SUM_DISCOUNT).toLocaleString("th-TH")}</td></tr>
      <tr><td colspan="3" class="right">ชำระแล้ว</td><td class="right">-${Number(SUM_PAID).toLocaleString("th-TH")}</td></tr>
      <tr><td colspan="3" class="right">คงค้างชำระ</td><td class="right">${Number(SUM_BALANCE).toLocaleString("th-TH")}</td></tr>
    </tfoot>
  </table>

  <!-- ช่องเซ็นชื่อ -->
  <div class="signature-section no-break">
    <div class="signature-box"><div>ลงชื่อ <span class="date-line"></span></div><div class="signature-label">ช่างผู้ให้บริการ</div><div>วันที่ <span class="date-line"></span></div></div>
    <div class="signature-box"><div>ลงชื่อ <span class="date-line"></span></div><div class="signature-label">ผู้เข้ารับบริการ</div><div>วันที่ <span class="date-line"></span></div></div>
  </div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),250);</script>
</body></html>`;

  // ===== เปิดแท็บใหม่ + ใส่ HTML + ปิด document แล้วปล่อยให้ onload -> print ทำงาน =====
  const w = window.open("", "_blank");
  if (!w) { alert("บราวเซอร์บล็อคป๊อปอัป กรุณาอนุญาตแล้วลองอีกครั้ง"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
