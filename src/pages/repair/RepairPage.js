// src/pages/RepairPage.jsx
// โค้ดหน้านี้คือ "ศูนย์รวมงานซ่อม" ของระบบเราเลย
// มีทั้งลิสต์งาน, ค้นหา/จัดเรียง, เปิดดูรายละเอียด, เปลี่ยนสถานะ,
// คิดเงิน (billing) และ export ใบประเมิน ด้วย
// ผมจะพยายามคอมเมนต์ให้อ่านเพลิน ๆ แบบคุยกับเพื่อนในคลาสนะ :D

import React, { useEffect, useMemo, useState, useRef } from "react";
import { Search, Table, List, ChevronDown, ArrowLeft, Plus, Users, Copy, Check } from "lucide-react";
import "../../styles/RepairPage.css";
import { useNavigate } from "react-router-dom";
import {
  subscribeRepairs,          // ฟังก์ชัน service: ยิง realtime ข้อมูลงานซ่อมทั้งหมด
  updateRepairStatus,        // อัปเดตสถานะงาน
  subscribePartsUsed,        // realtime: อะไหล่ที่ใช้ในงาน
  subscribeCharges,          // realtime: ค่าใช้จ่าย (ค่าช่าง/อื่น ๆ/มัดจำ/ชำระเงิน)
  addCharge,                 // เพิ่มแถวค่าใช้จ่าย
  removeCharge,              // ลบแถวค่าใช้จ่าย
  setChargePaid,             // mark ว่าจ่ายแล้ว
  deleteRepair,              // ลบงานซ่อม (ถาวร)
} from "../../services/repairService";
import { auth, db } from "../../firebase/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { subscribeEmployees } from "../../services/employeeService";

import { formatDate, baht } from "../../utils/repairs/format";       // util: ฟอร์แมตวันที่/เงินบาท (ใช้โชว์ใน UI)
import { printRepairDoc } from "../../utils/repairs/printRepairDoc"; // util: สร้างหน้าพิมพ์เอกสารประเมิน
import BillingSection from "../../components/repairs/BillingSection"; // กล่องสรุปค่าใช้จ่าย
import DepositModal from "../../components/repairs/DepositModal";     // โมดอลตั้งมัดจำ
import TechStatusModal from "../../components/repairs/TechStatusModal";// โมดอลดูสถานะช่าง

const STATUS_OPTIONS = ["รับรถเข้าร้าน","ตรวจสอบเสร็จสิ้น","ระหว่างการซ่อม","ซ่อมเสร็จสิ้น"];




// ====== คอมโพเนนต์หลักของไฟล์นี้ (นับเป็น "ฟังก์ชันหลัก" ตัวใหญ่สุด) ======
export default function RepairPage() {
  const nav = useNavigate();

  // ==== state กลุ่มควบคุมมุมมอง + ค้นหา/เรียง ====
  const [view, setView] = useState("table");         // toggle ระหว่างมุมมอง table/list
  const [q, setQ] = useState("");                    // คีย์เวิร์ดค้นหา
  const [sortField, setSortField] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const copyTimerRef = useRef(null);
  const [copied, setCopied] = useState(false);  
  const [deleting, setDeleting] = useState(false);

  // ==== state ข้อมูลงานซ่อม และแถวที่เลือก ====
  const [items, setItems] = useState([]);            // ลิสต์งานซ่อมทั้งหมด
  const [selected, setSelected] = useState(null);    // งานที่กำลังเปิด modal รายละเอียด

  // ==== state ที่เกี่ยวกับรายละเอียดงาน (ฝั่ง modal) ====
  const [statusLogsSub, setStatusLogsSub] = useState([]); // log สถานะ (จาก subcollection)
  const [partsUsed, setPartsUsed] = useState([]);         // รายการอะไหล่ที่ใช้
  const [charges, setCharges] = useState([]);             // รายการค่าใช้จ่าย
  const [discount, setDiscount] = useState(0);            // ส่วนลด (กรอกเองใน billing)
  const [tempStatus, setTempStatus] = useState("");       // ค่าที่เลือกใน dropdown สถานะ
  const [statusNote, setStatusNote] = useState("");       // โน้ตของสถานะ

  // ==== state สำหรับเพิ่มค่าใช้จ่ายแบบ manual ====
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("labor");
  const [newAmount, setNewAmount] = useState("");

  // ==== data ช่าง + modal สถานะช่าง ====
  const [employees, setEmployees] = useState([]);   // รายชื่อพนักงาน/ช่าง
  const [empStats, setEmpStats] = useState({});     // สถิติผลงานของแต่ละคน
  const [empQ, setEmpQ] = useState("");             // ค้นหาช่างใน modal
  const [showTechModal, setShowTechModal] = useState(false);

  // ==== modal ตั้งมัดจำ ====
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositProcessing, setDepositProcessing] = useState(false);

  // ===== subscribe หลัก: งานซ่อม + พนักงาน + สถิติ =====
  useEffect(() => {
    // เปิดเพจมา ก็ผูก realtime เลย
    const unsubRepairs = subscribeRepairs(setItems);
    const unsubEmps = subscribeEmployees(setEmployees);

    // สถิติพนักงาน (เก็บเป็น collection แยก) เอามาโชว์ ranking/จำนวนปิดงาน
    const col = collection(db, "employee_stats");
    const unsubStats = onSnapshot(col, (snap) => {
      const m = {};
      snap.forEach(d => { const x = d.data(); m[d.id] = { totalDone: Number(x?.totalDone || 0) }; });
      setEmpStats(m);
    });

    // clear subscription ตอนออก
    return () => { unsubRepairs && unsubRepairs(); unsubEmps && unsubEmps(); unsubStats && unsubStats(); };
  }, []);

  // ===== subscribe รายละเอียดของงานที่เลือก (อะไหล่/ค่าใช้จ่าย/log) =====
  useEffect(() => {
    if (!selected?._id) return;

    // เวลาเปิด modal จะ sync สถานะล่าสุดมาใส่ dropdown ให้ด้วย
    setTempStatus(selected.status || "รับรถเข้าร้าน");

    // ผูก realtime subcollections ของงานที่กำลังดูอยู่
    const u1 = subscribePartsUsed(selected._id, setPartsUsed);
    const u2 = subscribeCharges(selected._id, setCharges);

    // log สถานะ (เรียงเก่าสุด -> ใหม่สุด)
    let u3 = null;
    try {
      const col = collection(db, "repairs", selected._id, "status_logs");
      const qy = query(col, orderBy("at", "asc"));
      u3 = onSnapshot(qy, (snap) => setStatusLogsSub(snap.docs.map((d) => d.data())));
    } catch {}
    return () => { u1 && u1(); u2 && u2(); u3 && u3(); };
  }, [selected?._id, selected?.status]);

  // ===== ฟิลเตอร์ + เรียงงานซ่อม (ฝั่งหน้า list/table) =====
  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    const base = items.filter((r) => {
      const name  = (r.customerName  || "").toLowerCase();
      const phone = (r.customerPhone || "").toLowerCase();
      const addr  = (r.customerAddress || "").toLowerCase();
      const model = (r.vehicleTitle || "").toLowerCase();
      const plate = (r.vehiclePlate || "").toLowerCase();
      return (
        (r.code || "").toLowerCase().includes(t) ||
        name.includes(t) || phone.includes(t) || addr.includes(t) || model.includes(t) || plate.includes(t)
      );
    });

    // แปลงค่าที่จะใช้ sort ให้เป็น string เทียบกันได้ชัวร์ ๆ
    const normalize = (v) => {
      if (!v) return "";
      if (typeof v.toDate === "function") return String(v.toDate().getTime());
      if (v instanceof Date) return String(v.getTime());
      if (typeof v === "number") return String(v);
      return String(v);
    };

    return base.sort((a, b) => {
      const av = normalize(a[sortField]);
      const bv = normalize(b[sortField]);
      return sortDirection === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [items, q, sortField, sortDirection]);

  // ===== แปลง parts/charges ให้กลายเป็นบรรทัดที่เอาไปโชว์/คิดเงินง่าย ๆ =====
  const partsLines = useMemo(() =>
    partsUsed.map((p) => {
      const qty = Number(p.qty || 0);
      const unit = Number(p.unitPrice || 0);
      return { id: p._id || p.partsUsedId || "", name: p.partName || p.name || "อะไหล่", qty, unitPrice: unit, total: qty * unit, kind: "part" };
    }), [partsUsed]
  );

  const chargeLines = useMemo(() =>
    (charges || [])
      .filter((c) => !c.deletedAt && String(c.type || "other").toLowerCase() !== "payment")
      .map((c) => {
        const type = String(c.type || "other").toLowerCase();
        return {
          id: c._id,
          name: c.name || (type === "labor" ? "ค่าช่าง" : type === "deposit" ? "เงินมัดจำ" : "ค่าใช้จ่ายอื่นๆ"),
          qty: 1,
          unitPrice: Number(c.amount || 0),
          total: Number(c.amount || 0),
          paid: !!c.paid,
          kind: "charge",
          type,
        };
      }), [charges]
  );

  // รวมยอดต่าง ๆ ไว้ใช้โชว์ + ตัดสินใจปุ่ม “ชำระครบ/ไม่ครบ”
  const allLines   = [...partsLines, ...chargeLines];
  const partsTotal = partsLines.reduce((s, x) => s + x.total, 0);
  const chargesTotal = chargeLines.reduce((s, x) => s + x.total, 0);
  const paidTotal  = (charges || []).filter((c) => !c.deletedAt && c.paid).reduce((s, c) => s + Number(c.amount || 0), 0);
  const subTotal   = partsTotal + chargesTotal;
  const balance    = Math.max(0, subTotal - Number(discount || 0) - paidTotal);
  const isSettled  = balance === 0;

  // โชว์ปุ่ม “ตั้งมัดจำ” เมื่อถึงจังหวะที่ควรตั้ง (หลังตรวจเช็คเสร็จ)
  const existingDeposit = useMemo(
    () => (charges || []).find((c) => c?.type === "deposit" && !c?.deletedAt),
    [charges]
  );
  const logs = Array.isArray(selected?.statusLogs) && selected?.statusLogs.length ? selected.statusLogs : statusLogsSub;
  const hadCheckedDone = useMemo(() => logs.some(l => String(l?.to ?? l?.status ?? "").trim() === "ตรวจสอบเสร็จสิ้น"), [logs]);
  const currentIsCheckedDone = selected?.status === "ตรวจสอบเสร็จสิ้น";
  const showDepositButton = !!selected?._id && (currentIsCheckedDone || hadCheckedDone) && selected.status !== "ซ่อมเสร็จสิ้น" && !existingDeposit;

  // ===== สรุปข้อมูลช่างสำหรับหน้า "สถานะช่าง" =====
  const empMap = useMemo(() => {
    const m = new Map();
    (employees || []).forEach(e => m.set(e._id, e));
    return m;
  }, [employees]);

  // งานที่กำลังทำอยู่ต่อช่างแต่ละคน
  const activeByEmp = useMemo(() => {
    const res = {};
    (items || []).forEach(r => {
      const isDone = r.status === "ซ่อมเสร็จสิ้น";
      const assignees = Array.isArray(r.employees) ? r.employees : [];
      assignees.forEach(empId => {
        if (!res[empId]) res[empId] = [];
        if (!isDone) res[empId].push({ code: r.code || "-", status: r.status || "-", vehicle: r.vehicleTitle || r.vehiclePlate || "-", id: r._id });
      });
    });
    return res;
  }, [items]);

  // หา “ดาวซัลโว” = คนที่ปิดงานได้มากสุด (เอาไว้ติด badge TOP)
  const topFinishers = useMemo(() => {
    const entries = Object.entries(empStats);
    if (!entries.length) return [];
    const max = Math.max(...entries.map(([, v]) => Number(v?.totalDone || 0)));
    if (max <= 0) return [];
    return entries.filter(([, v]) => Number(v?.totalDone || 0) === max).map(([id]) => id);
  }, [empStats]);

  // เอาข้อมูลช่าง + งานที่ทำ/งานที่ปิด ไปเรียงก่อนเอาไปโชว์ใน modal
  const filteredSortedEmployees = useMemo(() => {
    const q = empQ.trim().toLowerCase();
    const withMeta = (employees || []).map(e => {
      const doing = (activeByEmp[e._id] || []).length;
      const done  = Number(empStats[e._id]?.totalDone || 0);
      return { emp: e, doing, done };
    }).filter(row => {
      if (!q) return true;
      const name = (row.emp.name || "").toLowerCase();
      const code = (row.emp.id || "").toLowerCase();
      const role = (row.emp.role || "").toLowerCase();
      return name.includes(q) || code.includes(q) || role.includes(q);
    });

    withMeta.sort((a, b) => {
      if (b.doing !== a.doing) return b.doing - a.doing;
      if (b.done  !== a.done)  return b.done  - a.done;
      return String(a.emp.name || "").localeCompare(String(b.emp.name || ""));
    });
    return withMeta;
  }, [employees, activeByEmp, empStats, empQ]);

  // ====== ACTION หลัก ๆ ฝั่งรายละเอียดงาน ======

  // (หลัก) ลบงานซ่อมทั้งงาน — ใช้ตอนเผลอสร้างผิดหรือซ้ำ
  const handleDeleteRepair = async () => {
    if (!selected?._id) return;
    if (deleting) return; // กันกดซ้ำระหว่างลบ
    if (!window.confirm(`ลบงานซ่อม ${selected.code || ""} ?\nการลบนี้เป็นการลบถาวร`)) return;
    try {
      setDeleting(true);
      await deleteRepair(selected._id, auth.currentUser?.uid || null);
      setItems((prev) => prev.filter((r) => r._id !== selected._id));
      setSelected(null);
      alert("ลบงานซ่อมเรียบร้อย");
    } catch (e) {
      console.error(e);
      alert("ลบงานซ่อมไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  };

  // (หลัก) เพิ่มแถวค่าใช้จ่ายใหม่ เช่น “ค่าช่าง”
  const addChargeRow = async () => {
    if (!selected?._id) return;
    const name = (newName || "").trim();
    const amt = Number(newAmount);
    if (!name) { alert("กรุณากรอกชื่อรายการ"); return; }
    if (!Number.isFinite(amt) || amt <= 0) { alert("จำนวนเงินไม่ถูกต้อง"); return; }

    const type = String(newType || "other").toLowerCase();
    try {
      await addCharge(selected._id, { name, type, amount: amt, paid: false }, auth.currentUser?.uid || null);
      setNewName(""); setNewAmount("");
    } catch (e) {
      console.error(e); alert("บันทึกค่าใช้จ่ายไม่สำเร็จ: " + (e?.message || e));
    }
  };

  // (หลัก) ลบแถวค่าใช้จ่าย
  const removeChargeRow = async (rowId) => {
    if (!selected?._id) return;
    if (!window.confirm("ลบรายการนี้?")) return;
    await removeCharge(selected._id, rowId);
  };

  // (หลัก) ทำเครื่องหมายว่า “จ่ายครบแล้วทั้งหมด” ถ้ายังเหลือ balance จะสร้างแถว payment ให้อัตโนมัติ
  const markAllPaid = async () => {
    if (!selected?._id) return;

    // 1) mark ค่าใช้จ่ายที่ยังไม่จ่ายให้เป็นจ่ายแล้ว
    const unpaid = charges.filter((c) => !c.deletedAt && !c.paid && c.type !== "payment");
    for (const row of unpaid) await setChargePaid(selected._id, row._id, true);

    // 2) คำนวณ balance เหลืออีกเท่าไหร่
    const partsTotalLocal = (partsUsed || []).reduce((s, p) => s + Number(p.qty || 0) * Number(p.unitPrice || 0), 0);
    const afterMark = (charges || []).filter((c) => !c.deletedAt)
      .map((c) => (unpaid.find((u) => u._id === c._id) ? { ...c, paid: true } : c));

    const nonPaymentCharges = afterMark.filter((c) => (c.type || "other") !== "payment");
    const chargesTotalLocal = nonPaymentCharges.reduce((s, c) => s + Number(c.amount || 0), 0);
    const paidTotalLocal = afterMark.filter((c) => c.paid).reduce((s, c) => s + Number(c.amount || 0), 0);

    const discountNum = Number(discount || 0);
    const subTotalLocal = partsTotalLocal + chargesTotalLocal;
    let balanceLocal = subTotalLocal - discountNum - paidTotalLocal;
    balanceLocal = Math.max(0, Math.round((balanceLocal + Number.EPSILON) * 100) / 100);

    // 3) ถ้ายังเหลือให้สร้างแถว payment ปิดยอด
    if (balanceLocal > 0) {
      await addCharge(selected._id, { name: "ชำระส่วนที่เหลือทั้งหมด", type: "payment", amount: balanceLocal, paid: true });
    }
    alert("ทำเครื่องหมายชำระเงินเรียบร้อย");
  };

  // ปุ่มขึ้น modal ตั้งมัดจำ (แค่เปิด/ปิด modal ไม่ถือเป็นฟังก์ชันหลัก)
  const openDepositModal  = () => { setDepositAmount(existingDeposit ? String(existingDeposit.amount || "") : ""); setShowDepositModal(true); };
  const closeDepositModal = () => { if (!depositProcessing) setShowDepositModal(false); };

  // (หลัก) บันทึก “เงินมัดจำ” แล้วอัพเดตสถานะเป็น “ตรวจสอบเสร็จสิ้น”
  const saveDepositAndUpdateStatus = async () => {
    if (!selected?._id) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) { alert("กรุณากรอกจำนวนเงินมัดจำเป็นตัวเลขมากกว่า 0"); return; }
    try {
      setDepositProcessing(true);

      // ถ้ามีมัดจำเดิมแล้ว และจำนวนเปลี่ยน ให้ลบทิ้งก่อน (กันซ้ำ)
      if (existingDeposit) {
        const prev = Number(existingDeposit.amount || 0);
        if (prev !== amt) await removeCharge(selected._id, existingDeposit._id);
      }
      // เพิ่มแถวมัดจำ (deposit) และทำเป็น paid ไว้เลย
      if (!existingDeposit || Number(existingDeposit.amount || 0) !== amt) {
        await addCharge(selected._id, { name: "เงินมัดจำ", type: "deposit", amount: amt, paid: true }, auth.currentUser?.uid || null);
      }

      // อัพเดตสถานะงาน -> "ตรวจสอบเสร็จสิ้น"
      await updateRepairStatus(
        selected._id,
        { status: "ตรวจสอบเสร็จสิ้น", note: statusNote || "", userId: auth.currentUser?.uid || null, needsDeposit: false }
      );
      setSelected((p) => (p ? { ...p, status: "ตรวจสอบเสร็จสิ้น" } : p));
      setStatusNote(""); setShowDepositModal(false);
      alert("บันทึกมัดจำและเปลี่ยนสถานะเรียบร้อย");
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถบันทึกมัดจำได้");
    } finally {
      setDepositProcessing(false);
    }
  };

  // (หลัก) กดเปลี่ยนสถานะงาน (ถ้าเลือก “ตรวจสอบเสร็จสิ้น” จะพาไปตั้งมัดจำก่อน)
  const applyStatus = async () => {
    if (!selected?._id) return;
    if (tempStatus === "ตรวจสอบเสร็จสิ้น") { openDepositModal(); return; }
    await updateRepairStatus(selected._id, { status: tempStatus, note: statusNote || "", userId: auth.currentUser?.uid || null });
    setSelected((prev) => (prev ? { ...prev, status: tempStatus } : prev));
    setStatusNote("");
    alert("เปลี่ยนสถานะแล้ว");
  };

  
  //Copy เลขงานซ่อม
   const copyJobCode = async () => {
   const code = selected?.code || "";
   if (!code) return;
   try {
     if (navigator?.clipboard?.writeText) {
       await navigator.clipboard.writeText(code);
     } else {
       // fallback แบบเดิม
       const ta = document.createElement("textarea");
       ta.value = code;
       ta.style.position = "fixed";
       ta.style.opacity = "0";
       document.body.appendChild(ta);
       ta.select();
       document.execCommand("copy");
       document.body.removeChild(ta);
     }
     setCopied(true);
     clearTimeout(copyTimerRef.current);
     copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
   } catch (e) {
     console.error(e);
     alert("คัดลอกไม่สำเร็จ");
   }
 };

  // (หลัก) Export เอกสารประเมิน/สรุปค่าใช้จ่าย เป็นหน้าพิมพ์
  const handleExport = () => {
    printRepairDoc({ selected, partsLines, chargeLines, subTotal, paidTotal, discount, balance });
  };

  // helper เปิดงานจาก modal สถานะช่าง (ถือเป็น utility เฉย ๆ)
  const onOpenJob = (list, id) => {
    const r = (list || []).find(x => x._id === id);
    if (r) setSelected(r);
  };

  return (
    <div className="repair-page">
      {/* เฮดเดอร์: ปุ่มกลับบ้าน + ปุ่มดูสถานะช่าง */}
      <header className="header1">
        <div className="header-left">
          <button className="back-button" onClick={() => nav("/admin/home")}><ArrowLeft size={24} /></button>
          <h1 className="page-title">งานซ่อม</h1>
        </div>
        <div className="header-right-actions" style={{ display: "flex", gap: 8 }}>
          <button className="import-button" onClick={() => setShowTechModal(true)} title="เช็คสถานะช่าง">
            <Users size={16} style={{ marginRight: 6 }} /> สถานะช่าง
          </button>
        </div>
      </header>

      {/* ส่วนลิสต์งาน + ควบคุมการมองเห็น/ค้นหา/จัดเรียง */}
      <div className="main-content">
        <div className="controls">
          <div className="controls-left">
            <div className="view-toggle">
              <button onClick={() => setView("table")} className={`view-button ${view === "table" ? "active" : "inactive"}`}>
                <Table className="icon-sm" /><span>ตาราง</span>
              </button>
              <button onClick={() => setView("list")} className={`view-button ${view === "list" ? "active" : "inactive"}`}>
                <List className="icon-sm" /><span>รายการ</span>
              </button>
            </div>

            <div className="sort-container">
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => { const [f, d] = e.target.value.split("-"); setSortField(f); setSortDirection(d); }}
                className="sort-select"
              >
                <option value="createdAt-desc">วันที่เพิ่ม (ใหม่ไปเก่า)</option>
                <option value="createdAt-asc">วันที่เพิ่ม (เก่าไปใหม่)</option>
                <option value="code-asc">รหัส (น้อยไปมาก)</option>
                <option value="code-desc">รหัส (มากไปน้อย)</option>
              </select>
              <ChevronDown className="sort-dropdown-icon" />
            </div>
          </div>

          <div className="search-container">
            <div className="search-icon"><Search className="icon-md" /></div>
            <input
              className="search-input"
              placeholder="ค้นหา: รหัส/ชื่อลูกค้า/เบอร์/ที่อยู่/รุ่น/ทะเบียน"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* มุมมองแบบตาราง */}
        {view === "table" && (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th>รหัส</th><th>ชื่อ</th><th>เบอร์</th><th>ที่อยู่</th><th>รุ่นรถ</th><th>ทะเบียนรถ</th><th>วันที่เพิ่ม</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filtered.map((r) => (
                    <tr key={r._id} className="table-row clickable" onClick={() => setSelected(r)}>
                      <td className="table-cell">{r.code || "-"}</td>
                      <td className="table-cell">{r.customerName || "-"}</td>
                      <td className="table-cell">{r.customerPhone || "-"}</td>
                      <td className="table-cell">{r.customerAddress || "-"}</td>
                      <td className="table-cell">{r.vehicleTitle || "-"}</td>
                      <td className="table-cell">{r.vehiclePlate || "-"}</td>
                      <td className="table-cell">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* มุมมองแบบการ์ด */}
        {view === "list" && (
          <div className="list-container">
            {filtered.map((r) => (
              <div key={r._id} className="customer-card clickable" onClick={() => setSelected(r)}>
                <div className="card-content">
                  <div className="card-left">
                    <div className="user-info">
                      <h3 className="customer-name">
                        {r.customerName || "-"} <small style={{ fontWeight: 400, color: "#64748b" }}>({r.code})</small>
                      </h3>
                      <div className="customer-details">
                        <div className="detail-item"><strong>เบอร์:</strong> {r.customerPhone || "-"}</div>
                        <div className="detail-item"><strong>รุ่น/ทะเบียน:</strong> {(r.vehicleTitle || "-")} / {(r.vehiclePlate || "-")}</div>
                        <div className="detail-item">
                          <strong>สถานะ:</strong> {r.status || "-"}
                          {(r.status === "ตรวจสอบเสร็จสิ้น" && !r.existingDeposit && (r.needsDeposit ?? true)) && (
                            <span className="paid-tag off" style={{ marginLeft: 8 }}>ต้องตั้งมัดจำ</span>
                          )}
                        </div>
                        <div className="detail-item"><strong>เพิ่มเมื่อ:</strong> {formatDate(r.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ปุ่มลอย เพิ่มงานซ่อม */}
        <div className="action-buttons-repair">
          <button className="add-button-repair" onClick={() => nav(`/admin/repairs/new`)}>
            <Plus className="icon-sm" /> เพิ่มงานซ่อม
          </button>
        </div>
      </div>

      {/* โมดอลรายละเอียดงาน */}
      {selected && (
        <div className="modal-overlay" onClick={() => !deleting && setSelected(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                รายละเอียดงาน: {selected.code}
                <button
                  className="icon-btn"
                  type="button"
                  title={copied ? "คัดลอกแล้ว" : "คัดลอกรหัสงาน"}
                  onClick={copyJobCode}
                  disabled={!selected?.code}
                  aria-label="คัดลอกรหัสงาน"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </h3>
              <button className="icon-btn" onClick={() => setSelected(null)}>×</button>
            </div>

            <div className="modal-body scrollable">
              {/* สรุปข้อมูลลูกค้า/รถ/สถานะ */}
              <div className="detail-grid">
                <div><label>ลูกค้า:</label><span>{selected.customerName || "-"}</span></div>
                <div><label>เบอร์:</label><span>{selected.customerPhone || "-"}</span></div>
                <div className="full"><label>ที่อยู่:</label><span>{selected.customerAddress || "-"}</span></div>
                <div className="full"><label>รถ:</label><span>{(selected.vehicleTitle || "-")} / {(selected.vehiclePlate || "-")}</span></div>
                <div><label>สถานะปัจจุบัน:</label><span>{selected.status || "-"}</span></div>
                <div><label>เพิ่มเมื่อ:</label><span>{formatDate(selected.createdAt)}</span></div>
              </div>

              {/* เปลี่ยนสถานะ + หมายเหตุ */}
              <div className="mt16">
                <label>เปลี่ยนสถานะ</label>
                <div className="form-grid">
                  <div className="form-group">
                    <select value={tempStatus} onChange={(e) => setTempStatus(e.target.value)}>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group full">
                    <input placeholder="หมายเหตุของสถานะนี้…" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                  </div>
                </div>
                <button className="btn-primary" onClick={applyStatus}>บันทึกสถานะ</button>
                {showDepositButton && (
                  <button className="btn-outline1" style={{ marginLeft: 8 }} onClick={() => setShowDepositModal(true)}
                          title="มีการตรวจสอบเสร็จสิ้นจากช่างมาก่อน — คลิกเพื่อตั้งมัดจำ">
                    ตั้งมัดจำ
                  </button>
                )}
              </div>

              {/* โซน Billing: จะโชว์เต็ม ๆ เมื่อสถานะงานเป็น “ซ่อมเสร็จสิ้น” */}
              {selected.status === "ซ่อมเสร็จสิ้น" ? (
                <BillingSection
                  allLines={allLines}
                  partsLines={partsLines}
                  chargeLines={chargeLines}
                  subTotal={subTotal}
                  paidTotal={paidTotal}
                  discount={discount}
                  setDiscount={setDiscount}
                  isSettled={isSettled}
                  newName={newName} setNewName={setNewName}
                  newType={newType} setNewType={setNewType}
                  newAmount={newAmount} setNewAmount={setNewAmount}
                  onAddCharge={addChargeRow}
                  onRemoveCharge={removeChargeRow}
                  onMarkPaid={(rowId) => setChargePaid(selected._id, rowId, true)}
                  onMarkAllPaid={markAllPaid}
                  onExport={handleExport}
                  balance={balance}
                  isAdminView
                />
              ) : (
                <div className="billing-hint">
                  ใบสรุปค่าใช้จ่ายจะแสดงเมื่อสถานะงานเป็น <strong>“ซ่อมเสร็จสิ้น”</strong>
                </div>
              )}
            </div>

            {/* ปุ่ม action ด้านล่างโมดอล */}
            <div className="modal-actions">
              <div className="mt16">
                <small>
                  ส่งรหัสนี้ให้ลูกค้าเพื่อใช้ค้นหา: <strong>{selected.code}</strong>
                </small>
              </div>

              <button className="btn-outline" onClick={handleExport}>
                ส่งออกเอกสาร
              </button>
              <button
                className="btn-outline"
                onClick={() => selected?._id && nav(`/admin/repairs/${selected._id}/edit`)}
              >
                แก้ไขงานซ่อม
              </button>
              <button className="btn-danger" onClick={handleDeleteRepair} disabled={deleting}>
                {deleting ? "กำลังลบ…" : "ลบงานซ่อม"}
              </button>
              <button className="btn-outline" onClick={() => setSelected(null)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* โมดอลตั้งมัดจำ */}
      <DepositModal
        open={showDepositModal}
        amount={depositAmount}
        setAmount={setDepositAmount}
        processing={depositProcessing}
        existingDeposit={existingDeposit}
        onClose={() => !depositProcessing && setShowDepositModal(false)}
        onSave={saveDepositAndUpdateStatus}
      />

      {/* โมดอลสถานะช่าง */}
      <TechStatusModal
        open={showTechModal}
        onClose={() => setShowTechModal(false)}
        empQ={empQ}
        setEmpQ={setEmpQ}
        employees={employees}
        empStats={empStats}
        activeByEmp={activeByEmp}
        topFinishers={topFinishers}
        empMap={empMap}
        items={items}
        filteredSortedEmployees={filteredSortedEmployees}
        onOpenJob={(id) => onOpenJob(items, id)}
      />
    </div>
  );
}
