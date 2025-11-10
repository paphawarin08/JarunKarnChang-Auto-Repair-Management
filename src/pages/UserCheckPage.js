import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Car, Wrench, CheckCircle, ClipboardCheck } from 'lucide-react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { app } from '../firebase/firebase';
import LOGO from '../images/jarun.jpg';
import '../styles/UserCheckPage.css';
import { useNavigate} from "react-router-dom";

const UserCheckPage = () => {
  const location = useLocation();
  const searchCodeFromNav = location.state?.searchCode || '';
  const [searchQuery, setSearchQuery] = useState(searchCodeFromNav);
  const [userData, setUserData] = useState(null);
  const [repairSteps, setRepairSteps] = useState([]);
  const [repairHistory, setRepairHistory] = useState([]);
  const [sortOrder, setSortOrder] = useState('oldest');
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

    const [companyData, setCompanyData] = useState({
      logoDataUrl: '',
    });
  
  // แม็ปสถานะตามข้อความ
  const statusStepMap = {
    'รับรถเข้าร้าน': 1,
    'ตรวจสอบเสร็จสิ้น': 2,
    'ระหว่างการซ่อม': 3,
    'ซ่อมเสร็จสิ้น': 4
  };

    // ดึงข้อมูล companyProfile จาก Firebase
    useEffect(() => {
      const fetchCompanyProfile = async () => {
        try {
          const db = getFirestore(app);
          const querySnapshot = await getDocs(collection(db, 'companyProfile'));
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            setCompanyData({
              logoDataUrl: data.logoDataUrl || '',
            });
          });
        } catch (error) {
          console.error('Error fetching company profile:', error);
        }
      };
  
      fetchCompanyProfile();
    }, []);

  const stepsTemplate = [
    { id: 1, name: 'รับรถเข้าร้าน', icon: Car },
    { id: 2, name: 'ตรวจสอบเสร็จสิ้น', icon: ClipboardCheck },
    { id: 3, name: 'ระหว่างการซ่อม', icon: Wrench },
    { id: 4, name: 'ซ่อมเสร็จสิ้น', icon: CheckCircle }
  ];

  const formatThaiDate = (dateObj) => {
    if (!dateObj) return '';
    return new Date(dateObj).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    setError('');
    setUserData(null);
    setRepairSteps([]);
    setRepairHistory([]);

    try {
      const db = getFirestore(app);
      const repairsRef = collection(db, 'repairs');
      const q = query(repairsRef, where('code', '==', searchQuery));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs[0];
        const data = docData.data();

        const createdAt = data.createdAt?.toDate?.();

        setUserData({
          userId: data.code,
          name: data.vehicleTitle || '',
          registrationNumber: createdAt
            ? `รับรถ ${formatThaiDate(createdAt)}`
            : 'รับรถ',
          status: data.status || 'รับรถเข้าร้าน'
        });

        const latestStatusText = data.status?.split(' ')[0] || 'รับรถเข้าร้าน';
        const stepIndex = statusStepMap[latestStatusText] || 1;
        setCurrentStep(stepIndex);

        setRepairSteps(
          stepsTemplate.map((step, index) => ({
            ...step,
            completed: index + 1 <= stepIndex,
            current: index + 1 === stepIndex
          }))
        );

        // ดึงข้อมูล statusLogs จาก subcollection
        const statusLogsRef = collection(db, `repairs/${docData.id}/statusLogs`);
        const statusLogsSnap = await getDocs(statusLogsRef);

        const formattedHistory = statusLogsSnap.docs.map(doc => {
          const item = doc.data();
          return {
            createdAt: item.createdAt?.toDate?.() || new Date(),
            note: item.note || '',
            status: item.status || ''
          };
        });

        setRepairHistory(formattedHistory);
      } else {
        setError('ไม่พบข้อมูลสำหรับรหัสนี้');
      }
    } catch (err) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // เรียงลำดับประวัติการซ่อมตามวันที่และเวลา
  const sortedHistory = [...repairHistory].sort((a, b) => {
    return sortOrder === 'newest'
      ? b.createdAt - a.createdAt
      : a.createdAt - b.createdAt;
  });

  // กดค้นหาอัตโนมัติเมื่อเข้าหน้า
  useEffect(() => {
    if (searchCodeFromNav) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCodeFromNav]);

  return (
    <div className="user-check-page">
      {/* Header */}
      <div className="user-check-header">
        <div className="header-container">
          <div className="company-logo-usercheck" onClick={() => nav(-1)}>
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
                placeholder="กรอกรหัส เพื่อตรวจสอบสถานะการซ่อม"
                className="search-input-user"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="search-button" onClick={handleSearch}>
              ค้นหา
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-container">
        {loading && <p>กำลังโหลดข้อมูล...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}

        {userData && (
          <>
            {/* User Info */}
            <div className="user-info-card">
              <h2 className="user-id-title">ID: {userData.userId}</h2>
              <div className="user-info-grid">
                <div className="user-info-item">
                  <div className="user-info-value">{userData.name}</div>
                </div>
                <div className="user-info-item">
                  <span className="user-info-label">{userData.registrationNumber}</span>
                </div>
              </div>
            </div>

            {/* Repair Process Steps */}
            <div className="repair-process-card">
              <div className="process-steps-container">
                {repairSteps.map((step, index) => {
                  const completed = step.completed;
                  const current = step.current;

                  return (
                    <div key={step.id} className="process-step">
                      <div
                        className={`step-icon-container ${
                          completed ? (current ? 'current' : 'completed') : 'pending'
                        }`}
                        style={{ color: completed ? 'green' : '#ccc' }}
                      >
                        <step.icon className="step-icon" />
                      </div>
                      <span className="step-name">{step.name}</span>
                      <div
                        className={`step-status-indicator ${completed ? 'completed' : 'pending'}`}
                      >
                        {completed && <CheckCircle className="status-check-icon" />}
                      </div>
                      {index < repairSteps.length - 1 && (
                        <div className={`step-connector ${completed ? 'completed' : ''}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Repair History */}
            <div className="repair-history-card">
              <div className="history-header">
                <h3 className="history-title">ประวัติการซ่อม</h3>
                <select
                  className="history-filter"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                >
                  <option value="oldest">เก่าไปใหม่</option>
                  <option value="newest">ใหม่ไปเก่า</option>
                </select>
              </div>

              <div className="history-content">
                {sortedHistory.map((item, index) => (
                  <div key={index} className="history-item">
                    <div className="history-status">สถานะ: {item.status}</div>
                    <div className="history-description">{item.note}</div>
                    <div className="history-date">{formatThaiDate(item.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UserCheckPage;