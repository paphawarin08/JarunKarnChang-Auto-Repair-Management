// src/pages/tech/TechRepairDetailModal.jsx
// TechRepairDetailModal.jsx — โมดอลรายละเอียดงานของช่าง
// เอาไว้: เปลี่ยนสถานะงาน + ดู/สรุปบิล + เพิ่ม/ลบค่าใช้จ่าย + ทำมัดจำ

// TechRepairDetailModal.jsx — โมดอลรายละเอียดงานของช่าง
// เอาไว้: เปลี่ยนสถานะงาน + ดู/สรุปบิล + เพิ่ม/ลบค่าใช้จ่าย + ทำมัดจำ
// โทนคอมเม้นแบบเพื่อนเล่าให้เพื่อนฟังนะ :D

// ===== imports หลัก ๆ =====
// - updateRepairStatus / subscribePartsUsed / subscribeCharges / addCharge / removeCharge / setChargePaid:
//   ฟังก์ชันคุยกับ backend เกี่ยวกับสถานะงานและบิล
// - auth: เอา uid ไปล็อกว่าใครเป็นคนแก้

// ===== ค่าคงที่ + helper =====
// STATUS_OPTIONS: รายชื่อสถานะที่ให้เลือกใน select
// baht(n): ฟอร์แมตราคาเป็น "1,234.00 บาท" (ยูทิล ไม่นับ)
// formatDate(val): แปลง timestamp เป็นสตริงอ่านง่าย (ยูทิล ไม่นับ)

// ===== state หลักของโมดอล =====
// selected: เก็บ repair ปัจจุบันที่กำลังดู
// partsUsed, charges: รายการอะไหล่ที่ใช้ + รายการค่าใช้จ่ายทั้งหมด (มาจาก subcollection)
// discount: ส่วนลดของงาน
// tempStatus, statusNote: สถานะที่จะเปลี่ยน + โน้ตของสถานะ (พิมพ์ก่อนกด “บันทึกสถานะ”)
// newName, newType, newAmount: เอาไว้เพิ่มค่าใช้จ่ายทั่วไป
// showDepositModal, depositAmount, depositProcessing: state ของ modal “เงินมัดจำ”

// ===== useEffect: subscribe subcollections =====
// เมื่อ repair._id เปลี่ยน -> set selected + tempStatus
// แล้วฟัง realtime: partsUsed / charges (unsubscribe ตอนปิด)
// แพทเทิร์น subscribe เหมือนไฟล์ก่อน ๆ (อธิบายแต่ “ไม่ต้องนับ”)

// ===== useMemo: existingDeposit =====
// หาแถว “มัดจำ” ตัวล่าสุดใน charges ไว้ใช้ตอนเปิด/แก้ไขมัดจำ (ยูทิลเล็ก ๆ ไม่นับ)

// ===== useMemo: ทำบิลสรุป =====
// partsLines: แปลง partsUsed เป็น {name, qty, unitPrice, total, kind:"part"}
// chargeLines: แปลง charges (ที่ไม่ถูกลบ) เป็น {name, qty:1, unitPrice, total, paid, kind:"charge", type}
// allLines + ยอดรวม: partsTotal, chargesTotal, paidTotal, subTotal, balance
// อันนี้เหมือนแนว BillingSection ก่อนหน้าเลย (อธิบายแต่ “ไม่ต้องนับ”)

// ===== ฟังก์ชันที่อธิบายแต่ “ไม่นับ” (เพราะคล้ายไฟล์ก่อน) =====
// - markAllPaid(): ไล่ setChargePaid ให้ทุกแถวที่ยังไม่จ่าย -> เคยมีลักษณะนี้ในส่วนบิลไฟล์ก่อน ๆ แล้ว
// - addChargeRow(): เพิ่มค่าใช้จ่ายทั่วไป (ชื่อ/ประเภท/จำนวน) -> ลอจิกเดิมใน BillingSection
// - removeChargeRow(rowId): ลบค่าใช้จ่าย → confirm แล้ว removeCharge
// - openDepositModal()/closeDepositModal(): แค่เปิด/ปิด modal (ยูทิล UI)

// ===== UI โดยย่อ =====
// - header: โค้ดงาน + ปุ่มปิด
// - ส่วนข้อมูลพื้นฐาน: ลูกค้า/เบอร์/ที่อยู่/รถ/สถานะ/วันที่
// - ส่วน “เปลี่ยนสถานะ”: select + input note + ปุ่ม “บันทึกสถานะ” (ไปที่ applyStatus())
// - ส่วนบิล (โผล่เฉพาะตอนสถานะ = “ซ่อมเสร็จสิ้น”): ตารางรวมรายการอะไหล่+ค่าใช้จ่าย, ปุ่ม markAllPaid,
//   ฟอร์มเพิ่มค่าใช้จ่ายทั่วไป
// - deposit modal: กรอกจำนวนแล้ว “บันทึกมัดจำ” → saveDepositAndUpdateStatus()

//สรุป “ฟังก์ชันหลักที่นับได้ในไฟล์นี้”
//    1) applyStatus — เปลี่ยนสถานะโดยมี gate บังคับทำมัดจำก่อน (สำคัญมาก)
//    2) saveDepositAndUpdateStatus — เขียน/อัพเดตแถวมัดจำ + อัพเดตสถานะเป็น “ตรวจสอบเสร็จสิ้น”
//
// รวมในไฟล์นี้: นับได้ 2 อัน

import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import "../../styles/RepairPage.css";           // ใช้ CSS เดิมของ RepairPage
import {
  updateRepairStatus,
  subscribePartsUsed,
  subscribeCharges,
  addCharge,
  removeCharge,
  setChargePaid,
} from "../../services/repairService";
import { auth } from "../../firebase/firebase";

const STATUS_OPTIONS = [
  "รับรถเข้าร้าน",
  "ตรวจสอบเสร็จสิ้น",
  "ระหว่างการซ่อม",
  "ซ่อมเสร็จสิ้น",
];

const baht = (n = 0) =>
  (Number(n) || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " บาท";

function formatDate(val) {
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

export default function TechRepairDetailModal({ repair, onClose, onGotoEdit }) {
  const [selected, setSelected] = useState(repair);

  // subcollections
  const [partsUsed, setPartsUsed] = useState([]);
  const [charges, setCharges] = useState([]);
  const [discount, setDiscount] = useState(Number(repair?.discount || 0));

  // เปลี่ยนสถานะ
  const [tempStatus, setTempStatus] = useState(repair?.status || "รับรถเข้าร้าน");
  const [statusNote, setStatusNote] = useState("");

  // เพิ่มค่าใช้จ่ายทั่วไป
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("labor");
  const [newAmount, setNewAmount] = useState("");

  // มัดจำ
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositProcessing, setDepositProcessing] = useState(false);

  useEffect(() => {
    if (!repair?._id) return;
    setSelected(repair);
    setTempStatus(repair?.status || "รับรถเข้าร้าน");

    const u1 = subscribePartsUsed(repair._id, setPartsUsed);
    const u2 = subscribeCharges(repair._id, setCharges);
    return () => {
      u1 && u1();
      u2 && u2();
    };
  }, [repair?._id]);

  const existingDeposit = useMemo(
    () => (charges || []).find((c) => c?.type === "deposit" && !c?.deletedAt),
    [charges]
  );

  // ใบสรุปค่าใช้จ่าย
  const partsLines = useMemo(
    () =>
      (partsUsed || []).map((p) => {
        const qty = Number(p.qty || 0);
        const unit = Number(p.unitPrice || 0);
        return {
          id: p._id || p.partsUsedId || "",
          name: p.partName || p.name || "อะไหล่",
          qty,
          unitPrice: unit,
          total: qty * unit,
          kind: "part",
        };
      }),
    [partsUsed]
  );

  const chargeLines = useMemo(
    () =>
      (charges || [])
        .filter((c) => !c.deletedAt)
        .map((c) => ({
          id: c._id,
          name:
            c.name ||
            (c.type === "labor"
              ? "ค่าช่าง"
              : c.type === "deposit"
              ? "เงินมัดจำ"
              : "ค่าใช้จ่ายอื่นๆ"),
          qty: 1,
          unitPrice: Number(c.amount || 0),
          total: Number(c.amount || 0),
          paid: !!c.paid,
          kind: "charge",
          type: c.type || "other",
        })),
    [charges]
  );

  const allLines = [...partsLines, ...chargeLines];
  const partsTotal = partsLines.reduce((s, x) => s + x.total, 0);
  const chargesTotal = chargeLines.reduce((s, x) => s + x.total, 0);
  const paidTotal = chargeLines.filter((c) => c.paid).reduce((s, x) => s + x.total, 0);
  const subTotal = partsTotal + chargesTotal;
  const balance = Math.max(0, subTotal - Number(discount || 0) - paidTotal);

  const markAllPaid = async () => {
    if (!selected?._id) return;
    const unpaid = charges.filter((c) => !c.paid && !c.deletedAt);
    for (const row of unpaid) {
      await setChargePaid(selected._id, row._id, true);
    }
    alert("ทำเครื่องหมายชำระเงินเรียบร้อย");
  };

  const addChargeRow = async () => {
    if (!selected?._id) return;
    const amt = Number(newAmount);
    if (!newName.trim() || !Number.isFinite(amt)) return;
    await addCharge(selected._id, {
      name: newName.trim(),
      type: newType,
      amount: amt,
      paid: false,
    });
    setNewName("");
    setNewAmount("");
  };

  const removeChargeRow = async (rowId) => {
    if (!selected?._id) return;
    if (!window.confirm("ลบรายการนี้?")) return;
    await removeCharge(selected._id, rowId);
  };

  // ===== Deposit flow =====
  const openDepositModal = () => {
    setDepositAmount(existingDeposit ? String(existingDeposit.amount || "") : "");
    setShowDepositModal(true);
  };
  const closeDepositModal = () => {
    if (!depositProcessing) setShowDepositModal(false);
  };

  // 2) saveDepositAndUpdateStatus()
//    - validate จำนวนเงินมัดจำ > 0
//    - ถ้ามีมัดจำเก่าและยอดเปลี่ยน → ลบแถวเก่าก่อน
//    - เพิ่มแถว charge แบบ type:"deposit", paid:true
//    - แล้วค่อย updateRepairStatus → “ตรวจสอบเสร็จสิ้น” + note
//    - ปิด modal / reset note
//    >> นี่คือ core flow “บันทึกมัดจำ + อัปเดตสถานะ”  ==> นับ
  const saveDepositAndUpdateStatus = async () => {
    if (!selected?._id) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("กรุณากรอกจำนวนเงินมัดจำเป็นตัวเลขมากกว่า 0");
      return;
    }
    try {
      setDepositProcessing(true);
      if (existingDeposit) {
        const prev = Number(existingDeposit.amount || 0);
        if (prev !== amt) await removeCharge(selected._id, existingDeposit._id);
      }
      if (!existingDeposit || Number(existingDeposit.amount || 0) !== amt) {
        await addCharge(
          selected._id,
          { name: "เงินมัดจำ", type: "deposit", amount: amt, paid: true },
          auth.currentUser?.uid || null
        );
      }
      await updateRepairStatus(selected._id, {
        status: "ตรวจสอบเสร็จสิ้น",
        note: statusNote || "",
        userId: auth.currentUser?.uid || null,
      });
      setSelected((prev) => (prev ? { ...prev, status: "ตรวจสอบเสร็จสิ้น" } : prev));
      setStatusNote("");
      setShowDepositModal(false);
      alert("บันทึกมัดจำและเปลี่ยนสถานะเรียบร้อย");
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถบันทึกมัดจำได้");
    } finally {
      setDepositProcessing(false);
    }
  };

  // ===== ฟังก์ชันหลัก (อันที่นับ) =====
// 1) applyStatus()
//    - ถ้าเลือกสถานะเป็น “ตรวจสอบเสร็จสิ้น” → ไม่อัปเดตทันที แต่ “เปิดหน้ามัดจำ” มาก่อน (gate)
//    - ถ้าเป็นสถานะอื่น → เรียก updateRepairStatus เลย แล้วรีเฟรช selected.status
//    >> อันนี้คือ logic แกนของหน้าช่าง: “เปลี่ยนสถานะพร้อมเงื่อนไขมัดจำ”  ==> นับ

  const applyStatus = async () => {
    if (!selected?._id) return;
    if (tempStatus === "ตรวจสอบเสร็จสิ้น") {
      openDepositModal();
      return;
    }
    await updateRepairStatus(selected._id, {
      status: tempStatus,
      note: statusNote || "",
      userId: auth.currentUser?.uid || null,
    });
    setSelected((prev) => (prev ? { ...prev, status: tempStatus } : prev));
    setStatusNote("");
    alert("เปลี่ยนสถานะแล้ว");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>รายละเอียดงาน: {selected?.code || "-"}</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body scrollable">
          {/* ข้อมูลพื้นฐาน */}
          <div className="detail-grid">
            <div><label>ลูกค้า:</label><span>{selected?.customerName || "-"}</span></div>
            <div><label>เบอร์:</label><span>{selected?.customerPhone || "-"}</span></div>
            <div className="full">
              <label>ที่อยู่:</label><span>{selected?.customerAddress || "-"}</span>
            </div>
            <div className="full">
              <label>รถ:</label>
              <span>{(selected?.vehicleTitle || "-")} / {(selected?.vehiclePlate || "-")}</span>
            </div>
            <div><label>สถานะปัจจุบัน:</label><span>{selected?.status || "-"}</span></div>
            <div><label>เพิ่มเมื่อ:</label><span>{formatDate(selected?.createdAt)}</span></div>
          </div>

          {/* เปลี่ยนสถานะ */}
          <div className="mt16">
            <label>เปลี่ยนสถานะ</label>
            <div className="form-grid">
              <div className="form-group">
                <select value={tempStatus} onChange={(e) => setTempStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full">
                <input
                  placeholder="หมายเหตุของสถานะนี้…"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-primary" onClick={applyStatus}>บันทึกสถานะ</button>
          </div>

          {/* ค่าใช้จ่าย/สรุป — โชว์เฉพาะเมื่อ 'ซ่อมเสร็จสิ้น' */}
          {selected?.status === "ซ่อมเสร็จสิ้น" && (
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
                        {row.kind === "charge" && (
                          <span className={`paid-tag ${row.paid ? "on" : "off"}`}>
                            {row.type === "deposit"
                              ? "มัดจำ (ชำระแล้ว)"
                              : row.paid
                                ? "จ่ายแล้ว"
                                : "ยังไม่จ่าย"}
                          </span>
                        )}
                      </div>
                      <div className="col qty">
                        {row.qty} {row.kind === "part" ? "ชิ้น" : "รายการ"}
                      </div>
                      <div className="col unit">{baht(row.unitPrice)}</div>
                      <div className="col total">{baht(row.total)}</div>
                      {row.kind === "charge" && row.type !== "deposit" && (
                        <div className="col actions">
                          {!row.paid && (
                            <button className="chip success" onClick={() => setChargePaid(selected._id, row.id, true)}>
                              ชำระแล้ว
                            </button>
                          )}
                          <button className="chip danger" onClick={() => removeChargeRow(row.id)}>ลบ</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bill-footer">
                  <div className="summary-row">
                    <span>รวม</span>
                    <span>{baht(subTotal)}</span>
                  </div>
                  <div className="summary-row">
                    <span>ส่วนลด</span>
                    <span>-{baht(discount)}</span>
                  </div>
                  <div className="summary-row">
                    <span>ชำระแล้ว</span>
                    <span>-{baht(paidTotal)}</span>
                  </div>
                  <div className="summary-row total">
                    <span>คงค้าง</span>
                    <span>{baht(balance)}</span>
                  </div>
                </div>

                <div className="bill-actions">
                  <button className="chip" onClick={markAllPaid}>
                    <Check size={16} /> ทำเครื่องหมายชำระทั้งหมด
                  </button>
                </div>

                <div className="add-charge">
                  <h4>เพิ่มค่าใช้จ่ายทั่วไป</h4>
                  <div className="form-grid">
                    <input placeholder="ชื่อรายการ…" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                      <option value="labor">ค่าช่าง</option>
                      <option value="other">ค่าใช้จ่ายอื่นๆ</option>
                    </select>
                    <input placeholder="จำนวนเงิน" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
                  </div>
                  <button className="btn-outline" onClick={addChargeRow}>เพิ่มรายการ</button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onGotoEdit}>แก้ไขงานซ่อม</button>
          <button className="btn-outline" onClick={onClose}>ปิด</button>
        </div>

        {/* Deposit Modal */}
        {showDepositModal && (
          <div className="modal-overlay" onClick={closeDepositModal}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>บันทึกเงินมัดจำ</h3>
              </div>
              <div className="modal-body">
                <input
                  type="number"
                  min="0"
                  placeholder="จำนวนเงินมัดจำ"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
                <p style={{ marginTop: 8, color: "#64748b" }}>
                  เมื่อยืนยัน ระบบจะตั้งสถานะเป็น “ตรวจสอบเสร็จสิ้น” ให้โดยอัตโนมัติ
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn-outline" onClick={closeDepositModal} disabled={depositProcessing}>ยกเลิก</button>
                <button className="btn-primary" onClick={saveDepositAndUpdateStatus} disabled={depositProcessing}>
                  {depositProcessing ? "กำลังบันทึก…" : "บันทึกมัดจำ"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
