// src/pages/UserHomePage.js
// ------------------------------------------------------------
// หน้าโฮมสำหรับผู้ใช้ทั่วไป (ลูกค้า) เอาไว้เช็คสถานะซ่อม + ดูข้อมูลร้าน
// โครงหลัก: ใช้ state เก็บข้อความค้นหา, index ของแบนเนอร์,
// และข้อมูลโปรไฟล์อู่ (ดึงจาก Firestore หนึ่งครั้งตอนเข้าเพจ)
// ------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/UserHomePage.css';
import Line from './Line.jpeg';
import Tel from './tell.jpeg';
import WalkIn from './walkin.jpeg';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { app } from '../firebase/firebase'; // ตัว firebase app ที่ config ไว้

// รูปแบนเนอร์ที่จะวนโชว์ (ใช้ require เพราะอยู่ใน public/assets โปรเจกต์)
const bannerImages = [
  require('../images/banner1.png'),
  require('../images/banner2.png'),
  require('../images/banner3.png')
];

// =================== Component หลัก: UserMainPage ===================
// หน้าที่ของ component นี้:
// 1) รับโค้ดซ่อมจากผู้ใช้ แล้ว navigate ไปหน้า /usercheck พร้อม state
// 2) วนโชว์รูปแบนเนอร์แบบ auto ทุก 60 วิ
// 3) โหลดข้อมูล companyProfile (โลโก้/ที่อยู่/เบอร์/ไลน์) จาก Firestore มาแสดง
const UserMainPage = () => {
  // เก็บโค้ดที่ผู้ใช้พิมพ์ เพื่อนำไปค้นหา
  const [searchQuery, setSearchQuery] = useState('');
  // เก็บ index ของรูปแบนเนอร์ที่กำลังโชว์อยู่
  const [currentIndex, setCurrentIndex] = useState(0);
  // เก็บข้อมูลโปรไฟล์อู่ (ค่า default เป็นค่าว่าง ๆ ก่อน)
  const [companyData, setCompanyData] = useState({
    logoDataUrl: '',
    phone: '',
    lineID: '',
    street: '',
    city: '',
    state: '',
    zip: ''
  });

  const navigate = useNavigate();

  // ------------------- handleSearch -------------------
  // ฟังก์ชันกดค้นหา: ถ้ามีโค้ด ให้พาไปหน้า /usercheck แล้วส่ง state ไปด้วย
  // ถ้าไม่มี โชว์ alert ให้กรอกก่อน
  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate('/usercheck', { state: { searchCode: searchQuery } });
    } else {
      alert('กรุณากรอกรหัสซ่อมก่อน');
    }
  };

  // ------------------- handleKeyPress -------------------
  // ฟังก์ชันดักกด Enter ในช่องค้นหา → เรียก handleSearch เลย
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ------------------- useEffect: วนแบนเนอร์อัตโนมัติ -------------------
  // ทุก ๆ 60 วินาที จะเลื่อน index ของรูปไปเรื่อย ๆ (วน loop ด้วย %)
  // และมีการเคลียร์ interval ตอน unmount เพื่อไม่ให้ memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % bannerImages.length);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ------------------- useEffect: โหลด companyProfile จาก Firestore -------------------
  // ดึง collection('companyProfile') มา 1 รอบ แล้ว map ข้อมูลที่ต้องใช้ใส่ state
  // (โค้ดนี้ assume ว่ามี 1 doc หรือถ้ามีหลาย doc ก็จะเอาอันล่าสุดที่วนมา set)
  useEffect(() => {
    // ฟังก์ชัน async แยกไว้ใน effect เดียวกัน อ่านแล้วตั้ง state
    const fetchCompanyProfile = async () => {
      try {
        const db = getFirestore(app);
        const querySnapshot = await getDocs(collection(db, 'companyProfile'));
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          setCompanyData({
            logoDataUrl: data.logoDataUrl || '',
            phone: data.phone || '',
            lineID: data.lineID || '',
            street: data.street || '',
            city: data.city || '',
            state: data.state || '',
            zip: data.zip || ''
          });
        });
      } catch (error) {
        console.error('Error fetching company profile:', error);
      }
    };

    fetchCompanyProfile();
  }, []);

  // ------------------- prevSlide / nextSlide -------------------
  // ปุ่มควบคุมสไลด์แบนเนอร์แบบ manual (ย้อน/ถัดไป)
  const prevSlide = () => {
    setCurrentIndex((prev) => (prev === 0 ? bannerImages.length - 1 : prev - 1));
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % bannerImages.length);
  };

  // =================== UI (งดแตะต้องการทำงาน) ===================
  // *ตามโจทย์บอกว่า "ไม่ต้องเอาส่วน body ui มาก็ได้"
  // แต่เพื่อคงพฤติกรรมครบ ผมคง JSX เดิมไว้ทั้งหมด และเพิ่มคอมเมนต์เฉย ๆ

  return (
    <div className="user-check-page23">
      {/* Header (ห้ามแก้) */}
      <div className="user-check-header13">
        <div className="header-container">
          <div className="company-logo">
            {/* ใช้โลโก้จาก Firebase ถ้ามี */}
            <img
              src={companyData.logoDataUrl || require('../images/jarun.jpg')}
              alt="Logo"
              className="logo-img"
            />
          </div>
          <div className="header-search-section">
            <div className="search-container">
              <input
                type="text"
                placeholder="กรอกรหัสเพื่อตรวจสอบสถานะการซ่อม"
                className="search-input-user"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
              />
            </div>
            <button className="search-button" onClick={handleSearch}>
              ค้นหา
            </button>
          </div>
        </div>
      </div>

      {/* แบนเนอร์สไลด์ */}
      <div className="page-wrapper">
        <div className="banner-slider">
          <img src={bannerImages[currentIndex]} alt="Banner" className="banner-image" />
          <button className="slide-btn prev" onClick={prevSlide}>‹</button>
          <button className="slide-btn next" onClick={nextSlide}>›</button>
        </div>
      </div>

      {/* บริการหลัก */}
      <section className="services-section">
        <div className="services-text">
          <h2 className="services-title">บริการหลัก <br /> จรัลการช่าง</h2>
          <p className="services-sub">
            บริการซ่อมและบำรุงรักษารถยนต์ครบวงจร <br />
            พร้อมรับประกันคุณภาพการซ่อม
          </p>
        </div>
        <div className="services-grid">
          <button className="service-btn">ระบบเกียร์</button>
          <button className="service-btn">ซ่อมเครื่องยนต์</button>
          <button className="service-btn">
            ซ่อมช่วงล่างรถยนต์ เช่น เบรค, คลัตช์, โช้คอัพ, ลูกปืน และอื่น ๆ
          </button>
          <button className="service-btn">
            เปลี่ยนถ่ายน้ำมันเครื่องและระบบหล่อเย็น
          </button>
        </div>
      </section>

    

      {/* วิธีการจองคิว */}
      <section className="booking-section">
        <h2 className="section-title">วิธีการจองคิว ?</h2>
        <div className="booking-methods">
          <div className="method">
            <img src={Line} alt="LINE" className="icon" />
            <p>{companyData.lineID || '@XXXX'}</p>
          </div>
          <div className="method">
            <img src={Tel} alt="Phone" className="icon" />
            <p>{companyData.phone || 'โทร 044-372047, 081-9775429'}</p>
          </div>
          <div className="method">
            <img src={WalkIn} alt="Walk-in" className="icon" />
            <p>เข้ารับบริการหน้าร้าน</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>
          <h3>จรัลการช่าง</h3>
          {companyData.street}, {companyData.city}, {companyData.state} {companyData.zip} <br />
          {companyData.phone || 'โทร 044-372047, 081-9775429'}
        </p>
      </footer>
    </div>
  );
};

export default UserMainPage;
