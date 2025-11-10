import React from 'react';
import '../../styles/TechRepairInfo.css';

const TechRepairInfo = () => {
  return (
    <div className="repair-info-container">
      <h2 className="section-title">ข้อมูลงานซ่อม</h2>

      <div className="customer-vehicle-section">
        <div className="customer-card-staff">
          <div className="avatar">KK</div>
          <div className="customer-details">
            <strong>KKK</strong>
            <p>luckky080@gmail.com</p>
            <p>0641668917</p>
            <p>สุรนารี</p>
            <button className="view-button1">View Client</button>
          </div>
        </div>
        <div className="vehicle-card">
          <img
            src="https://m.media-amazon.com/images/I/61Rx9tHudUL._UF1000,1000_QL80_.jpg"
            alt="vehicle"
            className="vehicle-img"
          />
          <div className="vehicle-details">
            <strong>2023 102 IRONWORKS, INC.</strong>
            <p>Coupe</p>
            <p>กฬ5253</p>
            <p>in at:miles</p>
            <p>out at:miles</p>
            <button className="view-button">View Vehicle</button>
          </div>
        </div>
      </div>

      <div className="inspection-section">
        <button className="action-btn">ปัญหาที่พบหรือรายงาน</button>
        <button className="action-btn">ตรวจสอบรถยนต์</button>

        <table className="inspection-table">
          <thead>
            <tr>
              <th>Concern</th>
              <th>System</th>
              <th>Fault</th>
              <th>Correction</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ปัญหาอาการ</td>
              <td>ปัญหาอาการ</td>
              <td>ปัญหาอาการ</td>
              <td>ปัญหาอาการ</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="parts-section">
        <h3>อะไหล่ และ พนักงานที่รับผิดชอบ</h3>
        <div className="sub-section">
          <strong>อะไหล่</strong>
          <div className="part-box">
            <p>54534345</p>
            <p># Description: ชื่ออะไหล่</p>
            <p># Price: $22</p>
            <p># Quantity: 1 pc.</p>
            <p>Amount: $22.00</p>
          </div>
        </div>
         <br/>
        <div className="sub-section">
          <strong>พนักงานที่รับผิดชอบ</strong>
          <div className="staff-box"> 
            <p>ชื่อของคนที่รับผิดชอบ</p>
            <p>ประเภท fulltime หรือ part time</p>
            <p>ช่างประจำร้าน</p>
          </div>
        </div>
      </div>

      <div className="cost-section">
        <h3>ค่าใช้จ่าย</h3>
        <table className="cost-table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th>จำนวน</th>
              <th>ราคาต่อหน่วย</th>
              <th>รวม</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>อะไหล่1</td>
              <td>1 อัน</td>
              <td>000 บ.</td>
              <td>000 บ.</td>
            </tr>
            <tr>
              <td>อะไหล่2</td>
              <td>1 อัน</td>
              <td>000 บ.</td>
              <td>000 บ.</td>
            </tr>
            <tr>
              <td>เพิ่มเติม</td>
              <td>1 อัน</td>
              <td>000 บ.</td>
              <td>000 บ.</td>
            </tr>
          </tbody>
        </table>
        <div className="summary">
          <p>Total: $85.00</p>
          <p>Paid: $0.00</p>
          <p>Discount: $0.00</p>
          <p className="balance-due">Balance Due: $85.00</p>
        </div>
      </div>

      <div className="status-section">
        <h3>สถานะของงาน</h3>
        <div className="status-box">
          <label>เปลี่ยนสถานะเป็น</label>
          <select>
            <option>รับรถเข้าร้าน</option>
            <option>ตรวจสอบอาการ</option>
            <option>ตรวจสอบเสร็จ</option>
            <option>กำลังซ่อม</option>
            <option>ซ่อมเสร็จ</option>
          </select>
        </div>
        <div className="note-box">
          <label>หมายเหตุ</label>
          <textarea placeholder="หมายเหตุ..." />
        </div>
        <button className="update-btn">อัปเดต</button>
      </div>
    </div>
  );
};

export default TechRepairInfo;