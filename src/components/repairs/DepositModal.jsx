// src/components/repairs/DepositModal.jsx
// โมดอลเรียบง่ายสำหรับตั้ง "เงินมัดจำ" ให้กับงานหนึ่ง ๆ
// ตัวนี้ไม่ได้คิดเงินเอง แค่รับ/ส่งค่าไปให้หน้าหลักจัดการ

import React from "react";

export default function DepositModal({
  open,             // เปิด/ปิดโมดอล
  onClose,          // ปิดโมดอล
  processing,       // ถ้ากำลังบันทึกอยู่จะปิด input + ปุ่ม
  existingDeposit,  // ถ้ามีมัดจำเก่า จะโชว์แจ้งเตือนว่ากำลังอัปเดต
  amount,           // ค่าที่กรอกในช่องจำนวนเงิน
  setAmount,        // setter ของช่องจำนวนเงิน
  onSave,           // กดบันทึก -> ส่งกลับไปให้หน้าแม่ทำธุรกรรม
}) {
  if (!open) return null;
  return (
    <div className="deposit-overlay" onClick={() => !processing && onClose()}>
      <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deposit-header">
          <h3>ตั้งค่ามัดจำ</h3>
          <button className="icon-btn" onClick={onClose} disabled={processing}>×</button>
        </div>
        <div className="deposit-body">
          <div className="form-group full">
            <label>จำนวนเงิน (บาท)</label>
            <input
              className="deposit-input"
              placeholder="เช่น 1000"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={processing}
            />
            {existingDeposit && (
              <small className="hint">
                มัดจำเดิม: {Number(existingDeposit.amount || 0).toLocaleString("th-TH")} บาท
                (จะอัปเดตเป็นจำนวนใหม่เมื่อบันทึก)
              </small>
            )}
          </div>
          <div className="deposit-note">
            * ระบบจะบันทึกมัดจำเป็นรายการค่าใช้จ่ายประเภท <b>deposit</b> และทำเครื่องหมายว่า <b>ชำระแล้ว</b>
          </div>
        </div>
        <div className="deposit-actions">
          <button className="btn-outline" onClick={onClose} disabled={processing}>ยกเลิก</button>
          <button className="btn-primary" onClick={onSave} disabled={processing}>
            {processing ? "กำลังบันทึก…" : "บันทึกมัดจำและเปลี่ยนสถานะ"}
          </button>
        </div>
      </div>
    </div>
  );
}
