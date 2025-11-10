// src/pages/MainPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';

const MainPage = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // ภายหลังจะใส่ Firebase Auth signOut ได้ที่นี่
    console.log('Logging out...');
    navigate('/'); // กลับไปหน้า login
  };

  return (
    <div style={styles.container}>
      <h2>Welcome to the Main Page</h2>
      <button onClick={handleLogout} style={styles.button}>Logout</button>
    </div>
  );
};

const styles = {
  container: {
    textAlign: 'center',
    marginTop: '100px',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};

export default MainPage;
