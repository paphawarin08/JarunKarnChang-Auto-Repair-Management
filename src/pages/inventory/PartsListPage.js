// src/pages/PartsListPage.jsx
// =====================================================
// หน้า "รายการอะไหล่" ของหมวด (category) ที่เลือก
// ภาพรวมฟีเจอร์:
// - ฟังรายการอะไหล่ในหมวดแบบ realtime
// - ฟัง "ล็อตการซื้อ (lots)" เพื่ออัปเดต stock และสถานะให้สด ๆ
// - เปิดดูรายละเอียดอะไหล่, แก้ไข, ลบ
// - ทำ "ซื้อเข้า" (เพิ่มสต๊อก) และ "ขาย/ตัดสต๊อก" (FIFO)
// - ค้นหา + sort ในตาราง/ลิสต์, อัปโหลดรูป (ย่อรูปเป็น base64 ก่อนโชว์)
// ปล. ใส่คอมเมนต์สไตล์เล่าให้เพื่อนเข้าใจ ไม่แตะ logic/พฤติกรรมเดิมครับ
// =====================================================

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Table, List, ChevronDown, Search, Plus, Pencil, Trash2,
  Image as ImageIcon, PackagePlus, ShoppingCart, Layers, History, X
} from "lucide-react";
import "../../styles/Parts.css";
import { auth } from "../../firebase/firebase";
import {
  subscribePartsByCategory, addPart, updatePart, deletePart,
  addPurchaseLot, sellPartFIFO,
  subscribeLots, subscribeLedger
} from "../../services/partService";

/* ====== options & helpers (ตัวเลือก dropdown + ยูทิลเล็ก ๆ) ====== */
const TYPE_OPTIONS  = ["อะไหล่แท้", "อะไหล่เทียม"];
const GRADE_OPTIONS = ["AAA", "AA", "A", "B", "C", "D"];
const STATUS_OPTIONS = ["มีอยู่ในสต๊อก", "ใกล้หมด", "หมดสต๊อก"];

const sortOptions = [
  { value: "code", label: "ไอดี" },
  { value: "name", label: "ชื่อ" },
  { value: "brand", label: "ยี่ห้อ" },
  { value: "stockQty", label: "คงเหลือ" },
  { value: "dateAdded", label: "วันที่เพิ่ม" },
];

// กรองให้เหลือเฉพาะตัวเลข (ไว้สำหรับ qty ขั้นต่ำ ฯลฯ)
const onlyInt = (v) => (v ?? "").toString().replace(/[^\d]/g, "");
// ตัวเลขทศนิยม (ราคาขาย/ต้นทุน)
const onlyNum = (v) =>
  (v ?? "").toString().replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

// >>> กฎตัดสินสถานะตามสต๊อกปัจจุบันกับขั้นต่ำ — ตัวนี้สำคัญสุด ๆ ในหน้า
const deriveStatus = (stock, min) => {
  const s = Number(stock || 0);
  const m = Number(min || 0);
  if (s <= 0) return "หมดสต๊อก";
  if (m > 0 && s < m) return "ใกล้หมด";
  return "มีอยู่ในสต๊อก";
};

// แปลงวันให้เป็น YYYY-MM-DD (รับได้หลายแบบ เผื่อค่าจาก Firestore)
function formatDate(val) {
  try {
    if (!val) return "-";
    if (typeof val.toDate === "function") {
      const d = val.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    if (val instanceof Date) {
      const d = val;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    if (typeof val === "number") {
      const d = new Date(val);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    if (typeof val === "string") return val;
    return String(val);
  } catch {
    return "-";
  }
}

// ย่อรูปให้กว้างไม่เกิน maxW แล้วคืนเป็น base64 (ไว้ preview/เก็บรูป)
const toBase64 = (file, maxW = 512) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxW / img.width, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = reject; img.src = reader.result;
  };
  reader.onerror = reject; reader.readAsDataURL(file);
});

/* === ปรับคำอธิบายในสมุดบัญชีให้เป็นไทยอ่านง่าย
   - ถ้าเป็นสไตล์ใหม่ (ไทย + R0000X) ก็ปล่อยตามเดิม
   - ถ้าเป็นสไตล์เก่า (อังกฤษ + docId) ให้แปลงเป็นไทยสั้น ๆ
*/
function formatLedgerNote(row) {
  const note = (row?.note || "").trim();

  // รูปแบบใหม่ (ไทย + R0000X) ปล่อยผ่าน
  if (/^(ใช้ในงานซ่อม|คืนจากงานซ่อม)\sR\d{5}$/u.test(note)) return note;

  // แปลงรูปแบบอังกฤษ + docId เก่า
  if (/^use in repair\s/i.test(note)) return "ใช้ในงานซ่อม";
  if (/^return from repair\s/i.test(note)) return "คืนจากงานซ่อม";

  return note || "-";
}

export default function PartsListPage() {
  const { categoryId } = useParams();
  const nav = useNavigate();

  // โหมดมุมมอง + ค้นหา/เรียง + state โหลด
  const [view, setView] = useState("table");
  const [q, setQ] = useState("");
  const [sortField, setSortField] = useState("dateAdded");
  const [sortDirection, setSortDirection] = useState("desc");
  const [loading, setLoading] = useState(true);

  // รายการอะไหล่ในหมวด
  const [items, setItems] = useState([]);

  // โมดัลรายละเอียด + แก้ไข
  const [selected, setSelected] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({});

  // โมดัลเพิ่มใหม่
  const [showAdd, setShowAdd] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [newForm, setNewForm] = useState({
    code: "", name: "", brand: "",
    type: "", grade: "",
    sellPrice: "", minimumStock: "",
    status: "หมดสต๊อก",
    note: "", image: ""
  });

  // แท็บในรายละเอียด: lots (ประวัติซื้อ) + ledger (สมุดบัญชี)
  const [lots, setLots] = useState([]);
  const [ledger, setLedger] = useState([]);

  // liveStock = ผลรวม qtyRemaining ของทุกล็อต → ใช้ sync แสดงผลให้ตรง
  const liveStock = useMemo(
    () => lots.reduce((sum, l) => sum + Number(l.qtyRemaining || 0), 0),
    [lots]
  );

  /* ===== subscribe list — ฟังรายการอะไหล่ในหมวดแบบ realtime =====
     เวลาเปลี่ยน categoryId หรือฐานข้อมูลเปลี่ยน → อัปเดตรายการและปิดโหลด
     ถ้าเปิดหน้ารายละเอียดค้างไว้ จะพยายาม sync รายการนั้นให้เป็นข้อมูลล่าสุดด้วย
  */
  useEffect(() => {
    setLoading(true);
    const unsub = subscribePartsByCategory(categoryId, (list) => {
      setItems(list);
      setLoading(false);
      // sync รายการที่กำลังเปิด detail อยู่ (ถ้ามี)
      setSelected(prev => prev ? list.find(x => x._id === prev._id) || null : prev);
    });
    return () => unsub && unsub();
  }, [categoryId]);

  /* ===== itemIdsKey — ทำ key ไว้ trigger effect สำหรับ lots อย่างสะอาด ๆ =====
     เราจะรวม _id ของทุกชิ้น เรียงแล้ว join เป็น string
     เพื่อใช้เป็น dependency เดียวใน effect ด้านล่าง (subscribe lots รายชิ้น)
  */
  const itemIdsKey = useMemo(
    () => items.map(i => i._id).filter(Boolean).sort().join("|"),
    [items]
  );

  /* ===== subscribe lots ของ "ทุกชิ้น" ที่อยู่ในตาราง =====
     โหดมันส์ฮา: เปิด sub ทีละชิ้น → สรุป stock (qtyRemaining รวม) แล้ว
     อัปเดตทั้งในตาราง + ใน detail (ถ้ากำลังดูชิ้นนั้น)
     พร้อมคำนวณสถานะใหม่ด้วย deriveStatus
  */
  useEffect(() => {
    if (!itemIdsKey) return;

    const ids = itemIdsKey.split("|").filter(Boolean);
    if (!ids.length) return;

    const unsubs = ids.map(id =>
      subscribeLots(id, (ls) => {
        const sum = ls.reduce((s, l) => s + Number(l.qtyRemaining || 0), 0);

        // อัปเดตค่าในตาราง
        setItems(prev =>
          prev.map(x =>
            x._id === id
              ? { ...x, stockQty: sum, status: deriveStatus(sum, x.minimumStock) }
              : x
          )
        );

        // ถ้าเปิด detail ของชิ้นนี้อยู่ ให้ sync ด้วย
        setSelected(prev =>
          prev && prev._id === id
            ? { ...prev, stockQty: sum, status: deriveStatus(sum, prev.minimumStock) }
            : prev
        );
      })
    );

    return () => { unsubs.forEach(u => u && u()); };
  }, [itemIdsKey]);

  /* ===== subscribe แท็บของ "ชิ้นที่เลือก" เท่านั้น =====
     เปิด detail เมื่อไหร่ → ค่อยฟัง lots และ ledger ของชิ้นนั้นแบบ realtime
  */
  useEffect(() => {
    if (!showDetail || !selected?._id) return;
    const u1 = subscribeLots(selected._id, setLots);
    const u2 = subscribeLedger(selected._id, setLedger);
    return () => { u1 && u1(); u2 && u2(); };
  }, [showDetail, selected?._id]);

  /* ===== sync liveStock → selected/items ขณะเปิด detail =====
     ถ้า sum ของ lots เปลี่ยน และไม่เท่ากับค่าใน selected → sync ให้ตรงกัน
     (กันเคสที่ lots วิ่งเร็วกว่า selected)
  */
  useEffect(() => {
    if (!showDetail || !selected?._id) return;
    const s = liveStock;

    if (s !== (selected.stockQty ?? 0)) {
      setSelected(prev => prev ? ({ ...prev, stockQty: s, status: deriveStatus(s, prev.minimumStock) }) : prev);
      setItems(prev => prev.map(x =>
        x._id === selected._id
          ? { ...x, stockQty: s, status: deriveStatus(s, x.minimumStock) }
          : x
      ));
    }
  }, [liveStock, showDetail, selected]);

  // normalize ไว้ sort (รับได้ทั้ง timestamp/Date/Firestore timestamp)
  const normalize = (v) => {
    if (v == null) return "";
    if (typeof v.toDate === "function") return String(v.toDate().getTime());
    if (v instanceof Date) return String(v.getTime());
    if (typeof v === "number") return String(v);
    return String(v);
  };

  // ท่อค้นหา+เรียง: filter ด้วย q (code/name/brand/type/grade) แล้วค่อย sort ตาม field/direction
  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    const base = items.filter(p =>
      (p.code || "").toLowerCase().includes(t) ||
      (p.name || "").toLowerCase().includes(t) ||
      (p.brand || "").toLowerCase().includes(t) ||
      (p.type || "").toLowerCase().includes(t) ||
      (p.grade || "").toLowerCase().includes(t)
    );
    return base.sort((a,b)=>{
      const av = normalize(a[sortField]); const bv = normalize(b[sortField]);
      return sortDirection === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [items, q, sortField, sortDirection]);

  /* ===== เปิด/ปิดรายละเอียด =====
     openDetail: ตั้ง selected + เปิดโมดัล + เตรียมฟอร์มแก้ไขให้พร้อม
  */
  const openDetail = (p) => {
    setSelected(p); setShowDetail(true); setEditMode(false);
    setEditForm({
      code: p.code || "", name: p.name || "", brand: p.brand || "",
      type: p.type || "", grade: p.grade || "",
      sellPrice: (p.sellPrice ?? "").toString(),
      minimumStock: (p.minimumStock ?? "").toString(),
      status: p.status || deriveStatus(p.stockQty, p.minimumStock),
      note: p.note || "", image: p.image || ""
    });
  };
  const closeDetail = () => { setShowDetail(false); setSelected(null); setEditMode(false); };

  /* ===== อัปโหลดรูป: ย่อรูปก่อนแล้วอัดเข้า form (new/edit) ===== */
  const handlePickImage = async (e, setter) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b = await toBase64(f, 640);
    setter(prev => ({ ...prev, image: b }));
  };

  /* ===== สร้าง / แก้ไข / ลบ — core CRUD ของรายการอะไหล่ ===== */
  const handleCreate = async (e) => {
    e?.preventDefault?.();
    if (!newForm.name.trim()) return alert("กรุณากรอกชื่ออะไหล่");

    const payload = {
      ...newForm,
      sellPrice: Number(onlyNum(newForm.sellPrice || "0")),
      minimumStock: Number(onlyInt(newForm.minimumStock || "0")),
      status: deriveStatus(0, Number(onlyInt(newForm.minimumStock || "0"))),
      categoryId
    };

    try {
      setSavingAdd(true);

      // service จะคืน {id, code} — เอามาใส่ list ให้เห็นผลทันที (แล้ว snapshot ค่อย sync อีกที)
      const { id, code } = await addPart(payload, auth.currentUser?.uid || null);

      setItems(prev => [
        { _id: id, ...payload, code, stockQty: 0, dateAdded: Date.now() },
        ...prev
      ]);

      setShowAdd(false);
      setNewForm({
        code: "", name: "", brand: "",
        type: "", grade: "",
        sellPrice: "", minimumStock: "",
        status: "หมดสต๊อก", note: "", image: ""
      });
    } catch (err) {
      console.error(err);
      alert("เพิ่มอะไหล่ไม่สำเร็จ");
    } finally {
      setSavingAdd(false);
    }
  };

  const saveEdit = async () => {
    if (!selected?._id) return;
    try {
      setSavingEdit(true);
      const payload = {
        ...editForm,
        sellPrice: Number(onlyNum(editForm.sellPrice || "0")),
        minimumStock: Number(onlyInt(editForm.minimumStock || "0")),
      };
      // สถานะอิงสต๊อกจริงของชิ้น + minimum ใหม่
      payload.status = deriveStatus(selected.stockQty, payload.minimumStock);
      await updatePart(selected._id, payload);
      setEditMode(false);
      // อัปเดตในทั้ง detail และตาราง
      setSelected(prev => prev ? ({ ...prev, ...payload }) : prev);
      setItems(prev => prev.map(x => x._id === selected._id ? { ...x, ...payload } : x));
    } catch (e) { console.error(e); alert("บันทึกไม่สำเร็จ"); }
    finally { setSavingEdit(false); }
  };

  const handleDelete = async () => {
    if (!selected?._id) return;
    if (!window.confirm(`ลบอะไหล่: ${selected.name || selected.code}?`)) return;
    try {
      // ลบแบบ optimistic — เอาออกจากจอไปก่อน
      setItems(prev => prev.filter(x => x._id !== selected._id));
      closeDetail();
      await deletePart(selected._id);
    } catch (e) {
      console.error(e);
      alert("ลบไม่สำเร็จ");
    }
  };

  /* ----- Actions: ซื้อเข้า / ขาย (FIFO) ----- */
  const [buyForm, setBuyForm] = useState({ qty: "", unitCost: "", purchasedAt: "", supplier: "", note: "" });
  const [sellForm, setSellForm] = useState({ qty: "", note: "" });
  const [savingAction, setSavingAction] = useState(false);

  // ซื้อเข้า: เพิ่ม lot ใหม่ + ดัน stock ขึ้นแบบ optimistic + คิดสถานะใหม่
  const doBuy = async () => {
    try {
      setSavingAction(true);
      const qty = Number(onlyInt(buyForm.qty));
      const unitCost = Number(onlyNum(buyForm.unitCost));
      if (!qty || unitCost < 0) return alert("จำนวน/ราคาต่อหน่วยไม่ถูกต้อง");

      await addPurchaseLot(
        selected._id,
        {
          qty, unitCost,
          purchasedAt: buyForm.purchasedAt || undefined,
          supplier: buyForm.supplier, note: buyForm.note
        },
        auth.currentUser?.uid || null,
        "WAC" // วิธีคำนวณต้นทุนเฉลี่ย (แม้ชื่อฟังก์ชันขายจะ FIFO แต่ฝั่งซื้อกำหนด method ได้)
      );

      // optimistic UI
      const newStock = (selected.stockQty || 0) + qty;
      const newStatus = deriveStatus(newStock, selected.minimumStock);
      setSelected(prev => prev ? ({ ...prev, stockQty: newStock, lastCost: unitCost, status: newStatus }) : prev);
      setItems(prev => prev.map(x => x._id === selected._id ? { ...x, stockQty: newStock, status: newStatus, lastCost: unitCost } : x));

      setBuyForm({ qty:"", unitCost:"", purchasedAt:"", supplier:"", note:"" });
    } catch(e){ console.error(e); alert("ซื้อเข้าไม่สำเร็จ"); }
    finally { setSavingAction(false); }
  };

  // ขาย/ตัดสต๊อก: ใช้ sellPartFIFO → ลด stock แบบตามลำดับล็อต
  const doSell = async () => {
    try {
      setSavingAction(true);
      const qty = Number(onlyInt(sellForm.qty));
      if (!qty) return alert("จำนวนไม่ถูกต้อง");

      await sellPartFIFO(
        selected._id,
        { qty, note: sellForm.note },
        auth.currentUser?.uid || null
      );

      // optimistic UI
      const newStock = (selected.stockQty || 0) - qty;
      const newStatus = deriveStatus(newStock, selected.minimumStock);
      setSelected(prev => prev ? ({ ...prev, stockQty: newStock, status: newStatus }) : prev);
      setItems(prev => prev.map(x => x._id === selected._id ? { ...x, stockQty: newStock, status: newStatus } : x));

      setSellForm({ qty:"", note:"" });
    } catch(e){ console.error(e); alert("ขาย/ตัดสต๊อกไม่สำเร็จ"); }
    finally { setSavingAction(false); }
  };

  
  return (
    <div className="customer-management">
      <header className="header1">
        <div className="header-left">
          <button className="back-button" onClick={()=>nav("/admin/parts")}><ArrowLeft size={24}/></button>
          <h1 className="page-title">รายการอะไหล่</h1>
        </div>
      </header>

      <div className="main-content">
        {/* สลับโหมดมุมมอง + ตัวเลือก sort + กล่องค้นหา */}
        <div className="controls">
          <div className="controls-left">
            <div className="view-toggle">
              <button onClick={()=>setView("table")} className={`view-button ${view==="table"?"active":"inactive"}`}><Table className="icon-sm"/><span>ตาราง</span></button>
              <button onClick={()=>setView("list")} className={`view-button ${view==="list"?"active":"inactive"}`}><List className="icon-sm"/><span>รายการ</span></button>
            </div>

            <div className="sort-container">
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e)=>{const [f,d]=e.target.value.split("-"); setSortField(f); setSortDirection(d);}}
                className="sort-select"
              >
                {sortOptions.map(o=>(
                  <React.Fragment key={o.value}>
                    <option value={`${o.value}-asc`}>{o.label} (น้อย→มาก)</option>
                    <option value={`${o.value}-desc`}>{o.label} (มาก→น้อย)</option>
                  </React.Fragment>
                ))}
              </select>
              <ChevronDown className="sort-dropdown-icon"/>
            </div>
          </div>

          <div className="search-container">
            <div className="search-icon"><Search className="icon-md"/></div>
            <input className="search-input" placeholder="ค้นหา ไอดี/ชื่อ/ยี่ห้อ/ประเภท/เกรด" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>

        {/* Table */}
        {view==="table" && (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th>ไอดี</th>
                    <th>รูป</th>
                    <th>ชื่อ</th>
                    <th>ยี่ห้อ</th>
                    <th>ประเภท</th>
                    <th>เกรด</th>
                    <th>คงเหลือ</th>
                    <th>ราคาขาย (บาท)</th>
                    <th>ขั้นต่ำ (แจ้งเตือนเมื่อของใกล้หมด)</th>
                    <th>สถานะ</th>
                    <th>หมายเหตุ</th>
                    <th>วันที่เพิ่ม</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filtered.length === 0 ? (
                    <tr className="table-row">
                      <td className="table-cell empty-cell" colSpan={12}>
                        {loading ? "เพิ่มข้อมูล หากเพิ่มแล้วข้อมูลกำลังโหลด…" : "ไม่มีข้อมูลในหมวดนี้"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map(p=>(
                      <tr key={p._id} className="table-row clickable" onClick={()=>openDetail(p)}>
                        <td className="table-cell">{p.code||"-"}</td>
                        <td className="table-cell">
                          {p.image
                            ? <img src={p.image} alt="" className="thumb" style={{height:42, width:56, objectFit:"contain"}}/>
                            : <div className="thumb placeholder" style={{height:42, width:56, display:"grid", placeItems:"center"}}><ImageIcon/></div>}
                        </td>
                        <td className="table-cell">{p.name||"-"}</td>
                        <td className="table-cell">{p.brand||"-"}</td>
                        <td className="table-cell">{p.type||"-"}</td>
                        <td className="table-cell">{p.grade||"-"}</td>
                        <td className="table-cell">{p.stockQty ?? 0}</td>
                        <td className="table-cell">{p.sellPrice || "-"}</td>
                        <td className="table-cell">{p.minimumStock || "-"}</td>
                        <td className="table-cell">{p.status || "-"}</td>
                        <td className="table-cell">{p.note || "-"}</td>
                        <td className="table-cell">{formatDate(p.dateAdded)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* List */}
        {view==="list" && (
          filtered.length === 0 ? (
            <div className="empty-list">
              {loading ? "เพิ่มข้อมูล หากเพิ่มแล้วข้อมูลกำลังโหลด…" : "ไม่มีข้อมูลในหมวดนี้"}
            </div>
          ) : (
            <div className="list-container">
              {filtered.map(p=>(
                <div key={p._id} className="customer-card clickable" onClick={()=>openDetail(p)}>
                  <div className="card-content">
                    <div className="card-left">
                      {p.image
                        ? <img src={p.image} className="thumb-lg" alt="" style={{height:72, width:96, objectFit:"contain"}}/>
                        : <div className="thumb-lg placeholder" style={{height:72, width:96, display:"grid", placeItems:"center"}}><ImageIcon/></div>}
                      <div className="user-info">
                        <h3 className="customer-name">{p.name} <small style={{fontWeight:400, color:"#64748b"}}>({p.code})</small></h3>
                        <div className="customer-details">
                          <div className="detail-item"><strong>ยี่ห้อ:</strong> {p.brand||"-"}</div>
                          <div className="detail-item"><strong>ประเภท:</strong> {p.type||"-"}</div>
                          <div className="detail-item"><strong>เกรด:</strong> {p.grade||"-"}</div>
                          <div className="detail-item"><strong>คงเหลือ:</strong> {p.stockQty ?? 0}</div>
                          <div className="detail-item"><strong>ราคาขาย (บาท):</strong> {p.sellPrice || "-"}</div>
                          <div className="detail-item"><strong>เพิ่มเมื่อ:</strong> {formatDate(p.dateAdded)}</div>
                        </div>
                        {p.note && <div className="customer-note"><strong>หมายเหตุ: </strong>{p.note}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Floating Add */}
        <div className="action-buttons">
          <button className="add-button" onClick={()=>setShowAdd(true)}><Plus className="icon-sm"/><span>เพิ่มอะไหล่</span></button>
        </div>
      </div>

      {/* ====== Add Part ====== */}
      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="modal-box wide" style={{maxWidth: "1040px"}} onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>เพิ่มอะไหล่</h3><button className="icon-btn" onClick={()=>setShowAdd(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleCreate} className="modal-form">
              <div className="modal-body scrollable">
                <div className="form-grid">

                  <div className="form-group"><label>ชื่อ*</label>
                    <input required value={newForm.name} onChange={e=>setNewForm({...newForm, name:e.target.value})}/>
                  </div>
                  <div className="form-group"><label>ยี่ห้อ</label>
                    <input value={newForm.brand} onChange={e=>setNewForm({...newForm, brand:e.target.value})}/>
                  </div>

                  {/* ประเภท (Dropdown) */}
                  <div className="form-group"><label>ประเภท</label>
                    <select value={newForm.type} onChange={e=>setNewForm({...newForm, type:e.target.value})}>
                      <option value="">-- เลือกประเภท --</option>
                      {TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* เกรด (Dropdown) */}
                  <div className="form-group"><label>เกรด</label>
                    <select value={newForm.grade} onChange={e=>setNewForm({...newForm, grade:e.target.value})}>
                      <option value="">-- เลือกเกรด --</option>
                      {GRADE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* ราคาขาย – ตัวเลข */}
                  <div className="form-group"><label>ราคาขาย (บาท)</label>
                    <input inputMode="decimal" value={newForm.sellPrice}
                      onChange={e=>setNewForm({...newForm, sellPrice: onlyNum(e.target.value)})}/>
                  </div>

                  {/* ขั้นต่ำ – ตัวเลข */}
                  <div className="form-group"><label>จำนวนขั้นต่ำ (แจ้งเตือนเมื่อของใกล้หมด)</label>
                    <input inputMode="numeric" value={newForm.minimumStock}
                      onChange={e=>{
                        const v = onlyInt(e.target.value);
                        const st = deriveStatus(0, Number(v));
                        setNewForm(prev => ({ ...prev, minimumStock: v, status: st }));
                      }}/>
                  </div>

                  {/* สถานะ (Dropdown) */}
                  <div className="form-group"><label>สถานะ</label>
                    <select value={newForm.status} onChange={e=>setNewForm({...newForm, status:e.target.value})}>
                      {STATUS_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* หมายเหตุ */}
                  <div className="form-group full"><label>หมายเหตุ</label>
                    <input value={newForm.note} onChange={e=>setNewForm({...newForm, note:e.target.value})}/>
                  </div>

                  {/* รูปภาพ */}
                  <div className="form-group full">
                    <label>รูปภาพ</label>
                    <input type="file" accept="image/*" onChange={(e)=>handlePickImage(e, setNewForm)}/>
                    {newForm.image && (
                      <img src={newForm.image} alt="" style={{marginTop:8, height:110, width:160, objectFit:"contain", borderRadius:8}}/>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={savingAdd}>{savingAdd?"กำลังบันทึก…":"บันทึก"}</button>
                <button type="button" className="btn-outline" onClick={()=>setShowAdd(false)}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== Detail / Edit / Actions ====== */}
      {showDetail && selected && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-box wide" style={{maxWidth:"1400px"}} onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>รายละเอียดอะไหล่</h3><button className="icon-btn" onClick={closeDetail}><X size={18}/></button>
            </div>

            {!editMode ? (
              <>
                <div className="modal-body scrollable">
                  <div className="detail-grid">
                    <div><label>ไอดี:</label><span>{selected.code||"-"}</span></div>
                    <div><label>ชื่อ:</label><span>{selected.name||"-"}</span></div>
                    <div><label>ยี่ห้อ:</label><span>{selected.brand||"-"}</span></div>
                    <div><label>ประเภท:</label><span>{selected.type||"-"}</span></div>
                    <div><label>เกรด:</label><span>{selected.grade||"-"}</span></div>
                    <div><label>คงเหลือ:</label>
                      <span>{(selected.stockQty ?? 0) || liveStock}</span>
                    </div>
                    <div><label>Avg Cost:</label><span>{selected.avgCost ?? 0}</span></div>
                    <div><label>Last Cost:</label><span>{selected.lastCost ?? 0}</span></div>
                    <div><label>ราคาขาย (บาท):</label><span>{selected.sellPrice||"-"}</span></div>
                    <div><label>จำนวนขั้นต่ำ (แจ้งเตือนเมื่อของใกล้หมด):</label><span>{selected.minimumStock||"-"}</span></div>
                    <div className="full"><label>สถานะ:</label><span>{selected.status||"-"}</span></div>
                    <div className="full"><label>หมายเหตุ:</label><span>{selected.note||"-"}</span></div>
                    <div className="full">
                      <label>รูป:</label>
                      {selected.image
                        ? <img src={selected.image} className="thumb-xl" alt="" style={{height:160, width:220, objectFit:"contain"}}/>
                        : <div className="thumb-xl placeholder" style={{height:160, width:220, display:"grid", placeItems:"center"}}><ImageIcon/></div>}
                    </div>
                    <div><label>วันที่เพิ่ม:</label><span>{formatDate(selected.dateAdded)}</span></div>
                  </div>

                  {/* Actions: ซื้อเข้า / ขาย (FIFO) */}
                  <div className="actions-panel">
                    <div className="action-box">
                      <h4><PackagePlus size={16}/> ซื้อเข้า</h4>
                      <div className="row">
                        <input placeholder="จำนวน" inputMode="numeric"
                               value={buyForm.qty} onChange={e=>setBuyForm({...buyForm, qty: onlyInt(e.target.value)})}/>
                        <input placeholder="ราคาต่อหน่วย" inputMode="decimal"
                               value={buyForm.unitCost} onChange={e=>setBuyForm({...buyForm, unitCost: onlyNum(e.target.value)})}/>
                        <input type="date" value={buyForm.purchasedAt} onChange={e=>setBuyForm({...buyForm, purchasedAt:e.target.value})}/>
                      </div>
                      <div className="row">
                        <input placeholder="ผู้ขาย/ซัพพลายเออร์" value={buyForm.supplier} onChange={e=>setBuyForm({...buyForm, supplier:e.target.value})}/>
                        <input placeholder="หมายเหตุ" value={buyForm.note} onChange={e=>setBuyForm({...buyForm, note:e.target.value})}/>
                      </div>
                      <button className="btn-primary sm" onClick={doBuy} disabled={savingAction}>บันทึกซื้อเข้า</button>
                    </div>

                    <div className="action-box">
                      <h4><ShoppingCart size={16}/> ขาย/ตัดสต๊อก (FIFO)</h4>
                      <div className="row">
                        <input placeholder="จำนวน" inputMode="numeric"
                               value={sellForm.qty} onChange={e=>setSellForm({...sellForm, qty: onlyInt(e.target.value)})}/>
                      </div>
                      <div className="row">
                        <input placeholder="หมายเหตุ" value={sellForm.note} onChange={e=>setSellForm({...sellForm, note: e.target.value})}/>
                      </div>
                      <button className="btn-primary sm" onClick={doSell} disabled={savingAction}>บันทึกขาย/ตัด</button>
                    </div>
                  </div>

                  {/* Lots & Ledger */}
                  <div className="history-grid">
                    {/* ===== ล็อตการซื้อ ===== */}
                    <div className="history-box">
                      <h4><Layers size={16} /> ล็อตการซื้อ</h4>
                      <div className="history-table lots">
                        <div className="thead">
                          <div>วันที่</div><div>จำนวน</div><div>คงเหลือ</div><div>ราคา</div><div>ผู้ขาย</div><div>หมายเหตุ</div>
                        </div>
                        <div className="tbody">
                          {lots.map(l => (
                            <div key={l._id} className="tr">
                              <div>{formatDate(l.purchasedAt)}</div>
                              <div>{l.qtyPurchased}</div>
                              <div>{l.qtyRemaining}</div>
                              <div>{l.unitCost}</div>
                              <div>{l.supplier || "-"}</div>
                              <div className="note-cell">{l.note || "-"}</div>
                            </div>
                          ))}
                          {!lots.length && <div className="empty">ไม่มีข้อมูล</div>}
                        </div>
                      </div>
                    </div>

                    {/* ===== สมุดบัญชี ===== */}
                    <div className="history-box">
                      <h4><History size={16} /> สมุดบัญชี</h4>
                      <div className="history-table ledger">
                        <div className="thead">
                          <div>เวลา</div><div>ประเภท</div><div>เข้า</div><div>ออก</div><div>ยอด</div><div>หมายเหตุ</div>
                        </div>
                        <div className="tbody">
                          {ledger.map(g => (
                            <div key={g._id} className="tr">
                              <div>{formatDate(g.createdAt)}</div>
                              <div>{g.type}</div>
                              <div>{g.qtyIn || "-"}</div>
                              <div>{g.qtyOut || "-"}</div>
                              <div>{g.amount || "-"}</div>
                              <div className="note-cell">{formatLedgerNote(g)}</div>
                            </div>
                          ))}
                          {!ledger.length && <div className="empty">ไม่มีข้อมูล</div>}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn-primary" onClick={() => setEditMode(true)}><Pencil size={16}/> แก้ไข</button>
                  <button className="btn-danger" onClick={handleDelete}><Trash2 size={16}/> ลบ</button>
                  <button className="btn-outline" onClick={closeDetail}>ปิด</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body scrollable">
                  <div className="form-grid">
                    <div className="form-group"><label>ชื่อ*</label>
                      <input required value={editForm.name} onChange={e=>setEditForm({...editForm, name:e.target.value})}/>
                    </div>
                    <div className="form-group"><label>ยี่ห้อ</label>
                      <input value={editForm.brand} onChange={e=>setEditForm({...editForm, brand:e.target.value})}/>
                    </div>

                    {/* ประเภท/เกรด dropdown */}
                    <div className="form-group"><label>ประเภท</label>
                      <select value={editForm.type} onChange={e=>setEditForm({...editForm, type:e.target.value})}>
                        <option value="">-- เลือกประเภท --</option>
                        {TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>เกรด</label>
                      <select value={editForm.grade} onChange={e=>setEditForm({...editForm, grade:e.target.value})}>
                        <option value="">-- เลือกเกรด --</option>
                        {GRADE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>

                    <div className="form-group"><label>ราคาขาย (บาท)</label>
                      <input inputMode="decimal" value={editForm.sellPrice}
                             onChange={e=>setEditForm({...editForm, sellPrice: onlyNum(e.target.value)})}/>
                    </div>
                    <div className="form-group"><label>จำนวนขั้นต่ำ (แจ้งเตือนเมื่อของใกล้หมด)</label>
                      <input inputMode="numeric" value={editForm.minimumStock}
                             onChange={e=>{
                               const v = onlyInt(e.target.value);
                               const st = deriveStatus(selected.stockQty, Number(v));
                               setEditForm(prev=>({ ...prev, minimumStock: v, status: st }));
                             }}/>
                    </div>

                    {/* สถานะ dropdown */}
                    <div className="form-group"><label>สถานะ</label>
                      <select value={editForm.status} onChange={e=>setEditForm({...editForm, status:e.target.value})}>
                        {STATUS_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>

                    <div className="form-group full"><label>หมายเหตุ</label>
                      <input value={editForm.note} onChange={e=>setEditForm({...editForm, note:e.target.value})}/>
                    </div>
                    <div className="form-group full">
                      <label>รูปภาพ</label>
                      <input type="file" accept="image/*" onChange={(e)=>handlePickImage(e, setEditForm)}/>
                      {editForm.image && <img alt="" src={editForm.image} style={{marginTop:8, height:110, width:160, objectFit:"contain", borderRadius:8}}/>}
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn-primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit?"กำลังบันทึก…":"บันทึก"}</button>
                  <button className="btn-outline" onClick={()=>setEditMode(false)} disabled={savingEdit}>ยกเลิก</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
