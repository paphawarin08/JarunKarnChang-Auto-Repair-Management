// src/pages/AppointmentCalendar.js
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, X, Search, Settings2, Save } from "lucide-react";
import "../../styles/AppointmentCalendar.css";
import { useNavigate } from "react-router-dom";
import { subscribeCustomers } from "../../services/customerService";
import { subscribeCars } from "../../services/carService";

import { db } from "../../firebase/firebase";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  orderBy, query, serverTimestamp, Timestamp
} from "firebase/firestore";

// === คอลเลคชันที่ใช้ใน Firestore ===
const apptCol = collection(db, "appointments");
const apptTypeCol = collection(db, "appointment_types");

// ===== Utils =====
// ฟังก์ชัน: pad2(n)
// หน้าที่: แปลงตัวเลขให้เป็นสตริง 2 หลัก (เติม 0 ด้านหน้า) เช่น 3 -> "03"
// พารามิเตอร์: n (number)
// คืนค่า: string 2 หลัก
const pad2 = (n) => String(n).padStart(2, "0");

// ฟังก์ชัน: toLocalInputValue(d)
// หน้าที่: แปลง Date เป็นสตริงรูปแบบที่ <input type="datetime-local"> ต้องใช้
// พารามิเตอร์: d (Date)
// คืนค่า: string "YYYY-MM-DDTHH:mm"
const toLocalInputValue = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// ฟังก์ชัน: fromInputToDate(val)
// หน้าที่: แปลงค่าสตริงจาก input เป็น Date; ถ้า parse ไม่ได้ให้คืน Date ปัจจุบัน (กันค่าพัง)
// พารามิเตอร์: val (string)
// คืนค่า: Date
const fromInputToDate = (val) => isNaN(new Date(val).getTime()) ? new Date() : new Date(val);

// ฟังก์ชัน: addMinutes(date, mins)
// หน้าที่: บวกนาทีให้กับวันที่
// พารามิเตอร์: date (Date), mins (number)
// คืนค่า: Date ใหม่ (ไม่แก้ตัวเดิม)
const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);

// ฟังก์ชัน: sameDate(a, b)
// หน้าที่: เช็คว่าเป็น "วันเดียวกัน" (ไม่มองชั่วโมงนาที)
// พารามิเตอร์: a,b (Date)
// คืนค่า: boolean
const sameDate = (a, b) => a.toDateString() === b.toDateString();

const daysOfWeek = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const monthNames = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

// overlaps helpers
// ฟังก์ชัน: overlaps(startA,endA,startB,endB)
// หน้าที่: ตรวจว่า 2 ช่วงเวลา ทับกันมั้ย
// คืนค่า: boolean
const overlaps = (startA, endA, startB, endB) => (startA < endB) && (endA > startB);

// ฟังก์ชัน: hourRangeOf(baseDay, hour)
// หน้าที่: สร้างช่วงเวลา [start,end) ของชั่วโมงที่ระบุในวัน baseDay
// พารามิเตอร์: baseDay (Date), hour (0-23)
// คืนค่า: [startMs,endMs]
const hourRangeOf = (baseDay, hour) => {
  const s = new Date(baseDay); s.setHours(hour, 0, 0, 0);
  const e = new Date(baseDay); e.setHours(hour + 1, 0, 0, 0);
  return [s.getTime(), e.getTime()];
};

// ฟังก์ชัน: dayRangeOf(day)
// หน้าที่: ช่วงเวลาเต็มวัน [00:00,24:00) ของวันที่บอก]
// คืนค่า: [startMs,endMs]
const dayRangeOf = (day) => {
  const s = new Date(day); s.setHours(0, 0, 0, 0);
  const e = new Date(day); e.setHours(24, 0, 0, 0);
  return [s.getTime(), e.getTime()];
};

// color helpers (ใช้สีจากประเภทแบบไดนามิก)
// ฟังก์ชัน: hexToRGBA(hex, alpha)
// หน้าที่: แปลงสี hex เป็น rgba string พร้อมความโปร่งใส (ใช้เป็นพื้นหลังนัดหมาย)
// ปล.: มี fallback ถ้า hex ไม่ถูก
const hexToRGBA = (hex, alpha=0.12) => {
  if (!hex) return `rgba(66,133,244,${alpha})`; // fallback
  const m = hex.replace("#","").match(/.{1,2}/g);
  if (!m || m.length < 3) return `rgba(66,133,244,${alpha})`;
  const [r,g,b] = m.map(x => parseInt(x, 16));
  return `rgba(${r},${g},${b},${alpha})`;
};

// ฟังก์ชัน: styleForType(typeConf)
// หน้าที่: คืนชุดสไตล์สำหรับแสดงนัดหมายขึ้นกับสีของประเภท
// คืนค่า: object สำหรับ inline style
const styleForType = (typeConf) => {
  if (!typeConf) return {};
  const base = typeConf.color || "#4285f4";
  return {
    backgroundColor: hexToRGBA(base, 0.15),
    color: base,
    borderColor: base
  };
};

/* ---------------------- Select Modals (Searchable) ---------------------- */
// คอมโพเนนต์: SelectCustomerModal
// หน้าที่: โมดอลค้นหา/เลือก "ลูกค้า" (พิมพ์ค้นหาแบบกรองในเมมโมรี)
// พร็อพ: open (bool), customers (array), onClose(), onPick(customer)
function SelectCustomerModal({ open, customers, onClose, onPick }) {
  const [q, setQ] = useState("");

  // เมื่อเปิดโมดอลใหม่ ให้รีเซ็ตคิวรีค้นหา
  useEffect(()=>{ if(open){ setQ(""); } }, [open]);

  // คำนวนรายการลูกค้าที่กรองแล้ว (แปลงเป็นตัวพิมพ์เล็กก่อนเทียบ)
  const filtered = useMemo(()=>{
    const t = q.trim().toLowerCase();
    if(!t) return customers;
    return customers.filter(c=>{
      const name = (c.name||"").toLowerCase();
      const phone = (c.phone||"").toLowerCase();
      const email = (c.email||"").toLowerCase();
      const cid = (c.id||"").toString().toLowerCase();
      return name.includes(t) || phone.includes(t) || email.includes(t) || cid.includes(t);
    });
  }, [q, customers]);

  if (!open) return null;

  return (
    <div className="select-overlay" onClick={onClose}>
      <div className="select-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="select-header">
          <h3>เลือกลูกค้า</h3>
          <button className="icon-btn" onClick={onClose}><X/></button>
        </div>
        <div className="select-search">
          <Search className="icon" />
          <input
            autoFocus
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="ค้นหา: ชื่อ / เบอร์ / อีเมล / รหัสลูกค้า"
          />
        </div>
        <div className="select-list">
          {filtered.map((c)=>(
            <div key={c._id} className="select-item" onClick={()=>onPick(c)}>
              <div className="avatar">{(c.name||"?").slice(0,1).toUpperCase()}</div>
              <div className="item-info">
                <div className="item-title">{c.name || "-"}</div>
                <div className="item-sub">
                  {(c.phone||"-")} · {(c.email||"-")} · ID:{c.id||"-"}
                </div>
              </div>
            </div>
          ))}
          {filtered.length===0 && <div className="empty">ไม่พบลูกค้า</div>}
        </div>
        <div className="select-actions">
          <button className="btn-outline" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

// คอมโพเนนต์: SelectVehicleModal
// หน้าที่: โมดอลค้นหา/เลือกรถยนต์ (กรองจากชื่อรุ่น/ยี่ห้อ ทะเบียน หรือรหัสรถ)
function SelectVehicleModal({ open, cars, onClose, onPick }) {
  const [q, setQ] = useState("");

  // รีเซ็ตคิวรีเมื่อเปิด
  useEffect(()=>{ if(open){ setQ(""); } }, [open]);

  // กรองรายการรถยนต์ตามคิวรี
  const filtered = useMemo(()=>{
    const t = q.trim().toLowerCase();
    if(!t) return cars;
    return cars.filter(v=>{
      const title = (v.title||v.brand||"").toLowerCase();
      const plate = (v.plate||v.lPlate||"").toLowerCase();
      const cid   = (v.id||"").toString().toLowerCase();
      return title.includes(t) || plate.includes(t) || cid.includes(t);
    });
  }, [q, cars]);

  if (!open) return null;

  return (
    <div className="select-overlay" onClick={onClose}>
      <div className="select-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="select-header">
          <h3>เลือกรถยนต์</h3>
          <button className="icon-btn" onClick={onClose}><X/></button>
        </div>
        <div className="select-search">
          <Search className="icon" />
          <input
            autoFocus
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="ค้นหา: รุ่น/ยี่ห้อ / ทะเบียน / รหัสรถ"
          />
        </div>
        <div className="select-list">
          {filtered.map((v)=>(
            <div key={v._id} className="select-item" onClick={()=>onPick(v)}>
              {v.imageDataUrl
                ? <img className="thumb thumb-img" src={v.imageDataUrl} alt="car" />
                : <div className="thumb" />
              }
              <div className="item-info">
                <div className="item-title">{v.title || v.brand || "รถยนต์"}</div>
                <div className="item-sub">
                  {(v.lPlate || v.plate || "-")} · {v.model || ""} {v.year ? `· ${v.year}` : ""} · ID:{v.id || "-"}
                </div>
              </div>
            </div>
          ))}
          {filtered.length===0 && <div className="empty">ไม่พบรถยนต์</div>}
        </div>
        <div className="select-actions">
          <button className="btn-outline" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Manage Appointment Types Modal ---------------------- */
// คอมโพเนนต์: ManageTypesModal
// หน้าที่: โมดอลจัดการ "ประเภทการนัดหมาย" (แก้ไข/เพิ่ม/ลบ) โดยเชื่อม Firestore
// พร็อพ: open(bool), types(array), onClose()
function ManageTypesModal({ open, types, onClose }) {
  const [draft, setDraft] = useState([]);
  const [newType, setNewType] = useState({ value: "", label: "", minutes: "", color: "#4285f4" });
  const [saving, setSaving] = useState(false);

  // โหลดค่าเริ่มต้นทุกครั้งที่เปิดโมดอล
  useEffect(() => {
    if (open) {
      setDraft(types.map(t => ({ ...t })));
      setNewType({ value: "", label: "", minutes: "", color: "#4285f4" });
    }
  }, [open, types]);

  if (!open) return null;

  // ฟังก์ชันภายใน: updateField(id, field, val)
  // หน้าที่: อัปเดตร่าง (draft) ของแถวตามฟิลด์ที่แก้ไข
  const updateField = (id, field, val) => {
    setDraft(prev => prev.map(x => x._id === id ? { ...x, [field]: val } : x));
  };

  // ฟังก์ชันภายใน: persistRow(row)
  // หน้าที่: บันทึกแถวที่แก้ไขลง Firestore (updateDoc)
  // หมายเหตุ: minutes ว่าง = null (โหมดกำหนดเอง)
  const persistRow = async (row) => {
    setSaving(true);
    try {
      const minutes = row.minutes === "" ? null : Number(row.minutes);
      await updateDoc(doc(db, "appointment_types", row._id), {
        value: (row.value || "").trim(),
        label: (row.label || "").trim() || (row.value || "").trim(),
        minutes: minutes,
        color: row.color || "#4285f4",
        updatedAt: serverTimestamp()
      });
    } finally {
      setSaving(false);
    }
  };

  // ฟังก์ชันภายใน: removeRow(id)
  // หน้าที่: ลบประเภทออกจาก Firestore (มี confirm)
  const removeRow = async (id) => {
    if (!window.confirm("ลบประเภทนี้หรือไม่?")) return;
    await deleteDoc(doc(db, "appointment_types", id));
  };

  // ฟังก์ชันภายใน: addRow()
  // หน้าที่: เพิ่มประเภทใหม่ลง Firestore จากฟอร์ม newType
  const addRow = async () => {
    const val = (newType.value || "").trim();
    if (!val) { alert("กรอกค่า 'ชื่อประเภท (ไทย)' ก่อน"); return; }
    setSaving(true);
    try {
      const minutes = newType.minutes === "" ? null : Number(newType.minutes);
      await addDoc(apptTypeCol, {
        value: val,                   // ใช้ไทยเป็น value (ระบบ)
        label: (newType.label || "").trim() || val,
        minutes: minutes,
        color: newType.color || "#4285f4",
        createdAt: serverTimestamp()
      });
      setNewType({ value: "", label: "", minutes: "", color: "#4285f4" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="type-overlay" onClick={onClose}>
      <div className="type-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="type-header">
          <h3><Settings2 size={16}/> แก้ไขประเภทการนัดหมาย</h3>
          <button className="icon-btn" onClick={onClose}><X/></button>
        </div>

        <div className="type-body">
          <div className="type-grid-header">
            <div>ชื่อประเภท </div>
            <div>ป้ายชื่อที่แสดง</div>
            <div>เวลาที่ใช้ (นาที)</div>
            <div>สีที่แสดง</div>
            <div>บันทึก</div>
          </div>

          <div className="type-rows">
            {draft.map(row => (
              <div className="type-row" key={row._id}>
                <input
                  value={row.value || ""}
                  onChange={(e) => updateField(row._id, "value", e.target.value)}
                  placeholder="เช่น ตรวจเช็ค/บำรุงรักษา"
                />
                <input
                  value={row.label || ""}
                  onChange={(e) => updateField(row._id, "label", e.target.value)}
                  placeholder="ป้ายชื่อที่แสดง (ว่าง = ใช้ชื่อประเภท)"
                />
                <input
                  value={row.minutes ?? ""}
                  onChange={(e) => updateField(row._id, "minutes", e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="ปล่อยว่าง = กำหนดเอง"
                  inputMode="numeric"
                />
                <input
                  type="color"
                  value={row.color || "#4285f4"}
                  onChange={(e) => updateField(row._id, "color", e.target.value)}
                  className="color-input"
                  title="เลือกสี"
                />
                <div className="type-actions">
                  <button className="btn-outline-appo medium" disabled={saving} onClick={() => persistRow(row)}>
                    <Save size={14} />
                  </button>
                  <button className="btn-danger-appo medium" disabled={saving} onClick={() => removeRow(row._id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="type-divider" />

          <div className="type-row new">
            <input
              value={newType.value}
              onChange={(e)=>setNewType(s=>({...s, value:e.target.value}))}
              placeholder="ชื่อประเภท"
            />
            <input
              value={newType.label}
              onChange={(e)=>setNewType(s=>({...s, label:e.target.value}))}
              placeholder="ป้ายชื่อที่แสดง (เว้นว่างได้)"
            />
            <input
              value={newType.minutes}
              onChange={(e)=>setNewType(s=>({...s, minutes:e.target.value.replace(/[^\d]/g,"")}))}
              placeholder="นาที (เว้นว่าง = กำหนดเอง)"
              inputMode="numeric"
            />
            <input
              type="color"
              value={newType.color}
              onChange={(e)=>setNewType(s=>({...s, color:e.target.value}))}
              className="color-input"
            />
            <div className="type-actions">
              <button className="btn-primary small" disabled={saving} onClick={addRow}>
                <Plus size={14}/> เพิ่ม
              </button>
            </div>
          </div>

          <div className="type-note">
            * ถ้า “นาที” เว้นว่าง ระบบจะถือเป็นประเภทแบบกำหนดเวลาเอง (custom) และช่อง “ถึง:” ในฟอร์มจะไม่ถูกล็อก
          </div>
        </div>

        <div className="type-footer">
          <button className="btn-outline" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Appointment Editor (uses Select Modals) ---------------------- */
// คอมโพเนนต์: AppointmentModal
// หน้าที่: ฟอร์มเพิ่ม/แก้ไขนัดหมาย (เลือก ลูกค้า/รถ/ประเภท เวลา ชื่อ รายละเอียด)
// พร็อพ: open, initial, customers, cars, types, onClose(), onSave(payload), onOpenManageTypes()
function AppointmentModal({ open, initial, customers, cars, types, onClose, onSave, onOpenManageTypes }) {
  const defaultType = types[0]?.value || "ตรวจเช็ค/บำรุงรักษา";
  const [customerId, setCustomerId] = useState(initial?.customerId || "");
  const [vehicleId, setVehicleId]   = useState(initial?.vehicleId   || "");
  const [type, setType]             = useState(initial?.type || defaultType);
  const [title, setTitle]           = useState(initial?.title || "");
  const [note, setNote]             = useState(initial?.note || "");
  const [startStr, setStartStr]     = useState(toLocalInputValue(initial?.startAt ? new Date(initial.startAt) : new Date()));
  const [endStr, setEndStr]         = useState(toLocalInputValue(initial?.endAt ? new Date(initial.endAt) : new Date()));

  // สถานะปุ่มบันทึก (ป้องกันการกดย้ำ)
  const [saving, setSaving] = useState(false);

  // เปิด/ปิด select modals
  const [showCusPicker, setShowCusPicker] = useState(false);
  const [showCarPicker, setShowCarPicker] = useState(false);

  // ปรับเวลาจบอัตโนมัติเมื่อเลือกประเภทที่กำหนด minutes ไว้
  useEffect(() => {
    const conf = types.find(t => t.value === type);
    if (!conf || conf.minutes == null) return; // custom
    const start = fromInputToDate(startStr);
    const end = addMinutes(start, conf.minutes);
    setEndStr(toLocalInputValue(end));
  }, [type, startStr, types]);

  // รีเซ็ตฟอร์มเมื่อเปิด
  useEffect(() => {
    if (open) {
      const def = types[0]?.value || "ตรวจเช็ค/บำรุงรักษา";
      setCustomerId(initial?.customerId || "");
      setVehicleId(initial?.vehicleId   || "");
      setType(initial?.type || def);
      setTitle(initial?.title || "");
      setNote(initial?.note || "");
      setStartStr(toLocalInputValue(initial?.startAt ? new Date(initial.startAt) : new Date()));
      setEndStr(toLocalInputValue(initial?.endAt ? new Date(initial.endAt) : new Date()));
      setShowCusPicker(false);
      setShowCarPicker(false);
    }
  }, [open, initial, types]);

  if (!open) return null;

  // หาวัตถุที่เลือกไว้จาก id (โชว์การ์ด)
  const selectedCustomer = customers.find(c => c._id === customerId);
  const selectedCar = cars.find(v => v._id === vehicleId);

  // ฟังก์ชันภายใน: handleSubmit()
  // หน้าที่: ตรวจสอบข้อมูลฟอร์มและเรียก onSave(payload)
  // หมายเหตุ: มี guard ป้องกัน "ลูกค้า/รถ ว่าง", "หัวข้อว่าง" และ "เวลาจบ < เวลาเริ่ม"
  const handleSubmit = async () => {
    const startAt = fromInputToDate(startStr);
    const endAt   = fromInputToDate(endStr);
    if (!customerId && !vehicleId) { alert("กรุณาเลือกอย่างน้อย ลูกค้า หรือ รถ"); return; }
    if (!title.trim()) { alert("กรุณากรอกหัวข้อ/ชื่อการนัดหมาย"); return; }
    if (endAt < startAt) { alert("เวลาเสร็จต้องมากกว่าเวลาเริ่ม"); return; }

    try {
      setSaving(true);
      await onSave({
        ...initial,
        customerId, vehicleId, title: title.trim(), type, note,
        startAt: startAt.getTime(), endAt: endAt.getTime(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="appt-overlay" onClick={onClose}>
      <div className="appt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appt-header">
          <h3>{initial?._id ? "แก้ไขนัดหมาย" : "เพิ่มตารางงาน / นัดหมาย"}</h3>
          <button className="icon-btn" onClick={onClose}><X /></button>
        </div>

        <div className="appt-body">
          <h4 className="sect-title">ลูกค้าและรถ</h4>
          <div className="picker-grid">
            <div className="picker-col">
              {!selectedCustomer ? (
                <button className="pick-btn" onClick={()=>setShowCusPicker(true)}>เลือกลูกค้า</button>
              ) : (
                <div className="card">
                  <div className="avatar">{(selectedCustomer.name||"?").slice(0,1).toUpperCase()}</div>
                  <div className="card-info">
                    <div className="card-title">
                      {selectedCustomer.name || selectedCustomer.customerName || selectedCustomer.id || "ไม่มี"}
                    </div>
                    <div className="card-sub">{selectedCustomer.email || ""}</div>
                    <div className="card-sub">{selectedCustomer.phone || ""}</div>
                    <div className="card-actions">
                      <button className="chip-appo" onClick={()=>setCustomerId("")}>Unlink Client</button>
                      <button className="chip-appo" onClick={()=>setShowCusPicker(true)}>เปลี่ยน</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="picker-col">
              {!selectedCar ? (
                <button className="pick-btn" onClick={()=>setShowCarPicker(true)}>เลือกรถยนต์</button>
              ) : (
                <div className="card">
                    {selectedCar.imageDataUrl
                      ? <img className="thumb thumb-img" src={selectedCar.imageDataUrl} alt="car" />
                      : <div className="thumb" />
                    }
                  <div className="card-info">
                    <div className="card-title">{selectedCar.title || selectedCar.brand || "รถยนต์"}</div>
                    <div className="card-sub">
                      {(selectedCar.lPlate || selectedCar.plate || "-")}
                    </div>
                    <div className="card-sub">
                      {selectedCar.model ? `  ${selectedCar.model}` : ""}
                      {selectedCar.year ? ` | ${selectedCar.year}` : ""}
                    </div>
                    <div className="card-actions">
                      <button className="chip-appo" onClick={()=>setVehicleId("")}>Unlink Vehicle</button>
                      <button className="chip-appo" onClick={()=>setShowCarPicker(true)}>เปลี่ยน</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <h4 className="sect-title">กำหนดการ</h4>
          <div className="form-grid">
            <div className="form-group-appo">
              <label>จาก:</label>
              <input type="datetime-local" value={startStr} onChange={(e)=>setStartStr(e.target.value)} />
            </div>
            <div className="form-group-appo">
              <label>ถึง:</label>
              <input type="datetime-local" value={endStr} onChange={(e)=>setEndStr(e.target.value)}
                     disabled={(types.find(t=>t.value===type)?.minutes ?? null) !== null}
                     title={(types.find(t=>t.value===type)?.minutes ?? null) !== null ? "เวลาจบถูกคำนวณอัตโนมัติ" : ""}/>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group-appo">
              <label>ประเภทการนัดหมาย</label>
              <div className="type-inline">
                <select value={type} onChange={(e)=>setType(e.target.value)}>
                  {types.map(o => <option key={o._id || o.value} value={o.value}>{o.label || o.value}</option>)}
                </select>
                <button type="button" className="btn-ghost" onClick={onOpenManageTypes}><Settings2 size={16}/> แก้ไขประเภท</button>
              </div>
            </div>
            <div className="form-group-appo">
              <label>หัวข้อ/ชื่อการนัด</label>
              <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="เช่น ตรวจเช็คเครื่อง, เปลี่ยนผ้าเบรก"/>
            </div>
          </div>

          <div className="form-group-appo">
            <label>รายละเอียดการนัดหมาย</label>
            <textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="รายละเอียดการนัดหมาย" />
          </div>
        </div>

        <div className="appt-actions">
          {initial?._id && <span className="hint">แก้ไขนัดหมายเดิม</span>}
          <button className="btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {initial?._id 
              ? (saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข")
              : (saving ? "กำลังเพิ่มข้อมูล..." : "เพิ่มข้อมูล")}
          </button>
        </div>

        {/* Select Modals */}
        <SelectCustomerModal
          open={showCusPicker}
          customers={customers}
          onClose={()=>setShowCusPicker(false)}
          onPick={(c)=>{ setCustomerId(c._id); setShowCusPicker(false); }}
        />
        <SelectVehicleModal
          open={showCarPicker}
          cars={cars}
          onClose={()=>setShowCarPicker(false)}
          onPick={(v)=>{ setVehicleId(v._id); setShowCarPicker(false); }}
        />
      </div>
    </div>
  );
}

/* ---------------------- Detail Modal ---------------------- */
// คอมโพเนนต์: DetailModal
// หน้าที่: แสดงรายละเอียดนัดหมาย + ปุ่มแก้ไข/ลบ
// พร็อพ: open(bool), appt(object), typeMap(record), onClose(), onEdit(), onDelete()
function DetailModal({ open, appt, typeMap, onClose, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  if (!open || !appt) return null;
  const start = new Date(appt.startAt);
  const end = new Date(appt.endAt);
  const conf = typeMap[appt.type];
  const style = styleForType(conf);

  // ฟังก์ชันภายใน: handleDelete()
  // หน้าที่: confirm และเรียก onDelete() เพื่อไปลบที่ชั้นนอก (ป้องกันกดย้ำด้วยสถานะ deleting)
  const handleDelete = async () => {
    if (!window.confirm("ลบนัดหมายนี้หรือไม่?")) return;
    try {
      setDeleting(true);
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div className="appt-overlay" onClick={onClose}>
      <div className="appt-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="appt-header">
          <h3>รายละเอียดนัดหมาย</h3>
          <button className="icon-btn" onClick={onClose}><X/></button>
        </div>
        <div className="appt-body">
          <div className="detail-line"><b>หัวข้อ:</b> {appt.title}</div>
          <div className="detail-line"><b>ประเภท:</b> <span className="type-chip" style={style}>{conf?.label || appt.type}</span></div>
          <div className="detail-line"><b>เริ่ม:</b> {start.toLocaleString()}</div>
          <div className="detail-line"><b>จบ:</b> {end.toLocaleString()}</div>
          <div className="detail-line"><b>ลูกค้า:</b> {appt.customerName || "-"}</div>
          <div className="detail-line"><b>รถ:</b> {appt.vehicleTitle || "-"}</div>
          <div className="detail-line"><b>รายละเอียด:</b> {appt.note || "-"}</div>
        </div>
        <div className="appt-actions">
          <button className="btn-outline" onClick={onEdit}><Pencil size={16}/> แก้ไข</button>
          <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "กำลังลบ..." : <><Trash2 size={16}/> ลบ</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Calendar Container ---------------------- */
// คอมโพเนนต์หลัก: AppointmentCalendar
// หน้าที่: ควบคุม state/subscribe ข้อมูล, สลับมุมมอง month/week/day, เปิดโมดอลต่าง ๆ
const AppointmentCalendar = () => {
  const nav = useNavigate();
  const [viewType, setViewType] = useState("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [customers, setCustomers] = useState([]);
  const [cars, setCars] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [apptTypes, setApptTypes] = useState([]);          // dynamic types
  const [showManageTypes, setShowManageTypes] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);

  const [showDetail, setShowDetail] = useState(false);
  const [detailAppt, setDetailAppt] = useState(null);

  // subscribe customers/cars
  useEffect(() => {
    const u1 = subscribeCustomers(setCustomers);
    const u2 = subscribeCars(setCars);
    return () => { u1 && u1(); u2 && u2(); };
  }, []);

  // subscribe appointments (เรียงตาม startAt asc และ map timestamp -> ms)
  useEffect(() => {
    const qy = query(apptCol, orderBy("startAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => {
      const arr = [];
      snap.forEach((d) => {
        const x = d.data();
        arr.push({
          _id: d.id, ...x,
          startAt: x.startAt?.toDate ? x.startAt.toDate().getTime() : (typeof x.startAt === "number" ? x.startAt : 0),
          endAt: x.endAt?.toDate ? x.endAt.toDate().getTime() : (typeof x.endAt === "number" ? x.endAt : 0),
        });
      });
      setAppointments(arr);
    });
    return () => unsub && unsub();
  }, []);

  // subscribe appointment types (dynamic)
  useEffect(() => {
    const qy = query(apptTypeCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ _id: d.id, ...d.data() }));
      // ถ้าไม่มีใน DB ให้ seed ค่าไทยเริ่มต้น
      if (arr.length === 0) {
        setApptTypes([
          { value: "ตรวจเช็ค/บำรุงรักษา", label: "ตรวจเช็ค/บำรุงรักษา", minutes: 60, color: "#1976d2" },
          { value: "ซ่อม",                label: "ซ่อม",               minutes: 180, color: "#d32f2f" },
          { value: "บริการทั่วไป",        label: "บริการทั่วไป",       minutes: 90,  color: "#388e3c" },
          { value: "กำหนดเอง",            label: "กำหนดเอง",           minutes: null, color: "#6a1b9a" },
        ]);
      } else {
        setApptTypes(arr.map(t => ({
          ...t,
          label: t.label || t.value,
          color: t.color || "#4285f4",
          minutes: (t.minutes === "" ? null : t.minutes)
        })));
      }
    });
    return () => unsub && unsub();
  }, []);

  // ฟังก์ชันภายใน: saveAppointment(payload)
  // หน้าที่: บันทึก/อัปเดตนัดหมายลง Firestore (ใช้ Timestamp.fromDate)
// หมายเหตุ: ปิด editor หลังสำเร็จ
  const saveAppointment = async (payload) => {
    if (payload._id) {
      await updateDoc(doc(db, "appointments", payload._id), {
        customerId: payload.customerId || "",
        vehicleId: payload.vehicleId || "",
        title: payload.title || "",
        type: payload.type || (apptTypes[0]?.value || "ตรวจเช็ค/บำรุงรักษา"),
        note: payload.note || "",
        startAt: Timestamp.fromDate(new Date(payload.startAt)),
        endAt: Timestamp.fromDate(new Date(payload.endAt)),
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(apptCol, {
        customerId: payload.customerId || "",
        vehicleId: payload.vehicleId || "",
        title: payload.title || "",
        type: payload.type || (apptTypes[0]?.value || "ตรวจเช็ค/บำรุงรักษา"),
        note: payload.note || "",
        startAt: Timestamp.fromDate(new Date(payload.startAt)),
        endAt: Timestamp.fromDate(new Date(payload.endAt)),
        createdAt: serverTimestamp(),
      });
    }
    setShowEditor(false); setEditing(null);
  };

  // ฟังก์ชันภายใน: deleteAppointment(id)
  // หน้าที่: ลบนัดหมายออกจาก Firestore + ปิดหน้ารายละเอียด
  const deleteAppointment = async (id) => {
   await deleteDoc(doc(db, "appointments", id));
   setShowDetail(false);
   setDetailAppt(null);
 };

  // ฟังก์ชันภายใน: navigateDate(direction)
  // หน้าที่: ขยับ currentDate ตามประเภทมุมมอง (วัน/สัปดาห์/เดือน)
  // พารามิเตอร์: direction (1 หรือ -1)
  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    if (viewType === "day") newDate.setDate(newDate.getDate() + direction);
    else if (viewType === "week") newDate.setDate(newDate.getDate() + direction * 7);
    else newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  // ฟังก์ชันภายใน: getDaysInMonth(date)
  // หน้าที่: สร้างอาร์เรย์ 42 วัน (6 สัปดาห์) สำหรับปฏิทินเดือน เริ่มจันทร์
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    const weekday = firstDay.getDay();
    const offset = (weekday === 0 ? -6 : 1) - weekday; // start Monday
    startDate.setDate(firstDay.getDate() + offset);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  };

  // ฟังก์ชันภายใน: getWeekDays(date)
  // หน้าที่: สร้าง 7 วันของสัปดาห์ที่มี date อยู่ (เริ่มจันทร์)
  const getWeekDays = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d); start.setDate(diff);
    return Array.from({length:7}, (_,i)=>{ const x=new Date(start); x.setDate(start.getDate()+i); return x; });
  };

  // ฟังก์ชันภายใน: formatMonthYear(date)
  // หน้าที่: แปลงเป็น "ชื่อเดือน(ไทยย่อ) ปีพ.ศ.(2หลัก)"
  const formatMonthYear = (date) => `${monthNames[date.getMonth()]} ${String(date.getFullYear() + 543).slice(-2)}`;

  // แผนที่ประเภท -> คอนฟิก (ใช้เรนเดอร์สี/ชื่อ)
  const typeMap = useMemo(() => Object.fromEntries(apptTypes.map(t => [t.value, t])), [apptTypes]);

  // สร้างออบเจ็กต์นัดหมายพร้อมข้อมูลชื่อ/รถ และ Date ที่แปลงแล้ว
  const appts = useMemo(() => appointments.map(a => {
    const c = customers.find(x => x._id === a.customerId);
    const v = cars.find(x => x._id === a.vehicleId);
    return {
      ...a,
      customerName: c?.name || "",
      vehicleTitle: v?.title || v?.brand || "",
      startDate: new Date(a.startAt),
      endDate: new Date(a.endAt),
      _typeConf: typeMap[a.type]
    };
  }), [appointments, customers, cars, typeMap]);

  // ช่วงเวลาที่โชว์ในสัปดาห์/วัน (08:00-20:00)
  const timeSlots = Array.from({length: 13}, (_,i)=> 8+i); // 8..20

  // ฟังก์ชันภายใน: renderMonthView()
// หน้าที่: เรนเดอร์ตารางเดือน + แท่งนัดหมายในแต่ละวัน (คลิกเปิดรายละเอียด)
  const renderMonthView = () => {
    const days = getDaysInMonth(currentDate);
    const weeks = []; for (let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
    return (
      <div className="calendar-grid">
        <div className="calendar-header">{daysOfWeek.map(d=><div key={d} className="day-header">{d}</div>)}</div>
        <div className="calendar-body">
          {weeks.map((week, wi)=>(
            <div key={wi} className="calendar-week">
              {week.map((day, di) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = sameDate(day, new Date());
                const [dStart, dEnd] = dayRangeOf(day);
                const dayAppointments = appts.filter(a => overlaps(a.startAt, a.endAt, dStart, dEnd));
                return (
                  <div key={di} className={`calendar-day ${!isCurrentMonth ? "other-month" : ""} ${isToday ? "today" : ""}`}>
                    <div className="day-number">{pad2(day.getDate())}</div>
                    <div className="day-appointments">
                      {dayAppointments.map(apt=>{
                        const st = styleForType(apt._typeConf);
                        return (
                          <div
                            key={apt._id}
                            className="appointment-item"
                            style={st}
                            title={`${apt.title}\n${apt.customerName||""}`}
                            onClick={()=>{ setDetailAppt(apt); setShowDetail(true); }}
                          >
                            <div className="appointment-time">{pad2(apt.startDate.getHours())}:{pad2(apt.startDate.getMinutes())}</div>
                            <div className="appointment-title">{apt.title}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ฟังก์ชันภายใน: renderWeekView()
// หน้าที่: เรนเดอร์ตารางสัปดาห์ แบ่งคอลัมน์วัน/แถวเวลา
  const renderWeekView = () => {
    const weekDays = getWeekDays(currentDate);
    return (
      <div className="week-view">
        <div className="week-header">
          <div className="time-column"></div>
          {weekDays.map((day, i) => {
            const isToday = sameDate(day, new Date());
            return (
              <div key={i} className={`week-day-header ${isToday ? "today" : ""}`}>
                <div className="day-name">{daysOfWeek[i]}</div>
                <div className="day-date">{pad2(day.getDate())} {monthNames[day.getMonth()]}</div>
              </div>
            );
          })}
        </div>
        <div className="week-body">
          {timeSlots.map((h)=>(
            <div key={h} className="time-row">
              <div className="time-label">{pad2(h)}:00</div>
              {weekDays.map((day, di) => {
                const isToday = sameDate(day, new Date());
                const [slotStart, slotEnd] = hourRangeOf(day, h);
                const blocks = appts.filter(a => overlaps(a.startAt, a.endAt, slotStart, slotEnd));
                return (
                  <div key={di} className={`time-cell ${isToday ? "today" : ""}`}>
                    {blocks.map(apt=>{
                      const st = styleForType(apt._typeConf);
                      return (
                        <div
                          key={apt._id}
                          className="appointment-block"
                          style={st}
                          onClick={()=>{ setDetailAppt(apt); setShowDetail(true); }}
                        >
                          <div className="appointment-title">{apt.title}</div>
                          <div className="appointment-customer">{apt.customerName}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ฟังก์ชันภายใน: renderDayView()
// หน้าที่: เรนเดอร์มุมมองรายวัน + ระยะเวลานัด (นาที)
  const renderDayView = () => {
    const dayA = appts.filter(a => sameDate(a.startDate, currentDate));
    return (
      <div className="day-view">
        <div className="day-header">
          <h3>{pad2(currentDate.getDate())} {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()+543}</h3>
        </div>
        <div className="day-schedule">
          {timeSlots.map((h)=> {
            const [slotStart, slotEnd] = hourRangeOf(currentDate, h);
            const blocks = dayA.filter(a => overlaps(a.startAt, a.endAt, slotStart, slotEnd));
            return (
              <div key={h} className="schedule-row">
                <div className="schedule-time">{pad2(h)}:00</div>
                <div className="schedule-content">
                  {blocks.map(apt=>{
                    const st = styleForType(apt._typeConf);
                    return (
                      <div
                        key={apt._id}
                        className="schedule-appointment"
                        style={{ ...st, borderLeft: `4px solid ${apt._typeConf?.color || "#4285f4"}` }}
                        onClick={()=>{ setDetailAppt(apt); setShowDetail(true); }}
                      >
                        <div className="appointment-title">{apt.title}</div>
                        <div className="appointment-customer">{apt.customerName}</div>
                        <div className="appointment-duration">
                          {Math.round((apt.endDate - apt.startDate)/60000)} นาที
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="appointment-calendar">
      <div className="calendar-header-bar">
        <div className="header-left">
          <button className="back-button" onClick={()=>nav("/admin/home")}><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="page-title">ตารางงาน / นัดหมาย</h1>
        </div>
        <div className="header-center">
          <button className="nav-button" onClick={() => navigateDate(-1)}><ChevronLeft className="w-5 h-5" /></button>
          <span className="current-date">{formatMonthYear(currentDate)}</span>
          <button className="nav-button" onClick={() => navigateDate(1)}><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="header-right">
          <div className="view-switcher">
            <button className={`view-button ${viewType === "day" ? "active" : ""}`} onClick={() => setViewType("day")}>วัน</button>
            <button className={`view-button ${viewType === "week" ? "active" : ""}`} onClick={() => setViewType("week")}>สัปดาห์</button>
            <button className={`view-button ${viewType === "month" ? "active" : ""}`} onClick={() => setViewType("month")}>เดือน</button>
          </div>
          <button className="btn-ghost header" onClick={()=>setShowManageTypes(true)}><Settings2 size={16}/> แก้ไขประเภท</button>
        </div>
      </div>

      <div className="calendar-content">
        {viewType === "month" && renderMonthView()}
        {viewType === "week"  && renderWeekView()}
        {viewType === "day"   && renderDayView()}
      </div>

      <button className="add-appointment-btn" onClick={() => { setEditing(null); setShowEditor(true); }}>
        <Plus className="w-5 h-5" /> เพิ่มกิจกรรม
      </button>

      <AppointmentModal
        open={showEditor}
        initial={editing}
        customers={customers}
        cars={cars}
        types={apptTypes}
        onClose={() => setShowEditor(false)}
        onOpenManageTypes={()=>setShowManageTypes(true)}
        onSave={saveAppointment}
      />

      <DetailModal
        open={showDetail}
        appt={detailAppt}
        typeMap={typeMap}
        onClose={() => { setShowDetail(false); setDetailAppt(null); }}
        onEdit={() => { setEditing(detailAppt); setShowDetail(false); setShowEditor(true); }}
        onDelete={() => deleteAppointment(detailAppt._id)}
      />

      <ManageTypesModal
        open={showManageTypes}
        types={apptTypes}
        onClose={()=>setShowManageTypes(false)}
      />
    </div>
  );
};

export default AppointmentCalendar;
