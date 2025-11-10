// src/pages/RepairEditPage.js

// [หัวข้อไฟล์]
// หน้าแก้งานซ่อม: โหลดงานซ่อมตาม id แล้วให้แก้ไขข้อมูลลูกค้า รถ อะไหล่ พนักงาน
// + มี modal สำหรับเลือก/ค้นหา และมีระบบแนบรูป+เช็กลิสต์การตรวจสอบ
// หมายเหตุ: คอมเมนต์นี้ “อธิบาย” อย่างเดียว ไม่เปลี่ยนพฤติกรรมโค้ด

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronUp, Mail, Phone, User, MapPin,
  Car as CarIcon, GaugeCircle, Wrench, Plus, Trash2, Search, Image as ImageIcon,
  Paintbrush, Eraser
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import "../../styles/RepairCreatePage.css";
import { auth } from "../../firebase/firebase";

// [services]
// กลุ่มบริการที่ดึง/อัปเดตข้อมูลงานซ่อม ลูกค้า รถ อะไหล่ และพนักงาน
import { subscribeCustomers } from "../../services/customerService";
import { subscribeCars } from "../../services/carService";
import {
  subscribeRepair, updateRepair, finalizeRepair,
  addInspection, addProblemReport,
  subscribePartsUsed, subscribeProblems, subscribeInspections,
  addPartToRepair, removePartFromRepair
} from "../../services/repairService";
import {
  subscribePartCategories, subscribePartsByCategory, subscribePartsSummaryByCategory
} from "../../services/partService";
import { subscribeEmployees } from "../../services/employeeService";

/* ===== helpers ===== */
// defaultChecklist: โครงรายการตรวจสอบพื้นฐาน (ตอนแก้ไข เราจะอ่านจากงานจริง ถ้าไม่มีค่อยมี default นี้)
const defaultChecklist = [
  "ทดลองขับ",
  "สมรรถนะเครื่องยนต์",
  "ระบบเบรก",
  "พวงมาลัย / ศูนย์ล้อ",
  "ช่วงล่าง / โช้คอัพ",
  "ระบบส่งกำลัง / เกียร์",
  "ระบบไฟฟ้า / แบตเตอรี่"
].map(name => ({ name, state: "", details: "" }));

// toBase64 (เหมือนไฟล์ก่อนหน้า → ไม่นับซ้ำ):
// แปลงรูปไฟล์เป็น DataURL และย่อขนาดเพื่อประหยัดพื้นที่/เร็วขึ้นเวลาแสดงผล
const toBase64 = (file, maxW = 1200) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxW / img.width, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject; img.src = reader.result;
  };
  reader.onerror = reject; reader.readAsDataURL(file);
});

// viewOfCar (เหมือนไฟล์ก่อนหน้า → ไม่นับซ้ำ):
// normalize ฟิลด์รถจากฐานข้อมูล ให้ UI ใช้สะดวก (title/plate/mileage/รูป)
function viewOfCar(c) {
  const title = [c.brand, c.model].filter(Boolean).join(" ").trim();
  return {
    id: c._id,
    raw: c,
    image: c.imageDataUrl || c.image || "",
    title: title || c.title || "-",
    plate: c.lPlate || "",
    mileage: c.odometer || "",
    type: c.carType || c.type || "",
    transmission: c.transmission || c.gear || "",
    color: c.color || "",
  };
}
const fmtBaht = (n) => (Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 0 });

export default function RepairEditPage() {
  const nav = useNavigate();
  const { id: repairId } = useParams(); // รับ id งานซ่อมจาก URL

  // [state หลักของหน้า]
  const [repair, setRepair] = useState(null);       // doc งานซ่อมจริง
  const [customers, setCustomers] = useState([]);   // รายชื่อลูกค้าทั้งหมด (ไว้เลือก)
  const [cars, setCars] = useState([]);             // รายการรถทั้งหมด (ไว้เลือก)

  // [modal เลือกลูกค้า/รถ]
  const [pickCustomerOpen, setPickCustomerOpen] = useState(false);
  const [pickVehicleOpen, setPickVehicleOpen] = useState(false);

  // [ตัวเลือกที่แปะอยู่บนงาน (denorm)]
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [showCus, setShowCus] = useState(true);
  const [showCar, setShowCar] = useState(true);

  // [พนักงานที่รับผิดชอบ] (ใหม่ในชุดแก้ไขนี้)
  const [employees, setEmployees] = useState([]);
  const [pickEmpOpen, setPickEmpOpen] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]); // เก็บเฉพาะ _id
  const [empQ, setEmpQ] = useState("");

  // [อะไหล่ + หมวด + modal เลือก]
  const [cats, setCats] = useState([]);
  const [statsByCat, setStatsByCat] = useState({});
  const [pickPartOpen, setPickPartOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(null);
  const [partsLoading, setPartsLoading] = useState(false);
  const [parts, setParts] = useState([]);           // ลิสต์อะไหล่ของหมวดที่เลือก
  const [partsUsed, setPartsUsed] = useState([]);   // อะไหล่ที่ถูกใช้ในงานนี้ (มาจาก subscribe)
  const [qPart, setQPart] = useState("");

  // จำนวนที่เลือกต่ออะไหล่ (drop-down ขวา)
  const [qtyByPart, setQtyByPart] = useState({});

  // [ปัญหา & การตรวจสอบ]
  const [problemOpen, setProblemOpen] = useState(false);
  const [probSymptom, setProbSymptom] = useState("");
  const [probCause, setProbCause] = useState("");
  const [probSolution, setProbSolution] = useState("");

  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectionDate, setInspectionDate] = useState("");
  const [images, setImages] = useState([]); // [{image, annotated, desc}]
  const [checklist, setChecklist] = useState(defaultChecklist);
  const [newChecklistName, setNewChecklistName] = useState("");

  // [annotate] (เหมือนไฟล์ก่อนหน้า → ไม่นับซ้ำ)
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotIdx, setAnnotIdx] = useState(-1);
  const [brushColor, setBrushColor] = useState("#ff0000");
  const [brushSize, setBrushSize] = useState(6);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  // [note ของงาน] (ฟิลด์ข้อความธรรมดา)
  const [note, setNote] = useState("");

  /* ===== subscribe base ===== */
  useEffect(() => {
    // ดึงงานซ่อมตาม id และ prefill denorm (ลูกค้า/รถ/โน้ต/พนักงาน)
    const u0 = subscribeRepair(repairId, (r) => {
      setRepair(r);
      if (r) {
        setNote(r.note || "");
        setCustomer({
          _id: r.customerRef || "",
          name: r.customerName || "",
          phone: r.customerPhone || "",
          email: r.customerEmail || "",
          lineId: r.customerLineId || "",
          address: r.customerAddress || "",
        });
        setVehicle({
          id: r.vehicleRef || "",
          image: r.vehicleImage || "",
          title: r.vehicleTitle || "",
          plate: r.vehiclePlate || "",
          type: r.vehicleType || "",
          mileage: r.vehicleMileage || "",
        });
        setSelectedEmpIds(Array.isArray(r?.employees) ? r.employees : []);
      }
    });

    // โหลด master data + ข้อมูลย่อยในงาน (อะไหล่ที่ใช้, ปัญหาล่าสุด, ตรวจสอบล่าสุด)
    const u1 = subscribeCustomers(setCustomers);
    const u2 = subscribeCars(setCars);
    const u3 = subscribePartsUsed(repairId, setPartsUsed);
    const u4 = subscribeProblems(repairId, (list) => {
      const last = list[0];
      if (last) {
        setProbSymptom(last.symptom || "");
        setProbCause(last.cause || "");
        setProbSolution(last.solution || "");
      }
    });
    const u5 = subscribeInspections(repairId, (list) => {
      const last = list[0];
      if (!last) return;
      setInspectionDate(last.date || "");
      const imgs = Array.isArray(last.images) ? last.images : [];
      setImages(imgs.map(im => ({ image: im.image || im, annotated: im.annotated || im, desc: im.desc || "" })));
      const chk = last.checklist || {};
      const keys = Object.keys(chk);
      if (keys.length) {
        setChecklist(keys.map(k => ({ name: k, state: chk[k]?.state || "", details: chk[k]?.details || "" })));
      }
    });

    // หมวดอะไหล่ + สรุปสต็อกตามหมวด + รายชื่อพนักงาน
    const u6 = subscribePartCategories(setCats);
    const u7 = subscribePartsSummaryByCategory((s) => setStatsByCat(s || {}));
    const u8 = subscribeEmployees(setEmployees);

    return () => { u0&&u0(); u1&&u1(); u2&&u2(); u3&&u3(); u4&&u4(); u5&&u5(); u6&&u6(); u7&&u7(); u8&&u8(); };
  }, [repairId]);

  // เติมข้อมูลลูกค้าจาก master ถ้า denorm บางช่องยังว่าง (ช่วยให้ข้อมูลขึ้นครบ)
  useEffect(() => {
    if (!repair) return;
    if (repair.customerRef && (!customer?.email || !customer?.lineId)) {
      const c = customers.find(x => x._id === repair.customerRef);
      if (c) {
        setCustomer(prev => ({
          ...(prev || {}),
          _id: c._id,
          name: prev?.name ?? c.name ?? "",
          phone: prev?.phone ?? c.phone ?? "",
          email: c.email ?? "",
          lineId: c.lineId ?? "",
          address: prev?.address ?? c.address ?? "",
        }));
      }
    }
  }, [customers, repair, customer?.email, customer?.lineId]); // ใส่ dep ให้ถูก กัน loop

  // เติมข้อมูลรถจาก master ถ้า denorm บางช่องยังว่าง
  useEffect(() => {
    if (!repair) return;
    if (repair.vehicleRef) {
      const car = cars.find(x => x._id === repair.vehicleRef);
      if (car) {
        const v = viewOfCar(car);
        setVehicle(prev => ({
          ...(prev || {}),
          id: v.id || repair.vehicleRef,
          image: v.image || prev?.image || "",
          title: v.title || prev?.title || "",
          plate: v.plate || prev?.plate || "",
          type:  v.type  || prev?.type  || "",
          mileage: v.mileage || prev?.mileage || "",
        }));
      }
    }
  }, [cars, repair]);

  // โหลดอะไหล่ของหมวดที่เลือก (เหมือนไฟล์ก่อนหน้า → ไม่นับซ้ำ)
  useEffect(() => {
    if (!pickPartOpen || !activeCat) return;
    setPartsLoading(true);
    setParts([]);
    const unsub = subscribePartsByCategory(activeCat, (list) => {
      setParts(list);
      setPartsLoading(false);
    });
    return () => unsub && unsub();
  }, [activeCat, pickPartOpen]);

  // ปิด modal อะไหล่เมื่อไหร่ เคลียร์ state ที่เกี่ยวข้อง (เหมือนไฟล์ก่อนหน้า → ไม่นับซ้ำ)
  useEffect(() => {
    if (!pickPartOpen) { setParts([]); setActiveCat(null); setQPart(""); setPartsLoading(false); }
  }, [pickPartOpen]);

  // cars ที่สัมพันธ์กับลูกค้าที่เลือก (นับเป็นฟังก์ชันหลักข้อ 4)
  const filteredCarsForCustomer = useMemo(() => {
    if (!customer?._id) return cars.map(viewOfCar);
    const cusDocId = customer._id;
    const cusCode = (customer.id || "").toString();
    return cars
      .filter(c => (c.ownerRefId && c.ownerRefId === cusDocId) || ((c.ownerCode || c.ownBy || "").toString() === cusCode))
      .map(viewOfCar);
  }, [cars, customer]);

  // ===== ส่วน annotate วาดลงรูป (เหมือนไฟล์ก่อนหน้า → ไม่นับซ้ำ) =====
  useEffect(() => {
    if (!annotateOpen || annotIdx < 0) return;
    const cvs = canvasRef.current, img = imgRef.current;
    if (!cvs || !img) return;
    const syncSize = () => { cvs.width = img.clientWidth; cvs.height = img.clientHeight; };
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => window.removeEventListener("resize", syncSize);
  }, [annotateOpen, annotIdx]);
  const startDraw = (e) => { setDrawing(true); draw(e); };
  const endDraw = () => setDrawing(false);
  const draw = (e) => {
    if (!drawing) return;
    const cvs = canvasRef.current;
    const ctx = cvs.getContext("2d");
    const rect = cvs.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    ctx.fillStyle = brushColor;
    ctx.beginPath(); ctx.arc(x, y, brushSize/2, 0, Math.PI*2); ctx.fill();
  };
  const commitAnnotation = () => {
    const cvs = canvasRef.current, base = images[annotIdx]?.image;
    if (!cvs || !base) return setAnnotateOpen(false);
    const img = new Image();
    img.onload = () => {
      const out = document.createElement("canvas");
      out.width = img.width; out.height = img.height;
      const o = out.getContext("2d");
      o.drawImage(img, 0,0,out.width,out.height);
      o.drawImage(cvs, 0,0,cvs.width,cvs.height, 0,0,out.width,out.height);
      const merged = out.toDataURL("image/jpeg", .9);
      setImages(prev => prev.map((it,i)=> i===annotIdx ? ({ ...it, annotated: merged }) : it));
      setAnnotateOpen(false);
    };
    img.src = base;
  };

  // ===== actions: add/remove parts =====
  // แค่ format แสดงผล (ปัจจุบันไม่ได้ใช้ renderโดยตรง) — คงไว้เฉย ๆ
  // eslint-disable-next-line no-unused-vars
  const fmtPartRow = (u) => {
    const name = u.name || "-";
    const brand = u.brand || "-";
    const grade = u.grade ? ` • เกรด ${u.grade}` : "";
    const price = fmtBaht(u.unitPrice);
    return `${name} • ${brand}${grade} — ${u.qty} ชิ้น x ${price} บาท`;
  };

  // addPart (นับเป็นฟังก์ชันหลักข้อ 2):
  // กด “เพิ่ม” ใน modal อะไหล่ → ลดคงเหลือแบบ optimistic แล้วเรียก service บันทึก
  const addPart = async (p) => {
    const qty = Number(qtyByPart[p._id] || 1);
    if (!qty || qty < 1) return;
    setParts(prev =>
      prev.map(x =>
        x._id === p._id
          ? { ...x, stockQty: Math.max(0, Number(x.stockQty || 0) - qty) }
          : x
      )
    );
    await addPartToRepair(repairId, { partId: p._id, qty }, auth.currentUser?.uid || null);
  }

  // removeUsage (นับเป็นฟังก์ชันหลักข้อ 3):
  // เอาอะไหล่ที่เคยใส่ออก → คืนคงเหลือแบบ optimistic และลบจาก repair
  const removeUsage = async (u) => {
    if (!window.confirm(`ลบอะไหล่: ${u.name || "-"} x ${u.qty}?`)) return;
    if (u.partId) {
      const back = Number(u.qty || 0);
      setParts(prev =>
        prev.map(x =>
          x._id === u.partId
            ? { ...x, stockQty: Number(x.stockQty || 0) + back }
            : x
        )
      );
    }
    await removePartFromRepair(repairId, u.partsUsedId, auth.currentUser?.uid || null);
  };

  // handleSave (นับเป็นฟังก์ชันหลักข้อ 1):
  // รวมข้อมูลทั้งหมดจาก state → updateRepair → แนบปัญหา/ตรวจสอบถ้ามี → finalizeRepair → กลับหน้ารายการ
  const handleSave = async () => {
    if (!repair?._id) return;

    await updateRepair(repairId, {
      customerRef: customer?._id || null,
      vehicleRef: vehicle?.id || null,

      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      customerEmail: customer?.email || "",
      customerLineId: customer?.lineId || "",
      customerAddress: customer?.address || "",

      vehicleTitle: vehicle?.title || "",
      vehiclePlate: vehicle?.plate || "",
      vehicleType: vehicle?.type || "",
      vehicleMileage: vehicle?.mileage || "",
      vehicleImage: vehicle?.image || "",
      vehicleTransmission: vehicle?.transmission || "",
      vehicleColor: vehicle?.color || "",

      // พนักงานที่รับผิดชอบ (array ของ employee _id)
      employees: selectedEmpIds,
      // โน้ตของงาน
      note,
    });

    if (probSymptom || probCause || probSolution) {
      await addProblemReport(repairId, { symptom: probSymptom, cause: probCause, solution: probSolution });
    }

    if (inspectionDate || images.length || checklist.some(c => c.state || c.details)) {
      const checkMap = {};
      checklist.forEach(c => { checkMap[c.name] = { state: c.state, details: c.details }; });
      await addInspection(repairId, { date: inspectionDate, images, checklist: checkMap });
    }

    await finalizeRepair(repairId);
    alert("บันทึกงานซ่อมเรียบร้อย");
    nav("/admin/repairs");
  };

  // ======= UI หลัก =======
  return (
    <div className="rcp-wrap">
      {/* หัวหน้าเพจ: ปุ่มย้อนกลับ + ชื่องาน (โค้ดงาน) */}
      <header className="profile-header">
        <button className="back-button" onClick={()=>nav("/admin/repairs")}><ArrowLeft size={24}/></button>
        <h1 className="page-title">แก้งานซ่อม {repair?.code ? `• ${repair.code}` : ""}</h1>
      </header>

      <div className="rcp-card">
        {/* ส่วนลูกค้า & รถ: แสดงการ์ด + ปุ่มเปิด modal เลือกใหม่ */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">ลูกค้าและรถ</h3>
          <div className="rcp-two">
            {/* customer */}
            <div className="rcp-col">
              {!customer?.name ? (
                <button className="rcp-btn rcp-btn-primary rcp-btn-lg" style={{width:"100%"}}
                  onClick={()=>setPickCustomerOpen(true)}>เลือกลูกค้า</button>
              ) : (
                <div className="rcp-card-info">
                  <div className="rcp-card-header">
                    <div className="rcp-avatar">{(customer.name||"C").slice(0,2).toUpperCase()}</div>
                    <div className="rcp-card-title"> {customer.name} </div>
                    <button className="rcp-collapse" onClick={()=>setShowCus(v=>!v)} aria-label="toggle">
                      {showCus ? <ChevronUp size={18}/> : <ChevronDown size={18}/> }
                    </button>
                  </div>
                  {showCus && (
                    <ul className="rcp-info-list">
                      <li><Mail size={16}/>{customer.email || "-"}</li>
                      <li><Phone size={16}/>{customer.phone || "-"}</li>
                      <li><User size={16}/>{customer.lineId || "-"}</li>
                      <li><MapPin size={16}/>{customer.address || "-"}</li>
                    </ul>
                  )}
                  <div className="rcp-actions-row">
                    <button className="rcp-badge green">View Client</button>
                    <button className="rcp-badge pink" onClick={()=>setCustomer({})}>Unlink Client</button>
                  </div>
                </div>
              )}
            </div>

            {/* vehicle */}
            <div className="rcp-col">
              {!vehicle?.title ? (
                <button className="rcp-btn rcp-btn-primary rcp-btn-lg" style={{width:"100%"}}
                  onClick={()=>setPickVehicleOpen(true)}>เลือกรถยนต์</button>
              ) : (
                <div className="rcp-card-info">
                  <div className="rcp-card-header">
                    {vehicle.image
                      ? <img className="rcp-thumb" src={vehicle.image} alt="vehicle"/>
                      : <div className="rcp-thumb placeholder"><ImageIcon/></div>}
                    <div className="rcp-card-title rcp-card-title-right">{vehicle.title || "-"}</div>
                    <button className="rcp-collapse" onClick={()=>setShowCar(v=>!v)} aria-label="toggle">
                      {showCar ? <ChevronUp size={18}/> : <ChevronDown size={18}/> }
                    </button>
                  </div>
                  {showCar && (
                    <ul className="rcp-info-list">
                      <li><CarIcon size={16}/>{vehicle.type || "-"}</li>
                      <li><Wrench size={16}/>{vehicle.plate || "-"}</li>
                      <li><GaugeCircle size={16}/>{vehicle.mileage || "-"} KM</li>
                    </ul>
                  )}
                  <div className="rcp-actions-row">
                    <button className="rcp-badge green">View Vehicle</button>
                    <button className="rcp-badge pink" onClick={()=>setVehicle({})}>Unlink Vehicle</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* โซน “ตรวจสอบและวินิจฉัย” → เปิดฟอร์มปัญหา/ตรวจสอบ (modal) */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">ตรวจสอบและวินิจฉัย</h3>
          <div className="rcp-two">
            <button className="rcp-btn rcp-btn-primary ghost rcp-btn-lg" onClick={()=>setProblemOpen(true)}>ปัญหาที่พบหรือรายงาน</button>
            <button className="rcp-btn rcp-btn-primary ghost rcp-btn-lg" onClick={()=>setInspectOpen(true)}>ตรวจสอบรถยนต์</button>
          </div>
        </section>

        {/* อะไหล่ + พนักงาน */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">อะไหล่</h3>
          <div className="rcp-panel">
            <div className="rcp-panel-title">
              <span>อะไหล่ที่ใช้</span>
              <button className="rcp-btn rcp-btn-primary" onClick={()=>{ setPickPartOpen(true); if (!activeCat && cats.length>0) setActiveCat(cats[0]._id); }}>เพิ่มอะไหล่</button>
            </div>
            <div className="rcp-panel-body">
              <div className="rcp-listbox">
                {partsUsed.length === 0 && <div className="rcp-empty">ยังไม่มีรายการ</div>}
                {partsUsed.map(u=>(
                  <div className="rcp-listrow" key={u.partsUsedId}>
                    <div className="rcp-listleft">
                      <div className="rcp-line-id">
                        {u.name || "-"} <span style={{color:"#64748b"}}>• {u.brand || "-"}</span>
                        {u.grade ? <span style={{color:"#64748b"}}> • เกรด {u.grade}</span> : null}
                      </div>
                      <div className="rcp-line-sub">จำนวน: {u.qty} ชิ้น</div>
                      <div className="rcp-line-sub">ราคา: {fmtBaht(u.unitPrice)} บาท</div>
                    </div>
                    <div className="rcp-listright">
                      <button className="rcp-chip danger" onClick={()=>removeUsage(u)}><Trash2 size={14}/> ลบรายการ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* พนักงานที่รับผิดชอบ */}
          <div className="rcp-panel" style={{ marginTop: 16 }}>
            <div className="rcp-panel-title">
              <span>พนักงานที่รับผิดชอบ</span>
              <button className="rcp-btn rcp-btn-primary" onClick={() => setPickEmpOpen(true)}>
                เลือกพนักงาน
              </button>
            </div>
            <div className="rcp-panel-body">
              {selectedEmpIds.length === 0 ? (
                <div className="rcp-empty">ยังไม่ได้เลือก</div>
              ) : (
                <div className="rcp-listbox">
                  {selectedEmpIds.map(id => {
                    const emp = employees.find(e => e._id === id);
                    const phone = emp?.phone || emp?.tel || emp?.mobile || emp?.phoneNumber || "-";
                    const jobType = (emp?.employmentType || emp?.jobType || emp?.type || "-").toString();
                    const role = emp?.role || "-";
                    return (
                      <div className="rcp-listrow" key={id}>
                        <div className="rcp-listleft">
                          <div className="rcp-line-id" style={{ marginBottom: 2 }}>{emp?.name || id}</div>
                          <div className="rcp-line-sub">เบอร์: {phone}</div>
                          <div className="rcp-line-sub">หน้าที่: {role}</div>
                          <div className="rcp-line-sub">ประเภทงาน: {jobType}</div>
                        </div>
                        <div className="rcp-listright">
                          <button
                            className="rcp-chip danger"
                            onClick={() => setSelectedEmpIds(prev => prev.filter(x => x !== id))}
                          >
                            <Trash2 size={14} /> นำออก
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* โน้ต + ปุ่มบันทึก */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">โน้ต</h3>
          <textarea
            className="rcp-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติมสำหรับงานนี้…"
          />
          <div className="rcp-submit-row">
            <button className="rcp-btn rcp-btn-primary rcp-submit" onClick={handleSave}>
              บันทึกการแก้ไข
            </button>
          </div>
        </section>
      </div>

      {/* ===== โมดอลเลือกลูกค้า ===== */}
      {pickCustomerOpen && (
        <div className="modal-overlay" onClick={()=>setPickCustomerOpen(false)}>
          <div className="modal-box wide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>เลือกลูกค้า</h3><button className="icon-btn" onClick={()=>setPickCustomerOpen(false)}>×</button></div>
            <div className="modal-body scrollable">
              <div className="search-container" style={{maxWidth:520}}>
                <div className="search-icon"><Search className="icon-md"/></div>
                <input className="search-input" placeholder="ค้นหา ชื่อ/เบอร์/ที่อยู่" onChange={(e)=>{
                  const t=e.target.value.toLowerCase();
                  setCustomers(prev=>prev.map(x=>({...x, __hide: !((x.name||"").toLowerCase().includes(t) || (x.phone||"").includes(t) || (x.address||"").toLowerCase().includes(t)) })));
                }}/>
              </div>
              <div className="list-container">
                {customers.filter(c=>!c.__hide).map(c=>(
                  <div key={c._id} className="customer-card clickable" onClick={()=>{ setCustomer(c); setPickCustomerOpen(false); }}>
                    <div className="card-content">
                      <div className="card-left">
                        <div className="user-info">
                          <h3 className="customer-name">{c.name}</h3>
                          <div className="customer-details">
                            <div className="detail-item"><strong>เบอร์:</strong> {c.phone||"-"}</div>
                            <div className="detail-item"><strong>อีเมล:</strong> {c.email||"-"}</div>
                            <div className="detail-item"><strong>ไลน์ไอดี:</strong> {c.lineId||"-"}</div>
                            <div className="detail-item"><strong>ที่อยู่:</strong> {c.address||"-"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {customers.length===0 && <div className="rcp-empty">ยังไม่มีลูกค้า</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== โมดอลเลือกรถ ===== */}
      {pickVehicleOpen && (
        <div className="modal-overlay" onClick={()=>setPickVehicleOpen(false)}>
          <div className="modal-box wide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>เลือกรถยนต์</h3><button className="icon-btn" onClick={()=>setPickVehicleOpen(false)}>×</button></div>
            <div className="modal-body scrollable">
              <div className="list-container">
                {filteredCarsForCustomer.map(v => (
                  <div key={v.id} className="customer-card clickable" onClick={()=>{ setVehicle(v); setPickVehicleOpen(false); }}>
                    <div className="card-content">
                      <div className="card-left">
                        {v.image ? <img src={v.image} className="thumb-lg" alt=""/> : <div className="thumb-lg placeholder"><ImageIcon/></div>}
                        <div className="user-info">
                          <h3 className="customer-name">{v.title || "-"}</h3>
                          <div className="customer-details">
                            <div className="detail-item"><strong>ประเภท:</strong> {v.type||"-"}</div>
                            <div className="detail-item"><strong>ทะเบียน:</strong> {v.plate||"-"}</div>
                            <div className="detail-item"><strong>เลขไมล์:</strong> {v.mileage||"-"} KM</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredCarsForCustomer.length===0 && <div className="rcp-empty">ไม่มีรถของลูกค้าคนนี้</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== โมดอลเลือกอะไหล่ (หมวด -> ชิ้นส่วน) ===== */}
      {pickPartOpen && (
        <div className="modal-overlay" onClick={()=>setPickPartOpen(false)}>
          <div className="modal-box wide" style={{maxWidth:1180}} onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>เลือกอะไหล่</h3><button className="icon-btn" onClick={()=>setPickPartOpen(false)}>×</button></div>
            <div className="modal-body" style={{display:"grid", gridTemplateColumns:"320px 1fr", gap:16, minHeight:520}}>
              {/* categories (มีแถบสรุปจำนวน/สต็อกต่อหมวด) */}
              <div className="part-cat-col">
                <div className="search-container">
                  <div className="search-icon"><Search className="icon-md"/></div>
                  <input className="search-input" placeholder="ค้นหาหมวด…" onChange={(e)=>{
                    const t=e.target.value.toLowerCase();
                    setCats(prev=>prev.map(c=>({...c, __hide: !(c.name||"").toLowerCase().includes(t)})));
                  }}/>
                </div>
                <div className="part-cat-grid">
                  {cats.filter(c=>!c.__hide).map(c=>{
                    const s = statsByCat[c._id] || {};
                    const itemsCount = s.itemCount ?? 0;
                    const stockTotal = s.stockSum ?? 0;
                    const active = activeCat === c._id;
                    return (
                      <button key={c._id}
                        className={`part-cat-card ${active ? "active" : ""}`}
                        onClick={()=>{ setActiveCat(c._id); setParts([]); setPartsLoading(true); }}>
                        <div className="part-cat-top">
                          {c.icon ? <img className="part-cat-icon" src={c.icon} alt={c.name}/> : <div className="part-cat-icon placeholder"><ImageIcon/></div>}
                          <div className="part-cat-name">{c.name}</div>
                        </div>
                        <div className="part-cat-bottom" style={{display:"flex", gap:8, marginTop:8, flexWrap:"wrap"}}>
                          <span className="stock-pill" style={{background:"#e8f3ff", color:"#0b5ed7", borderRadius:999, padding:"4px 8px", fontSize:12}}>
                            รวมสต็อก: {Number(stockTotal || 0).toLocaleString()}
                          </span>
                          <span className="stock-pill" style={{background:"#e5e7eb", color:"#111827", borderRadius:999, padding:"4px 8px", fontSize:12}}>
                            ทั้งหมด: {Number(itemsCount || 0)} รายการ
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* parts list ภายในหมวด */}
              <div className="part-list-col">
                <div className="search-container">
                  <div className="search-icon"><Search className="icon-md"/></div>
                  <input className="search-input" placeholder="ค้นหา ไอดี/ชื่อ/ยี่ห้อ…" value={qPart} onChange={(e)=>setQPart(e.target.value)}/>
                </div>

                {partsLoading && <div className="loading-hint" style={{margin:"8px 0"}}>กำลังโหลดอะไหล่…</div>}

                <div className="list-container">
                  {(!partsLoading && activeCat && parts.length === 0) && <div className="rcp-empty">ไม่มีอะไหล่ในหมวดนี้</div>}
                  {parts
                    .filter(p=>{
                      const t=qPart.toLowerCase();
                      return (p.code||"").toLowerCase().includes(t) || (p.name||"").toLowerCase().includes(t) || (p.brand||"").toLowerCase().includes(t);
                    })
                    .map(p=>(
                      <div key={p._id} className="customer-card">
                        <div className="card-content">
                          <div className="card-left">
                            {p.image ? <img src={p.image} className="thumb-lg" alt=""/> : <div className="thumb-lg placeholder"><ImageIcon/></div>}
                            <div className="user-info">
                              <h3 className="customer-name">{p.name} <small style={{fontWeight:400,color:"#64748b"}}>({p.code})</small></h3>
                              <div className="customer-details">
                                <div className="detail-item"><strong>ยี่ห้อ:</strong> {p.brand||"-"}</div>
                                <div className="detail-item"><strong>เกรด:</strong> {p.grade||"-"}</div>
                                <div className="detail-item"><strong>ราคาขาย:</strong> {fmtBaht(p.sellPrice)} บาท</div>
                                <div className="detail-item"><strong>คงเหลือ:</strong> {p.stockQty ?? 0}</div>
                              </div>
                            </div>
                          </div>
                          <div className="card-right">
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <select
                                value={qtyByPart[p._id] || 1}
                                onChange={(e) => setQtyByPart(prev => ({ ...prev, [p._id]: Number(e.target.value) }))}
                                style={{ height: 36, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 8px" }}
                              >
                                {Array.from({ length: 50 }, (_, i) => i + 1).map(n => (
                                  <option key={n} value={n}>{n}</option>
                                ))}
                              </select>
                              <button className="rcp-btn rcp-btn-primary" onClick={() => addPart(p)}>
                                <Plus size={16} /> เพิ่ม
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  {!activeCat && <div className="rcp-empty">เลือกหมวดก่อน</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ปัญหา (modal) — เก็บข้อความ 3 ส่วนสั้น ๆ ===== */}
      {problemOpen && (
        <div className="modal-overlay" onClick={()=>setProblemOpen(false)}>
          <div className="modal-box wide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>ปัญหาที่พบหรือรายงาน</h3><button className="icon-btn" onClick={()=>setProblemOpen(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label>1. ปัญหาอาการที่เจอหรือที่ลูกค้าแจ้งมา</label>
                  <textarea value={probSymptom} onChange={(e)=>setProbSymptom(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>2. สาเหตุที่ทำให้เป็น — ระบบส่วนไหน</label>
                  <input value={probCause} onChange={(e)=>setProbCause(e.target.value)} placeholder="เช่น เครื่องยนต์ / ระบบเบรก …"/>
                </div>
                <div className="form-group">
                  <label>3. ต้องแก้ไขยังไง</label>
                  <input value={probSolution} onChange={(e)=>setProbSolution(e.target.value)} placeholder="แนวคิดการแก้ไขเบื้องต้น"/>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={()=>setProblemOpen(false)}>บันทึก</button>
              <button className="btn-outline" onClick={()=>setProblemOpen(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ตรวจสอบรถ (modal) — อัปโหลดรูป + เช็กลิสต์ + วาด annotate ===== */}
      {inspectOpen && (
        <div className="modal-overlay" onClick={()=>setInspectOpen(false)}>
          <div className="modal-box xwide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>ตรวจสอบรถยนต์</h3><button className="icon-btn" onClick={()=>setInspectOpen(false)}>×</button></div>
            <div className="modal-body scrollable">
              <div className="form-grid" style={{maxWidth:480}}>
                <div className="form-group full">
                  <label>วันที่ตรวจสอบ</label>
                  <input type="date" value={inspectionDate} onChange={(e)=>setInspectionDate(e.target.value)} />
                </div>
              </div>

              {/* dropzone ใส่รูป (ลากวาง/เลือกไฟล์) */}
              <div className="dropzone" onDragOver={(e)=>{e.preventDefault();}} onDrop={async (e)=>{
                e.preventDefault();
                const files = [...(e.dataTransfer.files||[])];
                const arr = [];
                for (const f of files) { const b64 = await toBase64(f, 1600); arr.push({ image:b64, annotated:b64, desc:"" }); }
                setImages(prev => [...prev, ...arr]);
              }}>
                <div className="dz-inner">
                  <div>กดที่นี่เพื่อ Upload หรือ ลากวางในพื้นที่นี้</div>
                  <input type="file" accept="image/*" multiple onChange={async (e)=>{
                    const files=[...(e.target.files||[])]; const arr=[];
                    for (const f of files){ const b64=await toBase64(f,1600); arr.push({image:b64, annotated:b64, desc:""});}
                    setImages(prev=>[...prev, ...arr]);
                  }}/>
                </div>
              </div>

              {/* แสดงรูป + คำอธิบาย + ปุ่มวาด/ลบ */}
              <div className="img-grid">
                {images.map((im, idx)=>(
                  <div key={idx} className="img-card">
                    <img src={im.annotated || im.image} alt="" />
                    <input className="img-desc" placeholder="อธิบายรูป…" value={im.desc||""}
                      onChange={(e)=>setImages(prev=>prev.map((x,i)=>i===idx?({...x, desc:e.target.value}):x))}/>
                    <div className="img-actions">
                      <button className="rcp-chip" onClick={()=>{setAnnotIdx(idx); setAnnotateOpen(true);}}><Paintbrush size={14}/> วาดโน้ตลงบนรูป</button>
                      <button className="rcp-chip danger" onClick={()=>setImages(prev=>prev.filter((_,i)=>i!==idx))}><Trash2 size={14}/> ลบ</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* เช็กลิสต์ */}
              <div className="rcp-section-title" style={{ marginTop: 12 }}>เช็คลิสต์ตรวจสอบรถยนต์</div>
              <div className="form-grid" style={{ alignItems: "center", marginBottom: 8 }}>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>เพิ่มรายการเช็คลิสต์ใหม่</label>
                  <div style={{ display: "flex", gap: 8 ,}}>
                    <input
                      placeholder="เช่น ระบบหล่อเย็น, สภาพยาง, น้ำมันเครื่อง ฯลฯ"
                      value={newChecklistName}
                      onChange={(e) => setNewChecklistName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") {
                        const name=(newChecklistName||"").trim(); if (!name) return;
                        setChecklist(prev=>[...prev, {name, state:"", details:""}]); setNewChecklistName("");
                      }}}
                      style={{ flex: 1 }}
                    />
                    <button className="rcp-btn rcp-btn-primary" onClick={()=>{
                      const name=(newChecklistName||"").trim(); if (!name) return;
                      setChecklist(prev=>[...prev, {name, state:"", details:""}]); setNewChecklistName("");
                    }}>
                      <Plus size={16} /> เพิ่มรายการ
                    </button>
                  </div>
                </div>
              </div>

              {/* ตารางเช็กลิสต์ (เลือก ดี/ปกติ/แย่ + รายละเอียด) */}
              <div className="check-table">
                <div className="thead">
                  <div className="th name">ชื่อรายการ</div>
                  <div className="th">ดี</div>
                  <div className="th">ปกติ</div>
                  <div className="th">แย่</div>
                  <div className="th details">รายละเอียด</div>
                  <div className="th" style={{ width: 88 }}>ลบ</div>
                </div>
                <div className="tbody">
                  {checklist.map((c, idx)=>(
                    <div key={idx} className="tr">
                      <div className="td name">{c.name}</div>
                      <div className="td"><input type="radio" name={`s-${idx}`} checked={c.state==="good"} onChange={()=>setChecklist(prev=>prev.map((x,i)=>i===idx?({...x, state:"good"}):x))}/></div>
                      <div className="td"><input type="radio" name={`s-${idx}`} checked={c.state==="fair"} onChange={()=>setChecklist(prev=>prev.map((x,i)=>i===idx?({...x, state:"fair"}):x))}/></div>
                      <div className="td"><input type="radio" name={`s-${idx}`} checked={c.state==="poor"} onChange={()=>setChecklist(prev=>prev.map((x,i)=>i===idx?({...x, state:"poor"}):x))}/></div>
                      <div className="td details"><input value={c.details} onChange={(e)=>setChecklist(prev=>prev.map((x,i)=>i===idx?({...x, details:e.target.value}):x))}/></div>
                      <div className="td" style={{ display:"flex", justifyContent:"center" }}>
                        <button className="rcp-chip danger" onClick={()=>setChecklist(prev=>prev.filter((_,i)=>i!==idx))}><Trash2 size={14}/> ลบ</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={()=>setInspectOpen(false)}>บันทึก</button>
              <button className="btn-outline" onClick={()=>setInspectOpen(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Annotate editor (modal) — วาดบนรูปแล้ว merge กลับ (เหมือนไฟล์ก่อนหน้า) ===== */}
      {annotateOpen && annotIdx>=0 && (
        <div className="modal-overlay" onClick={()=>setAnnotateOpen(false)}>
          <div className="modal-box wide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>วาดลงบนรูป</h3>
              <button className="icon-btn" onClick={()=>setAnnotateOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="annot-toolbar">
                <label>สี: <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} /></label>
                <label style={{marginLeft:12}}>ขนาด: <input type="range" min="2" max="24" value={brushSize} onChange={(e)=>setBrushSize(Number(e.target.value))} /></label>
                <button className="rcp-chip" onClick={()=>{ const cvs = canvasRef.current; if (cvs) cvs.getContext("2d").clearRect(0,0,cvs.width,cvs.height); }}><Eraser size={14}/> ล้างเส้น</button>
              </div>
              <div className="annot-box">
                <img ref={imgRef} src={images[annotIdx]?.image} alt="" />
                <canvas
                  ref={canvasRef}
                  className="annot-canvas"
                  onMouseDown={startDraw} onMouseUp={endDraw} onMouseMove={draw}
                  onTouchStart={startDraw} onTouchEnd={endDraw} onTouchMove={draw}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={commitAnnotation}>บันทึกภาพที่วาด</button>
              <button className="btn-outline" onClick={()=>setAnnotateOpen(false)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== โมดอลเลือกพนักงาน ===== */}
      {pickEmpOpen && (
        <div className="modal-overlay" onClick={() => setPickEmpOpen(false)}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เลือกพนักงาน</h3>
              <button className="icon-btn" onClick={() => setPickEmpOpen(false)}>×</button>
            </div>

            <div className="modal-body scrollable">
              {/* ช่องค้นหา (ชื่อ/เบอร์/หน้าที่/ประเภทงาน) */}
              <div className="search-container" style={{ maxWidth: 520 }}>
                <div className="search-icon"><Search className="icon-md" /></div>
                <input
                  className="search-input"
                  placeholder="ค้นหา ชื่อ/เบอร์/หน้าที่/ประเภทงาน (fulltime/parttime)"
                  value={empQ}
                  onChange={(e) => setEmpQ(e.target.value)}
                />
              </div>

              {/* รายการพนักงาน: คลิกเพื่อ toggle เลือก/นำออก */}
              <div className="list-container" style={{ marginTop: 12 }}>
                {employees
                  .filter(e => {
                    const q = empQ.trim().toLowerCase();
                    if (!q) return true;
                    const phone = e.phone || e.tel || e.mobile || e.phoneNumber || "";
                    const jobType = (e.employmentType || e.jobType || e.type || "").toString();
                    const role = e.role || "";
                    return (e.name || "").toLowerCase().includes(q)
                      || phone.toLowerCase().includes(q)
                      || jobType.toLowerCase().includes(q)
                      || role.toLowerCase().includes(q);
                  })
                  .map(e => {
                    const phone = e.phone || e.tel || e.mobile || e.phoneNumber || "-";
                    const jobType = (e.employmentType || e.jobType || e.type || "-").toString();
                    const role = e.role || "-";
                    const checked = selectedEmpIds.includes(e._id);
                    return (
                      <div key={e._id} className="customer-card clickable" onClick={() => {
                        setSelectedEmpIds(prev => prev.includes(e._id) ? prev.filter(x => x !== e._id) : [e._id, ...prev]);
                      }}>
                        <div className="card-content">
                          <div className="card-left">
                            <div className="rcp-avatar">{(e.name || "E").slice(0, 2).toUpperCase()}</div>
                            <div className="user-info">
                              <h4 className="customer-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {e.name || "-"}
                                {checked && <span className="rcp-chip">เลือกแล้ว</span>}
                              </h4>
                              <div className="customer-details">
                                <div className="detail-item"><strong>เบอร์:</strong> {phone}</div>
                                <div className="detail-item"><strong>หน้าที่:</strong> {role}</div>
                                <div className="detail-item"><strong>ประเภทงาน:</strong> {jobType}</div>
                              </div>
                            </div>
                          </div>
                          <div className="card-right">
                            <button className="btn-primary">{checked ? "นำออก" : "เลือก"}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setPickEmpOpen(false)}>ปิด</button>
              <button className="btn-primary" onClick={() => setPickEmpOpen(false)}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
