import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";

// ใช้สไตล์เดียวกับ RepairPage
import "../../styles/RepairPage.css";
// ปรับ z-index/ขนาดกล่องสำหรับป๊อปอัปฝั่งช่าง
import "../../styles/TechRepairModal.css";

import { serverTimestamp } from "firebase/firestore"; // เพิ่มบรรทัดนี้

import {
  subscribeRepair,
  subscribePartsUsed,
  subscribeCharges,
  updateRepairStatus,
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
    if (typeof val.toDate === "function") return val.toDate().toLocaleString("th-TH");
    if (val instanceof Date) return val.toLocaleString("th-TH");
    if (typeof val === "number") return new Date(val).toLocaleString("th-TH");
    return String(val);
  } catch {
    return "-";
  }
}

export default function TechRepairModal({ repairId, onClose, onEdit }) {
  const [repair, setRepair] = useState(null);

  // subcollections
  const [partsUsed, setPartsUsed] = useState([]);
  const [charges, setCharges] = useState([]);

  // เปลี่ยนสถานะ (temp)
  const [tempStatus, setTempStatus] = useState("รับรถเข้าร้าน");
  const [statusNote, setStatusNote] = useState("");

  // เพิ่มค่าใช้จ่ายทั่วไป
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("labor"); // labor | other
  const [newAmount, setNewAmount] = useState("");

  // ส่วนลด (อ่าน/แก้เฉพาะ UI)
  const [discount, setDiscount] = useState(0);

  // === โมดัลมัดจำ ===
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositProcessing, setDepositProcessing] = useState(false);

  // โหลดข้อมูลงาน + subcollections
  useEffect(() => {
    if (!repairId) return;
    const u0 = subscribeRepair(repairId, (doc) => {
      setRepair(doc);
      setTempStatus(doc?.status || "รับรถเข้าร้าน");
      setDiscount(Number(doc?.discount || 0));
    });
    const u1 = subscribePartsUsed(repairId, setPartsUsed);
    const u2 = subscribeCharges(repairId, setCharges);

    // ปิดสกอลล์พื้นหลัง + ESC เพื่อปิดโมดัล
    document.body.style.overflow = "hidden";
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);

    return () => {
      u0 && u0();
      u1 && u1();
      u2 && u2();
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEsc);
    };
  }, [repairId, onClose]);

  // ===== ใบสรุปค่าใช้จ่าย =====
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
  const existingDeposit = useMemo(
    () => (charges || []).find((c) => c?.type === "deposit" && !c?.deletedAt),
    [charges]
  );

  // ===== Actions =====
  const applyStatus = async () => {
    if (!repair?._id) return;
    if (tempStatus === "ตรวจสอบเสร็จสิ้น") {
    // แจ้งฝั่งแอดมินว่ารอ “ตั้งมัดจำ”
    await updateRepairStatus(repair._id, {
      status: "ตรวจสอบเสร็จสิ้น",
      note: statusNote || "",
      userId: auth.currentUser?.uid || null,
      needsDeposit: true,
      depositRequestedAt: serverTimestamp?.() || Date.now(),
    });
    setStatusNote("");
    alert("อัปเดตสถานะเรียบร้อย (แจ้งแอดมินให้ตั้งมัดจำแล้ว)");
    return;
  }

  // สถานะอื่น ๆ อัปเดตปกติ
  await updateRepairStatus(repair._id, {
    status: tempStatus,
    note: statusNote || "",
    userId: auth.currentUser?.uid || null,
  });
  setStatusNote("");
  alert("อัปเดตสถานะเรียบร้อย");
  };

  // เพิ่มค่าใช้จ่ายทั่วไป (แสดง UI เฉพาะตอนซ่อมเสร็จสิ้น)
  const addChargeRow = async () => {
    if (!repair?._id) return;
    const amt = Number(newAmount);
    if (!newName.trim() || !Number.isFinite(amt)) return;
    await addCharge(repair._id, { name: newName.trim(), type: newType, amount: amt, paid: false });
    setNewName("");
    setNewAmount("");
  };

  const removeChargeRow = async (rowId) => {
    if (!repair?._id || !rowId) return;
    if (!window.confirm("ลบรายการนี้?")) return;
    await removeCharge(repair._id, rowId);
  };

  const markAllPaid = async () => {
    if (!repair?._id) return;
    const unpaid = charges.filter((c) => !c.paid && !c.deletedAt);
    for (const row of unpaid) {
      await setChargePaid(repair._id, row._id, true);
    }
    alert("ทำเครื่องหมายชำระเงินเรียบร้อย");
  };

  // ===== Deposit Modal flow =====
  const closeDepositModal = () => {
    if (!depositProcessing) setShowDepositModal(false);
  };

  const saveDepositAndUpdateStatus = async () => {
    if (!repair?._id) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("กรุณากรอกจำนวนเงินมัดจำเป็นตัวเลขมากกว่า 0");
      return;
    }
    try {
      setDepositProcessing(true);
      // ถ้ามีมัดจำเดิมและจำนวนต่างกัน -> ลบเดิมก่อน
      if (existingDeposit) {
        const prev = Number(existingDeposit.amount || 0);
        if (prev !== amt) {
          await removeCharge(repair._id, existingDeposit._id);
        }
      }
      // เพิ่ม/ยืนยันมัดจำ (paid: true)
      if (!existingDeposit || Number(existingDeposit.amount || 0) !== amt) {
        await addCharge(
          repair._id,
          { name: "เงินมัดจำ", type: "deposit", amount: amt, paid: true },
          auth.currentUser?.uid || null
        );
      }
      // เปลี่ยนสถานะจริง
      await updateRepairStatus(repair._id, {
        status: "ตรวจสอบเสร็จสิ้น",
        note: statusNote || "",
        userId: auth.currentUser?.uid || null,
      });
      setShowDepositModal(false);
      setStatusNote("");
      alert("บันทึกมัดจำและเปลี่ยนสถานะเรียบร้อย");
    } catch (e) {
      console.error(e);
      alert("บันทึกมัดจำไม่สำเร็จ");
    } finally {
      setDepositProcessing(false);
    }
  };

  if (!repair) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box tech-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>รายละเอียดงาน: {repair.code || "-"}</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body scrollable">
          {/* ข้อมูลพื้นฐาน */}
          <div className="detail-grid">
            <div><label>ลูกค้า:</label><span>{repair.customerName || "-"}</span></div>
            <div><label>เบอร์:</label><span>{repair.customerPhone || "-"}</span></div>
            <div className="full"><label>ที่อยู่:</label><span>{repair.customerAddress || "-"}</span></div>
            <div className="full">
              <label>รถ:</label>
              <span>{(repair.vehicleTitle || "-")} / {(repair.vehiclePlate || "-")}</span>
            </div>
            <div><label>สถานะปัจจุบัน:</label><span>{repair.status || "-"}</span></div>
            <div><label>เพิ่มเมื่อ:</label><span>{formatDate(repair.createdAt)}</span></div>
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

          {/* ใบสรุปค่าใช้จ่าย — เฉพาะเมื่อสถานะ = ซ่อมเสร็จสิ้น */}
          {repair.status === "ซ่อมเสร็จสิ้น" ? (
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
                      <div className="col qty">{row.qty} {row.kind === "part" ? "ชิ้น" : "รายการ"}</div>
                      <div className="col unit">{baht(row.unitPrice)}</div>
                      <div className="col total">{baht(row.total)}</div>
                      {row.kind === "charge" && row.type !== "deposit" && (
                        <div className="col actions">
                          {!row.paid && (
                            <button
                              className="chip success"
                              onClick={() => setChargePaid(repair._id, row.id, true)}
                            >
                              <Check size={14} /> จ่ายแล้ว
                            </button>
                          )}
                          <button className="chip danger" onClick={() => removeChargeRow(row.id)}>
                            <Trash2 size={14} /> ลบ
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bill-summary">
                  <div className="sum-left">
                    <div className="sum-line"><span>Total:</span><strong>{baht(subTotal)}</strong></div>
                    <div className="sum-line"><span>Paid:</span><strong>{baht(paidTotal)}</strong></div>
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
                    <strong className="balance">{baht(balance)}</strong>
                  </div>
                </div>
              </div>

            </>
          ) : (
            <div className="billing-hint">
              ใบสรุปค่าใช้จ่ายจะแสดงเมื่อสถานะงานเป็น <strong>“ซ่อมเสร็จสิ้น”</strong>
            </div>
          )}
        </div>

        {/* Actions ของโมดัล */}
        <div className="modal-actions">
          <div className="mt16">
            <small>ส่งรหัสนี้ให้ลูกค้าเพื่อใช้ค้นหา: <strong>{repair.code}</strong></small>
          </div>
          <button className="btn-outline" onClick={() => onEdit?.(repair._id)}>แก้ไขงานซ่อม</button>
          <button className="btn-outline" onClick={onClose}>ปิด</button>
        </div>

        {/* ===== Deposit Modal ===== */}
        {showDepositModal && (
          <div className="deposit-overlay" onClick={closeDepositModal}>
            <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="deposit-header">
                <h3>ตั้งค่ามัดจำ</h3>
                <button className="icon-btn" onClick={closeDepositModal} disabled={depositProcessing}>×</button>
              </div>
              <div className="deposit-body">
                <div className="form-group full">
                  <label>จำนวนเงิน (บาท)</label>
                  <input
                    className="deposit-input"
                    placeholder="เช่น 1000"
                    inputMode="decimal"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    disabled={depositProcessing}
                  />
                  {existingDeposit && (
                    <small className="hint">
                      มัดจำเดิม: {Number(existingDeposit.amount || 0).toLocaleString("th-TH")} บาท
                    </small>
                  )}
                </div>
                <div className="deposit-note">
                  * ระบบจะบันทึกมัดจำเป็นรายการค่าใช้จ่ายประเภท <b>deposit</b> และทำเครื่องหมายว่า <b>ชำระแล้ว</b>
                </div>
              </div>
              <div className="deposit-actions">
                <button className="btn-outline" onClick={closeDepositModal} disabled={depositProcessing}>ยกเลิก</button>
                <button className="btn-primary" onClick={saveDepositAndUpdateStatus} disabled={depositProcessing}>
                  {depositProcessing ? "กำลังบันทึก…" : "บันทึกมัดจำและเปลี่ยนสถานะ"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
