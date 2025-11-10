import React, { useState, useMemo } from 'react';
import { Search, Table, List, ChevronDown, MoreVertical, Plus, Trash2, ArrowLeft, User } from 'lucide-react';
import '../style/addminListStock.css';
import { useNavigate } from 'react-router-dom';

const AddminListStockPage = () => {
  const [view, setView] = useState('table'); // 'table' or 'list'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const navigate = useNavigate();
  
  // ตัวอย่าง customer data พร้อม image
  const [customers] = useState([
    {
      id: '001',
      image: 'https://www.b-quik.com/image/product/ProductManual/Image1/DB2304HD.jpg',
      name: 'ผ้าเบรก',
      brand: 'เด็นโซ คอร์ป',
      type: 'อะไหล่แท้',
      grade: 'A',
      stock: '40',
      buy: '350',
      sell: '456',
      status: 'เติมสต็อก',
      minimumstock: '6',
      note: 'สีดำ',
      dateAdded: '2023-01-01'
    },
    {
      id: '002',
      image: 'https://asiabattery1999.com/wp-content/uploads/2018/09/GS-XTRA150L.jpg',
      name: 'แบตเตอรี่',
      brand: 'เด็นโซ คอร์ป',
      type: 'อะไหล่เทียม',
      grade: 'A',
      stock: '40',
      buy: '350',
      sell: '456',
      status: 'หมด',
      minimumstock: '15',
      note: '',
      dateAdded: '2023-01-01'
    },
    {
      id: '003',
      image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRuBEfL-XwSQtIxzWxgiDNKAIL_iAtsfm2ZVg&s',
      name: 'ยางรถยนต์',
      brand: 'โรเบิร์ต บ๊อช จีเอ็มบีเอช',
      type: 'อะไหล่แท้',
      grade: 'B',
      stock: '40',
      buy: '350',
      sell: '456',
      status: 'มีในสต็อก',
      minimumstock: '10',
      note: '',
      dateAdded: '2023-01-01'
    },
    {
      id: '004',
      image: 'https://my.kapook.com/imagescontent/fb_img/467/s_110137_4380.jpg',
      name: 'กระจก',
      brand: 'ฮุนได โมบิส',
      type: 'อะไหล่เทียม',
      grade: 'D',
      stock: '40',
      buy: '350',
      sell: '456',
      status: 'เติมสต็อก',
      minimumstock: '10',
      note: '',
      dateAdded: '2023-01-01'
    }
  ]);

  const sortOptions = [
    { value: 'id', label: 'ไอดี' },
    { value: 'name', label: 'ชื่ออะไหล่' },
    { value: 'grade', label: 'เกรด' },
    { value: 'dateAdded', label: 'วันที่เพิ่ม' }
  ];

  const handleBack = () => {
      navigate('/admin/home');
  };

  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = customers.filter(customer =>
      customer.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.grade.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue, 'th');
      } else {
        return bValue.localeCompare(aValue, 'th');
      }
    });
  }, [customers, searchTerm, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
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
          <h1 className="page-title">สต็อกอะไหล่</h1>
        </div>       
      </header>

      {/* Content */}
      <div className="main-content">
        {/* Controls */}
        <div className="controls">
          <div className="controls-left">
            <div className="view-toggle4">
              <button
                onClick={() => setView('table')}
                className={`view-button1 ${view === 'table' ? 'active' : 'inactive'}`}
              >
                <Table className="icon-sm" />
                <span>ตาราง</span>
              </button>
              <button
                onClick={() => setView('list')}
                className={`view-button1 ${view === 'list' ? 'active' : 'inactive'}`}
              >
                <List className="icon-sm" />
                <span>รายการ</span>
              </button>
            </div>

            <div className="sort-container">
              <select 
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split('-');
                  setSortField(field);
                  setSortDirection(direction);
                }}
                className="sort-select"
              >
                {sortOptions.map(option => (
                  <React.Fragment key={option.value}>
                    <option value={`${option.value}-asc`}>
                      {option.label} (น้อยไปมาก)
                    </option>
                    <option value={`${option.value}-desc`}>
                      {option.label} (มากไปน้อย)
                    </option>
                  </React.Fragment>
                ))}
              </select>
            </div>
          </div>

          <div className="search1-container">
            <div className="search1-icon">
              <Search className="icon-md" />
            </div>
            <input
              type="text"
              placeholder="ค้นหา"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search1-input"
            />
          </div>
        </div>

        {/* Table View */}
        {view === 'table' && (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th>ไอดี</th>
                    <th>รูปภาพ</th>
                    <th>ชื่ออะไหล่</th>
                    <th>แบรนด์</th>
                    <th>ประเภทอะไหล่</th>
                    <th>เกรด</th>
                    <th>จำนวนคงคลัง</th>
                    <th>ราคาซื้อ</th>
                    <th>ราคาขาย</th>
                    <th>สถานะ</th>
                    <th>จำนวนขั้นต่ำ</th>
                    <th>หมายเหตุ</th>
                    <th>วันที่เพิ่ม</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {filteredAndSortedCustomers.map((customer) => (
                    <tr key={customer.id} className="table-row">
                      <td className="table-cell">{customer.id}</td>
                      <td className="table-cell">
                        <img 
                          src={customer.image} 
                          alt={customer.name} 
                          style={{ width: '100px', height: '100px', borderRadius: '6px' }} 
                        />
                      </td>
                      <td className="table-cell">{customer.name}</td>
                      <td className="table-cell">{customer.brand}</td>
                      <td className="table-cell">{customer.type}</td>
                      <td className="table-cell">{customer.grade}</td>
                      <td className="table-cell">{customer.stock}</td>
                      <td className="table-cell">{customer.buy}</td>
                      <td className="table-cell">{customer.sell}</td>
                      <td className="table-cell">{customer.status}</td>
                      <td className="table-cell">{customer.minimumstock}</td>
                      <td className="table-cell">{customer.note}</td>
                      <td className="table-cell">{customer.dateAdded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <div className="list-container">
            {filteredAndSortedCustomers.map(customer => (
              <div key={customer.id} className="customer-card">
                <div className="card-left">
                  <img 
                    src={customer.image} 
                    alt={customer.name} 
                    style={{ width: '50px', height: '50px', borderRadius: '6px', marginRight: '1rem' }} 
                  />
                  <div>
                    <h3>{customer.name}</h3>
                    <p>ประเภท: {customer.type} | แบรนด์: {customer.brand}</p>
                    <p>สต็อก: {customer.stock} | เกรด: {customer.grade}</p>
                    {customer.note && <p>หมายเหตุ: {customer.note}</p>}
                  </div>
                </div>
                <div className="card-actions">
                  <MoreVertical className="icon-md" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <button className="delete-button">
            <Trash2 className="icon-sm" />
            <span>แก้ไขอะไหล่</span>
          </button>
          
          <button className="add-button1">
            <Plus className="icon-sm" />
            <span>เพิ่มอะไหล่</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddminListStockPage;
