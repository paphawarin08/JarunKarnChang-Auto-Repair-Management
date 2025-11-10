// src/pages/EmployeePage.js
// ===============================
// หน้าจัดการ "พนักงาน"
// โฟลว์หลัก: โหลดรายชื่อพนักงาน -> ค้นหา/เรียง -> ดูรายละเอียด/แก้ไข/ลบ
// + มี modal จัดการบัญชีผู้ใช้ที่ผูกกับพนักงาน (สร้าง/อัปเดต/ลบ หรือส่งอีเมลรีเซ็ต)
// ===============================

import React, { useEffect, useMemo, useState } from "react";
import {
  Search, Table, List, ChevronDown, MoreVertical, Plus, Trash2,
  ArrowLeft, Phone, User, X, Pencil, CalendarDays
} from "lucide-react";
import "../../styles/EmployeePage.css";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/firebase";

import {
  subscribeEmployees, addEmployee, deleteEmployee, updateEmployee
} from "../../services/employeeService";

// === services เกี่ยวกับ "บัญชีผู้ใช้" ที่จะไปผูกกับพนักงาน ===
// มีทั้งเวอร์ชันที่พึ่ง Cloud Functions (สาย Blaze) และเวอร์ชัน client (สาย Spark ฟรี)
import {
  createUserForEmployee,      // สร้าง user ผ่าน Cloud Functions
  updateUserForEmployee,      // อัปเดต user ผ่าน Cloud Functions
  deleteUserForEmployee,      // ลบ user ผ่าน Cloud Functions
  createUserForEmployeeClient,// fallback: สร้าง user ฝั่ง client (Spark)
  sendResetEmailForEmployee,  // ส่งอีเมลรีเซ็ตกรณีอัปเดตไม่ได้
} from "../../services/userService";

// helper เล็ก ๆ: แปลง Timestamp/string -> YYYY-MM-DD (ใช้โชว์ในตาราง/การ์ด)
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
    return val;
  } catch {
    return "-";
  }
}

// ตัวเลือกประเภทการจ้าง (ไว้ใส่ select และแปะป้ายใน UI)
const EMP_TYPES = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
];
const TYPE_LABEL = { "full-time": "Full-time", "part-time": "Part-time" };

// คอมโพเนนต์หลักของหน้านี้
const EmployeePage = () => {
  // === state หลักของหน้า ===
  const [view, setView] = useState("table");              // โหมดแสดงผล: ตาราง/การ์ด
  const [searchTerm, setSearchTerm] = useState("");       // คำค้นหา
  const [sortField, setSortField] = useState("name");     // ฟิลด์ที่ใช้เรียง
  const [sortDirection, setSortDirection] = useState("asc");
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState([]);         // รายการพนักงาน
  const [selected, setSelected] = useState(null);         // พนักงานที่กำลังเปิดดูรายละเอียด
  const [showDetail, setShowDetail] = useState(false);    // เปิด/ปิด modal รายละเอียด

  const [savingAdd, setSavingAdd] = useState(false);      // กันกดบันทึกซ้ำตอน "เพิ่ม"

  // === โหมดแก้ไขข้อมูลพื้นฐานของพนักงาน ===
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "", name: "", nickname: "", phoneNumber: "",
    role: "", type: "", additional: ""
  });

  // === modal เพิ่มพนักงานใหม่ ===
  const [showAdd, setShowAdd] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    id: "", name: "", nickname: "", phoneNumber: "",
    role: "", type: "", additional: ""
  });

  // === modal จัดการบัญชีผู้ใช้งาน (auth/user) ที่ผูกกับพนักงาน ===
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accEmail, setAccEmail] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [accRole, setAccRole] = useState("staff");
  const [accDisplayName, setAccDisplayName] = useState("");
  const [savingAcc, setSavingAcc] = useState(false);

  const navigate = useNavigate();

  // โหลด/subscribe รายชื่อพนักงานจาก service
  // ถ้าเปิด modal รายละเอียดอยู่ จะ sync รายการนั้นให้เป็นตัวล่าสุดด้วย
  useEffect(() => {
    const unsub = subscribeEmployees((list) => {
      setEmployees(list);
      setLoading(false);
      if (showDetail && selected?._id) {
        const latest = list.find(x => x._id === selected._id);
        if (latest) setSelected(latest);
      }
    });
    return () => unsub && unsub();
  }, [showDetail, selected?._id]);

  // เวลาเปิด modal จัดการรหัส ให้ prefill email/displayName/role ให้พอเป็นไกด์
  useEffect(() => {
    if (showAccountModal && selected) {
      setAccEmail(selected.userEmail || "");
      setAccDisplayName(selected.name || "");
      setAccRole(selected.role || "staff");
      setAccPassword("");
    }
  }, [showAccountModal, selected]);

  // ตัวเลือกสำหรับ dropdown sorting
  const sortOptions = [
    { value: "id", label: "ไอดี" },
    { value: "name", label: "ชื่อ" },
    { value: "nickname", label: "ชื่อเล่น" },
    { value: "phoneNumber", label: "เบอร์โทร" },
    { value: "role", label: "บทบาท" },
    { value: "type", label: "ประเภทการจ้าง" },
    { value: "dateAdded", label: "วันที่เพิ่ม" },
  ];

  const handleBack = () => navigate("/admin/home");
  const handleImportPage = () => navigate('/admin/employees/import');

  // ให้ค่าที่จะเอาไปเทียบเรียง (sort) เป็น string สม่ำเสมอ
  const normalize = (v) => {
    if (v == null) return "";
    if (typeof v.toDate === "function") return v.toDate().getTime().toString();
    return String(v);
  };

  // useMemo ตัวนี้คือ “ท่อค้นหา + เรียง” ของพนักงาน
  // 1) filter จากคำค้นหา (เช็คหลายฟิลด์) 2) sort ตามฟิลด์/ทิศทางที่เลือก
  const filteredAndSortedEmployees = useMemo(() => {
    const t = searchTerm.toLowerCase();
    let filtered = employees.filter((emp) =>
      (emp.id || "").toLowerCase().includes(t) ||
      (emp.name || "").toLowerCase().includes(t) ||
      (emp.nickname || "").toLowerCase().includes(t) ||
      (emp.role || "").toLowerCase().includes(t) ||
      (emp.type || "").toLowerCase().includes(t) ||
      (emp.additional || "").toLowerCase().includes(t) ||
      (emp.phoneNumber || "").includes(searchTerm)
    );

    return filtered.sort((a, b) => {
      const av = normalize(a[sortField]);
      const bv = normalize(b[sortField]);
      return sortDirection === "asc"
        ? av.localeCompare(bv, "th", { sensitivity: "base" })
        : bv.localeCompare(av, "th", { sensitivity: "base" });
    });
  }, [employees, searchTerm, sortField, sortDirection]);

  // เปลี่ยนฟิลด์/ทิศทางเรียง เมื่อกดที่หัวคอลัมน์หรือเลือกจาก dropdown
  const handleSort = (field) => {
    if (sortField === field) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection("asc"); }
  };

  // เปิด modal รายละเอียด + ใส่ค่าเริ่มต้นสำหรับโหมดแก้ไข
  const openDetail = (emp) => {
    setSelected(emp);
    setEditMode(false);
    setEditForm({
      id: emp.id || "",
      name: emp.name || "",
      nickname: emp.nickname || "",
      phoneNumber: emp.phoneNumber || "",
      role: emp.role || "",
      type: emp.type || "",
      additional: emp.additional || "",
    });
    setShowDetail(true);
  };

  // ปิด modal รายละเอียด และออกจากโหมดแก้ไข
  const closeDetail = () => {
    setShowDetail(false);
    setSelected(null);
    setEditMode(false);
  };

  // สลับเข้า/ออกโหมดแก้ไข (ยกเลิกจะรีเซ็ตค่าจาก selected ล่าสุด)
  const startEdit = () => setEditMode(true);
  const cancelEdit = () => {
    if (selected) {
      setEditForm({
        id: selected.id || "",
        name: selected.name || "",
        nickname: selected.nickname || "",
        phoneNumber: selected.phoneNumber || "",
        role: selected.role || "",
        type: selected.type || "",
        additional: selected.additional || "",
      });
    }
    setEditMode(false);
  };

  // === CORE: บันทึกการแก้ไขพนักงาน (update) ===
  // เช็คฟิลด์จำเป็นก่อน -> ยิง service updateEmployee -> อัปเดต UI เฉพาะหน้า
  const saveEdit = async () => {
    if (!selected?._id) return;
    if (!editForm.name || !editForm.phoneNumber) {
      alert("กรุณากรอกชื่อและเบอร์โทร");
      return;
    }
    try {
      setSavingEdit(true);
      await updateEmployee(selected._id, {
        id: editForm.id || "",
        name: editForm.name || "",
        nickname: editForm.nickname || "",
        phoneNumber: editForm.phoneNumber || "",
        role: editForm.role || "",
        type: editForm.type || "",
        additional: editForm.additional || "",
        updatedBy: auth.currentUser?.uid || null,
      });
      setEditMode(false);
      setSelected(prev => prev ? ({ ...prev, ...editForm }) : prev);
    } catch (e) {
      console.error(e);
      alert("บันทึกการแก้ไขไม่สำเร็จ");
    } finally {
      setSavingEdit(false);
    }
  };

  // === เปิด/ปิด modal "เพิ่มพนักงาน" ===
  const openAdd = () => {
    setNewEmployee({
      id: "", name: "", nickname: "", phoneNumber: "",
      role: "", type: "", additional: ""
    });
    setShowAdd(true);
  };
  const closeAdd = () => setShowAdd(false);

  // === CORE: เพิ่มพนักงานใหม่ (create) ===
  // validate ฟิลด์จำเป็น -> ยิง service addEmployee -> ปิด modal
  const handleAddSubmit = async (e) => {
    e?.preventDefault?.();
    if (!newEmployee.name || !newEmployee.phoneNumber) {
      alert("กรุณากรอกชื่อและเบอร์โทร");
      return;
    }
    try {
      setSavingAdd(true);
      await addEmployee(newEmployee, auth.currentUser?.uid || null);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert("บันทึกพนักงานไม่สำเร็จ");
    } finally {
      setSavingAdd(false);
    }
  };

  // === CORE: ลบพนักงาน (delete) ===
  const handleDeleteSelected = async () => {
    if (!selected?._id) {
      alert("กรุณาเปิดหน้ารายละเอียดของพนักงานก่อน");
      return;
    }
    if (!window.confirm(`ยืนยันลบพนักงาน: ${selected.name || selected.id}?`)) return;
    try {
      await deleteEmployee(selected._id);
      closeDetail();
    } catch (err) {
      console.error(err);
      alert("ลบพนักงานไม่สำเร็จ");
    }
  };

  return (
    <div className="customer-management">
      {/* Header */}
      <header className="header1">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="page-title">พนักงาน</h1>
        </div>
        <div className="header-right-actions">
          <button className="import-button" onClick={handleImportPage}>นำเข้าข้อมูล</button>
        </div>
      </header>

      {/* Content */}
      <div className="main-content">
        {/* Controls: สลับมุมมอง + เรียง + ค้นหา */}
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
                onChange={(e) => {
                  const [field, direction] = e.target.value.split("-");
                  setSortField(field); setSortDirection(direction);
                }}
                className="sort-select"
              >
                {sortOptions.map(op => (
                  <React.Fragment key={op.value}>
                    <option value={`${op.value}-asc`}>{op.label} (น้อยไปมาก)</option>
                    <option value={`${op.value}-desc`}>{op.label} (มากไปน้อย)</option>
                  </React.Fragment>
                ))}
              </select>
              <ChevronDown className="sort-dropdown-icon" />
            </div>
          </div>

          <div className="search-container">
            <div className="search-icon"><Search className="icon-md" /></div>
            <input
              type="text"
              placeholder="ค้นหา ID/ชื่อ/ชื่อเล่น/เบอร์/บทบาท/ประเภท/หมายเหตุ"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {loading && <div className="loading-hint">กำลังโหลดข้อมูลพนักงาน…</div>}

        {/* Table View */}
        {view === "table" && !loading && (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th className="sortable" onClick={() => handleSort("id")}>
                      ไอดี {sortField === "id" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("name")}>
                      ชื่อ {sortField === "name" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("nickname")}>
                      ชื่อเล่น {sortField === "nickname" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("phoneNumber")}>
                      เบอร์โทร {sortField === "phoneNumber" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("role")}>
                      บทบาท {sortField === "role" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort("type")}>
                      ประเภทการจ้าง {sortField === "type" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                    <th>หมายเหตุเพิ่มเติม</th>
                    <th className="sortable" onClick={() => handleSort("dateAdded")}>
                      วันที่เพิ่ม {sortField === "dateAdded" && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filteredAndSortedEmployees.map((emp) => (
                    <tr key={emp._id} className="table-row clickable" onClick={() => openDetail(emp)} title="กดเพื่อดูรายละเอียด">
                      <td className="table-cell">{emp.id || "-"}</td>
                      <td className="table-cell">{emp.name || "-"}</td>
                      <td className="table-cell">{emp.nickname || "-"}</td>
                      <td className="table-cell">{emp.phoneNumber || "-"}</td>
                      <td className="table-cell">{emp.role || "-"}</td>
                      <td className="table-cell">{TYPE_LABEL[emp.type] || "-"}</td>
                      <td className="table-cell">{emp.additional || "-"}</td>
                      <td className="table-cell">{formatDate(emp.dateAdded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* List View */}
        {view === "list" && !loading && (
          <div className="list-container">
            {filteredAndSortedEmployees.map((emp) => (
              <div key={emp._id} className="customer-card clickable" onClick={() => openDetail(emp)} title="กดเพื่อดูรายละเอียด">
                <div className="card-content">
                  <div className="card-left">
                    <div className="user-avatar"><User className="icon-lg" /></div>
                    <div className="user-info">
                      <h3 className="customer-name">
                        {emp.name} {emp.nickname ? `(${emp.nickname})` : ""}
                      </h3>
                      <div className="customer-details">
                        <div className="detail-item"><strong>ID:</strong> {emp.id || "-"}</div>
                        <div className="detail-item"><Phone className="icon-sm" /><span>{emp.phoneNumber || "-"}</span></div>
                        <div className="detail-item"><span><strong>บทบาท:</strong> {emp.role || "-"}</span></div>
                        <div className="detail-item"><span><strong>ประเภทการจ้าง:</strong> {TYPE_LABEL[emp.type] || "-"}</span></div>
                        <div className="detail-item"><CalendarDays className="icon-sm" /><span>{formatDate(emp.dateAdded)}</span></div>
                      </div>
                      {emp.additional && <div className="customer-note"><strong>หมายเหตุ:</strong> {emp.additional}</div>}
                    </div>
                  </div>
                  <div className="card-actions">
                    <button className="more-button" onClick={(e) => { e.stopPropagation(); openDetail(emp); }}>
                      <MoreVertical className="icon-md" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Floating Add */}
        <div className="action-buttons">
          <button className="add-button" onClick={openAdd}>
            <Plus className="icon-sm" /><span>เพิ่มพนักงาน</span>
          </button>
        </div>
      </div>

      {/* ===== Detail Modal ===== */}
      {showDetail && selected && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>รายละเอียดพนักงาน</h3>
              <button className="icon-btn" onClick={closeDetail}><X size={18} /></button>
            </div>

            {/* โหมดดูรายละเอียด vs โหมดแก้ไข */}
            {!editMode ? (
              <>
                <div className="modal-body scrollable">
                  <div className="detail-grid">
                    <div><label>ไอดี:</label><span>{selected.id || "-"}</span></div>
                    <div><label>ชื่อ:</label><span>{selected.name || "-"}</span></div>
                    <div><label>ชื่อเล่น:</label><span>{selected.nickname || "-"}</span></div>
                    <div><label>เบอร์โทร:</label><span>{selected.phoneNumber || "-"}</span></div>
                    <div><label>บทบาท:</label><span>{selected.role || "-"}</span></div>
                    <div><label>ประเภทการจ้าง:</label><span>{selected.type || "-"}</span></div>
                    <div className="full"><label>หมายเหตุ:</label><span>{selected.additional || "-"}</span></div>
                    <div><label>วันที่เพิ่ม:</label><span>{formatDate(selected.dateAdded)}</span></div>
                    {/* โชว์บัญชีผู้ใช้ที่ผูกอยู่ (ถ้ามี) */}
                    <div className="full">
                      <label>บัญชีผู้ใช้ที่ผูก:</label>
                      <span>{selected.userId ? `${selected.userEmail || ""} (${selected.userId})` : "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn-outline" onClick={() => setShowAccountModal(true)}>จัดการรหัส</button>
                  <button className="btn-primary" onClick={startEdit}><Pencil size={16} /> แก้ไข</button>
                  <button className="btn-danger" onClick={handleDeleteSelected}><Trash2 size={16} /> ลบพนักงาน</button>
                  <button className="btn-outline" onClick={closeDetail}>ปิด</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body scrollable">
                  <div className="form-grid">
                    <div className="form-group"><label>ชื่อ*</label>
                      <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
                    </div>
                    <div className="form-group"><label>ชื่อเล่น</label>
                      <input value={editForm.nickname} onChange={e => setEditForm({ ...editForm, nickname: e.target.value })} />
                    </div>
                    <div className="form-group"><label>เบอร์โทร*</label>
                      <input value={editForm.phoneNumber} onChange={e => setEditForm({ ...editForm, phoneNumber: e.target.value })} required />
                    </div>
                    <div className="form-group"><label>บทบาท</label>
                      <input value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} />
                    </div>
                    <div className="form-group"><label>ประเภทการจ้าง</label>
                      <select
                        value={editForm.type}
                        onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                      >
                        <option value="">-- เลือกประเภท --</option>
                        {EMP_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group full"><label>หมายเหตุ</label>
                      <input value={editForm.additional} onChange={e => setEditForm({ ...editForm, additional: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn-primary" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                  <button className="btn-outline" onClick={cancelEdit} disabled={savingEdit}>ยกเลิก</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Add Modal ===== */}
      {showAdd && (
        <div
          className="modal-overlay"
          onClick={!savingAdd ? closeAdd : undefined}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เพิ่มพนักงาน</h3>
              <button className="icon-btn" onClick={closeAdd} disabled={savingAdd}>
                <X size={18} />
              </button>
            </div>

            {/* ฟอร์มเพิ่มพนักงานใหม่ (มี disabled ตอนกำลังบันทึก) */}
            <form onSubmit={handleAddSubmit} className="modal-form">
              <div className="modal-body scrollable">
                <div className="form-grid">
                  <div className="form-group"><label>ชื่อ*</label>
                    <input required disabled={savingAdd}
                      value={newEmployee.name}
                      onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group"><label>ชื่อเล่น</label>
                    <input disabled={savingAdd}
                      value={newEmployee.nickname}
                      onChange={e => setNewEmployee({ ...newEmployee, nickname: e.target.value })}
                    />
                  </div>
                  <div className="form-group"><label>เบอร์โทร*</label>
                    <input required disabled={savingAdd}
                      value={newEmployee.phoneNumber}
                      onChange={e => setNewEmployee({ ...newEmployee, phoneNumber: e.target.value })}
                    />
                  </div>
                  <div className="form-group"><label>บทบาท</label>
                    <input disabled={savingAdd}
                      value={newEmployee.role}
                      onChange={e => setNewEmployee({ ...newEmployee, role: e.target.value })}
                    />
                  </div>
                  <div className="form-group"><label>ประเภทการจ้าง</label>
                    <select disabled={savingAdd}
                      value={newEmployee.type}
                      onChange={e => setNewEmployee({ ...newEmployee, type: e.target.value })}
                    >
                      <option value="">-- เลือกประเภท --</option>
                      {EMP_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group full"><label>หมายเหตุ</label>
                    <input disabled={savingAdd}
                      value={newEmployee.additional}
                      onChange={e => setNewEmployee({ ...newEmployee, additional: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={savingAdd}>
                  {savingAdd ? "กำลังบันทึก…" : (<><Plus size={16} /> บันทึก</>)}
                </button>
                <button type="button" className="btn-outline" onClick={closeAdd} disabled={savingAdd}>
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Account Management Modal ===== */}
      {showAccountModal && selected && (
        <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>จัดการรหัสพนักงาน</h3>
              <button className="icon-btn" onClick={() => setShowAccountModal(false)}><X size={18} /></button>
            </div>

            <div className="modal-body">
              {!selected.userId ? (
                // ==== เคส "ยังไม่มีบัญชี" → สร้างใหม่ ====
                <>
                  <div className="form-grid">
                    <div className="form-group full"><label>อีเมล</label>
                      <input type="email" value={accEmail} onChange={(e)=>setAccEmail(e.target.value)} placeholder="name@company.com" />
                    </div>
                    <div className="form-group full"><label>Password ชั่วคราว</label>
                      <input type="password" value={accPassword} onChange={(e)=>setAccPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัว" />
                    </div>
                    <div className="form-group"><label>ชื่อที่แสดง</label>
                      <input value={accDisplayName} onChange={(e)=>setAccDisplayName(e.target.value)} />
                    </div>
                    <div className="form-group"><label>บทบาท</label>
                      <select value={accRole} onChange={(e)=>setAccRole(e.target.value)}>
                        <option value="staff">staff</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="btn-primary"
                      disabled={savingAcc}
                      onClick={async ()=>{
                        // CORE (บัญชี): สร้าง user ใหม่
                        // ลองเรียกฟังก์ชันบนคลาวด์ก่อน → ถ้าไม่มีให้ fallback ไป client
                        if(!accEmail || !accPassword) { alert("กรอก email และ password"); return; }
                        try {
                          setSavingAcc(true);
                          let res;
                          try {
                            res = await createUserForEmployee({
                              employeeId: selected._id,
                              email: accEmail,
                              password: accPassword,
                              displayName: accDisplayName || selected.name || "",
                              role: accRole,
                            });
                          } catch {
                            res = await createUserForEmployeeClient({
                              employeeId: selected._id,
                              email: accEmail,
                              password: accPassword,
                              displayName: accDisplayName || selected.name || "",
                              role: accRole,
                            });
                          }
                          await updateEmployee(selected._id, {
                            role: accRole,
                            updatedBy: auth.currentUser?.uid || null,
                          });
                          setSelected(prev => prev ? { ...prev, userId: res.uid, userEmail: accEmail } : prev);
                          alert("สร้างบัญชีผู้ใช้สำเร็จ");
                          setShowAccountModal(false);
                        } catch (err) {
                          console.error(err);
                          const msg = err?.message || err?.code || String(err);
                          alert("สร้างบัญชีไม่สำเร็จ: " + msg);
                        } finally {
                          setSavingAcc(false);
                        }
                      }}
                    >
                      {savingAcc ? "กำลังสร้าง…" : "สร้างบัญชีผู้ใช้"}
                    </button>
                    <button className="btn-outline" onClick={()=>setShowAccountModal(false)}>ปิด</button>
                  </div>
                </>
              ) : (
                // ==== เคส "มีบัญชีแล้ว" → อัปเดต/ลบ หรือส่งรีเซ็ตรหัส ====
                <>
                  <div className="form-grid">
                    <div className="form-group full"><label>UID (รหัสของผู้ใช้ในฐานข้อมูล)</label>
                      <input value={selected.userId} disabled />
                    </div>
                    <div className="form-group full"><label>อีเมลที่เชื่อมกับบัญชีนี้</label>
                      <input type="email" value={accEmail} onChange={(e)=>setAccEmail(e.target.value)} disabled/> 
                    </div>
                    <div className="form-group"><label>บทบาท</label>
                      <select value={accRole} onChange={(e)=>setAccRole(e.target.value)}>
                        <option value="staff">staff</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                  </div>

                  <div className="modal-actions" style={{justifyContent:"space-between"}}>
                    <button
                      className="btn-danger"
                      disabled={savingAcc}
                      onClick={async ()=>{
                        // CORE (บัญชี): ลบ/เลิกผูกบัญชี
                        if(!window.confirm("ลบบัญชีผู้ใช้นี้?")) return;
                        try{
                          setSavingAcc(true);
                          try {
                            await deleteUserForEmployee(selected.userId); // เส้นทาง Cloud Functions
                            setSelected(prev => prev ? { ...prev, userId: undefined, userEmail: undefined } : prev);
                            alert("ลบบัญชีผู้ใช้แล้ว");
                          } catch {
                            // เส้นทาง Spark: ลบเอกสาร users/{uid} + เคลียร์ลิงก์ใน employees/{id}
                            const { doc, setDoc, deleteDoc } = await import("firebase/firestore");
                            const { db } = await import("../../firebase/firebase");
                            if (selected.userId) {
                              await deleteDoc(doc(db, "users", selected.userId));
                            }
                            await setDoc(doc(db, "employees", selected._id), { userId: null, userEmail: null }, { merge: true });
                            setSelected(prev => prev ? { ...prev, userId: undefined, userEmail: undefined } : prev);
                            alert("เลิกผูกบัญชีแล้ว และลบข้อมูลผู้ใช้ใน Firestore เรียบร้อย (ถ้าต้องการลบออกจาก Auth ให้ลบใน Firebase Console)");
                          }
                          setShowAccountModal(false);
                        } catch(err){
                          console.error(err);
                          alert("ลบ/เลิกผูกไม่สำเร็จ: " + (err?.message || err?.code || String(err)));
                        } finally {
                          setSavingAcc(false);
                        }
                      }}
                    >
                      ลบ/เลิกผูกบัญชี
                    </button>

                    <div>
                      <button className="btn-outline" onClick={()=>setShowAccountModal(false)}>ปิด</button>
                      <button
                        className="btn-primary"
                        disabled={savingAcc}
                        onClick={async ()=>{
                          // CORE (บัญชี): อัปเดต (ถ้ามี Functions) หรือส่งอีเมลรีเซ็ตแทน
                          try{
                            setSavingAcc(true);
                            try {
                              await updateUserForEmployee({
                                uid: selected.userId,
                                email: accEmail !== selected.userEmail ? accEmail : undefined,
                                password: accPassword || undefined,
                                role: accRole,
                                displayName: accDisplayName || selected.name || "",
                              });
                              // เขียนซ้ำลง Firestore: users/{uid} เพื่อให้ role ตรงแน่ ๆ
                              await setDoc(
                                doc(db, "users", selected.userId),
                                {
                                  role: accRole,                                  // <-- จุดสำคัญ
                                  displayName: accDisplayName || selected.name || "",
                                  email: accEmail || selected.userEmail || "",
                                  updatedAt: serverTimestamp(),
                                  updatedBy: auth.currentUser?.uid || null,
                                },
                                { merge: true }
                              );

                              // ทำให้ collection employees สะท้อน role ใหม่ด้วย
                              await updateEmployee(selected._id, {
                                role: accRole,
                                updatedBy: auth.currentUser?.uid || null,
                              });
                              alert("อัปเดตบัญชีแล้ว");
                            } catch {
                              await sendResetEmailForEmployee(selected.userEmail || accEmail);
                              // แต่ role ใน Firestore ยังอัปเดตได้จากฝั่ง client
                              await setDoc(
                                doc(db, "users", selected.userId),
                                {
                                  role: accRole,                                  // <-- จุดสำคัญ
                                  displayName: accDisplayName || selected.name || "",
                                  email: selected.userEmail || accEmail || "",
                                  updatedAt: serverTimestamp(),
                                  updatedBy: auth.currentUser?.uid || null,
                                },
                                { merge: true }
                              );
                              // ทำให้ collection employees สะท้อน role ใหม่ด้วย
                              await updateEmployee(selected._id, {
                                role: accRole,
                                updatedBy: auth.currentUser?.uid || null,
                              });
                              alert("ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว");
                            }
                            setShowAccountModal(false);
                          } catch(err){
                            console.error(err);
                            alert("ดำเนินการไม่สำเร็จ: " + (err?.message || err?.code || String(err)));
                          } finally {
                            setSavingAcc(false);
                          }
                        }}
                      >
                        บันทึก / ส่งรีเซ็ตรหัส
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePage;
