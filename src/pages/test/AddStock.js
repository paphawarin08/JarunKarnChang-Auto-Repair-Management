import React, { useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import '../style/addstock.css';

const AddInventoryPage = () => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    brand: '',
    type: '',
    grade: '',
    description: '',
    cost: '',
    price: '',
    unit: '',
    sell: '',
    status: '',
    minimumStock: '',
    note: '',
    image: null
  });

  const [inventoryList, setInventoryList] = useState([]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = () => {
    if (!formData.id || !formData.name) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setInventoryList(prev => [...prev, formData]);

    setFormData({
      id: '',
      name: '',
      brand: '',
      type: '',
      grade: '',
      description: '',
      cost: '',
      price: '',
      unit: '',
      sell: '',
      status: '',
      minimumStock: '',
      note: '',
      image: null
    });
  };

  return (
    <div className="add-inventory-container">
      {/* Header */}
      <div className="add-inventory-header">
        <button className="back-button">
          <ArrowLeft size={24} />
        </button>
        <h1 className="page-title">เพิ่มสต็อกของ</h1>
      </div>

      {/* Form */}
      <div className="form-container">
        <h2 className="form-title">ข้อมูลอะไหล่</h2>

        {/* ✅ จัด layout ใหม่: ซ้ายเป็นอัปโหลดรูป, ขวาเป็นฟอร์ม */}
        <div className="form-content">
          {/* Upload Image */}
          <div className="image-upload-section">
            <label htmlFor="file-upload" className="image-placeholder">
              {formData.image ? (
                <img
                  src={URL.createObjectURL(formData.image)}
                  alt="Preview"
                  className="preview-image"
                />
              ) : (
                <>
                  <Camera size={40} color="#666" />
                  <span className="upload-text">เพิ่มรูปภาพ</span>
                </>
              )}
            </label>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleInputChange('image', e.target.files[0])}
              className="file-input"
            />
          </div>

          {/* Form Fields */}
          <div className="form-fields">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">รหัสอะไหล่</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.id}
                  onChange={(e) => handleInputChange('id', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">ประเภท</label>
                <select
                  className="form-select"
                  value={formData.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}  
                >
                  <option value="">เลือกประเภทอะไหล่</option>
                  <option value="อะไหล่แท้">อะไหล่แท้</option>
                  <option value="อะไหล่เทียม">อะไหล่เทียม</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">เกรด</label>
                <select
                  className="form-select"
                  value={formData.grade}
                  onChange={(e) => handleInputChange('grade', e.target.value)} 
                >
                  <option value="">เลือกเกรดอะไหล่</option>
                  <option value="A">เกรด A</option>
                  <option value="B">เกรด B</option>
                  <option value="C">เกรด C</option>
                  <option value="D">เกรด D</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">แบรนด์อะไหล่</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.brand}
                  onChange={(e) => handleInputChange('brand', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">ชื่ออะไหล่</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">จำนวนอะไหล่</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.cost}
                  onChange={(e) => handleInputChange('cost', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">หน่วยนับ</label>
                <select
                  className="form-select"
                  value={formData.unit}
                  onChange={(e) => handleInputChange('unit', e.target.value)}
                >
                  <option value="">เลือกหน่วย</option>
                  <option value="piece">ชิ้น</option>
                  <option value="set">ชุด</option>
                  <option value="pair">คู่</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">ราคาที่ซื้อ</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.price}
                  onChange={(e) => handleInputChange('price', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">ราคาขาย</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.sell}
                  onChange={(e) => handleInputChange('sell', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">สถานะ</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
              >
                <option value="">เลือกสถานะ</option>
                <option value="เติม">เติมสต็อก</option>
                <option value="หมด">หมด</option>
                <option value="มีอะไหล่">มีอะไหล่</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                จำนวนอะไหล่ในสต็อกขั้นต่ำ (ถ้าต่ำกว่านี้จะมีการแจ้งเตือน)
              </label>
              <input
                type="number"
                className="form-input"
                value={formData.minimumStock}
                onChange={(e) => handleInputChange('minimumStock', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">โน้ต</label>
              <textarea
                className="form-textarea"
                value={formData.note}
                onChange={(e) => handleInputChange('note', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>

      <button className="submit-button" onClick={handleSubmit}>
        เพิ่มข้อมูล
      </button>
    </div>
  );
};

export default AddInventoryPage;
