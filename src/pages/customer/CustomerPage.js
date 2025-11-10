// === CustomerPage.js (ใส่คอมเมนต์อ่านง่ายสไตล์เพื่อนสอนเพื่อน) ===
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Table, List, ChevronDown, MoreVertical, Plus, Trash2, ArrowLeft, Phone, Mail, MapPin, User, X, Pencil } from 'lucide-react';
import '../../styles/CustomerPage.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../firebase/firebase';
import { subscribeCustomers, addCustomer, deleteCustomer, updateCustomer } from '../../services/customerService';

// ฟังก์ชัน: formatDate
// ใช้แปลงวันที่จาก Firestore (Timestamp) หรือ string ให้เป็นรูปแบบ YYYY-MM-DD
// ถ้าเป็น Timestamp จะเรียก .toDate() ก่อน แล้วค่อยประกอบสตริง
// กันพังด้วย try/catch ถ้าอะไรแปลก ๆ โผล่มาจะคืนเป็น "-"
function formatDate(val) {
  try {
    if (!val) return '-';
    if (typeof val.toDate === 'function') {
      const d = val.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }
    return val;
  } catch {
    return '-';
  }
}

// คอมโพเนนต์หลัก: CustomerPage
// หน้าที่: จัดการหน้าลูกค้าทั้งหมด → ดูแบบตาราง/การ์ด, ค้นหา-จัดอันดับ, sort, เปิดรายละเอียด, เพิ่ม/แก้/ลบ
const CustomerPage = () => {
  const [view, setView] = useState('table'); // โหมดแสดงผล 'table' หรือ 'list'
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');        // คำค้นหา
  const [sortField, setSortField] = useState('name');      // ฟิลด์ที่ใช้ sort
  const [sortDirection, setSortDirection] = useState('asc'); // ทิศทาง sort
  const [loading, setLoading] = useState(true);            // โหลดข้อมูลอยู่ไหม

  const [customers, setCustomers] = useState([]);          // รายชื่อลูกค้าทั้งหมด
  const [selected, setSelected] = useState(null);          // ลูกค้าที่เลือกดูรายละเอียดอยู่
  const [showDetail, setShowDetail] = useState(false);     // เปิด/ปิด modal รายละเอียด

  const [editMode, setEditMode] = useState(false);         // toggle โหมดแก้ไขใน modal รายละเอียด
  const [savingEdit, setSavingEdit] = useState(false);     // state กันกดบันทึกซ้ำตอนแก้ไข
  const [editForm, setEditForm] = useState({
    id: '', name: '', phone: '', email: '', lineId: '',
    address: '', subdistrict: '', district: '', province: '',
    note: ''
  });

  // modal เพิ่มลูกค้าใหม่
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    lineId: '',
    address: '',
    subdistrict: '',
    district: '',
    province: '',
    note: '',
  });

  const navigate = useNavigate();

  // ดึงค่า ?q= จาก URL มาใส่ช่องค้นหาให้เลย (จะได้แชร์ลิงก์ค้นหากันได้)
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q');
    if (q) setSearchTerm(q);
  }, [location.search]);

  // subscribe ลูกค้าจาก service: ทุกครั้งที่มีการเปลี่ยนก็อัปเดต state ให้ UI รีเฟรชเอง
  // ถ้าเปิด modal รายละเอียดอยู่ ก็ sync รายการนั้นให้เป็นข้อมูลล่าสุด
  useEffect(() => {
    const unsub = subscribeCustomers((list) => {
      setCustomers(list);
      setLoading(false);
      // sync รายละเอียดที่เปิดค้างอยู่
      if (showDetail && selected?._id) {
        const latest = list.find(x => x._id === selected._id);
        if (latest) setSelected(latest);
      }
    });
    return () => unsub && unsub();
  }, [showDetail, selected?._id]);

  // ตัวเลือกฟิลด์สำหรับ sort (ทำงานร่วมกับ select ข้างบน)
  const sortOptions = [
    { value: 'id', label: 'ไอดี' },
    { value: 'phone', label: 'เบอร์โทร' },
    { value: 'dateAdded', label: 'วันที่เพิ่ม' }
  ];

  // ฟังก์ชัน: handleBack
  // กลับไปหน้า Home ของ Admin
  const handleBack = () => navigate('/admin/home');

  // ฟังก์ชัน: handleImportPage
  // กดแล้วไปหน้า import ลูกค้า
  const handleImportPage = () => navigate('/admin/customers/Import_customer');

  // ฟังก์ชัน: normalize
  // แปลงค่าที่จะใช้เทียบ/เรียง ให้อยู่ในรูป string สม่ำเสมอ
  // ถ้าเป็น Timestamp จะ convert เป็น milliseconds ก่อน
  const normalize = (v) => {
    if (v == null) return '';
    if (typeof v.toDate === 'function') return v.toDate().getTime().toString();
    return String(v);
  };

  // helper เล็ก ๆ:
  // s: บังคับเป็น string ตัวเล็ก (ไว้เปรียบเทียบไม่สนเคส)
  const s = (v) => (v ?? '').toString().toLowerCase();
  // digits: เก็บเฉพาะตัวเลข (เช่น phone) เพื่อจับคู่แบบไม่สนขีด/เว้นวรรค
  const digits = (v) => (v ?? '').toString().replace(/\D/g, '');

  // useMemo: กรอง + จัดอันดับ + sort รายชื่อลูกค้าตามคำค้นและตัวเลือกเรียง
  // ตรงนี้มี "scoreOf" เอาไว้ให้คะแนน match ของแต่ละลูกค้า → อะไรแม่นกว่าก็ได้คะแนนมากกว่า
  const filteredAndSortedCustomers = useMemo(() => {
    const raw = (searchTerm ?? '').trim();
    const termLower = raw.toLowerCase();

    // โหมดค้นหาเฉพาะ ID: พิมพ์ "id:4" หรือ "#4"
    const idOnlyQuery = termLower.startsWith('id:') || raw.startsWith('#');
    const termForId = idOnlyQuery
      ? termLower.replace(/^id:|^#/i, '').trim()
      : termLower;

    // ถ้าไม่พิมพ์อะไรเลยก็แค่ sort ตามตัวเลือก
    if (!raw) {
      const base = [...customers];
      return base.sort((a, b) => {
        const av = normalize(a[sortField]);
        const bv = normalize(b[sortField]);
        return sortDirection === 'asc'
          ? av.localeCompare(bv, 'th')
          : bv.localeCompare(av, 'th');
      });
    }

    // ฟังก์ชัน: scoreOf (ซ่อนอยู่ใน useMemo)
    // ไว้คิดคะแนนความเกี่ยวข้องของลูกค้าคนนึงกับคำค้น
    // logic: เน้น ID มากสุด → รองลงมาชื่อ → เบอร์ → อื่น ๆ (อีเมล/ไลน์/ที่อยู่)
    const scoreOf = (c) => {
      const id = s(c.id);
      const name = s(c.name);
      const phone = digits(c.phone);
      const email = s(c.email);
      const lineId = s(c.lineId);
      const address = s(c.address);
      const subdistrict = s(c.subdistrict);
      const district = s(c.district);
      const province = s(c.province);
      const note = s(c.note);

      const t = termForId;
      const tNum = digits(raw);

      // โหมดค้นหาเฉพาะ ID
      if (idOnlyQuery) {
        if (!t) return 0;
        if (id === t) return 1000;
        if (id.startsWith(t)) return 800;
        if (id.includes(t)) return 600;
        return 0;
      }

      // โหมดปกติ: ให้คะแนนตามระดับความเป๊ะ
      let score = 0;

      // ID เด่นสุด
      if (id === termLower) score = Math.max(score, 1000);
      else if (id.startsWith(termLower)) score = Math.max(score, 850);
      else if (id.includes(termLower)) score = Math.max(score, 700);

      // ชื่อ
      if (name === termLower) score = Math.max(score, 500);
      else if (name.startsWith(termLower)) score = Math.max(score, 400);
      else if (name.includes(termLower)) score = Math.max(score, 300);

      // เบอร์ (เทียบเฉพาะตัวเลข)
      if (tNum) {
        if (phone === tNum) score = Math.max(score, 280);
        else if (phone.startsWith(tNum)) score = Math.max(score, 240);
        else if (phone.includes(tNum)) score = Math.max(score, 200);
      }

      // ฟิลด์อื่น ๆ
      const others = [email, lineId, address, subdistrict, district, province, note];
      if (others.some(f => f.includes(termLower))) score = Math.max(score, 120);

      return score;
    };

    // จัดลำดับโดยดูคะแนนก่อน แล้วค่อยแตกประเด็นไปตาม sortField/Direction
    const scored = customers
      .map(c => ({ c, score: scoreOf(c) }))
      .filter(x => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const av = normalize(a.c[sortField]);
        const bv = normalize(b.c[sortField]);
        return sortDirection === 'asc'
          ? av.localeCompare(bv, 'th')
          : bv.localeCompare(av, 'th');
      });

    return scored.map(x => x.c);
  }, [customers, searchTerm, sortField, sortDirection]);

  // ฟังก์ชัน: handleSort
  // คลิกหัวคอลัมน์แล้วปรับทิศทาง/ฟิลด์ที่ใช้ sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // ฟังก์ชัน: openDetail
  // เปิด modal รายละเอียด + เตรียมค่าใส่ฟอร์มแก้ไข
  const openDetail = (customer) => {
    setSelected(customer);
    setEditMode(false);
    setEditForm({
      id: customer.id || '',
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      lineId: customer.lineId || '',
      address: customer.address || '',
      subdistrict: customer.subdistrict || '',
      district: customer.district || '',
      province: customer.province || '',
      note: customer.note || '',
    });
    setShowDetail(true);
  };

  // ฟังก์ชัน: closeDetail
  // ปิด modal รายละเอียดและรีเซ็ตสถานะที่เกี่ยวข้องกับการแก้ไข
  const closeDetail = () => {
    setShowDetail(false);
    setSelected(null);
    setEditMode(false);
  };

  // ฟังก์ชัน: startEdit / cancelEdit
  // เข้าโหมดแก้ไข / ยกเลิกแล้วดึงค่าล่าสุดของ selected มากรอกคืนในฟอร์ม
  const startEdit = () => setEditMode(true);
  const cancelEdit = () => {
    if (selected) {
      setEditForm({
        id: selected.id || '',
        name: selected.name || '',
        phone: selected.phone || '',
        email: selected.email || '',
        lineId: selected.lineId || '',
        address: selected.address || '',
        subdistrict: selected.subdistrict || '',
        district: selected.district || '',
        province: selected.province || '',
        note: selected.note || '',
      });
    }
    setEditMode(false);
  };

  // ฟังก์ชัน: saveEdit (async)
  // เช็คฟิลด์บังคับ (ชื่อ/เบอร์) แล้วเรียก service updateCustomer
  // มี state savingEdit กันกดซ้ำ + แจ้งเตือนถ้าพลาด
  const saveEdit = async () => {
    if (!selected?._id) return;
    if (!editForm.name || !editForm.phone) {
      alert('กรุณากรอกชื่อและเบอร์โทร');
      return;
    }
    try {
      setSavingEdit(true);
      await updateCustomer(selected._id, {
        id: editForm.id || '',
        name: editForm.name || '',
        phone: editForm.phone || '',
        email: editForm.email || '',
        lineId: editForm.lineId || '',
        address: editForm.address || '',
        subdistrict: editForm.subdistrict || '',
        district: editForm.district || '',
        province: editForm.province || '',
        note: editForm.note || '',
        updatedBy: auth.currentUser?.uid || null,
      });
      setEditMode(false);
      setSelected(prev => prev ? ({ ...prev, ...editForm }) : prev);
    } catch (e) {
      console.error(e);
      alert('บันทึกการแก้ไขไม่สำเร็จ');
    } finally {
      setSavingEdit(false);
    }
  };

  // ฟังก์ชัน: openAdd / closeAdd
  // เปิด/ปิด modal เพิ่มลูกค้าใหม่ (รีเซ็ตฟอร์มทุกครั้งที่เปิด)
  const openAdd = () => {
    setNewCustomer({
      id: '', name: '', phone: '', email: '',
      lineId: '', address: '', subdistrict: '', district: '', province: '',
      note: ''
    });
    setShowAdd(true);
  };
  const closeAdd = () => setShowAdd(false);

  // ฟังก์ชัน: handleAddSubmit (async)
  // submit ฟอร์มเพิ่มลูกค้า → เช็คชื่อ/เบอร์ก่อน แล้วค่อยยิง addCustomer
  const handleAddSubmit = async (e) => {
    e?.preventDefault?.();
    if (!newCustomer.name || !newCustomer.phone) {
      alert('กรุณากรอกชื่อและเบอร์โทร');
      return;
    }
    try {
      await addCustomer(newCustomer, auth.currentUser?.uid || null);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert('บันทึกลูกค้าไม่สำเร็จ');
    }
  };

  // ฟังก์ชัน: handleDeleteSelected (async)
  // ลบลูกค้าที่เปิดอยู่ใน modal รายละเอียด (มี confirm ก่อน)
  const handleDeleteSelected = async () => {
    if (!selected?._id) {
      alert('กรุณาเลือกข้อมูลที่จะลบ (เปิดหน้ารายละเอียดก่อน)');
      return;
    }
    if (!window.confirm(`ยืนยันลบลูกค้า: ${selected.name || selected.id}?`)) return;
    try {
      await deleteCustomer(selected._id);
      closeDetail();
    } catch (err) {
      console.error(err);
      alert('ลบลูกค้าไม่สำเร็จ');
    }
  };

  return (
    <div className="customer-management">
      {/* Header */}
      <header className="header1">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="page-title">ลูกค้า</h1>
        </div>
        <div className="header-right-actions" onClick={handleImportPage}>
          <button className='import-button'>
            นำเข้าข้อมูล
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="main-content">
        {/* Controls */}
        <div className="controls">
          <div className="controls-left">
            <div className="view-toggle">
              <button onClick={() => setView('table')} className={`view-button ${view === 'table' ? 'active' : 'inactive'}`}>
                <Table className="icon-sm" /><span>ตาราง</span>
              </button>
              <button onClick={() => setView('list')} className={`view-button ${view === 'list' ? 'active' : 'inactive'}`}>
                <List className="icon-sm" /><span>รายการ</span>
              </button>
            </div>

            <div className="sort-container">
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split('-');
                  setSortField(field); setSortDirection(direction);
                }}
                className="sort-select"
              >
                {sortOptions.map(option => (
                  <React.Fragment key={option.value}>
                    <option value={`${option.value}-asc`}>{option.label} (น้อยไปมาก)</option>
                    <option value={`${option.value}-desc`}>{option.label} (มากไปน้อย)</option>
                  </React.Fragment>
                ))}
              </select>
              <ChevronDown className="sort-dropdown-icon" />
            </div>
          </div>

          <div className="search-container">
            <div className="search-icon"><Search className="icon-md" /></div>
            <input
              type="text"
              placeholder="ค้นหา (พิมพ์ id:4 หรือ #4 เพื่อค้นหาเฉพาะ ID)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {loading && <div className="loading-hint">กำลังโหลดข้อมูลลูกค้า…</div>}

        {/* Table View */}
        {view === 'table' && !loading && (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th className="sortable" onClick={() => handleSort('id')}>
                      ไอดี {sortField === 'id' && <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                    <th>ชื่อ</th>
                    <th className="sortable" onClick={() => handleSort('phone')}>
                      เบอร์โทร {sortField === 'phone' && <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                    <th>บ้านเลขที่</th>
                    <th>แขวง/ตำบล</th>
                    <th>เขต/อำเภอ</th>
                    <th>จังหวัด</th>
                    <th>หมายเหตุ</th>
                    <th className="sortable" onClick={() => handleSort('dateAdded')}>
                      วันที่เพิ่ม {sortField === 'dateAdded' && <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filteredAndSortedCustomers.map((c) => (
                    <tr key={c._id} className="table-row clickable" onClick={() => openDetail(c)} title="กดเพื่อดูรายละเอียด">
                      <td className="table-cell">{c.id || '-'}</td>
                      <td className="table-cell">{c.name || '-'}</td>
                      <td className="table-cell">{c.phone || '-'}</td>
                      <td className="table-cell">{c.address || '-'}</td>
                      <td className="table-cell">{c.subdistrict || '-'}</td>
                      <td className="table-cell">{c.district || '-'}</td>
                      <td className="table-cell">{c.province || '-'}</td>
                      <td className="table-cell">{c.note || '-'}</td>
                      <td className="table-cell">{formatDate(c.dateAdded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* List View */}
        {view === 'list' && !loading && (
          <div className="list-container">
            {filteredAndSortedCustomers.map((c) => (
              <div key={c._id} className="customer-card clickable" onClick={() => openDetail(c)} title="กดเพื่อดูรายละเอียด">
                <div className="card-content">
                  <div className="card-left">
                    <div className="user-avatar"><User className="icon-lg" /></div>
                    <div className="user-info">
                      <h3 className="customer-name">{c.name}</h3>
                      <div className="customer-details">
                        <div className="detail-item"><Phone className="icon-sm" /><span>{c.phone}</span></div>
                        <div className="detail-item"><Mail className="icon-sm" /><span>{c.email || '-'}</span></div>
                        <div className="detail-item"><div className="line-indicator"></div><span>{c.lineId || '-'}</span></div>
                        <div className="detail-item"><MapPin className="icon-sm" /><span>{c.address || '-'}, {c.subdistrict || '-'}, {c.district || '-'}, {c.province || '-'}</span></div>
                      </div>
                      {c.note && <div className="customer-note"><strong>หมายเหตุ:</strong> {c.note}</div>}
                    </div>
                  </div>
                  <div className="card-actions">
                    <button className="more-button" onClick={(e) => { e.stopPropagation(); openDetail(c); }}>
                      <MoreVertical className="icon-md" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <button className="add-button" onClick={openAdd}>
            <Plus className="icon-sm" /><span>เพิ่มลูกค้า</span>
          </button>
        </div>
      </div>

      {/* ===== Detail Modal ===== */}
      {showDetail && selected && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>รายละเอียดลูกค้า</h3>
              <button className="icon-btn" onClick={closeDetail}><X size={18} /></button>
            </div>

            {/* โหมดดูเฉย ๆ กับโหมดแก้ไข สลับกันด้วย editMode */}
            {!editMode ? (
              <>
                <div className="modal-body scrollable">
                  <div className="detail-grid">
                    <div><label>ไอดี:</label><span>{selected.id || '-'}</span></div>
                    <div><label>ชื่อ:</label><span>{selected.name || '-'}</span></div>
                    <div><label>เบอร์โทร:</label><span>{selected.phone || '-'}</span></div>
                    <div><label>อีเมล:</label><span>{selected.email || '-'}</span></div>
                    <div><label>ไลน์ไอดี:</label><span>{selected.lineId || '-'}</span></div>
                    <div className="full"><label>ที่อยู่:</label><span>{selected.address || '-'}</span></div>
                    <div><label>แขวง/ตำบล:</label><span>{selected.subdistrict || '-'}</span></div>
                    <div><label>เขต/อำเภอ:</label><span>{selected.district || '-'}</span></div>
                    <div><label>จังหวัด:</label><span>{selected.province || '-'}</span></div>
                    <div className="full"><label>หมายเหตุ:</label><span>{selected.note || '-'}</span></div>
                    <div><label>วันที่เพิ่ม:</label><span>{formatDate(selected.dateAdded)}</span></div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn-primary" onClick={startEdit}><Pencil size={16}/> แก้ไข</button>
                  <button className="btn-danger" onClick={handleDeleteSelected}><Trash2 size={16}/> ลบลูกค้า</button>
                  <button className="btn-outline" onClick={closeDetail}>ปิด</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body scrollable">
                  <div className="form-grid">
                    <div className="form-group"><label>ชื่อ*</label>
                      <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
                    </div>
                    <div className="form-group"><label>เบอร์โทร*</label>
                      <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} required />
                    </div>
                    <div className="form-group"><label>อีเมล</label>
                      <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                    </div>
                    <div className="form-group"><label>ไลน์ไอดี</label>
                      <input value={editForm.lineId} onChange={e => setEditForm({ ...editForm, lineId: e.target.value })} />
                    </div>
                    <div className="form-group full"><label>ที่อยู่</label>
                      <input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                    </div>
                    <div className="form-group"><label>แขวง/ตำบล</label>
                      <input value={editForm.subdistrict} onChange={e => setEditForm({ ...editForm, subdistrict: e.target.value })} />
                    </div>
                    <div className="form-group"><label>เขต/อำเภอ</label>
                      <input value={editForm.district} onChange={e => setEditForm({ ...editForm, district: e.target.value })} />
                    </div>
                    <div className="form-group"><label>จังหวัด</label>
                      <input value={editForm.province} onChange={e => setEditForm({ ...editForm, province: e.target.value })} />
                    </div>
                    <div className="form-group full"><label>หมายเหตุ</label>
                      <input value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn-primary" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? 'กำลังบันทึก…' : 'บันทึก'}
                  </button>
                  <button className="btn-outline" onClick={cancelEdit} disabled={savingEdit}>ยกเลิก</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Add Modal ===== */}
      {showAdd && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เพิ่มลูกค้า</h3>
              <button className="icon-btn" onClick={closeAdd}><X size={18} /></button>
            </div>

            {/* form ครอบทั้ง body + actions เพื่อให้ปุ่ม submit ได้ */}
            <form onSubmit={handleAddSubmit} className="modal-form">
              <div className="modal-body scrollable">
                <div className="form-grid">
                  <div className="form-group"><label>ชื่อ*</label>
                    <input required value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                  </div>
                  <div className="form-group"><label>เบอร์โทร*</label>
                    <input required value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                  </div>
                  <div className="form-group"><label>อีเมล</label>
                    <input value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                  </div>
                  <div className="form-group"><label>ไลน์ไอดี</label>
                    <input value={newCustomer.lineId} onChange={e => setNewCustomer({ ...newCustomer, lineId: e.target.value })} />
                  </div>
                  <div className="form-group full"><label>ที่อยู่</label>
                    <input value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                  </div>
                  <div className="form-group"><label>แขวง/ตำบล</label>
                    <input value={newCustomer.subdistrict} onChange={e => setNewCustomer({ ...newCustomer, subdistrict: e.target.value })} />
                  </div>
                  <div className="form-group"><label>เขต/อำเภอ</label>
                    <input value={newCustomer.district} onChange={e => setNewCustomer({ ...newCustomer, district: e.target.value })} />
                  </div>
                  <div className="form-group"><label>จังหวัด</label>
                    <input value={newCustomer.province} onChange={e => setNewCustomer({ ...newCustomer, province: e.target.value })} />
                  </div>
                  <div className="form-group full"><label>หมายเหตุ</label>
                    <input value={newCustomer.note} onChange={e => setNewCustomer({ ...newCustomer, note: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-primary"><Plus size={16}/> บันทึก</button>
                <button type="button" className="btn-outline" onClick={closeAdd}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPage;
