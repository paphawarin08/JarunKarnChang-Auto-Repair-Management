// src/components/repairs/TechStatusModal.jsx
// โมดอลนี้ไว้ดูภาพรวมว่า "ช่างแต่ละคนกำลังทำงานอะไรอยู่" + "ใครปิดงานแล้วกี่งาน"
// ช่วยหัวหน้างานเช็คคิว + กระจายงานได้ง่ายขึ้น

import React from "react";
import { Search } from "lucide-react";

export default function TechStatusModal({
  open, onClose,
  empQ, setEmpQ,                    // ช่องค้นหาช่าง
  filteredSortedEmployees,          // ลิสต์ช่างที่ถูกจัดอันดับแล้ว (กำลังทำเยอะ -> done เยอะ -> ชื่อ)
  topFinishers,                     // id ของคนที่ปิดงานสูงสุด (โชว์ badge TOP)
  empMap,                           // Map id -> employee object (ไว้ resolve ชื่อ)
  empStats,                         // ค่าสถิติรวม ๆ
  activeByEmp,                      // งานที่กำลังทำ (ยังไม่จบ) ของแต่ละคน
  items,                            // รายชื่องานทั้งหมด (ไว้กดลิงก์แล้วเปิดงาน)
  onOpenJob,                        // ฟังก์ชันจากหน้าแม่: คลิก job -> เปิดรายละเอียดงาน
}) {
  if (!open) return null;

 const list = Array.isArray(filteredSortedEmployees) ? filteredSortedEmployees : [];
 const top = Array.isArray(topFinishers) ? topFinishers : [];
 const active = activeByEmp || {};
 const map = empMap instanceof Map ? empMap : new Map();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>สถานะช่าง / งานปัจจุบัน & สถิติปิดงาน</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        {/* แถบค้นหาช่าง */}
        <div className="search-container-staff-static" style={{ maxWidth: 420, marginBottom: 10 }}>
          <div className="search-icon"><Search className="icon-md" /></div>
          <input
            className="search-input"
            placeholder="ค้นหา ชื่อ/รหัสพนักงาน/หน้าที่"
            value={empQ}
            onChange={(e) => setEmpQ(e.target.value)}
          />
        </div>

        {/* ตารางสรุปสถานะ + ลิสต์งานที่กำลังทำ */}
        <div className="modal-body scrollable">
          {/* กล่องโชว์ TOP finisher */}
          <div className="info-card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>🏆 ผู้ปิดงานมากที่สุด</div>
            {topFinishers.length === 0 ? (
              <div>ยังไม่มีใครปิดงาน “ซ่อมเสร็จสิ้น”</div>
            ) : (
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {topFinishers.map(id => {
                  const e = empMap.get(id);
                  const name = e?.name || e?.id || id;
                  const n = Number(empStats?.[id]?.totalDone || 0);
                  return <li key={id}>{name} — {n} งาน</li>;
                })}
              </ul>
            )}
          </div>

          {/* ตารางรายชื่อช่าง + งานที่กำลังทำอยู่ */}
          <div className="table-wrapper">
            <table className="data-table">
              <thead className="table-header">
                <tr>
                  <th>ช่าง</th>
                  <th>กำลังทำอยู่</th>
                  <th>ปิดงานแล้ว (ซ่อมเสร็จสิ้น)</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {filteredSortedEmployees.map(({ emp, doing, done }) => {
                  const isTop = topFinishers.includes(emp._id);
                  return (
                    <tr key={emp._id} className="table-row">
                      <td className="table-cell">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>{emp.name || "-"}</div>
                          <small style={{ opacity: .7 }}>{emp.id ? `#${emp.id}` : ""}</small>
                          {isTop && <span className="rcp-badge green">TOP</span>}
                        </div>
                        <div style={{ opacity: .7 }}>{emp.role || "-"}</div>
                      </td>
                      <td className="table-cell">
                        {doing === 0 ? (
                          <span style={{ opacity: .7 }}>ว่าง/ไม่มีงานค้าง</span>
                        ) : (
                          <ul style={{ paddingLeft: 18, margin: 0 }}>
                            {(activeByEmp[emp._id] || []).map(job => (
                              <li key={job.id}>
                                <button
                                  className="linklike"
                                  onClick={() => onOpenJob(job.id)}
                                  style={{ padding: 0, border: "none", background: "none", cursor: "pointer", textDecoration: "underline" }}
                                  title="เปิดรายละเอียดงาน"
                                >
                                  <strong>{job.code}</strong> — {job.vehicle} <em>({job.status})</em>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="table-cell">{done}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10 }}>
            <small>* จำนวน “ปิดงานแล้ว” มาจากสถิติถาวร และจะไม่หายเมื่อมีการลบงานซ่อม</small>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-outline" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
