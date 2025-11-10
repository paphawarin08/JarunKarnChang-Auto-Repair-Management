// src/pages/CompanyProfile.js
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Edit3 } from 'lucide-react';
import '../styles/CompanyProfile.css';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/firebase';
import { fetchCompanyProfile, saveCompanyProfile } from '../services/companyProfileService';

// ค่าคงที่สำหรับจำกัดขนาดโลโก้และขนาดย่อภาพ
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB สูงสุดที่ยอมให้กับโลโก้ (รูปแบบ dataURL)
const DEFAULT_MAX_W = 700;          // ความกว้างสูงสุดตอนย่อรูป
const DEFAULT_MAX_H = 700;          // ความสูงสูงสุดตอนย่อรูป

const CompanyProfile = () => {
  const navigate = useNavigate();

  // state หลักของหน้าโปรไฟล์บริษัท
  const [logoImage, setLogoImage] = useState(null); // เก็บ dataURL ของโลโก้ (พร้อมแสดงทันที)
  const [showPreview, setShowPreview] = useState(false); // toggle ระหว่างโหมดฟอร์ม/พรีวิว
  const [loading, setLoading] = useState(true);          // โหลดข้อมูลครั้งแรก
  const [hasProfile, setHasProfile] = useState(false);   // มีโปรไฟล์ใน DB อยู่แล้วไหม

  // state ของฟอร์มข้อมูลบริษัท (ช่อง input ทั้งหมด)
  const [formData, setFormData] = useState({
    companyName: '',
    ownerName: '',
    taxId: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    fax: '',
    email: '',
    otherInfo: '',
    lineID: ''
  });

  /* ===========================
     Helpers เกี่ยวกับรูปภาพ
     =========================== */

  // (หลัก) ฟังก์ชันเล็กๆ วัด "ขนาดเป็นไบต์" ของ dataURL
  // ใช้เพื่อเช็คว่าเกินโควตา 1MB ไหมก่อนยอมให้บันทึก/แสดงผล
  const dataUrlBytes = (dataUrl) => {
    const b64 = (dataUrl || '').split(',')[1] || '';
    // ประมาณขนาด payload base64 -> ไบต์
    return Math.ceil((b64.length * 3) / 4);
  };

  // (คล้ายไฟล์ก่อนหน้า) อ่านไฟล์จาก input -> แปลงเป็น dataURL (Promise)
  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result); // ได้สตริง dataURL
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // (คล้ายไฟล์ก่อนหน้า) โหลดรูปจาก dataURL เข้า <img> เพื่อรู้ขนาดจริง (Promise)
  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img); // ได้อ็อบเจ็กต์รูปไว้ใช้งานกับ canvas
      img.onerror = reject;
      img.src = src;
    });

  // (หลัก) อัลกอริทึมย่อ/บีบอัดรูปให้ไม่เกิน maxBytes
  // ไอเดีย: scale รูปไม่เกิน 700x700 และบีบอัด JPEG โดยค่อยๆ ลด quality -> ถ้ายังเกินค่อยลดมิติรูป
  const compressToMaxBytes = async (file, maxBytes, maxW = DEFAULT_MAX_W, maxH = DEFAULT_MAX_H) => {
    // 1) อ่านไฟล์เป็น dataURL แล้วโหลดเป็น <img> เพื่อรู้ขนาดเดิม
    const originalUrl = await readFileAsDataURL(file);
    let img = await loadImage(originalUrl);

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    // เริ่มจากคุณภาพ 0.85 แล้วค่อยๆ ลดลง ถ้ายังเกินค่อยลดขนาดรูป
    let quality = 0.85;
    let attempts = 0;
    let dataUrl;

    while (attempts < 12) { // กันหลุดลูป: ลองได้สูงสุด ~12 รอบ
      // 2) คำนวณสเกลไม่ให้เกิน maxW x maxH และไม่ "ขยาย" ถ้ารูปเล็กอยู่แล้ว
      const scale = Math.min(maxW / width, maxH / height, 1);
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      // 3) วาดลง canvas ด้วยขนาดใหม่
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // 4) export ออกเป็น JPEG โดยใช้ quality ปัจจุบัน
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = dataUrlBytes(dataUrl);

      // ถ้าขนาดถึงเกณฑ์แล้ว จบเลย
      if (bytes <= maxBytes) return dataUrl;

      // 5) ถ้ายังเกิน: ลด quality ลงจนถึง 0.5 ก่อน
      //    ถ้ายังไม่พอ ค่อย "ลดมิติรูป" ลง 10% แล้ววนใหม่
      if (quality > 0.5) {
        quality = Math.max(0.5, quality - 0.1);
      } else {
        width = Math.round(width * 0.9);
        height = Math.round(height * 0.9);
      }

      attempts += 1;
    }

    // ถ้าลองจนสุดทางแล้วยังเกิน ส่งสัญญาณให้ผู้ใช้เลือกไฟล์ใหม่แทน
    return null;
  };

  /* ===========================
     โหลดข้อมูลครั้งแรก (หลัก)
     ดึงโปรไฟล์บริษัทจาก DB แล้วใส่ลงฟอร์ม/พรีวิว
     =========================== */
  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchCompanyProfile();
        if (profile) {
          setHasProfile(true);
          // เติมค่าลงฟอร์ม (กรณีมีข้อมูลเก่า)
          setFormData(prev => ({
            ...prev,
            companyName: profile.companyName || '',
            ownerName: profile.ownerName || '',
            taxId: profile.taxId || '',
            street: profile.street || '',
            city: profile.city || '',
            state: profile.state || '',
            zip: profile.zip || '',
            phone: profile.phone || '',
            fax: profile.fax || '',
            email: profile.email || '',
            otherInfo: profile.otherInfo || '',
            lineID: profile.lineID || ''
          }));
          setLogoImage(profile.logoDataUrl || null); // รูปโลโก้เก่าถ้ามี
          setShowPreview(true);                      // เปิดโหมดพรีวิวทันที
        } else {
          setHasProfile(false); // ยังไม่มีโปรไฟล์ -> โหมดกรอกฟอร์ม
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ===========================
     อีเวนต์ของฟอร์ม/การอัปโหลด (หลัก)
     =========================== */

  // (หลัก) เวลาเลือกโลโก้: เช็คเป็นรูปภาพ, บีบอัดให้ไม่เกิน 1MB, แล้วค่อยเซ็ตให้แสดง
  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // กันผู้ใช้เลือกไฟล์ที่ไม่ใช่รูป
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    // บีบอัด/ย่อรูปให้ผ่านเกณฑ์
    const compressed = await compressToMaxBytes(file, MAX_LOGO_BYTES);
    if (!compressed) {
      alert('รูปภาพมีขนาดใหญ่เกิน 1 MB โปรดเลือกไฟล์ที่เล็กลงหรือใช้รูปที่มีความละเอียดต่ำกว่า');
      return;
    }

    // กันพลาด: ตรวจซ้ำอีกรอบว่าจริงๆ แล้วไม่เกิน 1MB แน่ๆ
    if (dataUrlBytes(compressed) > MAX_LOGO_BYTES) {
      alert('รูปภาพมีขนาดใหญ่เกิน 1 MB');
      return;
    }

    setLogoImage(compressed); // พร้อมแสดงตัวอย่างโลโก้
  };

  // (คล้าย/ไม่เน้นนับ) อัปเดตค่าช่องฟอร์มทั่วไป
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // (หลัก) กดบันทึก: ตรวจความครบถ้วน + ตรวจโลโก้เกินโควตาไหม แล้วค่อยเรียก service บันทึก
  const handleSubmit = async () => {
    if (!formData.companyName || !formData.ownerName) {
      alert('กรุณากรอกชื่อบริษัทและชื่อเจ้าของให้ครบถ้วน');
      return;
    }

    if (logoImage && dataUrlBytes(logoImage) > MAX_LOGO_BYTES) {
      alert('รูปภาพโลโก้เกิน 1 MB กรุณาเปลี่ยนรูปหรือให้ระบบย่อรูปใหม่');
      return;
    }

    setLoading(true);
    try {
      await saveCompanyProfile({
        ...formData,
        logoDataUrl: logoImage || null,
        updatedBy: auth.currentUser?.uid || null, // เก็บว่าใครเป็นคนอัปเดต
      });
      setShowPreview(true); // กลับไปหน้าพรีวิวหลังบันทึก
      setHasProfile(true);
    } finally {
      setLoading(false);
    }
  };

  // (หลัก) ปุ่มย้อนกลับ: ถ้าอยู่หน้าแบบฟอร์มและมีข้อมูลเดิม -> ย้อนกลับไปพรีวิว
  // ถ้าอยู่พรีวิว (หรือยังไม่มีข้อมูล) -> กลับหน้า Home
  const handleBack = () => {
    if (!showPreview && hasProfile) {
      setShowPreview(true); // ฟอร์ม (มีข้อมูลเดิม) → พรีวิว
    } else {
      navigate('/admin/home'); // พรีวิว หรือ ฟอร์ม(ยังไม่มีข้อมูล) → Home
    }
  };

  if (loading) {
    return (
      <div className="company-profile-container">
        <header className="profile-header">
          <button className="back-button" onClick={handleBack}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="page-title">รายละเอียดอู่ซ่อมรถ</h1>
        </header>
        <div style={{ padding: 16 }}>กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="company-profile-container">
      {/* Header */}
      <header className="profile-header">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}><ArrowLeft size={24} /></button>
          <h1 className="page-title"> {showPreview ? 'ข้อมูลอู่ซ่อมรถ' : 'รายละเอียดอู่ซ่อมรถ'} </h1>
        </div>
      </header>

      <div className="profile-content">
        {!showPreview ? (
          /* Form View */
          <div className="profile-form">
            <div className="form-card">
              {/* Logo Section */}
              <div className="logo-section">
                <div className="logo-placeholder">
                  {logoImage ? (
                    <img src={logoImage} alt="Company Logo" className="uploaded-logo" />
                  ) : (
                    <>
                      <span className="logo-text">YOUR COMPANY</span>
                      <span className="logo-text">LOGO HERE</span>
                    </>
                  )}
                  <label htmlFor="logo-upload" className="edit-logo-btn">
                    <Edit3 size={16} />
                  </label>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              <div className="logo-note">ควรใช้ภาพขนาด 460 x 230 พิกเซลขึ้นไปเพื่อความสมบูรณ์</div>
              
              {/* Form Fields */}
              <div className="form-row">
                <div className="form-group">
                  <label>ชื่อบริษัท</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกชื่อบริษัท"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>ชื่อเจ้าของ</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกชื่อเจ้าของ"
                    value={formData.ownerName}
                    onChange={(e) => handleInputChange('ownerName', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>เลขกำกับภาษี</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกเลขกำกับภาษี"
                    value={formData.taxId}
                    onChange={(e) => handleInputChange('taxId', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group full-width">
                  <label>ที่อยู่</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกที่อยู่"
                    value={formData.street}
                    onChange={(e) => handleInputChange('street', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>อำเภอ</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกชื่ออำเภอ"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>จังหวัด</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกชื่อจังหวัด"
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>รหัสไปรษณีย์</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกรหัสไปรษณีย์"
                    value={formData.zip}
                    onChange={(e) => handleInputChange('zip', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>โทรศัพท์</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกหมายเลขโทรศัพท์"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>แฟกซ์</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกหมายเลขแฟกซ์"
                    value={formData.fax}
                    onChange={(e) => handleInputChange('fax', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>ไอดีไลน์</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกไอดีไลน์"
                    value={formData.lineID}
                    onChange={(e) => handleInputChange('lineID', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group full-width">
                  <label>อีเมล</label>
                  <input
                    type="text"
                    placeholder="กรุณากรอกอีเมล (หลายอีเมลแยกด้วยเครื่องหมายจุลภาค)"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              

              <div className="form-row">
                <div className="form-group full-width">
                  <div className="label-with-note">
                    <label>ข้อมูลเพิ่มเติม</label>
                  </div>
                  <textarea
                    placeholder="กรุณากรอกข้อมูลเพิ่มเติม เช่น หมายเลขประจำตัวผู้เสียภาษี, หมายเลขโทรศัพท์ที่สอง, ฯลฯ"
                    value={formData.otherInfo}
                    onChange={(e) => handleInputChange('otherInfo', e.target.value)}
                    className="form-textarea"
                    rows="4"
                  />
                </div>
              </div>

              <button className="submit-button" onClick={handleSubmit}>
                บันทึก
              </button>
            </div>
          </div>
        ) : (
          /* Preview View */
          <div className="profile-preview">
            <div className="preview-card">
              <div className="preview-header">
                <h2>ข้อมูลอู่ซ่อมรถที่บันทึกแล้ว</h2>
                <button className="edit-button" onClick={() => setShowPreview(false)}>
                  <Edit3 size={16} />
                  แก้ไข
                </button>
              </div>

              <div className="preview-content">
                {logoImage && (
                  <div className="preview-logo">
                    <img src={logoImage} alt="Uploaded Company Logo" className="uploaded-logo" />
                  </div>
                )}

                <div className="info-section">
                  <h3>ข้อมูลบริษัท</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>ชื่อบริษัท:</label>
                      <span>{formData.companyName || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>ชื่อเจ้าของ:</label>
                      <span>{formData.ownerName || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>เลขกำกับภาษี:</label>
                      <span>{formData.taxId || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="info-section">
                  <h3>ที่อยู่</h3>
                  <div className="info-grid">
                    <div className="info-item full">
                      <label>ถนน:</label>
                      <span>{formData.street || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>เมือง:</label>
                      <span>{formData.city || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>จังหวัด:</label>
                      <span>{formData.state || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>รหัสไปรษณีย์:</label>
                      <span>{formData.zip || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="info-section">
                  <h3>ข้อมูลติดต่อ</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>โทรศัพท์:</label>
                      <span>{formData.phone || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>แฟกซ์:</label>
                      <span>{formData.fax || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>อีเมล:</label>
                      <span>{formData.email || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>ไอดีไลน์:</label>
                      <span>{formData.lineID || '-'}</span>
                    </div>
                  </div>
                </div>

                {formData.otherInfo && (
                  <div className="info-section">
                    <h3>ข้อมูลเพิ่มเติม</h3>
                    <div className="other-info">
                      {formData.otherInfo}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyProfile;
