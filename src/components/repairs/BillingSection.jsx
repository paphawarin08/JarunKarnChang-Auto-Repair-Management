// src/components/repairs/BillingSection.jsx
// ส่วนนี้เป็นคอมโพเนนต์สรุปค่าใช้จ่าย (อ่านง่าย ๆ: ตารางบิล + ปุ่มเพิ่มค่าใช้จ่าย + ปุ่ม mark paid)
// ตัวมันเองไม่คุยกับ Database โดยตรงนะ รับ props มาจากหน้า RepairPage แล้วเด้ง callback กลับ

import React from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { baht } from "../../utils/repairs/format";

export default function BillingSection({
  // ==== อินพุตสำหรับ render ตาราง ====
  allLines,       // parts + charges รวมกัน
  partsLines,     // เผื่ออยากแยกโชว์/คำนวณเพิ่มภายนอก
  chargeLines,
  subTotal,
  paidTotal,
  discount,
  setDiscount,    // คุม input ส่วนลด (lifted state)
  isSettled,      // true = จ่ายครบแล้ว ใช้ขึ้นแท็ก "จ่ายแล้ว" ให้รายการอะไหล่

  // ==== state/handler สำหรับเพิ่มค่าใช้จ่ายใหม่ ====
  newName, setNewName,
  newType, setNewType,
  newAmount, setNewAmount,
  onAddCharge,     // กดเพิ่มแถวค่าใช้จ่าย

  // ==== action รายแถว ====
  onRemoveCharge,  // ลบแถวค่าใช้จ่าย
  onSetChargePaid, // ทำเครื่องหมายจ่ายแล้ว (ค่าช่าง/อื่น ๆ) — deposit ไม่ให้แก้
  onMarkAllPaid,   // ปุ่มรวม: จ่ายครบทั้งหมด
}) {
  return (
    <>
      <h3 className="billing-title">ค่าใช้จ่าย</h3>

      <div className="bill-table">
        <div className="bill-header">
          <div className="col item">รายการ</div>
          <div className="col qty">จำนวน</div>
          <div className="col unit">ราคาต่อหน่วย</div>
          <div className="col total">รวม</div>
        </div>

        <div className="bill-body">
          {allLines.map((row) => (
            <div className="bill-row" key={row.id}>
              <div className="col item">
                {row.name}
                {/* ถ้าเป็น charge ก็โชว์สถานะจ่าย/ยังไม่จ่าย / deposit แปะว่า "มัดจำ (ชำระแล้ว)" */}
                {row.kind === "charge" && (
                  <span className={`paid-tag ${row.paid ? "on" : "off"}`}>
                    {row.type === "deposit" ? "มัดจำ (ชำระแล้ว)" : row.paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"}
                  </span>
                )}
                {/* ถ้าอะไหล่ แล้วบิลปิดยอดแล้ว ก็ถือว่าจ่ายแล้วเหมือนกัน */}
                {row.kind === "part" && isSettled && <span className="paid-tag on">จ่ายแล้ว</span>}
              </div>
              <div className="col qty">
                {row.qty} {row.kind === "part" ? "ชิ้น" : "รายการ"}
              </div>
              <div className="col unit">{baht(row.unitPrice)}</div>
              <div className="col total">{baht(row.total)}</div>

              {/* เฉพาะ charge ที่ไม่ใช่มัดจำ ถึงจะให้ทำ paid / ลบได้ */}
              {row.kind === "charge" && row.type !== "deposit" && (
                <div className="col actions">
                  {!row.paid && (
                    <button className="chip success" onClick={() => onSetChargePaid(row.id, true)}>
                      <Check size={14} /> จ่ายแล้ว
                    </button>
                  )}
                  <button className="chip danger" onClick={() => onRemoveCharge(row.id)}>
                    <Trash2 size={14} /> ลบ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* สรุปด้านล่างบิล */}
        <div className="bill-summary">
          <div className="sum-left">
            <div className="sum-line">
              <span>Total:</span>
              <strong>{baht(subTotal)}</strong>
            </div>
            <div className="sum-line">
              <span>Paid:</span>
              <strong>{baht(paidTotal)}</strong>
            </div>
            <div className="sum-line">
              <span>Discount:</span>
              <input
                className="sum-input"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>
          <div className="sum-right">
            <span>Balance Due:&nbsp;</span>
            <strong className="balance">
              {baht(Math.max(0, (subTotal || 0) - Number(discount || 0) - (paidTotal || 0)))}
            </strong>
          </div>
        </div>
      </div>

      {/* แถวกรอกเพื่อเพิ่มค่าใช้จ่ายใหม่ */}
      <div className="add-charge-row">
        <div className="form-grid">
          <div className="form-group">
            <label>รายการ</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น ค่าช่าง เปลี่ยนผ้าเบรก"
            />
          </div>
          <div className="form-group">
            <label>ประเภท</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="labor">ค่าช่าง</option>
              <option value="other">ค่าใช้จ่ายอื่นๆ</option>
            </select>
          </div>
          <div className="form-group">
            <label>จำนวนเงิน (บาท)</label>
            <input
              inputMode="decimal"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="เช่น 500"
            />
          </div>
          <div className="form-group">
            <button className="btn-outline1" onClick={onAddCharge}>
              <Plus size={16} /> เพิ่มค่าใช้จ่าย
            </button>
          </div>
        </div>
      </div>

      {/* ปุ่มรวม: mark paid ทั้งบิล */}
      <div className="bill-actions">
        <button className="btn-primary" onClick={onMarkAllPaid}>
          ทำเครื่องหมายว่าชำระเงินแล้ว
        </button>
      </div>
    </>
  );
}
