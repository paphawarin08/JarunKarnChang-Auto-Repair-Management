// src/pages/PartCategoriesPage.jsx
// ================================================
// หน้า "หมวดหมู่อะไหล่"
// โฟลว์หลัก: subscribe รายชื่อหมวดแบบ realtime + subscribe summary สต็อกต่อหมวด
// ให้ค้นหาด้วยข้อความ, เพิ่มหมวด (พร้อมอัปโหลดไอคอนย่อส่วน), และลบหมวดได้
// ================================================

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Search, Image as ImageIcon } from "lucide-react";
import { MoreVertical, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "../../styles/Parts.css";
import { auth } from "../../firebase/firebase";
import {
  subscribePartCategories,          // ฟังรายการ "หมวด" แบบสด ๆ
  addPartCategory,                  // เพิ่มหมวดใหม่
  deletePartCategory,               // ลบหมวด
  subscribePartsSummaryByCategory,  // ★ ฟังสรุปสต็อกจาก parts ทั้งคอลเลกชันแบบ realtime (group by หมวด)
  updatePartCategory,               // แก้ไขหมวด
} from "../../services/partService";

/**
 * toBase64(file, max)
 * utility เล็ก ๆ สำหรับ "ย่อรูป" แล้วเปลี่ยนเป็น base64
 * - อ่านไฟล์รูป → สร้าง <img> → วาดลง <canvas> ขนาดย่อ (ไม่เกิน max px)
 * - ส่งกลับเป็น dataURL (jpeg) เอาไว้ preview/เก็บไอคอน
 * ปล. ใช้ Promise เพื่อรอขั้นตอนอ่านและโหลดรูปให้เสร็จก่อน
 */
const toBase64 = (file, max = 256) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(max / img.width, max / img.height, 1); // ย่อเท่าที่จำเป็น พอ
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85)); // คุณภาพกำลังดี ไม่เปลือง
    };
    img.onerror = reject;
    img.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function PartCategoriesPage() {
  const nav = useNavigate();

  // ---------- state หลัก ----------
  const [cats, setCats] = useState([]);        // รายชื่อหมวดทั้งหมด
  const [loading, setLoading] = useState(true);// โชว์ "กำลังโหลด..." ตอนแรก

  const [q, setQ] = useState("");              // คำค้นหา
  const [showAdd, setShowAdd] = useState(false);// เปิด/ปิด modal เพิ่มหมวด
  const [form, setForm] = useState({ name: "", icon: "" }); // ฟอร์มเพิ่มหมวด: ชื่อ + รูป
  const [saving, setSaving] = useState(false); // ป้องกันกดบันทึกซ้ำ

  const [menuOpenId, setMenuOpenId] = useState(null);     // id ของการ์ดที่เปิดเมนูอยู่
  const [showEdit, setShowEdit] = useState(false);        // modal แก้ไขหมวด
  const [editForm, setEditForm] = useState({ name: "", icon: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // ★ เก็บสรุปของแต่ละหมวด: { [catId]: { itemCount, stockSum } }
  // ใช้โชว์ pill "รวมสต็อก" และ "ทั้งหมดกี่รายการ" ใต้การ์ดหมวด
  const [stats, setStats] = useState({});

  // ---------- realtime: รายชื่อหมวด ----------
  // sub เปลี่ยนเมื่อมีใครเพิ่ม/ลบ/แก้ไขหมวดในระบบ → list ด้านหน้าอัปเดตทันที
  useEffect(() => {
    const unsub = subscribePartCategories(list => { setCats(list); setLoading(false); });
    return () => unsub && unsub();
  }, []);

  // ★ realtime: summary ต่อหมวด (นับจำนวนชนิด + รวมจำนวนสต็อก)
  // เบื้องหลัง service จะไปรวมข้อมูลจาก parts ทั้งหมด แล้วส่งกลับมาเป็น object
  useEffect(() => {
    const unsub = subscribePartsSummaryByCategory((stat) => {
      // stat ตัวอย่าง: { "catId1": { itemCount: 12, stockSum: 345 }, ... }
      setStats(stat || {});
    });
    return () => unsub && unsub();
  }, []);

  // ---------- filter สำหรับกล่องค้นหา ----------
  // useMemo เพื่อไม่ต้อง filter ใหม่ทุกรอบ ถ้า cats/q ไม่เปลี่ยน
  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return cats.filter(c => (c.name || "").toLowerCase().includes(t));
  }, [cats, q]);

  /**
   * handleAdd(e)
   * บันทึก "หมวดใหม่" จากฟอร์ม:
   * - validate ว่ามีชื่อหมวด
   * - ส่งไป service addPartCategory (แนบ userId เผื่อ logging)
   * - ปิด modal + รีเซ็ตฟอร์ม
   */
  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) return alert("กรุณากรอกชื่อหมวด");
    setSaving(true);
    try {
      await addPartCategory(form.name.trim(), form.icon, auth.currentUser?.uid || null);
      setShowAdd(false);
      setForm({ name: "", icon: "" });
    } catch (err) {
      console.error(err); alert("เพิ่มหมวดไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  /**
   * pickIcon(e)
   * เวลาเลือกไฟล์รูป → ย่อรูปด้วย toBase64 แล้วเก็บลง form.icon
   * ทำให้ preview ได้และอัปโหลดเบา ๆ
   */
  const pickIcon = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b64 = await toBase64(f, 192);
    setForm(prev => ({ ...prev, icon: b64 }));
  };

  /**
   * handleDelete(cat)
   * ลบหมวด (ต้อง confirm ก่อน)
   * หมายเหตุ: ถ้าลบไม่ผ่าน ส่วนใหญ่คือยังมีอะไหล่ในหมวดนั้นอยู่
   */
  const handleDelete = async (cat) => {
    if (!window.confirm(`ลบหมวด "${cat.name}" ?`)) return;
    try { await deletePartCategory(cat._id); }
    catch (e) { console.error(e); alert("ลบไม่สำเร็จ (อาจยังมีอะไหล่อยู่ในหมวด)"); }
  };

  /*---------------------------------- Edit Category -------------------------------------------------------*/
  // ใช้ย่อรูป (โค้ดเหมือน pickIcon เดิม แต่เขียนสำหรับ edit)
  const pickEditIcon = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b64 = await toBase64(f, 192);
    setEditForm(prev => ({ ...prev, icon: b64 }));
  };

  // เปิด modal แก้ไข
  const openEdit = (cat) => {
    setEditingCat(cat);
    setEditForm({ name: cat.name || "", icon: cat.icon || "" });
    setShowEdit(true);
    setMenuOpenId(null);
  };

  // บันทึกแก้ไข
  const handleEdit = async (e) => {
    e?.preventDefault?.();
    if (!editingCat?._id) return;
    if (!editForm.name.trim()) return alert("กรุณากรอกชื่อหมวด");
    setEditSaving(true);
    try {
      await updatePartCategory(editingCat._id, { name: editForm.name, icon: editForm.icon });
      setShowEdit(false);
      setEditingCat(null);
    } catch (err) {
      console.error(err);
      alert("แก้ไขไม่สำเร็จ");
    } finally {
      setEditSaving(false);
    }
  };
  /*-------------------------------------------------------------------------------------------------------*/

  return (
    <div className="customer-management">
      <header className="header1">
        <div className="header-left">
          {/* ปุ่มกลับหน้า Home */}
          <button className="back-button" onClick={() => nav("/admin/home")}><ArrowLeft size={24}/></button>
          <h1 className="page-title">อะไหล่</h1>
        </div>
      </header>

      <div className="main-content">
        {/* Search: หาหมวดตามชื่อแบบง่าย ๆ */}
        <div className="search-container" style={{maxWidth: "640px"}}>
          <div className="search-icon"><Search className="icon-md"/></div>
          <input className="search-input" placeholder="ค้นหาหมวด..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>

        {loading && <div className="loading-hint">กำลังโหลดหมวด…</div>}

        {/* Grid รายการหมวด: การ์ดแต่ละใบคลิกไปหน้ารายการอะไหล่ของหมวดนั้น */}
        <div className="part-cat-grid">
          {filtered.map(c => {
            const s = stats[c._id] || {};
            const itemsCount = s.itemCount ?? 0;  // จำนวนชนิดในหมวด
            const stockTotal = s.stockSum  ?? 0;  // รวมสต็อกในหมวด
            return (
              <div
                key={c._id}
                className="part-cat-card"
                onClick={()=>nav(`/admin/parts/${c._id}`)}
              >
                <div className="part-cat-top">
                  {/* ถ้ามีไอคอนก็โชว์รูป ไม่งั้นโชว์ placeholder */}
                  {c.icon
                    ? <img className="part-cat-icon" src={c.icon} alt={c.name} style={{objectFit:"contain"}}/>
                    : <div className="part-cat-icon placeholder"><ImageIcon/></div>}
                  <div className="part-cat-name">{c.name}</div>
                </div>

                <div className="part-cat-bottom" style={{gap: 8}}>
                  {/* pill สรุป: รวมสต็อก + จำนวนรายการในหมวด */}
                  <span className="stock-pill">รวมสต็อก: {stockTotal.toLocaleString()}</span>
                  <span className="stock-pill" style={{background:"#e5e7eb", color:"#111827"}}>ทั้งหมด: {itemsCount} รายการ</span>

                  {/* ปุ่ม 3 จุด + เมนู (แทนปุ่มลบเดิม) */}
                  <div style={{ marginLeft: "auto", position: "relative" }}>
                    <button
                      className="mini-kebab"
                      title="ตัวเลือก"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(prev => prev === c._id ? null : c._id); }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {menuOpenId === c._id && (
                      <div
                        className="kebab-menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute", right: 0, bottom: "calc(100% + 8px)",
                          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                          boxShadow: "0 8px 24px rgba(0,0,0,.08)", minWidth: 160, zIndex: 5
                        }}
                      >
                        <button
                          className="kebab-item"
                          onClick={() => openEdit(c)}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px" }}
                        >
                          <Pencil size={16}/> แก้ไข
                        </button>
                        <button
                          className="kebab-item"
                          onClick={() => handleDelete(c)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                            color: "#b91c1c"
                          }}
                        >
                          <Trash2 size={16}/> ลบ
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Add: ปุ่มเพิ่มหมวดลอยขวาล่าง */}
        <div className="action-buttons">
          <button className="add-button" onClick={()=>setShowAdd(true)}>
            <Plus className="icon-sm"/><span>เพิ่มประเภทอะไหล่</span>
          </button>
        </div>
      </div>

      {/* Modal เพิ่มหมวดใหม่ */}
      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          {/* คลิกด้านในไม่ปิด modal */}
          <div className="modal-box" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>เพิ่มประเภทอะไหล่</h3>
              <button className="icon-btn" onClick={()=>setShowAdd(false)}>×</button>
            </div>
            {/* form ครอบไว้เพื่อให้ Enter = submit ได้ */}
            <form onSubmit={handleAdd} className="modal-form">
              <div className="modal-body scrollable">
                <div className="form-grid">
                  <div className="form-group full">
                    <label>ชื่อหมวด*</label>
                    <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} required/>
                  </div>
                  <div className="form-group full">
                    <label>ไอคอน (รูปเล็ก .jpg/.png)</label>
                    <input type="file" accept="image/*" onChange={pickIcon}/>
                    {/* preview ไอคอนที่เลือก (base64) */}
                    {form.icon && <img src={form.icon} alt="preview" style={{marginTop:8, height:72, borderRadius:8, objectFit:"contain"}}/>}
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={saving}>{saving?"กำลังบันทึก…":"บันทึก"}</button>
                <button type="button" className="btn-outline" onClick={()=>setShowAdd(false)}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal แก้ไขหมวด (CSS แยกไฟล์ PartCategoryEditModal.css) */}
      {showEdit && (
        <div className="pc-edit-modal__overlay" onClick={() => setShowEdit(false)}>
          <div className="pc-edit-modal__box" onClick={(e)=>e.stopPropagation()}>
            <div className="pc-edit-modal__header">
              <h3>แก้ไขประเภทอะไหล่</h3>
              <button className="pc-edit-modal__icon-btn" onClick={()=>setShowEdit(false)}>×</button>
            </div>

            <form onSubmit={handleEdit} className="pc-edit-modal__form">
              <div className="pc-edit-modal__body">
                <div className="pc-edit-modal__grid">
                  <div className="pc-edit-modal__field full">
                    <label>ชื่อหมวด*</label>
                    <input
                      value={editForm.name}
                      onChange={(e)=>setEditForm({...editForm, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="pc-edit-modal__field full">
                    <label>ไอคอน (รูปเล็ก .jpg/.png)</label>
                    <input type="file" accept="image/*" onChange={pickEditIcon}/>
                    {editForm.icon && (
                      <img
                        src={editForm.icon}
                        alt="preview"
                        className="pc-edit-modal__preview"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="pc-edit-modal__actions">
                <button type="submit" className="btn-primary" disabled={editSaving}>
                  {editSaving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
                <button type="button" className="btn-outline" onClick={()=>setShowEdit(false)}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
