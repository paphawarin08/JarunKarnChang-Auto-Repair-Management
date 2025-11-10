// src/pages/LoginPage.jsx
// -------------------------------------------------------------
// โค้ดหน้านี้คือ "หน้าเข้าสู่ระบบ" ของพนักงาน/แอดมิน
// โฟลว์หลัก ๆ ที่ต้องเข้าใจ:
//   - useEffect#1: ดึงโลโก้บริษัทมาแสดงที่หัวการ์ด
//   - useEffect#2: ตอนเข้าเพจ เช็คว่ามีผู้ใช้ role=admin อยู่ไหม
//       • ถ้าไม่มี → โชว์โมดัลให้สร้าง Admin คนแรก (handleCreateAdmin)
//   - handleLogin (ฟังก์ชันหลัก #1):
//       • เรียก login(email, password)
//       • ถ้าสำเร็จ อ่าน role จาก users/{uid} ด้วย getUserRole
//       • นำทางไป /admin/home หรือ /staff/home ตาม role
//   - handleCreateAdmin (ฟังก์ชันหลัก #2):
//       • ใช้ createUserForEmployeeClient เพื่อสร้างผู้ใช้ใหม่พร้อม role=admin
//   - handleResetPassword (ฟังก์ชันหลัก #3):
//       • เรียก sendResetEmailForEmployee เพื่อส่งอีเมลรีเซ็ตรหัสผ่าน
// ส่วน UI มี overlay โหลด, โมดัลสร้างแอดมิน, ฟอร์มอีเมล/รหัสผ่าน พร้อมปุ่มโชว์/ซ่อนรหัส
// -------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LoginPage.css';
import LOGO from '../imgs/jarun.jpg';
import SIDEIMG from '../images/side-pic-login.png';
// ใช้ไอคอนโชว์/ซ่อนรหัสผ่าน
import { Eye, EyeOff } from 'lucide-react';

// service ฝั่ง auth และผู้ใช้
import { login, logout } from '../services/authService';
import {
  getUserRole,
  createUserForEmployeeClient,
  sendResetEmailForEmployee
} from '../services/userService';
import { subscribeCompanyProfile } from '../services/companyProfileService';

// Firestore สำหรับเช็คว่ามี admin หรือยัง
import { db } from '../firebase/firebase';
import {
  collection, getDocs, query, where
} from 'firebase/firestore';

const LoginPage = () => {
  const navigate = useNavigate();

  // ====== states ฟอร์ม Login ======
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // overlay โหลดตอนกำลัง login
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState('');

  // สวิทช์โชว์/ซ่อนรหัสผ่านช่องหลัก
  const [showPwd, setShowPwd] = useState(false);

  // โลโก้บริษัทที่ดึงจากโปรไฟล์ (Realtime)
  const [companyLogoUrl, setCompanyLogoUrl] = useState(null);

  // ====== โมดัล "ยังไม่มีแอดมิน" ======
  const [noAdmin, setNoAdmin] = useState(false); // true = แสดงโมดัล
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPwd, setShowAdminPwd] = useState(false); // toggle โชว์รหัสในโมดัล
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');

  // ---------------- useEffect #1: Subscribe โลโก้บริษัท ----------------
  // แค่ฟัง profile เพื่อ set โลโก้ที่หัวหน้าเพจ/overlay
  useEffect(() => {
    const unsub = subscribeCompanyProfile((profile) => {
      setCompanyLogoUrl(profile?.logoDataUrl || null);
    });
    return () => unsub && unsub();
  }, []);

  // ---------------- useEffect #2: เช็คว่ามี Admin อยู่หรือยัง ----------------
  // เข้าหน้าปุ๊บยิง query ไปที่ users โดย where role == 'admin'
  // ถ้ายังไม่มีเอกสารเลย → โชว์โมดัลให้สร้าง Admin คนแรก
  useEffect(() => {
    const checkAdminExists = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'));
        const snap = await getDocs(q);
        if (snap.empty) {
          setNoAdmin(true);
        }
      } catch (err) {
        // ถ้า query ล้มเหลวก็ปล่อยให้หน้าล็อกอินใช้ได้ตามปกติ
        console.warn('checkAdminExists error:', err);
      }
    };
    checkAdminExists();
  }, []);

  // ---------------- ฟังก์ชันหลัก #1: ล็อกอิน ----------------
  // ขั้นตอน:
  //   1) เคลียร์ error + โชว์สถานะโหลด
  //   2) เรียก login(email, password)
  //   3) ถ้าผิดพลาด → โชว์ error แล้วหยุด
  //   4) ถ้าสำเร็จ → อ่าน role จาก getUserRole(uid)
  //   5) ไม่มี role → logout แล้วแจ้งเตือนว่าไม่ได้ผูกพนักงาน
  //   6) มี role → นำทางตามสิทธิ์ (admin -> /admin/home, staff -> /staff/home)
  const handleLogin = async () => {
    setError('');
    setShowLoading(true);

    const res = await login(email.trim(), password);
    if (!res.success) {
      setShowLoading(false);
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    const role = await getUserRole(res.user.uid);
    setShowLoading(false);

    if (!role) {
      await logout();
      setError('บัญชีนี้ไม่ได้ผูกกับพนักงาน หรือถูกยกเลิกการผูกแล้ว\nกรุณาติดต่อผู้ดูแลระบบ');
      return;
    }

    if (role === 'admin') {
      navigate('/admin/home', { replace: true });
    } else if (role === 'staff') {
      navigate('/staff/home', { replace: true });
    } else {
      // กันกรณี role แปลก ๆ ให้ไปหน้า admin/repairs เป็นดีฟอลต์
      navigate('/admin/repairs', { replace: true });
    }
  };

  // ---------------- ฟังก์ชันหลัก #2: สร้าง Admin คนแรก ----------------
  // ใช้ตอนโมดัลเด้งขึ้นมาว่า "ยังไม่มีผู้ดูแลระบบ"
  // จะสร้าง users ใหม่ โดยกำหนด role='admin' ให้เลย
  const handleCreateAdmin = async () => {
    setAdminError('');
    if (!adminEmail || !adminPassword) {
      setAdminError('กรุณากรอกอีเมลและรหัสผ่านให้ครบ');
      return;
    }
    setCreatingAdmin(true);
    try {
      await createUserForEmployeeClient({
        // employeeId สมมุติ (บอกว่าคนนี้เป็น root admin)
        employeeId: 'admin-root',
        email: adminEmail.trim(),
        password: adminPassword,
        displayName: 'Administrator',
        role: 'admin',
      });
      setNoAdmin(false);
      setAdminEmail('');
      setAdminPassword('');
      alert('สร้างผู้ดูแลระบบ (Admin) สำเร็จแล้ว! กรุณาเข้าสู่ระบบด้วยอีเมล/รหัสผ่านที่เพิ่งสร้าง');
    } catch (err) {
      console.error(err);
      setAdminError(err?.message || 'ไม่สามารถสร้าง Admin ได้');
    } finally {
      setCreatingAdmin(false);
    }
  };

  // ---------------- ฟังก์ชันหลัก #3: ลืมรหัสผ่าน ----------------
  // ถ้าใส่อีเมลแล้วกด "ลืมรหัสผ่าน?" จะส่งลิงก์รีเซ็ตไปที่อีเมลพนักงาน
  const handleResetPassword = async () => {
    setError('');
    if (!email) {
      setError('กรุณากรอกอีเมลก่อนกด “ลืมรหัสผ่าน?”');
      return;
    }
    try {
      await sendResetEmailForEmployee(email.trim());
      alert('ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปที่อีเมลแล้ว');
    } catch (err) {
      setError(err?.message || 'ส่งลิงก์รีเซ็ตรหัสผ่านไม่สำเร็จ');
    }
  };

  // ---------------- UI (เก็บโครงไว้ครบ ไม่แตะต้องการทำงาน) ----------------
  // หมายเหตุ: ด้านล่างคือ body UI เต็มเดิมเพื่อไม่เปลี่ยนพฤติกรรมหน้า
  // - overlay โหลดระหว่างล็อกอิน
  // - โมดัลสร้างแอดมินเมื่อยังไม่มีในระบบ
  // - ฟอร์มอีเมล/รหัสผ่าน + ปุ่มโชว์/ซ่อนรหัส + ปุ่มลืมรหัสผ่าน
  return (
    <div className="login-container">
      {/* === Loading Overlay เดิม === */}
      {showLoading && (
        <div className="loading-overlay">
          <div className="loading-screen">
            <div className="loading-logo">
              <div className="logo-frame-login logo-frame--loading">
                <img src={companyLogoUrl || LOGO} alt="Logo" className="logo-image" />
              </div>
            </div>
            <div className="loading-text">
              <h2>กำลังเข้าสู่ระบบ</h2>
              <div className="loading-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div className="loading-bar">
              <div className="progress-bar"></div>
            </div>
          </div>
        </div>
      )}

      {/* === Modal: สร้าง Admin เมื่อยังไม่พบในระบบ === */}
      {noAdmin && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title">ยังไม่มีผู้ดูแลระบบ</h3>
            <p className="modal-subtitle">กรุณาสร้างบัญชีผู้ดูแลระบบ (Admin) คนแรก</p>

            <input
              type="email"
              className="modal-input"
              placeholder="อีเมลแอดมิน"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              disabled={creatingAdmin}
            />
            {/* ช่องรหัสผ่าน (โมดัล) + ปุ่มโชว์/ซ่อน */}
            <div className="pwd-wrap">
              <input
                type={showAdminPwd ? 'text' : 'password'}
                className="modal-input input-no-right-icon"
                placeholder="รหัสผ่าน"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={creatingAdmin}
                aria-label="รหัสผ่านแอดมิน"
              />
              <button
                type="button"
                className="toggle-pwd-btn"
                onClick={() => setShowAdminPwd(v => !v)}
                aria-label={showAdminPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                title={showAdminPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showAdminPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {adminError && <div className="modal-error">{adminError}</div>}

            <div className="modal-actions">
              <button
                className="modal-btn modal-btn--primary"
                onClick={handleCreateAdmin}
                disabled={creatingAdmin}
              >
                {creatingAdmin ? 'กำลังสร้าง...' : 'สร้าง Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === การ์ดล็อกอินเดิม เพิ่มปุ่มลืมรหัสผ่าน === */}
      <div className="login-card">
        <div className="login-form">
          <div className="logo-frame-login">
            <img src={companyLogoUrl || LOGO} alt="Logo" className="logo-image" />
          </div>

          <div className="form-fields">
            <input
              type="email"
              placeholder="อีเมล"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
            {/* ช่องรหัสผ่าน (หน้า Login) + ปุ่มโชว์/ซ่อน */}
            <div className="pwd-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="รหัสผ่าน"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field input-no-right-icon"
                aria-label="รหัสผ่าน"
              />
              <button
                type="button"
                className="toggle-pwd-btn"
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                title={showPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <div className="error-text">{error}</div>}

            <button onClick={handleLogin} className="login-button">
              เข้าสู่ระบบ
            </button>

            <button type="button" className="reset-button" onClick={handleResetPassword}>
              ลืมรหัสผ่าน?
            </button>
          </div>
        </div>

        <div className="image-section">
          <img src={SIDEIMG} alt="Login Side" className="side-image" />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
