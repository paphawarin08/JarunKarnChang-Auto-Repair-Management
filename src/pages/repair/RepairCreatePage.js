// src/pages/RepairCreatePage.js
// หน้า "สร้างงานซ่อมใหม่" — workflow หลักคือ:
// 1) เลือกลูกค้า + รถ  2) ใส่ปัญหาเบื้องต้น/ให้ AI ช่วยแนะนำ (optional)
// 3) ตรวจสภาพ + อัปโหลด/วาดภาพ + เช็คลิสต์  4) เลือกอะไหล่ + พนักงาน
// 5) กด "เพิ่มข้อมูล" -> บันทึกทุกอย่างลงฐาน + finalize
// * ผมจะคอมเมนต์ทีละบล็อกให้เห็น flow + ฟังก์ชันไหนสำคัญนะ

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronUp, Mail, Phone, User, MapPin,
  Car as CarIcon, GaugeCircle, Wrench, Plus, Trash2, Search, Image as ImageIcon,
  Paintbrush, Eraser
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import "../../styles/RepairCreatePage.css";
import { auth } from "../../firebase/firebase";

// === ชุด AI แนะนำจาก "อาการ" ===
// - getSuggestionsForSymptom: ขอคำแนะนำจากอาการลูกค้า
// - setDynamicRulesFromDB: sync rules จาก DB มาให้ engine ใช้
// - makeRuleFromExample: แปลงตัวอย่าง (symptom/cause/solution) เป็น rule เก็บไว้ใช้ต่อ
// - isNLIReady/ensureNLI: จัดการ NLI engine (ตัวช่วยจัดอันดับผลลัพธ์)
import {
  getSuggestionsForSymptom, setDynamicRulesFromDB, makeRuleFromExample, isNLIReady, ensureNLI,
} from "../../ai/aiSuggestLocal";
import { subscribeAIRules, addAIRule, logAIFeedback, incrementRuleHit } from "../../services/aiRuleService";

// === services ฝั่งข้อมูลหลัก ===
import { subscribeCustomers } from "../../services/customerService";
import { subscribeCars } from "../../services/carService";
import { subscribeEmployees } from "../../services/employeeService";
import {
  subscribePartCategories, subscribePartsByCategory, subscribePartsSummaryByCategory
} from "../../services/partService";
import {
  addRepair, finalizeRepair, updateRepair, addInspection,
  addProblemReport, addPartToRepair, removePartFromRepair
} from "../../services/repairService";

// ====== helpers (ค่าเริ่มต้นของเช็คลิสต์) ======
// เคส basic ๆ ที่อู่ชอบเช็ค — default เป็นสถานะ "fair"
const defaultChecklist = [
  "ทดลองขับ",
  "สมรรถนะเครื่องยนต์",
  "ระบบเบรก",
  "พวงมาลัย / ศูนย์ล้อ",
  "ช่วงล่าง / โช้คอัพ",
  "ระบบส่งกำลัง / เกียร์",
  "ระบบไฟฟ้า / แบตเตอรี่"
].map(name => ({ name, state: "fair", details: "" }));

// ====== helpers เงินบาท ======
// * ฟังก์ชันนี้คล้าย ๆ กับ `baht()` ในไฟล์ก่อนหน้า (format เป็น 1,234.00)
//   ถือว่า "ซ้ำบทบาท" → จะ "ไม่นับเพิ่ม" ใน tally แต่ยังคอมเมนต์ให้อ่านออก
const fmtBaht = (v) => Number(v || 0).toLocaleString("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ====== helper แปลงรูปเป็น base64 (ลดขนาดด้วย) ======
// * โทนเดียวกับ toBase64 ในไฟล์ Part/Category/PartsList (ซ้ำแนวคิด) → ไม่นับเพิ่ม
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

/** map รถจากโครงสร้างจริงให้ UI ใช้ */
function viewOfCar(c) {
  const title = [c.brand, c.model].filter(Boolean).join(" ").trim();
  return {
    id: c._id,
    raw: c,
    image: c.imageDataUrl || "",
    title: title || c.title || "-",
    plate: c.lPlate || "",
    mileage: c.odometer || "",
    type: c.carType || c.type || "",
    transmission: c.transmission || c.gear || "",
    color: c.color || "",
  };
}

// ====== คอมโพเนนต์หลักของหน้า (ฟังก์ชันใหญ่สุด) ======
export default function RepairCreatePage() {
  const nav = useNavigate();

  // ========= draft repair =========
  // เวลาเปิดหน้านี้ เรายังไม่มีเอกสารงานซ่อมจริง → จะสร้าง draft ไว้ก่อนตอนต้องใช้
  const [repairId, setRepairId] = useState(null);
  const [repairCode, setRepairCode] = useState(null);

  // ========= โซนลูกค้า/รถ =========
  const [customers, setCustomers] = useState([]);
  const [cars, setCars] = useState([]);
  const [pickCustomerOpen, setPickCustomerOpen] = useState(false);
  const [pickVehicleOpen, setPickVehicleOpen] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [showCus, setShowCus] = useState(true);
  const [showCar, setShowCar] = useState(true);

  // ========= พนักงาน =========
  const [employees, setEmployees] = useState([]);
  const [pickEmpOpen, setPickEmpOpen] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]); // งานนึงมีหลายคนได้
  const [empQ, setEmpQ] = useState(""); // ค้นหาใน modal

  // ========= อะไหล่ =========
  const [cats, setCats] = useState([]);
  const [statsByCat, setStatsByCat] = useState({}); // { [catId]: { itemCount, stockSum } }
  const [pickPartOpen, setPickPartOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(null);
  const [partsLoading, setPartsLoading] = useState(false);
  const [parts, setParts] = useState([]);
  const [partsUsed, setPartsUsed] = useState([]);
  const [qPart, setQPart] = useState("");
  const [qtyByPart, setQtyByPart] = useState({}); // เก็บจำนวนที่เลือกของแต่ละ partId
  const [addingPartIds, setAddingPartIds] = useState({}); // { [partId]: true/false }
  const setAdding = (id, v) => setAddingPartIds(prev => ({ ...prev, [id]: !!v }));


  // ========= ตรวจสภาพ/รูป/เช็คลิสต์ =========
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectionDate, setInspectionDate] = useState("");
  const [images, setImages] = useState([]); // [{image, annotated, desc}]
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotIdx, setAnnotIdx] = useState(-1);
  const [brushColor, setBrushColor] = useState("#ff0000");
  const [brushSize, setBrushSize] = useState(6);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [checklist, setChecklist] = useState(defaultChecklist);
  const [newChecklistName, setNewChecklistName] = useState("");

  // ========= ปัญหา + AI =========
  const [problemOpen, setProblemOpen] = useState(false);
  const [probSymptom, setProbSymptom] = useState("");
  const [probCause, setProbCause] = useState("");
  const [probSolution, setProbSolution] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSugs, setAiSugs] = useState([]);        // ลิสต์ข้อเสนอแนะจาก AI
  const [nliReady, setNliReady] = useState(null);

  // ========= โน้ตเอกสาร =========
  const [note, setNote] = useState("");

  // ---------- (หลัก) ขอคำแนะนำจาก AI ตาม "อาการ" ----------
  async function handleSuggest() {
    const text = (probSymptom || "").trim();
    if (!text) { alert("พิมพ์อาการก่อนนะ"); return; }
    try {
      setAiLoading(true);
      // sync สถานะ NLI (เบื้องหลังจะโหลด asset ถ้ายังไม่พร้อม)
      const ready = await isNLIReady();
      setNliReady(ready);
      // ใช้ NLI เสมอ (เพื่อจัดอันดับ rule ให้ตรงอาการ)
      const sugs = await getSuggestionsForSymptom(text, { useNLI: true });
      setAiSugs(sugs);
    } finally {
      setAiLoading(false);
    }
  }

  // ---------- self-test NLI (แนว debug/เช็คเครื่อง) — ไม่ถือเป็น core action ----------
  async function handleNliSelfTest() {
    try {
      setAiLoading(true);
      const nli = await ensureNLI();
      const out = await nli(
        "รถน้ำมันหมดไว",
        ["เครื่องยนต์","ระบบไฟฟ้า","ไอดี/เชื้อเพลิง","ช่วงล่าง","ตัวถัง/เสียง"]
      );
      console.log("NLI test output:", out);
      alert("NLI พร้อม • Top1: " + out.labels?.[0] + " (score=" + out.scores?.[0]?.toFixed(3) + ")");
    } catch (e) {
      console.error("NLI test failed:", e);
      alert("NLI ยังไม่พร้อม: " + (e?.message || e));
    } finally {
      setAiLoading(false);
    }
  }

  // -------- โหลดข้อมูลฐานทั้งหมดแบบ realtime (ลูกค้า/รถ/พนง./หมวด/สรุปอะไหล่/AI rules) --------
  useEffect(() => {
    const u1 = subscribeCustomers(setCustomers);
    const u2 = subscribeCars(setCars);
    const u3 = subscribeEmployees(setEmployees);
    const u4 = subscribePartCategories(setCats);
    // ★ รวมค่าสถิติของ parts ต่อหมวดไว้ขึ้น badge
    const u5 = subscribePartsSummaryByCategory((stat) => setStatsByCat(stat || {}));
    // ★ AI rules -> feed เข้า engine ให้แนะนำได้ทันที
    const u6 = subscribeAIRules((rules) => setDynamicRulesFromDB(rules));
    return () => { u1&&u1(); u2&&u2(); u3&&u3(); u4&&u4(); u5&&u5(); u6&&u6(); };
  }, []);

  // เช็กสถานะ NLI ครั้งแรก (โชว์ป้าย "พร้อม/กำลังเตรียม")
  useEffect(() => {
    (async () => { setNliReady(await isNLIReady()); })();
  }, []);

  // ✅ subscribe parts เฉพาะตอน modal เปิด + มี activeCat เท่านั้น (ประหยัดทรัพยากร)
  useEffect(() => {
    if (!pickPartOpen || !activeCat) return;
    setPartsLoading(true);
    setParts([]); // clear ก่อน
    const unsub = subscribePartsByCategory(activeCat, (list) => {
      setParts(list);
      setPartsLoading(false);
    });
    return () => { unsub && unsub(); };
  }, [activeCat, pickPartOpen]);

  // ✅ เปิด modal เลือกอะไหล่ครั้งแรก -> auto เลือกหมวดแรกให้
  useEffect(() => {
    if (!pickPartOpen) return;
    if (!activeCat && cats.length > 0) {
      setActiveCat(cats[0]._id);
    }
  }, [pickPartOpen, cats, activeCat]);

  // ✅ ปิด modal parts -> เคลียร์ state เพื่อไม่ให้ค้าง
  useEffect(() => {
    if (!pickPartOpen) {
      setParts([]);
      setActiveCat(null);
      setQPart("");
      setPartsLoading(false);
    }
  }, [pickPartOpen]);

  // -------- helper สำคัญ: สร้าง "draft repair" เมื่อจำเป็น --------
  // * ฟังก์ชันหลัก (นับ): ใช้ในหลาย flow เช่นกดเพิ่มอะไหล่/บันทึกครั้งแรก
  const ensureDraft = async () => {
    if (repairId) return { id: repairId, code: repairCode };
    const { id, code } = await addRepair({ isDraft: true, status: "รับรถเข้าร้าน" }, auth.currentUser?.uid || null);
    setRepairId(id); setRepairCode(code);
    return { id, code };
  };

  // -------- อัปโหลด/ลากวางรูปสำหรับ "ผลตรวจ" --------
  const onPickImages = async (files) => {
    const arr = [];
    for (const f of files) {
      const b64 = await toBase64(f, 1600);
      arr.push({ image: b64, annotated: b64, desc: "" });
    }
    setImages(prev => [...prev, ...arr]);
  };
  const onDrop = async (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer.files || [])];
    await onPickImages(files);
  };

  // เพิ่ม/ลบรายการ Checklist
  const addChecklistItem = () => {
    const name = (newChecklistName || "").trim();
    if (!name) return;
    setChecklist(prev => [...prev, { name, state: "fair", details: "" }]);
    setNewChecklistName("");
  };
  const removeChecklistItem = (idx) => {
    setChecklist(prev => prev.filter((_, i) => i !== idx));
  };

  // -------- เครื่องมือวาด annotate บนภาพ --------
  // sync ขนาด canvas ให้เท่ารูป (responsive)
  useEffect(() => {
    if (!annotateOpen || annotIdx < 0) return;
    const cvs = canvasRef.current, img = imgRef.current;
    if (!cvs || !img) return;
    const syncSize = () => {
      cvs.width = img.clientWidth;
      cvs.height = img.clientHeight;
    };
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => window.removeEventListener("resize", syncSize);
  }, [annotateOpen, annotIdx]);

  // เริ่ม/หยุดวาด + วาดเป็นจุด ๆ (แปรงวงกลม)
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
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  // (หลักเล็ก ๆ ฝั่ง inspect) บันทึกการวาดทับลงรูปจริง
  const commitAnnotation = () => {
    const cvs = canvasRef.current, base = images[annotIdx]?.image;
    if (!cvs || !base) return setAnnotateOpen(false);
    const img = new Image();
    img.onload = () => {
      const out = document.createElement("canvas");
      out.width = img.width; out.height = img.height;
      const octx = out.getContext("2d");
      octx.drawImage(img, 0, 0, out.width, out.height);
      octx.drawImage(cvs, 0, 0, cvs.width, cvs.height, 0, 0, out.width, out.height);
      const merged = out.toDataURL("image/jpeg", 0.9);
      setImages(prev => prev.map((it, i) => i === annotIdx ? ({ ...it, annotated: merged }) : it));
      setAnnotateOpen(false);
    };
    img.src = base;
  };

  // -------- เฉลยลิสต์รถของ "ลูกค้าที่เลือก" เท่านั้น --------
  const filteredCarsForCustomer = useMemo(() => {
    if (!customer) return cars;
    const cusDocId = customer._id;
    const cusCode  = (customer.id || "").toString();
    return cars.filter(c => {
      const ownerRefId = c.ownerRefId || "";
      const ownerCode  = (c.ownerCode || c.ownBy || "").toString();
      return (ownerRefId && ownerRefId === cusDocId) || (ownerCode && ownerCode === cusCode);
    });
  }, [cars, customer]);

  // -------- (หลัก) เพิ่มอะไหล่ที่ใช้กับงานซ่อมนี้ --------
  const addPartUsage = async (p) => {
    const qty = Number(qtyByPart[p._id] || 1);
    if (!qty || qty < 1) return;

    // กันกดซ้ำชิ้นเดียวกัน
    if (addingPartIds[p._id]) return;

    try {
    setAdding(p._id, true);

    const { id } = await ensureDraft(); // ไม่มีเอกสาร -> สร้าง draft ก่อน
    const { partsUsedId } = await addPartToRepair(
      id,
      { partId: p._id, qty },
      auth.currentUser?.uid || null
    );

    // 1) อัปเดตรายการอะไหล่ที่ใช้ (ฝั่ง UI)
    setPartsUsed(prev => [
      {
        partsUsedId,
        partId: p._id,
        name: p.name,
        brand: p.brand || "-",
        grade: p.grade || "-",          // เก็บเกรดไว้ด้วย (โชว์ตอนคิดเงิน/สรุป)
        unitPrice: Number(p.sellPrice || 0),
        qty
      },
      ...prev
    ]);

    // 2) ลด "คงเหลือ" ในลิสต์ parts แบบ optimistic
    setParts(prev =>
      prev.map(x =>
        x._id === p._id
          ? { ...x, stockQty: Math.max(0, Number(x.stockQty || 0) - qty) }
          : x
      )
    );

     // แจ้งเตือนสำเร็จ
    alert(`เพิ่ม "${p.name}" x ${qty} แล้ว`);
  } catch (e) {
    console.error(e);
    alert(e?.message || "เพิ่มอะไหล่ไม่สำเร็จ");
  } finally {
    setAdding(p._id, false);
  }
  };

  // -------- (หลัก) ยกเลิกการใช้อะไหล่ (คืนสต็อกใน UI ด้วย) --------
  const removeUsage = async (u) => {
    if (!window.confirm(`ลบอะไหล่: ${u.name} x ${u.qty}?`)) return;
    await removePartFromRepair(repairId, u.partsUsedId, auth.currentUser?.uid || null);

    // 1) เอาออกจากรายการ partsUsed
    setPartsUsed(prev => prev.filter(x => x.partsUsedId !== u.partsUsedId));

    // 2) คืน "คงเหลือ" ในลิสต์ parts แบบ optimistic
    setParts(prev =>
      prev.map(x =>
        x._id === u.partId
          ? { ...x, stockQty: Number(x.stockQty || 0) + Number(u.qty || 0) }
          : x
      )
    );
  };

  // -------- (หลัก) บันทึกทุกอย่างลงเอกสาร + finalize --------
  // * ฟังก์ชันนี้เป็นตัวปิดจ๊อบ: อัปเดตข้อมูลลูกค้า/รถ/พนักงาน/โน้ต
  //   แนบรายงานปัญหา/ผลตรวจถ้ามี แล้ว finalize งานซ่อม
  const handleSave = async () => {
    const { id } = await ensureDraft();

    const vTitle = vehicle?.title || "";
    const vPlate = vehicle?.plate || "";

    await updateRepair(id, {
      customerRef: customer?._id || null,
      vehicleRef: vehicle?.id || null,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      customerAddress: customer?.address || "",
      vehicleTitle: vTitle,
      vehiclePlate: vPlate,
      vehicleImage: vehicle?.image || "",
      vehicleMileage: vehicle?.mileage || "",
      vehicleType: vehicle?.type || "",
      vehicleTransmission: vehicle?.transmission || "",
      vehicleColor: vehicle?.color || "",
      employees: selectedEmpIds,
      note,
    });

    // แนบรายงาน "อาการ/สาเหตุ/แนวทางแก้" ถ้ามีกรอก
    if (probSymptom || probCause || probSolution) {
      await addProblemReport(id, { symptom: probSymptom, cause: probCause, solution: probSolution });
      setProbSymptom(""); setProbCause(""); setProbSolution("");
    }

    // แนบ "ผลตรวจ" (วันที่ + รูปที่ annotate + เช็คลิสต์)
    if (inspectionDate || images.length || checklist.some(c => c.state || c.details)) {
      const checkMap = {};
      checklist.forEach(c => { checkMap[c.name] = { state: c.state, details: c.details }; });
      await addInspection(id, { date: inspectionDate, images, checklist: checkMap });
      setInspectionDate(""); setImages([]); setChecklist(defaultChecklist);
    }

    await finalizeRepair(id);
    alert("บันทึกงานซ่อมเรียบร้อย");
    nav("/admin/repairs");
  };

  return (
    <div className="rcp-wrap">
      {/* ====== Header ====== */}
      <header className="profile-header">
        <div className="header-left">
          <button className="back-button" onClick={()=>nav("/admin/repairs")}><ArrowLeft size={24} /></button>
          <h1 className="page-title">เพิ่มงานซ่อม {repairCode ? `• ${repairCode}` : ""}</h1>
        </div>
      </header>

      <div className="rcp-card">
        {/* ลูกค้า & รถ */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">ลูกค้าและรถ</h3>
          <div className="rcp-two">
            {/* การ์ดลูกค้า */}
            <div className="rcp-col">
              {!customer ? (
                <button
                  className="rcp-btn rcp-btn-primary rcp-btn-lg"
                  style={{ width: "100%" }}
                  onClick={() => setPickCustomerOpen(true)}
                >
                  เลือกลูกค้า
                </button>
              ) : (
                <div className="rcp-card-info">
                  <div className="rcp-card-header">
                    <div className="rcp-avatar">{(customer.name || "C").slice(0,2).toUpperCase()}</div>
                    <div className="rcp-card-title"> {customer.name} </div>
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
                    <button className="rcp-badge pink" onClick={()=>setCustomer(null)}>นำออก</button>
                  </div>
                </div>
              )}
            </div>

            {/* การ์ดรถ */}
            <div className="rcp-col">
              {!vehicle ? (
                <button
                  className="rcp-btn rcp-btn-primary rcp-btn-lg"
                  style={{ width: "100%" }}
                  onClick={() => setPickVehicleOpen(true)}
                >
                  เลือกรถยนต์
                </button>
              ) : (
                <div className="rcp-card-info">
                  <div className="rcp-card-header">
                    {vehicle.image
                      ? <img className="rcp-thumb" src={vehicle.image} alt="vehicle"/>
                      : <div className="rcp-thumb placeholder"><ImageIcon/></div>}
                    <div className="rcp-card-title rcp-card-title-right">{vehicle.title || "-"}</div>
                  </div>
                  {showCar && (
                    <ul className="rcp-info-list">
                      <li><CarIcon size={16} />{vehicle.type || "-"}</li>
                      <li><Wrench size={16} />{vehicle.plate || "-"}</li>
                      <li><GaugeCircle size={16} />{vehicle.mileage || "-"} KM</li>
                    </ul>
                  )}
                  <div className="rcp-actions-row">
                    <button className="rcp-badge pink" onClick={()=>setVehicle(null)}>Unlink Vehicle</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ตรวจสอบ & วินิจฉัย (ปุ่มเปิด popup) */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">ตรวจสอบและวินิจฉัย</h3>
          <div className="rcp-two">
            <button
              className="rcp-btn rcp-btn-primary ghost rcp-btn-lg"
              onClick={() => setProblemOpen(true)}
            >
              อาการและปัญหาเบื้องต้น
            </button>

            <button
              className="rcp-btn rcp-btn-primary ghost rcp-btn-lg"
              onClick={() => setInspectOpen(true)}
            >
              ผลการตรวจเช็กสภาพ
            </button>
          </div>
        </section>

        {/* อะไหล่ & ช่าง */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">อะไหล่ และ พนักงานที่รับผิดชอบ</h3>

          {/* parts used */}
          <div className="rcp-panel">
            <div className="rcp-panel-title">
              <span>อะไหล่</span>
              <button
                className="rcp-btn rcp-btn-primary"
                onClick={() => {
                  setPickPartOpen(true);
                  if (!activeCat && cats.length > 0) setActiveCat(cats[0]._id);
                }}
              >
                เพิ่มอะไหล่
              </button>
            </div>
            <div className="rcp-panel-body">
              <div className="rcp-listbox">
                {partsUsed.length === 0 && <div className="rcp-empty">ยังไม่มีรายการ</div>}
                {partsUsed.map((u) => (
                  <div className="rcp-listrow" key={u.partsUsedId}>
                    <div className="rcp-listleft">
                      <div className="rcp-line-id">
                        {u.name} <span style={{ color: "#64748b" }}>• {u.brand || "-"}</span>
                      </div>
                      <div className="rcp-line-sub">จำนวน: {u.qty} ชิ้น</div>
                      <div className="rcp-line-sub">ราคา: {fmtBaht(u.unitPrice)} บาท</div>
                      <div className="rcp-line-sub">เกรด: {u.grade}</div>
                    </div>
                    <div className="rcp-listright">
                      <button className="rcp-chip danger" onClick={() => removeUsage(u)}>
                        <Trash2 size={14} /> ลบรายการ
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* employees */}
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

        {/* Note */}
        <section className="rcp-section">
          <h3 className="rcp-section-title">โน้ต</h3>
          <textarea className="rcp-textarea" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติมสำหรับงานนี้…"/>
        </section>

        <div className="rcp-submit-row">
          {/* ปุ่มปิดจ๊อบ — ไปเรียก handleSave (ฟังก์ชันหลัก) */}
          <button className="rcp-btn rcp-btn-primary rcp-submit" onClick={handleSave}>เพิ่มข้อมูล</button>
        </div>
      </div>

      {/* ===== โมดอลเลือกลูกค้า ===== */}
      {pickCustomerOpen && (
        <div className="modal-overlay" onClick={()=>setPickCustomerOpen(false)}>
          <div className="modal-box wide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>เลือกลูกค้า</h3><button className="icon-btn" onClick={()=>setPickCustomerOpen(false)}>×</button></div>
            <div className="modal-body scrollable">
              <div className="search-container" style={{maxWidth:520}}>
                <div className="search-icon"><Search className="icon-md"/></div>
                {/* ฟิลเตอร์แบบ on-the-fly โดยใส่ flag __hide ที่ array เดิม (ประหยัดโค้ด) */}
                <input className="search-input" placeholder="ค้นหา ชื่อ/เบอร์/ที่อยู่" onChange={(e)=>{
                  const t=e.target.value.toLowerCase();
                  setCustomers(prev=>prev.map(x=>({...x, __hide: !((x.name||"").toLowerCase().includes(t) || (x.phone||"").includes(t) || (x.address||"").toLowerCase().includes(t)) }))
                  );
                }}/>
              </div>
              <div className="list-container">
                {customers.filter(c=>!c.__hide).map(c=>(
                  <div key={c._id} className="customer-card clickable" onClick={()=>{setCustomer(c); setPickCustomerOpen(false);}}>
                    <div className="card-content">
                      <div className="card-left">
                        <div className="user-info">
                          <h3 className="customer-name">{c.name}</h3>
                          <div className="customer-details">
                            <div className="detail-item"><strong>เบอร์:</strong> {c.phone||"-"}</div>
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
                {filteredCarsForCustomer.map(vRaw=>{
                  const v = viewOfCar(vRaw);
                  return (
                    <div key={vRaw._id} className="customer-card clickable" onClick={()=>{setVehicle(v); setPickVehicleOpen(false);}}>
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
                  );
                })}
                {filteredCarsForCustomer.length===0 && <div className="rcp-empty">ไม่มีรถของลูกค้าคนนี้</div>}
              </div>
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
              {/* ค้นหา */}
              <div className="search-container" style={{maxWidth:520}}>
                <div className="search-icon"><Search className="icon-md"/></div>
                <input
                  className="search-input"
                  placeholder="ค้นหา ชื่อ/เบอร์/หน้าที่/ประเภทงาน (fulltime/parttime)"
                  value={empQ}
                  onChange={(e)=>setEmpQ(e.target.value)}
                />
              </div>

              {/* รายชื่อ (คลิกเพื่อ toggle เลือก/เอาออก) */}
              <div className="list-container">
                {employees
                  .filter(emp => {
                    const t = empQ.trim().toLowerCase();
                    if (!t) return true;
                    const name = (emp.name || "").toLowerCase();
                    const phone = (emp.phone || emp.tel || emp.mobile || emp.phoneNumber || "").toLowerCase();
                    const jobType = (emp.employmentType || emp.jobType || emp.type || "").toString().toLowerCase();
                    const role = (emp.role || "").toLowerCase();
                    return (
                      name.includes(t) ||
                      phone.includes(t) ||
                      jobType.includes(t) ||
                      role.includes(t)
                    );
                  })
                  .map(emp => {
                    const id = emp._id;
                    const selected = selectedEmpIds.includes(id);
                    const phone = emp.phone || emp.tel || emp.mobile || emp.phoneNumber || "-";
                    const jobType = (emp.employmentType || emp.jobType || emp.type || "-").toString();
                    const role = emp.role || "-";
                    return (
                      <div
                        key={id}
                        className="customer-card clickable"
                        onClick={() => {
                          setSelectedEmpIds(prev =>
                            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                          );
                        }}
                        style={{ outline: selected ? "3px solid rgba(74,144,226,.25)" : "none" }}
                      >
                        <div className="card-content">
                          <div className="card-left">
                            <div className="user-info">
                              <h3 className="customer-name">
                                {emp.name} {selected ? <small style={{ color: "#2563eb" }}>• เลือกแล้ว</small> : null}
                              </h3>
                              <div className="customer-details">
                                <div className="detail-item"><strong>เบอร์:</strong> {phone}</div>
                                <div className="detail-item"><strong>หน้าที่:</strong> {role}</div>
                                <div className="detail-item"><strong>ประเภทงาน:</strong> {jobType}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {employees.length === 0 && <div className="rcp-empty">ยังไม่มีพนักงาน</div>}
              </div>
            </div>

            <div className="modal-actions-create">
              <button className="btn-primary" onClick={() => setPickEmpOpen(false)}>เสร็จสิ้น</button>
              <button className="btn-outline" onClick={() => { setSelectedEmpIds([]); }}>ล้างที่เลือก</button>
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
              {/* ด้านซ้าย: รายการหมวด */}
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
                      <button
                        key={c._id}
                        className={`part-cat-card ${active ? "active" : ""}`}
                        onClick={()=>{
                          // เคลียร์รายการเดิมแล้วโหลดใหม่เฉพาะหมวดนี้
                          setActiveCat(c._id);
                          setParts([]); setPartsLoading(true);
                        }}
                      >
                        <div className="part-cat-top">
                          {c.icon ? (
                            <img className="part-cat-icon" src={c.icon} alt={c.name} />
                          ) : (
                            <div className="part-cat-icon placeholder"><ImageIcon/></div>
                          )}
                          <div className="part-cat-name">{c.name}</div>
                        </div>
                        {/* ★ เหมือนหน้า PartCategoriesPage — badge "รวมสต็อก/ทั้งหมด" (ซ้ำแนวคิด) */}
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

              {/* ด้านขวา: รายการอะไหล่ในหมวดที่เลือก */}
              <div className="part-list-col">
                <div className="search-container">
                  <div className="search-icon"><Search className="icon-md"/></div>
                  <input className="search-input" placeholder="ค้นหา ไอดี/ชื่อ/ยี่ห้อ…" value={qPart} onChange={(e)=>setQPart(e.target.value)}/>
                </div>

                {partsLoading && <div className="loading-hint" style={{margin:"8px 0"}}>กำลังโหลดอะไหล่…</div>}

                <div className="list-container">
                  {(!partsLoading && activeCat && parts.length === 0) && (
                    <div className="rcp-empty">ไม่มีอะไหล่ในหมวดนี้</div>
                  )}
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
                                <div className="detail-item"><strong>ยี่ห้อ:</strong> {p.brand || "-"}</div>
                                <div className="detail-item"><strong>เกรด:</strong> {p.grade || "-"}</div>
                                <div className="detail-item"><strong>คงเหลือ:</strong> {p.stockQty ?? 0}</div>
                                <div className="detail-item"><strong>ราคา:</strong> {fmtBaht(p.sellPrice || 0)} บาท</div>
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
                              <button
                                className="rcp-btn rcp-btn-primary"
                                disabled={!!addingPartIds[p._id]}
                                onClick={() => addPartUsage(p)}
                              >
                                {addingPartIds[p._id] ? "กำลังเพิ่ม…" : (<><Plus size={16} /> เพิ่ม</>)}
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

      {/* ===== Modal: ปัญหาที่พบหรือรายงาน ===== */}
      {problemOpen && (
        <div className="modal-overlay" onClick={()=>setProblemOpen(false)}>
          <div className="modal-box wide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>อาการและปัญหาเบื้องต้น</h3><button className="icon-btn" onClick={()=>setProblemOpen(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label>1. อาการรถที่ลูกค้าแจ้ง</label>
                  <textarea className="rcp-textarea" placeholder="ตัวอย่างอาการ: “เบรกแข็ง”, “เดินเบาไม่นิ่ง”, “น้ำมันหมดไว”" value={probSymptom} onChange={(e) => setProbSymptom(e.target.value)} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <button className="rcp-btn rcp-btn-primary small" onClick={handleSuggest}>
                      {aiLoading ? "กำลังวิเคราะห์…" : "ขอคำแนะนำ"}
                    </button>
                    {/* ป้ายสถานะ NLI */}
                    <span
                      style={{
                        fontSize: 13,
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: nliReady === true ? "#e8f5e9" : "#fdecea",
                        color: nliReady === true ? "#1b5e20" : "#b71c1c",
                        border: "1px solid",
                        borderColor: nliReady === true ? "#c8e6c9" : "#f5c6cb"
                      }}
                      title="สถานะเอ็นจิน NLI สำหรับช่วยจัดอันดับกฎแนะนำ"
                    >
                      NLI: {nliReady === true ? "พร้อมใช้งาน" : (nliReady === false ? "ไม่พร้อม" : "กำลังเตรียม…")}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label>2. สาเหตุที่คาดว่าเกิดจาก</label>
                  <input value={probCause} onChange={(e)=>setProbCause(e.target.value)} placeholder="ระบบหรือชิ้นส่วนที่อาจเป็นต้นเหตุ เช่น ระบบเบรก, ระบบไฟฟ้า"/>
                </div>

                <div className="form-group">
                  <label>3. แนวทางการแก้ไข</label>
                  <input value={probSolution} onChange={(e)=>setProbSolution(e.target.value)} placeholder="วิธีซ่อมที่ช่างแนะนำ เช่น เปลี่ยนผ้าเบรก, ตรวจสอบแบตเตอรี่"/>
                </div>

                <div className="ai-quick-actions" style={{ marginTop: 8 }}>
                  {/* โซนปุ่มลัดจาก AI (เผื่อขยาย) */}
                </div>
              </div>

              {aiSugs.length > 0 && (
                <div className="ai-suggest-panel">
                  <div className="ai-suggest-title">ข้อเสนอแนะจากอาการ</div>
                  <div className="ai-suggest-list">
                    {aiSugs.map((s, i) => (
                      <div key={i} className="ai-suggest-card">
                        {["nli", "nli-rule"].includes(s._source) && (
                          <div className="ai-tag" style={{ marginBottom: 6 }}>NLI</div>
                        )}
                        <div className="ai-suggest-cause"><strong>สาเหตุที่เป็นไปได้:</strong> {s.cause}</div>
                        <div className="ai-suggest-solution"><strong>แนวทางแก้:</strong> {s.solution}</div>
                        {Array.isArray(s.tags) && s.tags.length > 0 && (
                          <div className="ai-suggest-tags">
                            {s.tags.map((t, idx) => <span key={idx} className="ai-tag">{t}</span>)}
                          </div>
                        )}
                        <div className="ai-suggest-actions">
                          <button
                            className="rcp-chip-add"
                            onClick={() => {
                              if (!probCause) setProbCause(s.cause);
                              else setProbCause(prev => (prev.includes(s.cause) ? prev : (prev + " • " + s.cause)));
                            }}
                          >
                            ใส่สาเหตุนี้
                          </button>

                          <button
                            className="rcp-chip-add"
                            onClick={() => {
                              if (!probSolution) setProbSolution(s.solution);
                              else setProbSolution(prev => (prev.includes(s.solution) ? prev : (prev + " | " + s.solution)));
                            }}
                          >
                            ใส่วิธีแก้นี้
                          </button>

                          <button
                            className="rcp-chip-add"
                            onClick={async () => {
                              const draft = makeRuleFromExample(probSymptom, s.cause, s.solution);
                              await addAIRule(draft, auth.currentUser?.uid || null);
                              alert("บันทึกไว้ใช้ครั้งถัดไปแล้ว • ระบบจะช่วยแนะนำอัตโนมัติเมื่อพบอาการคล้ายกัน");
                            }}
                          >
                            บันทึกปัญหาลงไปในอาการนี้
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions-create2">
              <button
                className="rcp-chip-add"
                onClick={async () => {
                  const sym = (probSymptom || "").trim();
                  if (!sym) { alert("กรอกข้อ 1 (อาการ) ก่อน"); return; }
                  const draft = makeRuleFromExample(sym, probCause, probSolution);
                  await addAIRule(draft, auth.currentUser?.uid || null);
                  alert("บันทึกจากแบบฟอร์มนี้ไว้ใช้ครั้งถัดไปแล้ว ระบบจะหยิบรายการที่บันทึกไว้มาช่วยแนะนำอัตโนมัติเมื่อพบอาการคล้ายกัน✔");
                }}
              >
                เพิ่มฟอร์มเป็นคำแนะนำใหม่
              </button>
              <div>
                <button className="btn-primary" onClick={()=>setProblemOpen(false)}>บันทึก</button>
                <button className="btn-outline" onClick={()=>setProblemOpen(false)}>ปิด</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: ตรวจสอบรถยนต์ + อัปโหลด/วาด + Checklist ===== */}
      {inspectOpen && (
        <div className="modal-overlay" onClick={()=>setInspectOpen(false)}>
          <div className="modal-box xwide" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header"><h3>ผลการตรวจเช็กสภาพ</h3><button className="icon-btn" onClick={()=>setInspectOpen(false)}>×</button></div>
            <div className="modal-body scrollable">
              <div className="form-grid" style={{maxWidth:480}}>
                <div className="form-group full">
                  <label>วันที่ตรวจสอบ</label>
                  <input type="date" value={inspectionDate} onChange={(e)=>setInspectionDate(e.target.value)} />
                </div>
              </div>

              {/* upload / drag & drop */}
              <div className="dropzone" onDragOver={(e)=>{e.preventDefault();}} onDrop={onDrop}>
                <div className="dz-inner">
                  <div>กดที่นี่เพื่อ Upload หรือ ลากวางในพื้นที่นี้</div>
                  <input type="file" accept="image/*" multiple onChange={(e)=>onPickImages([...e.target.files])}/>
                </div>
              </div>

              {/* images list */}
              <div className="img-grid">
                {images.map((im, idx)=>(
                  <div key={idx} className="img-card">
                    <img src={im.annotated || im.image} alt="" />
                    <input className="img-desc" placeholder="อธิบายรูป…" value={im.desc||""} onChange={(e)=>setImages(prev=>prev.map((x,i)=>i===idx?({...x, desc: e.target.value}):x))}/>
                    <div className="img-actions">
                      <button className="rcp-chip" onClick={()=>{setAnnotIdx(idx); setAnnotateOpen(true);}}><Paintbrush size={14}/> วาดโน้ตลงบนรูป</button>
                      <button className="rcp-chip danger" onClick={()=>setImages(prev=>prev.filter((_,i)=>i!==idx))}><Trash2 size={14}/> ลบ</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* checklist */}
              <div className="rcp-section-title" style={{ marginTop: 12 }}>เช็คลิสต์ตรวจสอบรถยนต์</div>

              {/* เพิ่มรายการใหม่ */}
              <div className="form-grid" style={{ alignItems: "center", marginBottom: 8 }}>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>เพิ่มรายการเช็คลิสต์ใหม่</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      placeholder="เช่น ระบบหล่อเย็น, สภาพยาง, น้ำมันเครื่อง ฯลฯ"
                      value={newChecklistName}
                      onChange={(e) => setNewChecklistName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addChecklistItem(); }}
                      style={{ flex: 1 }}
                    />
                    <button className="rcp-btn rcp-btn-primary" onClick={addChecklistItem}>
                      <Plus size={16} /> เพิ่มรายการ
                    </button>
                  </div>
                </div>
              </div>

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
                  {checklist.map((c, idx) => (
                    <div key={idx} className="tr">
                      <div className="td name">{c.name}</div>
                      <div className="td">
                        <input
                          type="radio"
                          name={`s-${idx}`}
                          checked={c.state === "good"}
                          onChange={() => setChecklist(prev => prev.map((x, i) => i === idx ? ({ ...x, state: "good" }) : x))}
                        />
                      </div>
                      <div className="td">
                        <input
                          type="radio"
                          name={`s-${idx}`}
                          checked={c.state === "fair"}
                          onChange={() => setChecklist(prev => prev.map((x, i) => i === idx ? ({ ...x, state: "fair" }) : x))}
                        />
                      </div>
                      <div className="td">
                        <input
                          type="radio"
                          name={`s-${idx}`}
                          checked={c.state === "poor"}
                          onChange={() => setChecklist(prev => prev.map((x, i) => i === idx ? ({ ...x, state: "poor" }) : x))}
                        />
                      </div>
                      <div className="td details">
                        <input
                          value={c.details}
                          onChange={(e) => setChecklist(prev => prev.map((x, i) => i === idx ? ({ ...x, details: e.target.value }) : x))}
                        />
                      </div>
                      <div className="td" style={{ display: "flex", justifyContent: "center" }}>
                        <button className="rcp-chip danger" onClick={() => removeChecklistItem(idx)}>
                          <Trash2 size={14} /> ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-actions-create">
              <button className="btn-primary" onClick={()=>setInspectOpen(false)}>บันทึก</button>
              <button className="btn-outline" onClick={()=>setInspectOpen(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Annotate editor ===== */}
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
                <button className="rcp-chip" onClick={()=>{
                  const cvs = canvasRef.current; if (cvs) { const ctx=cvs.getContext("2d"); ctx.clearRect(0,0,cvs.width,cvs.height); }
                }}><Eraser size={14}/> ล้างเส้น</button>
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
            <div className="modal-actions-create">
              <button className="btn-primary" onClick={commitAnnotation}>บันทึกภาพที่วาด</button>
              <button className="btn-outline" onClick={()=>setAnnotateOpen(false)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
