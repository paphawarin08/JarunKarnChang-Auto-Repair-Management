import React, { useState, useEffect } from 'react';
import { Users, Car, Wrench, Package, Calendar, UserCheck, FileText, BarChart3, LogOut, Building } from 'lucide-react';
import '../styles/HomePage.css';
import LOGO from '../imgs/jarun.jpg';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/authService';
import { subscribeCompanyProfile } from '../services/companyProfileService';

const HomePage = () => {
  const [activeTab, setActiveTab] = useState('ทั้งหมด');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState(null);
  const navigate = useNavigate();

  // subscribe โลโก้บริษัทจาก Firestore (ไม่ใช้ Storage)
  useEffect(() => {
    const unsub = subscribeCompanyProfile((profile) => {
      setCompanyLogoUrl(profile?.logoDataUrl || null);
    });
    return () => unsub && unsub();
  }, []);

  const menuItems = [
    { id: 1, title: 'ลูกค้า', nav: '/admin/customers', icon: Users, category: 'งาน' },
    { id: 2, title: 'รถยนต์', nav: '/admin/cars', icon: Car, category: 'งาน' },
    { id: 3, title: 'งานซ่อม', nav: '/admin/repairs', icon: Wrench, category: 'งาน' },
    { id: 4, title: 'สต็อกของ', nav: '/admin/parts', icon: Package, category: 'งาน' },
    { id: 5, title: 'ตารางงาน / นัดหมาย', nav: '/admin/appointment-calendar', icon: Calendar, category: 'งาน' },
    { id: 6, title: 'พนักงาน', nav: '/admin/employees', icon: UserCheck, category: 'งาน' },
    { id: 7, title: 'รายงาน', nav: '/admin/reports', icon: FileText, category: 'ติดตาม' },
    { id: 8, title: 'Dashboard', nav: '/admin/dashboard', icon: BarChart3, category: 'ติดตาม' }
  ];

  const tabs = ['ทั้งหมด', 'งาน', 'ติดตาม'];

  const getFilteredItems = () => {
    if (activeTab === 'ทั้งหมด') return menuItems;
    return menuItems.filter(item => item.category === activeTab);
  };

  const handleCardClick = (item) => {
    navigate(item.nav);
  };

  // เปิดกล่องยืนยัน logout
  const openConfirmLogout = () => setShowConfirmLogout(true);
  const cancelLogout = () => setShowConfirmLogout(false);

  const confirmLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } finally {
      setIsLoggingOut(false);
      setShowConfirmLogout(false);
      navigate('/', { replace: true });
    }
  };

  const handleCompanyProfile = () => {
    navigate('/admin/company-profile');
  };

  return (
    <div className="home-container">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-frame">
              <img src={companyLogoUrl || LOGO} alt="Logo" className="logo-img" />
            </div>
          </div>
          <div className="company-info">
            <button className="company-btn" onClick={handleCompanyProfile}>
              <span className="company-name">โปรไฟล์</span>
              <span className="building-icon"><Building size={20} /></span>
            </button>
          </div>
        </div>
        <div className="header-right">
          <button className="logout-btn" onClick={openConfirmLogout} disabled={isLoggingOut}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <h1 className="page-title1">หน้าหลัก</h1>

        {/* Tabs */}
        <div className="tabs-container">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Cards Grid */}
        <div className="cards-grid">
          {getFilteredItems().map(item => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.id}
                className="menu-card"
                onClick={() => handleCardClick(item)}
              >
                <div className="card-icon">
                  <IconComponent size={40} />
                </div>
                <div className="card-title-home">{item.title}</div>
              </div>
            );
          })}
        </div>
      </main>

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
              <button className="btn-outline" onClick={cancelLogout} disabled={isLoggingOut}>
                ยกเลิก
              </button>
              <button className="btn-danger" onClick={confirmLogout} disabled={isLoggingOut}>
                {isLoggingOut ? 'กำลังออก…' : 'ออกจากระบบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
