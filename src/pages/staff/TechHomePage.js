import React, { useEffect, useMemo, useState } from "react";
import "../../styles/TechHome.css";
import { useNavigate } from "react-router-dom";
import LOGO from "../../images/jarun.jpg";
import { LogOut } from "lucide-react";

import { auth, db } from "../../firebase/firebase";
import { doc, onSnapshot } from "firebase/firestore";

import { logout } from "../../services/authService";
import { subscribeCompanyProfile } from "../../services/companyProfileService";
import { subscribeRepairs } from "../../services/repairService";

import TechRepairModal from "../../pages/staff/TechRepairModal";

// TechHomePage – หน้าโฮมของช่าง: เอาไว้ดู “งานของฉัน” ตามสถานะที่เลือก (แท็บด้านบน)
// โค้ดนี้ดึงข้อมูลบริษัท/ผู้ใช้/งานซ่อมแบบ realtime แล้วกรองเฉพาะงานที่มอบหมายให้เรา จากนั้นแบ่งตามสถานะเพื่อแสดงเป็นการ์ดงาน

// ===== Imports หลัก ๆ =====
// - auth, db, onSnapshot: เอาไว้รู้ว่าเราเป็นใคร + ไปอ่าน users/{uid} เพื่อดึง employeeId
// - subscribeCompanyProfile: เอาโลโก้บริษัทมาโชว์หัวข้อ
// - subscribeRepairs: ฟังรายการงานซ่อมทั้งหมดแบบ realtime แล้วค่อยกรองเฉพาะ “งานของฉัน”
// - TechRepairModal: โมดอลเปิดรายละเอียดงานและปุ่มไปแก้ไข

const STATUS_TABS = [
  "รับรถเข้าร้าน",
  "ตรวจสอบเสร็จสิ้น",
  "ระหว่างการซ่อม",
  "ซ่อมเสร็จสิ้น",
];

export default function TechHomePage() {
  const navigate = useNavigate();

  // header states
  const [employeeName, setEmployeeName] = useState("กำลังโหลด...");
  const [employeeKey, setEmployeeKey] = useState(null); // users/{uid}.employeeId
  const [companyLogoUrl, setCompanyLogoUrl] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);

  // jobs
  const [allRepairs, setAllRepairs] = useState([]);
  const [activeStatus, setActiveStatus] = useState("ระหว่างการซ่อม");
  const [selected, setSelected] = useState(null);

  // ====== subscribe header info ======
  // =====อันที่ 1 useEffect: subscribe header info (บริษัท + user) =====
// - ฟัง company profile → ได้ logoDataUrl มาแปะโลโก้
// - ถ้ามี uid: ฟัง users/{uid} → ได้ displayName + employeeId (เก็บ employeeKey ไว้ใช้กรองงานของตัวเอง)
// - อันนี้เป็น pattern “subscribe แล้วเซ็ต state” เหมือนไฟล์ก่อน ๆ ที่ฟัง collection ต่าง ๆ เลย (ไม่ได้นับซ้ำ แต่สำคัญ)

  useEffect(() => {
    const unsubCompany = subscribeCompanyProfile((profile) => {
      setCompanyLogoUrl(profile?.logoDataUrl || null);
    });

    const uid = auth.currentUser?.uid || null;
    let unsubUser = null;
    if (uid) {
      const userRef = doc(db, "users", uid);
      unsubUser = onSnapshot(userRef, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const dn =
          data?.displayName || auth.currentUser?.displayName || "ไม่ทราบชื่อ";
        setEmployeeName(dn);
        setEmployeeKey(data?.employeeId || null);
      });
    } else {
      setEmployeeName("ไม่พบผู้ใช้");
      setEmployeeKey(null);
    }

    return () => {
      unsubCompany && unsubCompany();
      unsubUser && unsubUser();
    };
  }, []);


  // ====== subscribe repairs ======
  // ===== อันที่ 2 useEffect: subscribeRepairs =====
// - ฟังรายการงานซ่อมทั้งหมดแบบสด ๆ (ทั้งร้าน)
// - เก็บลง allRepairs เพื่อให้ useMemo ไปกรองต่อ
// - ก็เป็น pattern subscribe รายการข้อมูลเหมือนไฟล์ก่อนหน้า (ไม่ได้นับซ้ำ แต่จำเป็น)
  useEffect(() => {
    const unsub = subscribeRepairs((list) => {
      setAllRepairs(Array.isArray(list) ? list : []);
    });
    return () => unsub && unsub();
  }, []);

  // งานของฉัน (มอบหมายให้ฉัน)
  // =====อันที่ 3 useMemo: myRepairs (งานของฉัน) =====
// - จุดสำคัญของหน้า! กรอง allRepairs ให้เหลือเฉพาะงานที่ “ถูกมอบหมาย” ให้เรา
// - เช็ค 2 ทาง: ถ้ามี employeeKey (employeeId) ก็ใช้ตัวนั้น, ถ้าไม่มี (ข้อมูลเก่า) ใช้ uid แทน
// - ตัดงาน draft / งานถูกลบ ออกก่อน
// - อันนี้คือแกนธุรกิจของหน้า เลย “นับเป็นฟังก์ชันหลัก”
  const myRepairs = useMemo(() => {
    const uid = auth.currentUser?.uid || "";
    const empKey = employeeKey || "";
    return (allRepairs || []).filter((r) => {
      if (r?.deletedAt) return false;
      if (r?.isDraft) return false;
      const arr = Array.isArray(r?.employees) ? r.employees : [];
      // primary: employeeId, fallback: uid (กันข้อมูลเก่าๆ)
      return (empKey && arr.includes(empKey)) || (uid && arr.includes(uid));
    });
  }, [allRepairs, employeeKey]);

  // กรองตามสถานะ
  // =====อันที่ 4 useMemo: filteredRepairs (งานของฉันตามสถานะที่เลือก) =====
// - จาก myRepairs อีกที กรองด้วย activeStatus (ตรงกับแท็บที่เลือก)
// - ทำให้เปลี่ยนแท็บแล้ว list เปลี่ยนไว ๆ ไม่ต้องยิง query ใหม่
// - อันนี้ก็แกนของ UI เพจนี้ “นับเป็นฟังก์ชันหลัก”
  const filteredRepairs = useMemo(() => {
    return myRepairs.filter((r) => (r?.status || "") === activeStatus);
  }, [myRepairs, activeStatus]);

  // ----- logout modal handlers -----
  const openConfirmLogout = () => setShowConfirmLogout(true);
  const cancelLogout = () => setShowConfirmLogout(false);
  const confirmLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } finally {
      setIsLoggingOut(false);
      setShowConfirmLogout(false);
      navigate("/", { replace: true });
    }
  };

  // ---- small helpers ----
  const fmtDateTime = (ts) => {
    try {
      const d =
        ts && typeof ts.toDate === "function"
          ? ts.toDate()
          : ts instanceof Date
          ? ts
          : ts
          ? new Date(ts)
          : null;
      return d
        ? d.toLocaleString("th-TH", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-";
    } catch {
      return "-";
    }
  };

  // นับจำนวนงานในแต่ละสถานะ (เอาไว้โชว์ในแท็บ)
  // =====อันที่ 5 useMemo: countsByStatus (นับงานตามสถานะ) =====
// - นับจำนวนงานใน myRepairs แต่ละสถานะ → เก็บเป็นอ็อบเจ็กต์ {status: count}
// - เอาไว้โชว์จำนวนงานข้างแท็บ (เช่น รับรถเข้าร้าน (3))
// - อันนี้ก็เป็นฟังก์ชันหลักของ UI
  const countsByStatus = useMemo(() => {
   const base = Object.fromEntries(STATUS_TABS.map(s => [s, 0]));
   for (const r of myRepairs) {
     const s = r?.status || "";
     if (s in base) base[s] += 1;
   }
   return base;
 }, [myRepairs]);

  return (
    <div className={`home-container ${selected ? "modal-open" : ""}`}>
      {/* Header */}
      <header className="header">
        <div className="header-left_tech">
          <div className="logo1">
            <img
              src={companyLogoUrl || LOGO}
              alt="Logo"
              className="logo-img1"
            />
          </div>
        </div>
        <div className="header-right">
          <span className="employee-name">{employeeName}</span>
          <button
            className="logout-btn"
            onClick={openConfirmLogout}
            disabled={isLoggingOut}
            title="ออกจากระบบ"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main-content">

        <div className="section-header">
          <h1 className="section-title-home">
            {activeStatus === "รับรถเข้าร้าน" && "งานที่รับรถเข้าร้านแล้ว"}
            {activeStatus === "ตรวจสอบเสร็จสิ้น" && "งานที่ตรวจสอบเสร็จสิ้น"}
            {activeStatus === "ระหว่างการซ่อม" && "งานที่กำลังซ่อมอยู่"}
            {activeStatus === "ซ่อมเสร็จสิ้น" && "งานที่ซ่อมเสร็จแล้ว"}
          </h1>
        </div>

        {/* Tabs */}
        <div className="tabs-container">
          {STATUS_TABS.map((st) => (
            <button
              key={st}
              className={`tab ${activeStatus === st ? "active" : ""}`}
              onClick={() => setActiveStatus(st)}
              aria-label={`${st} (${countsByStatus[st] || 0} งาน)`}
            >
              <span>{st}</span>
              {(countsByStatus[st] || 0) > 0 && (
                <span className="tab-badge">{countsByStatus[st]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Jobs */}
        <div className="job-list">
          {filteredRepairs.length === 0 ? (
            <div style={{ color: "#666", padding: "8px 0" }}>
              — ยังไม่มีงานในสถานะนี้ —
            </div>
          ) : (
            filteredRepairs.map((job) => {
              const carTitle =
                [job?.vehicleTitle, job?.vehiclePlate]
                  .filter(Boolean)
                  .join(" | ") || "-";
              return (
                <div
                  key={job._id}
                  className="job-card"
                  onClick={() => setSelected(job)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="job-header">
                    <div className="customer-info">
                      {job?.vehicleImage ? (
                        <img
                          src={job.vehicleImage}
                          alt="vehicle"
                          className="profile-img"
                        />
                      ) : (
                        <div className="profile-img placeholder">
                          {(job?.customerName || "C").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="customer-name">
                        {job?.customerName || "-"}
                      </span>
                    </div>
                    <span className="job-status open">{job?.status || "-"}</span>
                  </div>

                  <div className="job-details">
                    <div className="job-car">{carTitle}</div>
                    <div className="job-updated">
                      อัปเดตล่าสุด: {fmtDateTime(job?.updatedAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Repair Detail Modal */}
      {selected && (
        <TechRepairModal
          repairId={selected._id}
          onClose={() => setSelected(null)}
          onEdit={(id) => {
            setSelected(null);
            navigate(`/tech/repairs/${id}/edit`);
          }}
        />
      )}



      {/* Confirm Logout Modal */}
      {showConfirmLogout && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={cancelLogout}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ยืนยันการออกจากระบบ</h3>
            </div>
            <div className="modal-body">
              <p>คุณต้องการออกจากระบบใช่หรือไม่?</p>
            </div>
            <div className="modal-actions">
              <button
                className="btn-outline"
                onClick={cancelLogout}
                disabled={isLoggingOut}
              >
                ยกเลิก
              </button>
              <button
                className="btn-danger"
                onClick={confirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "กำลังออก…" : "ออกจากระบบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== ค่าคงที่ =====
// STATUS_TABS: รายชื่อสถานะงานที่ใช้ทำเป็นแท็บให้กดสลับ (รับรถเข้าร้าน/ตรวจสอบเสร็จ/ระหว่างซ่อม/ซ่อมเสร็จ)

// ===== state หลัก =====
// employeeName, employeeKey: ชื่อช่าง + key ของพนักงาน (มาจาก users/{uid}.employeeId)
// companyLogoUrl: โลโก้บริษัทโชว์มุมซ้ายบน
// isLoggingOut/showConfirmLogout: จัดการ modal ยืนยันออกจากระบบ
// allRepairs: งานซ่อมทั้งหมดที่ร้าน (ยังไม่กรอง)
// activeStatus: สถานะที่กำลังเลือกอยู่ในแท็บ (ดีฟอลต์ “ระหว่างการซ่อม”)
// selected: ถ้าเลือกการ์ดงาน จะเก็บงานนั้นไว้เพื่อเปิด TechRepairModal

// ===== Logout handlers =====
// - openConfirmLogout/cancelLogout: แค่เปิด/ปิด modal ยืนยัน (ยูทิลเล็ก ๆ ไม่ได้นับ)
// - confirmLogout: เรียก logout แล้วเด้งไปหน้า “/” (ถือว่าเป็นงานส่วนหัว ไม่ใช่แกน data ของหน้า เลยไม่ได้นับ)

// ===== helper: fmtDateTime =====
// - แปลง timestamp (ทั้ง Firestore Timestamp/Date/number) ให้เป็นสตริงเวลาแบบ th-TH
// - ยูทิลจุกจิก ไม่ได้นับ

// ===== UI หลัก =====
// - Header: โลโก้ + ชื่อพนักงาน + ปุ่มออกจากระบบ
// - Tabs: ปุ่ม 4 สถานะ → เปลี่ยน activeStatus
// - Job list: map(filteredRepairs) เป็นการ์ดงาน (โชว์ชื่อ, สถานะ, รถ, เวลาอัปเดตล่าสุด)
// - คลิกการ์ด → setSelected เพื่อเปิด <TechRepairModal />
// - โมดอลยืนยันออกจากระบบ: กด “ออกจากระบบ” → confirmLogout