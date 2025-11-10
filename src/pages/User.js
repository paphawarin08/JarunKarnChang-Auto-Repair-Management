import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/User.css';
import { login } from '../services/authService';
import Line from './Line.jpeg';
import Tel from './tell.jpeg';
import WalkIn from './walkin.jpeg';
import LOGO from '../images/jarun.jpg';

const User = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate('/user/check', { state: { searchCode: searchQuery } });
    } else {
      navigate('/user/check');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="uc-page">
      <div className="uc-header">
        <div className="uc-header-container">
          <div className="uc-company-logo">
            <img src={LOGO} alt="Logo" className="uc-logo-img" />
          </div>
          <div className="uc-header-search">
            <div className="uc-search-container">
              <input
                type="text"
                placeholder="กรอกรหัส เพื่อตรวจสอบสถานะการซ่อม"
                className="uc-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
              />
            </div>
            <button className="uc-search-button" onClick={handleSearch}>
              ค้นหา
            </button>
          </div>
        </div>
      </div>

      <div className="uc-banner-wrapper">
        <img src={require('../images/car6.jpeg')} alt="Banner" className="uc-banner-image" />
      </div>

      <main className="uc-main">
        <h2 className="uc-title">วิธีการจองคิว ?</h2>
        <div className="uc-booking-methods">
          <div className="uc-method">
            <img src={Line} alt="LINE" className="uc-icon" />
            <p>QR LINE </p>
          </div>
          <div className="uc-method">
            <img src={Tel} alt="Phone" className="uc-icon" />
            <p>Tell: 062 895 4539</p>
          </div>
          <div className="uc-method">
            <img src={WalkIn} alt="Walk-in" className="uc-icon" />
            <p>WalkIn</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default User;
