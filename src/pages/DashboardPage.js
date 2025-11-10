// src/pages/admin/DashboardPage.js
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import '../styles/Dashboard.css';
import { useNavigate } from 'react-router-dom';

// services (ดึงข้อมูลแบบ realtime จาก Firestore ผ่าน service layer)
import { subscribeCustomers } from '../services/customerService';
import { subscribeCars } from '../services/carService';
import { subscribeRepairs, subscribeCharges } from '../services/repairService';
import {
  subscribePartCategories,
  subscribePartsByCategory,
  subscribeLots,
} from '../services/partService';

import { db } from '../firebase/firebase';
import {
  collection, query, where, orderBy, onSnapshot, Timestamp
} from 'firebase/firestore';

/* ========================= Helpers / ค่าคงที่ ========================= */

// แปลงตัวเลขเป็นเงินไทย (THB) แบบสั้นๆ
const formatTHB = (n = 0) =>
  Number(n).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

// ชื่อเดือนย่อภาษาไทย + เลือกช่วง 6 เดือนล่าสุดไว้ทำกราฟลูกค้า/รถ
const thMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTH_RANGE = 6;

/* ========================= React Component หลัก ========================= */

const Dashboard = () => {
  const navigate = useNavigate();

  /* ---------- State กลุ่มนัดหมาย / ฟิลเตอร์ ---------- */
  const [activeFilter, setActiveFilter] = useState('วันนี้');         // แท็บฟิลเตอร์นัดหมาย (วันนี้/พรุ่งนี้/7วัน/30วัน/ทั้งหมด)
  const [confirmationStatus, setConfirmationStatus] = useState({});    // เก็บสถานะยืนยัน (ต่อแถว) ไว้ toggle ในตาราง

  /* ---------- ช่วงวันที่ของ "ยอดขาย (ส่งมอบแล้ว)" (แทนการทำแท็บ) ---------- */
  const today = new Date();
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const [salesFrom, setSalesFrom] = useState(toDateInput(d30));
  const [salesTo, setSalesTo] = useState(toDateInput(today));

  /* ---------- State ข้อมูลจริงจาก Firestore ---------- */
  const [customers, setCustomers] = useState([]);           // ลูกค้าทั้งหมด
  const [cars, setCars] = useState([]);                     // รถทั้งหมด
  const [repairs, setRepairs] = useState([]);               // งานซ่อมทั้งหมด
  const [chargesByRepair, setChargesByRepair] = useState({});// map: repairId -> รายการค่าใช้จ่าย (charge)

  /* ---------- Low stock ส่วนแสดงอะไหล่ใกล้หมด ---------- */
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockPage, setLowStockPage] = useState(1);
  const LOW_PER_PAGE = 10;

  /* ---------- Appointments (นัดหมาย) ---------- */
  const [appointments, setAppointments] = useState([]);
  const filterTabs = ['วันนี้', 'พรุ่งนี้', '7 วันถัดไป', '30 วันถัดไป', 'ทั้งหมดที่กำลังจะมาถึง'];

  /* ========================= Subscriptions (Realtime) ========================= */

  // 1) ลูกค้า/รถ (subscribeCustomers/subscribeCars) — โหลดครั้งเดียวพร้อม unsubscribe ตอน unmount
  useEffect(() => {
    const u1 = subscribeCustomers(setCustomers);
    const u2 = subscribeCars(setCars);
    return () => { u1 && u1(); u2 && u2(); };
  }, []);

  // 2) งานซ่อมทั้งหมด
  useEffect(() => {
    const unrep = subscribeRepairs((list) => setRepairs(list || []));
    return () => unrep && unrep();
  }, []);

  // 3) ค่าใช้จ่ายของแต่ละงานซ่อม (subscribe ทีละ repairId) => เก็บไว้ใน chargesByRepair
  useEffect(() => {
    if (!repairs?.length) { setChargesByRepair({}); return; }
    const unsubs = repairs
      .filter(r => !!r._id)
      .map(r =>
        subscribeCharges(r._id, (rows) => {
          setChargesByRepair(prev => ({ ...prev, [r._id]: rows || [] }));
        })
      );
    return () => { unsubs.forEach(u => u && u()); };
  }, [repairs]);

  // 4) นัดหมายล่วงหน้า (appointments) — query เริ่มจากเวลาปัจจุบันขึ้นไป และ orderBy เวลาเริ่ม
  useEffect(() => {
    const now = new Date();
    const apptCol = collection(db, 'appointments');
    const qy = query(apptCol, where('startAt', '>=', Timestamp.fromDate(now)), orderBy('startAt', 'asc'));
    const unsub = onSnapshot(qy, (snap) => {
      const arr = [];
      snap.forEach(doc => {
        const x = doc.data() || {};
        const toMs = (v) => v?.toDate ? v.toDate().getTime() : (typeof v === 'number' ? v : 0);
        arr.push({
          id: doc.id,
          startAt: toMs(x.startAt),
          endAt: toMs(x.endAt),
          title: x.title || '',
          // เก็บ id จริงไว้ แล้วค่อย map ชื่อเวลา render
          customerId: x.customerId || '',
          vehicleId: x.vehicleId || '',
          // เผื่อเคสข้อมูลเดิม (fallback เป็นชื่อ/รถแบบสตริง)
          customerName: x.customerName || '',
          vehicleTitle: x.vehicleTitle || '',
          confirmed: !!x.confirmed
        });
      });
      setAppointments(arr);
    });
    return () => unsub && unsub();
  }, []);

  // 5) สต็อกต่ำ: loop ทุกหมวด -> ทุกอะไหล่ -> subscribe lots แล้วสรุปยอดคงเหลือเทียบ minimumStock
  useEffect(() => {
    let allUnsubs = [];
    let mounted = true;

    const unCat = subscribePartCategories((cats) => {
      allUnsubs.forEach(u => u && u());
      allUnsubs = [];

      cats.forEach((cat) => {
        const unParts = subscribePartsByCategory(cat._id, (parts) => {
          parts.forEach((p) => {
            const unLots = subscribeLots(p._id, (lots) => {
              if (!mounted) return;
              const stockSum = (lots || []).reduce((s, l) => s + Number(l.qtyRemaining || 0), 0);
              const min = Number(p.minimumStock || 0);
              setLowStockItems(prev => {
                const next = [...prev];
                const idx = next.findIndex(x => x.id === p._id);
                const row = { id: p._id, name: p.name || '-', minimumStock: min, stockSum };
                if (min > 0 && stockSum < min) {
                  if (idx >= 0) next[idx] = row; else next.push(row);
                } else {
                  if (idx >= 0) next.splice(idx, 1);
                }
                // เรียงตามชื่อเพื่อให้อ่านง่าย
                return next.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
              });
            });
            allUnsubs.push(unLots);
          });
        });
        allUnsubs.push(unParts);
      });
    });

    allUnsubs.push(unCat);
    return () => { allUnsubs.forEach(u => u && u()); };
  }, []);

  /* ========================= Utils / Handlers ========================= */

  // ปุ่มย้อนกลับไปหน้า Home ฝั่งแอดมิน
  const handleBack = () => navigate('/admin/home');

  // เปลี่ยนแท็บฟิลเตอร์นัดหมาย
  const handleFilterChange = (filter) => setActiveFilter(filter);

  // toggle confirmed ของแถว (เก็บไว้ใน state ฝั่ง client เฉยๆ)
  const toggleConfirmation = (rowIndex) =>
    setConfirmationStatus(prev => ({ ...prev, [rowIndex]: !prev[rowIndex] }));

  // แปลงวันที่ให้เป็น label ไทย (ใช้ทั้งรายวัน/รายเดือน)
  const dateToThaiLabel = (d, mode) => {
    if (mode === 'month') return `${thMonthsShort[d.getMonth()]} ${d.getFullYear()}`;
    return `${d.getDate()} ${thMonthsShort[d.getMonth()]}`;
  };

  // คำนวณสรุปเงินของงานซ่อม 1 งาน (รวม parts + charges - discount และเช็คจ่ายครบไหม)
  const calcRepairTotals = (r) => {
    const charges = chargesByRepair[r._id] || [];
    const chargeTotal = charges.filter(c => !c.deletedAt).reduce((s, c) => s + Number(c.amount || 0), 0);
    const paidTotal = charges.filter(c => !c.deletedAt && c.paid).reduce((s, c) => s + Number(c.amount || 0), 0);
    const discount = Number(r.discount || 0);
    const partsTotal = Number(r.partsTotal || 0);
    const subTotal = partsTotal + chargeTotal;
    const balance = Math.max(0, subTotal - discount - paidTotal);
    const fullyPaid = balance === 0;
    const grand = subTotal - discount;
    return { subTotal, discount, paidTotal, balance, fullyPaid, grand };
  };

  /* ========================= useMemo กลุ่มสรุปยอด/กราฟ ========================= */

  // เลือกเฉพาะงานที่ "ซ่อมเสร็จสิ้น" และ "จ่ายครบ" เพื่อถือว่าเป็นยอดขายที่ส่งมอบแล้ว
  const salesDelivered = useMemo(() => {
    return (repairs || [])
      .filter(r => (r.status || '') === 'ซ่อมเสร็จสิ้น')
      .map(r => ({ r, totals: calcRepairTotals(r) }))
      .filter(x => x.totals.fullyPaid);
  }, [repairs, chargesByRepair]);

  // กรองยอดขายตามช่วงวันที่เลือก และ map ข้อมูลเพื่อนำไปแสดงในตาราง/กราฟ
  const filteredSales = useMemo(() => {
    const start = new Date(salesFrom); start.setHours(0,0,0,0);
    const end = new Date(salesTo);     end.setHours(23,59,59,999);

    const pass = salesDelivered.filter(({ r }) => {
      const d = r?.createdAt
        ? (typeof r.createdAt.toDate === 'function' ? r.createdAt.toDate() : new Date(r.createdAt))
        : new Date(0);
      return d >= start && d <= end;
    });

    return pass.map(({ r, totals }) => ({
      id: r.code || r._id,
      date: r.createdAt,
      dateISO: (r.createdAt && typeof r.createdAt.toDate === 'function')
        ? r.createdAt.toDate().toISOString()
        : new Date().toISOString(),
      customer: r.customerName || '-',
      vehicle: r.vehicleTitle || '-',
      total: Math.max(0, totals.grand),
    }));
  }, [salesDelivered, salesFrom, salesTo]);

  // KPI ยอดรวม + จำนวนคัน
  const salesSummary = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const countDelivered = filteredSales.length;
    return { totalRevenue, countDelivered };
  }, [filteredSales]);

  // เตรียมข้อมูลกราฟแท่งรายรับ (group ตามวัน)
  const revenueChartData = useMemo(() => {
    const map = new Map();
    filteredSales.forEach(s => {
      const d = new Date(s.dateISO);
      const key = dateToThaiLabel(d, 'day');
      map.set(key, (map.get(key) || 0) + (s.total || 0));
    });
    return Array.from(map.entries()).map(([label, revenue]) => ({ label, revenue }));
  }, [filteredSales]);

  // คำนวณแกนเวลาแบบ "6 เดือนล่าสุด" เอาไว้จับคู่กับวันที่ของลูกค้า/รถที่เพิ่มเข้ามา
  const monthKeys = useMemo(() => {
    const base = new Date(); base.setDate(1);
    const arr = [];
    for (let i = MONTH_RANGE - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      arr.push({ y: d.getFullYear(), m: d.getMonth(), label: `${thMonthsShort[d.getMonth()]}` });
    }
    return arr;
  }, []);

  // จำนวนลูกค้าที่เพิ่มใหม่รายเดือน (6 เดือน)
  const clientsData = useMemo(() => {
    const counts = monthKeys.map(k => ({ month: k.label, count: 0 }));
    customers.forEach(c => {
      const d = c.dateAdded && typeof c.dateAdded.toDate === 'function' ? c.dateAdded.toDate() : null;
      if (!d) return;
      const hit = monthKeys.findIndex(k => (k.y === d.getFullYear() && k.m === d.getMonth()));
      if (hit >= 0) counts[hit].count += 1;
    });
    return counts.map(x => ({ month: x.month, existing: 0, new: x.count }));
  }, [customers, monthKeys]);

  // จำนวนรถที่เพิ่มใหม่รายเดือน (6 เดือน)
  const vehiclesData = useMemo(() => {
    const counts = monthKeys.map(k => ({ month: k.label, count: 0 }));
    cars.forEach(v => {
      const d = v.dateAdded && typeof v.dateAdded.toDate === 'function' ? v.dateAdded.toDate() : null;
      if (!d) return;
      const hit = monthKeys.findIndex(k => (k.y === d.getFullYear() && k.m === d.getMonth()));
      if (hit >= 0) counts[hit].count += 1;
    });
    return counts.map(x => ({ month: x.month, existing: 0, new: x.count }));
  }, [cars, monthKeys]);

  // สีสำหรับแต่ละสถานะงานซ่อม (ใช้ตอนสรุปรวมตามสถานะ)
  const statusPalette = {
    'รับรถเข้าร้าน': '#3b82f6',
    'ตรวจสอบอาการ': '#06b6d4',
    'ตรวจสอบเสร็จสิ้น': '#10b981',
    'เตรียมซ่อม': '#f59e0b',
    'ระหว่างการซ่อม': '#8b5cf6',
    'ซ่อมเสร็จสิ้น': '#22c55e',
  };

  // รวมยอดตามสถานะ (จำนวนออเดอร์ + ยอดรวม)
  const statusData = useMemo(() => {
    const acc = new Map();
    (repairs || []).forEach(r => {
      const st = r.status || 'รับรถเข้าร้าน';
      const t = calcRepairTotals(r);
      const row = acc.get(st) || { status: st, orders: 0, total: 0, color: statusPalette[st] || '#64748b' };
      row.orders += 1;
      row.total += Math.max(0, t.grand);
      acc.set(st, row);
    });
    return Array.from(acc.values());
  }, [repairs, chargesByRepair]);

  /* ========================= Maps สำหรับโชว์ชื่อจริงในตารางนัดหมาย ========================= */

  // customerId -> ชื่อลูกค้า (ชื่อแสดงผล)
  const customerMap = useMemo(() => {
    const m = {};
    customers.forEach(c => { m[c._id] = c.name || c.customerName || c.id || '-'; });
    return m;
  }, [customers]);

  // vehicleId -> object รถ (เก็บทั้งคัน)
  const carMap = useMemo(() => {
    const m = {};
    cars.forEach(v => { m[v._id] = v; });
    return m;
  }, [cars]);

  // แปลงรถให้เป็นข้อความสั้นๆ สวยๆ
  const prettyVehicle = (v) => {
    if (!v) return '-';
    const brandOrTitle = v.brand || v.title || '';
    const model = v.model || '';
    const type = v.vehicleType || v.type || '';
    const main = [brandOrTitle, model].filter(Boolean).join(' ');
    return { main: main || '-', type: type || '' };
  };

  /* ========================= กรองนัดหมาย + map display name ========================= */

  const filteredAppointments = useMemo(() => {
    const nowMs = Date.now();
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const inRange = (ms, start, end) => ms >= start.getTime() && ms < end.getTime();

    const base = appointments.filter(a => {
      const s = Number(a.startAt || 0);
      if (activeFilter === 'วันนี้') {
        const start = new Date(); start.setHours(0,0,0,0);
        const end = new Date(); end.setHours(24,0,0,0);
        return inRange(s, start, end);
      }
      if (activeFilter === 'พรุ่งนี้') {
        const start = addDays(new Date(), 1); start.setHours(0,0,0,0);
        const end = addDays(new Date(), 2); end.setHours(0,0,0,0);
        return inRange(s, start, end);
      }
      if (activeFilter === '7 วันถัดไป') {
        const end = addDays(new Date(), 7);
        return s >= nowMs && s < end.getTime();
      }
      if (activeFilter === '30 วันถัดไป') {
        const end = addDays(new Date(), 30);
        return s >= nowMs && s < end.getTime();
      }
      return s >= nowMs; // ทั้งหมดที่กำลังจะมาถึง
    });

    // map ชื่อจริงของลูกค้า/รถ สำหรับโชว์ในตาราง
    return base.map(a => {
      const customerName = a.customerId ? (customerMap[a.customerId] || a.customerName || '-') : (a.customerName || '-');
      const car = a.vehicleId ? (carMap[a.vehicleId] || null) : null;
      const pv = prettyVehicle(car);
      return {
        ...a,
        _displayCustomer: customerName,
        _displayVehicleMain: pv.main,
        _displayVehicleType: pv.type
      };
    });
  }, [appointments, activeFilter, customerMap, carMap]);

  
  // ====== Render ======
  return (
    <div className="dashboard-container">
      <div className='dashboard-wrapper'>
        {/* Header */}
        <header className="db-header">
          <div className="header-left">
            <button className="back-button" onClick={handleBack}><ArrowLeft size={24} /></button>
            <h1 className="page-title">แดชบอร์ด</h1>
          </div>
        </header>

        <main className="dashboard-main">
          {/* =================== Sales Section =================== */}
          <div className="appointments-card">
            <div className="appointments-header">
              <h3 className="appointments-title">ยอดขาย (ส่งมอบแล้ว)</h3>
              {/* ★★ เลือกช่วงวัน */}
              <div className="filter-tabs" style={{ gap: 6 }}>
                <input
                  type="date"
                  className="date-input"
                  value={salesFrom}
                  onChange={(e)=>setSalesFrom(e.target.value)}
                  title="วันที่เริ่ม"
                />
                <span style={{ alignSelf: 'center' }}>ถึง</span>
                <input
                  type="date"
                  className="date-input"
                  value={salesTo}
                  onChange={(e)=>setSalesTo(e.target.value)}
                  title="วันที่สิ้นสุด"
                />
              </div>
            </div>

            {/* KPI */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">จำนวนคันที่ส่งมอบ</div>
                <div className="kpi-value">{salesSummary.countDelivered} คัน</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">รายรับรวม</div>
                <div className="kpi-value">{formatTHB(salesSummary.totalRevenue)}</div>
              </div>
            </div>

            {/* กราฟรายรับ */}
            <div className="chart-container" style={{ height: 260, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v) => formatTHB(v)} />
                  <Legend align="right" verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '20px' }} />
                  <Bar dataKey="revenue" fill="#34d399" radius={[2, 2, 0, 0]} name="รายรับ" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ตารางรายการ (scroll ถ้าเกิน 4 แถว) */}
            <div className="appointments-table-wrapper" style={{ marginTop: 12 }}>
              <div className="table-scroll-y">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>เลขที่งาน</th>
                      <th>วันที่</th>
                      <th>ลูกค้า</th>
                      <th>รถ</th>
                      <th style={{ textAlign: 'right' }}>ยอดสุทธิ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-state">ไม่มีรายการที่จะแสดง</td>
                      </tr>
                    ) : (
                      filteredSales
                        .slice()
                        .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
                        .map((s, idx) => {
                          const d = new Date(s.dateISO);
                          const dateLabel = `${d.getDate()} ${thMonthsShort[d.getMonth()]} ${d.getFullYear()} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
                          return (
                            <tr key={`${s.id}-${idx}`}>
                              <td>{s.id}</td>
                              <td>{dateLabel}</td>
                              <td>{s.customer}</td>
                              <td>{s.vehicle}</td>
                              <td style={{ textAlign: 'right' }}>{formatTHB(s.total)}</td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {/* =================== /Sales Section =================== */}

          {/* แถวกลาง */}
          <div className="middle-grid">
            {/* ยอดตามสถานะ */}
            <div className="table-card">
              <div className="table-card-header">
                <h3 className="table-title">ยอดตามสถานะ</h3>
                <Info size={16} className="info-icon" />
              </div>
              <div className="table-wrapper">
                <table className="status-table">
                  <thead>
                    <tr>
                      <th>สถานะ</th>
                      <th>จำนวนออเดอร์</th>
                      <th>รวม (฿)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusData.map((item, index) => (
                      <tr key={index}>
                        <td>
                          <div className="status-cell">
                            <div className="status-dot" style={{ backgroundColor: item.color }} />
                            {item.status}
                          </div>
                        </td>
                        <td>{item.orders}</td>
                        <td>{formatTHB(item.total)}</td>
                      </tr>
                    ))}
                    {statusData.length === 0 && (
                      <tr><td colSpan={3} className="empty-state">ไม่มีข้อมูล</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* อะไหล่ใกล้หมดสต็อก */}
            <div className="table-card">
              <div className="table-card-header">
                <h3 className="table-title">อะไหล่ใกล้หมดสต็อก</h3>
                <Info size={16} className="info-icon" />
              </div>
              <div className="table-wrapper">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>รายการ <span className="sort-arrow">▲</span></th>
                      <th>ปริมาณวิกฤติ</th>
                      <th>คงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="empty-state">ไม่มีรายการที่จะแสดง</td>
                      </tr>
                    ) : (
                      lowStockItems
                        .slice((lowStockPage - 1) * LOW_PER_PAGE, (lowStockPage) * LOW_PER_PAGE)
                        .map(row => (
                          <tr key={row.id}>
                            <td>{row.name}</td>
                            <td>{row.minimumStock}</td>
                            <td>{row.stockSum}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
                <div className="table-pagination">
                  <button
                    className="pagination-btn"
                    onClick={() => setLowStockPage(p => Math.max(1, p - 1))}
                  >‹</button>
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      const maxPage = Math.max(1, Math.ceil(lowStockItems.length / LOW_PER_PAGE));
                      setLowStockPage(p => Math.min(maxPage, p + 1));
                    }}
                  >›</button>
                  <span className="page-number">
                    {lowStockPage}/{Math.max(1, Math.ceil(lowStockItems.length / LOW_PER_PAGE))}
                  </span>
                  <select className="items-select" value={LOW_PER_PAGE} readOnly>
                    <option>10</option>
                  </select>
                  <span className="pagination-text">รายการต่อหน้า</span>
                </div>
              </div>
            </div>
          </div>

          {/* แถวกราฟ: ลูกค้า / รถ */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h3 className="chart-title">จำนวนลูกค้าในระบบ</h3>
                <Info size={16} className="info-icon" />
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend align="right" verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '20px' }} />
                    <Bar dataKey="new" fill="#a78bfa" radius={[2, 2, 0, 0]} name="ลูกค้า" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3 className="chart-title">จำนวนรถยนต์ในระบบ</h3>
                <Info size={16} className="info-icon" />
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vehiclesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend align="right" verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '20px' }} />
                    <Bar dataKey="new" fill="#a78bfa" radius={[2, 2, 0, 0]} name="รถยนต์" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>



          {/* นัดหมายที่กำลังจะมาถึง */}
          <div className="appointments-card">
            <div className="appointments-header">
              <h3 className="appointments-title">นัดหมายที่กำลังจะมาถึง</h3>
              <div className="filter-tabs">
                {filterTabs.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleFilterChange(filter)}
                    className={`filter-tab ${activeFilter === filter ? 'active' : ''}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="appointments-table-wrapper">
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ลูกค้า</th>
                    <th>รถ</th>
               
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">ไม่มีรายการที่จะแสดง</td></tr>
                  ) : filteredAppointments.map((appointment, index) => {
                    const d = new Date(Number(appointment.startAt || 0));
                    const dateLabel = `${d.getDate()} ${thMonthsShort[d.getMonth()]} ${d.getFullYear()} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
                    const confirmed = confirmationStatus[index] ?? appointment.confirmed;
                    return (
                      <tr key={appointment.id}>
                        <td>{dateLabel}</td>
                        <td>{appointment._displayCustomer || '-'}</td>
                        <td>
                          <div className="vehicle-info">
                            {appointment._displayVehicleMain || '-'}
                            <br />
                            <span className="vehicle-detail">
                              {appointment._displayVehicleType || ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <button className="action-button" onClick={() => navigate('/admin/appointment-calendar')}>
                            →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="appointments-footer">
                <div className="pagination-controls">
                  <button className="pagination-btn" disabled>‹</button>
                  <button className="pagination-btn" disabled>›</button>
                  <span className="page-number">1</span>
                  <select className="items-select" value="ทั้งหมด" readOnly>
                    <option>ทั้งหมด</option>
                  </select>
                  <span className="pagination-text">รายการต่อหน้า</span>
                </div>
                <div className="total-items">
                  {filteredAppointments.length
                    ? `1 - ${filteredAppointments.length} จาก ${filteredAppointments.length} รายการ`
                    : '0 รายการ'}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
