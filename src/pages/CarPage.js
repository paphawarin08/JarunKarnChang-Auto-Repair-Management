// src/pages/CarPage.js
import React from "react";
import {
  Search, Table, List, ChevronDown, MoreVertical, Plus, Trash2,
  ArrowLeft, Hexagon, Car as CarIcon, CarFront, Caravan, Cog,
  X, Pencil, Image as ImageIcon, ExternalLink, CalendarDays
} from "lucide-react";
import "../styles/CarPage.css";

// 🧠 ตรงนี้คือ custom hook ที่รวม "สมอง" ของหน้านี้ไว้หมดแล้ว
// - จัดการ state, โหลด/คัดกรอง/จัดเรียงรถ, เปิด/ปิด modal, บันทึก/ลบ ฯลฯ
// - ข้อดี: ทำให้ component หลัก (CarPage) เน้นเรนเดอร์ UI อย่างเดียว
import { useCarPageLogic } from "../hooks/useCarPageLogic";

/* ===== ค่าคงที่สำหรับ Dropdown (ไว้เรนเดอร์ตัวเลือก) =====
   - อันนี้ไม่มี side-effect เป็นแค่ list ของ label ภาษาไทย/อังกฤษ
   - แยกไว้ด้านบนเพื่อแก้ทีหลังได้ง่าย ไม่ต้องวิ่งหาตาม JSX
*/
const CAR_TYPES = [
  "เก๋ง (Sedan)", "แฮทช์แบ็ก (Hatchback)", "กระบะ (Pickup)",
  "SUV", "MPV/Van", "สปอร์ต/คูเป้", "อื่นๆ"
];
const ENGINE_TYPES = [
  "เบนซิน (Gasoline)", "ดีเซล (Diesel)", "ไฮบริด (Hybrid)",
  "ปลั๊กอินไฮบริด (PHEV)", "ไฟฟ้า (EV)", "LPG/NGV", "อื่นๆ"
];
const TRANSMISSIONS = [
  "ธรรมดา (MT)", "อัตโนมัติ (AT)", "CVT", "DCT", "อื่นๆ"
];

/* ===== formatDate: แปลงวันจากหลายชนิดให้เป็น YYYY-MM-DD =====
   - รับค่าได้หลายรูปแบบ: Firestore Timestamp, Date, number(ms), string
   - โค้ดลักษณะนี้มีในไฟล์ก่อนหน้าแล้ว ⇒ ถือว่า "ซ้ำไอเดีย" เลย **ไม่นับเพิ่ม**
*/
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

/* ===== (นับ) CarPage: คอมโพเนนต์หลักของหน้า "รถยนต์" =====
   สรุป flow แบบย่อยง่าย:
   1) เรียก useCarPageLogic() เพื่อดึง state + handlers ที่เตรียมไว้
      - แยก concerns: logic อยู่ใน hook, ส่วนนี้ทำหน้าที่ "ประกอบ UI"
   2) state หลักที่น่ารู้:
      - view: 'table' หรือ 'list'   → ใช้สลับโหมดมุมมอง
      - searchTerm                   → คีย์เวิร์ดค้นหา (รองรับ #id, ยี่ห้อ/รุ่น/ทะเบียน/เจ้าของ)
      - sortField/sortDirection      → จัดเรียงตาม field/ทิศทาง
      - filteredAndSortedCars        → รายการรถ "หลังผ่าน" ค้นหา+เรียงแล้ว พร้อมโชว์
      - selected/showDetail/editMode → คุม modal รายละเอียด/โหมดแก้ไข
      - newCar/showAdd               → คุม modal เพิ่มรถใหม่
   3) handlers สำคัญที่ได้จาก hook:
      - handleBack                   → กลับหน้าเดิม/แดชบอร์ด
      - handleSort                   → เปลี่ยนเงื่อนไข sort
      - openDetail/closeDetail       → เปิด/ปิด modal รายละเอียดรถ
      - startEdit/cancelEdit/saveEdit→ เข้า/ออก/บันทึก โหมดแก้ไขรถคันที่เลือก
      - openAdd/closeAdd/handleAddSubmit
      - handleAddImagePicked/handleEditImagePicked → ย่อรูปก่อนบันทึก (≤1MB)
      - handleDeleteSelected         → ลบรถคันที่เลือก
      - Owner lookup ชุด: addOwner editOwner→ ผูก/เปลี่ยนเจ้าของจากหน้าลูกค้า*/
const CarPage = () => {
  // ✅ ดึงทุกอย่างจาก hook เดียว จัดระเบียบ state/handlers ให้คอมโพเนนต์นี้เรียบร้อย
  const {
    // state & setters
    view, setView,
    searchTerm, setSearchTerm,
    sortField, sortDirection, setSortField, setSortDirection,
    loading,
    selected, showDetail, editMode, savingEdit,
    editForm, setEditForm,
    showAdd, newCar, setNewCar,
    sortOptions, filteredAndSortedCars,

    // handlers
    handleBack,
    handleGoImport,
    handleSort,
    addOwnerMatches, editOwnerMatches,
    addOwnerQuery, setAddOwnerQuery,
    editOwnerQuery, setEditOwnerQuery,
    chooseAddOwner, clearAddOwner,
    chooseEditOwner, clearEditOwner,

    openDetail, closeDetail, startEdit, cancelEdit, saveEdit,
    openAdd, closeAdd, handleAddSubmit, handleDeleteSelected,
    handleAddImagePicked, handleEditImagePicked,
    gotoOwnerInCustomerPage,
  } = useCarPageLogic();

  // 📝 หมายเหตุ: ในโปรเจกต์จริง ตรงนี้จะมี JSX ยาวมาก (header, controls, table/list, modals)
  // เพื่อให้คำตอบโฟกัสที่ logic ผม "ตัด UI body ออก" ในคำตอบนี้เท่านั้น

  return (
    <div className="customer-management">
      {/* Header */}
      <header className="header1">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="page-title">รถยนต์</h1>
        </div>
      </header>

      {/* Content */}
      <div className="main-content">
        {/* Controls */}
        <div className="controls">
          <div className="controls-left">
            <div className="view-toggle">
              <button
                onClick={() => setView("table")}
                className={`view-button ${view === "table" ? "active" : "inactive"}`}
              >
                <Table className="icon-sm" />
                <span>ตาราง</span>
              </button>
              <button
                onClick={() => setView("list")}
                className={`view-button ${view === "list" ? "active" : "inactive"}`}
              >
                <List className="icon-sm" />
                <span>รายการ</span>
              </button>
            </div>
            <div className="sort-container">
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [f, d] = e.target.value.split("-");
                  setSortField(f);
                  setSortDirection(d);
                }}
                className="sort-select"
              >
                {sortOptions.map((o) => (
                  <React.Fragment key={o.value}>
                    <option value={`${o.value}-asc`}>{o.label} (น้อยไปมาก)</option>
                    <option value={`${o.value}-desc`}>{o.label} (มากไปน้อย)</option>
                  </React.Fragment>
                ))}
              </select>
              <ChevronDown className="sort-dropdown-icon" />
            </div>
          </div>

          <div className="search-container">
            <div className="search-icon">
              <Search className="icon-md" />
            </div>
            <input
              type="text"
              placeholder="ค้นหา (พิมพ์ id:4 หรือ #4 เพื่อหาเฉพาะรหัสรถ; ยี่ห้อ/รุ่น/ทะเบียน/เจ้าของ/…)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {loading && <div className="loading-hint">กำลังโหลดข้อมูลรถ…</div>}

        {/* Table View */}
        {view === "table" && !loading && (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th className="sortable" onClick={() => handleSort("id")}>
                      ไอดี{" "}
                      {sortField === "id" && (
                        <span className="sort-indicator">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th>รูป</th>
                    <th>เจ้าของ</th>
                    <th className="sortable" onClick={() => handleSort("brand")}>
                      ยี่ห้อ{" "}
                      {sortField === "brand" && (
                        <span className="sort-indicator">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th>รุ่น</th>
                    <th>ประเภทรถ</th>
                    <th>สี</th>
                    <th>ขนาดเครื่องยนต์</th>
                    <th>ประเภทเครื่องยนต์</th>
                    <th>ประเภทเกียร์</th>
                    <th>เลขทะเบียน</th>
                    <th>เลขไมล์</th>
                    <th className="sortable" onClick={() => handleSort("year")}>
                      ปี{" "}
                      {sortField === "year" && (
                        <span className="sort-indicator">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th>ข้อมูลเพิ่มเติม</th>
                    <th className="sortable" onClick={() => handleSort("dateAdded")}>
                      วันที่เพิ่ม{" "}
                      {sortField === "dateAdded" && (
                        <span className="sort-indicator">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filteredAndSortedCars.map((c) => (
                    <tr
                      key={c._id}
                      className="table-row clickable"
                      onClick={() => openDetail(c)}
                      title="กดเพื่อดูรายละเอียด"
                    >
                      <td className="table-cell">{c.id || "-"}</td>
                      <td className="table-cell">
                        {c.imageDataUrl ? (
                          <img className="car-thumb" src={c.imageDataUrl} alt="car" />
                        ) : (
                          <div className="car-thumb placeholder">
                            <ImageIcon size={16} />
                          </div>
                        )}
                      </td>
                      <td className="table-cell">
                        {c.ownerName
                          ? `${c.ownerName}${c.ownerCode ? ` (${c.ownerCode})` : ""}`
                          : c.ownBy || "-"}
                      </td>
                      <td className="table-cell">{c.brand || "-"}</td>
                      <td className="table-cell">{c.model || "-"}</td>
                      <td className="table-cell">{c.carType || "-"}</td>
                      <td className="table-cell">{c.color || "-"}</td>
                      <td className="table-cell">{c.engine || "-"}</td>
                      <td className="table-cell">{c.engineType || "-"}</td>
                      <td className="table-cell">{c.transmission || "-"}</td>
                      <td className="table-cell">{c.lPlate || "-"}</td>
                      <td className="table-cell">{c.odometer || "-"}</td>
                      <td className="table-cell">{c.year || "-"}</td>
                      <td className="table-cell">{c.additional || "-"}</td>
                      <td className="table-cell">{formatDate(c.dateAdded)}</td>
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
            {filteredAndSortedCars.map((c) => (
              <div
                key={c._id}
                className="customer-card clickable"
                onClick={() => openDetail(c)}
                title="กดเพื่อดูรายละเอียด"
              >
                <div className="card-content">
                  <div className="card-left">
                    <div className="user-avatar">
                      {c.imageDataUrl ? (
                        <img className="user-avatar-img" src={c.imageDataUrl} alt="car" />
                      ) : (
                        <CarIcon className="icon-lg" />
                      )}
                    </div>
                    <div className="user-info">
                      <h3 className="customer-name">
                        {c.ownerName
                          ? `${c.ownerName}${c.ownerCode ? ` (${c.ownerCode})` : ""}`
                          : c.ownBy || "-"}
                      </h3>
                      <div className="customer-details">
                        <div className="detail-item">
                          <Hexagon className="icon-sm" />
                          <span>{c.brand || "-"}</span>
                        </div>
                        <div className="detail-item">
                          <CarFront className="icon-sm" />
                          <span>{c.model || "-"}</span>
                        </div>
                        <div className="detail-item">
                          <Caravan className="icon-sm" />
                          <span>{c.carType || "-"}</span>
                        </div>
                        <div className="detail-item">
                          <Cog className="icon-sm" />
                          <span>
                            {[c.engine, c.engineType, c.transmission]
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </span>
                        </div>
                        <div className="detail-item">
                          <CalendarDays className="icon-sm" />
                          <span>{formatDate(c.dateAdded)}</span>
                        </div>
                      </div>
                      {c.additional && (
                        <div className="customer-note">
                          <strong>หมายเหตุ:</strong> {c.additional}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      className="more-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(c);
                      }}
                    >
                      <MoreVertical className="icon-md" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAB */}
        <div className="action-buttons">
          <button className="add-button" onClick={openAdd}>
            <Plus className="icon-sm" />
            <span>เพิ่มรถ</span>
          </button>
        </div>
      </div>

      {/* ===== Detail Modal ===== */}
      {showDetail && selected && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>รายละเอียดรถ</h3>
              <button className="icon-btn" onClick={closeDetail}>
                <X size={18} />
              </button>
            </div>

            {!editMode ? (
              <>
                <div className="modal-body scrollable">
                  {selected.imageDataUrl && (
                    <div className="car-photo-lg-wrap">
                      <img className="car-photo-lg" src={selected.imageDataUrl} alt="car" />
                    </div>
                  )}
                  <div className="detail-grid">
                    <div><label>ไอดี:</label><span>{selected.id || "-"}</span></div>

                    <div className="full owner-line">
                      <label>เจ้าของ:</label>
                      <span>
                        {selected.ownerName
                          ? `${selected.ownerName}${selected.ownerCode ? ` (${selected.ownerCode})` : ""}`
                          : selected.ownBy || "-"}
                      </span>
                      {selected.ownerRefId && (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={gotoOwnerInCustomerPage}
                          title="เปิดหน้า Customer"
                        >
                          ดูข้อมูลลูกค้า <ExternalLink size={14} />
                        </button>
                      )}
                    </div>

                    <div><label>ยี่ห้อ:</label><span>{selected.brand || "-"}</span></div>
                    <div><label>รุ่น:</label><span>{selected.model || "-"}</span></div>
                    <div><label>ประเภทรถ:</label><span>{selected.carType || "-"}</span></div>
                    <div><label>สี:</label><span>{selected.color || "-"}</span></div>
                    <div><label>เครื่องยนต์:</label><span>{selected.engine || "-"}</span></div>
                    <div><label>ประเภทเครื่องยนต์:</label><span>{selected.engineType || "-"}</span></div>
                    <div><label>เกียร์:</label><span>{selected.transmission || "-"}</span></div>
                    <div><label>เลขทะเบียน:</label><span>{selected.lPlate || "-"}</span></div>
                    <div><label>เลขไมล์:</label><span>{selected.odometer || "-"}</span></div>
                    <div><label>ปี:</label><span>{selected.year || "-"}</span></div>
                    <div className="full"><label>หมายเหตุ:</label><span>{selected.additional || "-"}</span></div>
                    <div><label>วันที่เพิ่ม:</label><span>{formatDate(selected.dateAdded)}</span></div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn-primary" onClick={startEdit}>
                    <Pencil size={16} /> แก้ไข
                  </button>
                  <button className="btn-danger" onClick={handleDeleteSelected}>
                    <Trash2 size={16} /> ลบรถ
                  </button>
                  <button className="btn-outline" onClick={closeDetail}>
                    ปิด
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body scrollable">
                  {/* อัปโหลด/เปลี่ยนรูป */}
                  <div className="form-group full">
                    <label>รูปภาพรถ (≤ 1 MB)</label>
                    <div className="image-uploader">
                      {editForm.imageDataUrl ? (
                        <img className="car-photo-sm" src={editForm.imageDataUrl} alt="preview" />
                      ) : (
                        <div className="car-photo-sm placeholder">
                          <ImageIcon size={20} />
                        </div>
                      )}
                      <label className="btn-outline">
                        เลือกรูป
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (!f) return;
                            try { await handleEditImagePicked(f); }
                            catch (err) { alert(err.message || "อัปโหลดรูปไม่สำเร็จ"); }
                          }}
                          hidden
                        />
                      </label>
                      {editForm.imageDataUrl && (
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => setEditForm((p) => ({ ...p, imageDataUrl: "" }))}
                        >
                          ลบรูป
                        </button>
                      )}
                    </div>
                  </div>

                  {/* เลือกเจ้าของ (แก้ไข) */}
                  <div className="form-group full">
                    <label>เจ้าของ (ค้นหาชื่อหรือรหัสลูกค้า)</label>
                    <div className="owner-lookup">
                      <input
                        className="owner-input"
                        placeholder="พิมพ์ชื่อหรือรหัสลูกค้า เช่น 001"
                        value={editOwnerQuery}
                        onChange={(e) => setEditOwnerQuery(e.target.value)}
                      />
                      {!!editOwnerMatches.length && (
                        <div className="owner-dropdown">
                          {editOwnerMatches.map((c) => (
                            <div key={c._id} className="owner-item" onClick={() => chooseEditOwner(c)}>
                              <div className="owner-name">{c.name || "-"}</div>
                              <div className="owner-meta">ID: {c.id || "-"} • {c.phone || "-"}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {(editForm.ownerName || editForm.ownerCode) && (
                      <div className="owner-chip">
                        เลือกแล้ว: {editForm.ownerName || "-"}{editForm.ownerCode ? ` (${editForm.ownerCode})` : ""}
                        <button type="button" className="chip-clear" onClick={clearEditOwner}>×</button>
                      </div>
                    )}
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>ยี่ห้อ*</label>
                      <input
                        placeholder="เช่น Toyota, Honda, Isuzu"
                        required
                        value={editForm.brand}
                        onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>รุ่น*</label>
                      <input
                        placeholder="เช่น Vios, Civic, D-Max"
                        required
                        value={editForm.model}
                        onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                      />
                    </div>

                    {/* ====== Dropdowns ====== */}
                    <div className="form-group">
                      <label>ประเภทรถ</label>
                      <select
                        value={editForm.carType}
                        onChange={(e) => setEditForm({ ...editForm, carType: e.target.value })}
                      >
                        <option value="">-- เลือกประเภทรถ --</option>
                        {CAR_TYPES.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>สี</label>
                      <input
                        placeholder="เช่น ขาว, ดำ, เทาเข้ม"
                        value={editForm.color}
                        onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>ขนาดเครื่องยนต์ (ลิตร หรือ ซีซี)</label>
                      <input
                        placeholder="เช่น 1.5L, 1500cc หรืออื่นๆตามต้องการ"
                        value={editForm.engine}
                        onChange={(e) => setEditForm({ ...editForm, engine: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>ประเภทเครื่องยนต์</label>
                      <select
                        value={editForm.engineType}
                        onChange={(e) => setEditForm({ ...editForm, engineType: e.target.value })}
                      >
                        <option value="">-- เลือกประเภทเครื่องยนต์ --</option>
                        {ENGINE_TYPES.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>ประเภทเกียร์</label>
                      <select
                        value={editForm.transmission}
                        onChange={(e) => setEditForm({ ...editForm, transmission: e.target.value })}
                      >
                        <option value="">-- เลือกประเภทเกียร์ --</option>
                        {TRANSMISSIONS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    {/* ====== /Dropdowns ====== */}

                    <div className="form-group">
                      <label>เลขทะเบียน</label>
                      <input
                      placeholder="เช่น 1กก-1234 กทม."
                        value={editForm.lPlate}
                        onChange={(e) => setEditForm({ ...editForm, lPlate: e.target.value })}
                      />
                    </div>
                      {/* เลขไมล์ */}
                      <div className="form-group">
                        <label>เลขไมล์</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editForm.odometer}
                          placeholder="เฉพาะตัวเลข เช่น 45200"
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\D/g, ""); // ลบทุกอย่างที่ไม่ใช่เลข
                            setEditForm({ ...editForm, odometer: onlyDigits });
                          }}
                        />
                      </div>

                      {/* ปี */}
                      <div className="form-group">
                        <label>ปี</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editForm.year}
                          placeholder="ค.ศ. หรือ พ.ศ 4 หลัก เช่น 2019"
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\D/g, "");
                            setEditForm({ ...editForm, year: onlyDigits });
                          }}
                        />
                      </div>

                    <div className="form-group full">
                      <label>หมายเหตุ</label>
                      <input
                        placeholder="ตัวอย่าง: ติดแก๊ส / มีของแต่ง / เคยชนหน้าเล็กน้อย"
                        value={editForm.additional}
                        onChange={(e) => setEditForm({ ...editForm, additional: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn-primary" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                  <button className="btn-outline" onClick={cancelEdit} disabled={savingEdit}>
                    ยกเลิก
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Add Modal ===== */}
      {showAdd && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เพิ่มรถ</h3>
              <button className="icon-btn" onClick={closeAdd}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="modal-form">
              <div className="modal-body scrollable">
                {/* อัปโหลดรูป */}
                <div className="form-group full">
                  <label>รูปภาพรถ (≤ 1 MB)</label>
                  <div className="image-uploader">
                    {newCar.imageDataUrl ? (
                      <img className="car-photo-sm" src={newCar.imageDataUrl} alt="preview" />
                    ) : (
                      <div className="car-photo-sm placeholder">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <label className="btn-outline">
                      เลือกรูป
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          try { await handleAddImagePicked(f); }
                          catch (err) { alert(err.message || "อัปโหลดรูปไม่สำเร็จ"); }
                        }}
                        hidden
                      />
                    </label>
                    {newCar.imageDataUrl && (
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setNewCar((p) => ({ ...p, imageDataUrl: "" }))}
                      >
                        ลบรูป
                      </button>
                    )}
                  </div>
                </div>

                {/* เลือกเจ้าของ (เพิ่ม) */}
                <div className="form-group full">
                  <label>เจ้าของ (ค้นหาชื่อหรือรหัสลูกค้า)</label>
                  <div className="owner-lookup">
                    <input
                      className="owner-input"
                      placeholder="พิมพ์ชื่อหรือรหัสลูกค้า เช่น 001"
                      value={addOwnerQuery}
                      onChange={(e) => setAddOwnerQuery(e.target.value)}
                    />
                    {!!addOwnerMatches.length && (
                      <div className="owner-dropdown">
                        {addOwnerMatches.map((c) => (
                          <div key={c._id} className="owner-item" onClick={() => chooseAddOwner(c)}>
                            <div className="owner-name">{c.name || "-"}</div>
                            <div className="owner-meta">ID: {c.id || "-"} • {c.phone || "-"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {(newCar.ownerName || newCar.ownerCode) && (
                    <div className="owner-chip">
                      เลือกแล้ว: {newCar.ownerName || "-"}{newCar.ownerCode ? ` (${newCar.ownerCode})` : ""}
                      <button type="button" className="chip-clear" onClick={clearAddOwner}>×</button>
                    </div>
                  )}
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>ยี่ห้อ*</label>
                    <input
                    placeholder="เช่น Toyota, Honda, Isuzu"
                      required
                      value={newCar.brand}
                      onChange={(e) => setNewCar({ ...newCar, brand: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>รุ่น*</label>
                    <input
                      placeholder="เช่น Vios, Civic, D-Max"
                      required
                      value={newCar.model}
                      onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                    />
                  </div>

                  {/* Dropdowns */}
                  <div className="form-group">
                    <label>ประเภทรถ</label>
                    <select
                      value={newCar.carType}
                      onChange={(e) => setNewCar({ ...newCar, carType: e.target.value })}
                    >
                      <option value="">-- เลือกประเภทรถ --</option>
                      {CAR_TYPES.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>สี</label>
                    <input
                      placeholder="เช่น ขาว, ดำ, เทาเข้ม"
                      value={newCar.color}
                      onChange={(e) => setNewCar({ ...newCar, color: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>ขนาดเครื่องยนต์ (ลิตร หรือ ซีซี)</label>
                    <input
                      value={newCar.engine}
                      onChange={(e) => setNewCar({ ...newCar, engine: e.target.value })}
                      placeholder="เช่น 1.5L, 1500cc หรืออื่นๆตามต้องการ"
                    />
                  </div>

                  <div className="form-group">
                    <label>ประเภทเครื่องยนต์</label>
                    <select
                      value={newCar.engineType}
                      onChange={(e) => setNewCar({ ...newCar, engineType: e.target.value })}
                    >
                      <option value="">-- เลือกประเภทเครื่องยนต์ --</option>
                      {ENGINE_TYPES.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>ประเภทเกียร์</label>
                    <select
                      value={newCar.transmission}
                      onChange={(e) => setNewCar({ ...newCar, transmission: e.target.value })}
                    >
                      <option value="">-- เลือกประเภทเกียร์ --</option>
                      {TRANSMISSIONS.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>เลขทะเบียน</label>
                    <input
                      placeholder="เช่น 1กก-1234 กทม."
                      value={newCar.lPlate}
                      onChange={(e) => setNewCar({ ...newCar, lPlate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>เลขไมล์</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={newCar.odometer}
                      placeholder="เฉพาะตัวเลข เช่น 45200"
                      onChange={(e) => {
                        const onlyDigits = e.target.value.replace(/\D/g, ""); // ลบตัวอักษรที่ไม่ใช่เลข
                        setNewCar({ ...newCar, odometer: onlyDigits });
                      }}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>ปี</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={newCar.year}
                      placeholder="ค.ศ. หรือ พ.ศ 4 หลัก เช่น 2019"
                      onChange={(e) => {
                        const onlyDigits = e.target.value.replace(/\D/g, "");
                        setNewCar({ ...newCar, year: onlyDigits });
                      }}
                    />
                  </div>

                  <div className="form-group full">
                    <label>หมายเหตุ</label>
                    <input
                    placeholder="ตัวอย่าง: ติดแก๊ส / มีของแต่ง / เคยชนหน้าเล็กน้อย"
                      value={newCar.additional}
                      onChange={(e) => setNewCar({ ...newCar, additional: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  <Plus size={16} /> บันทึก
                </button>
                <button type="button" className="btn-outline" onClick={closeAdd}>
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarPage;
