// src/pages/ReportPage.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Car,
  Wrench,
  Package,
  UsersRound,
  BarChart3,
  Loader2
} from "lucide-react";
import {
  getDocs, collection
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "../styles/ReportPage.css";

/* =========================================================
 * โซน Helper (ฟังก์ชันเล็กๆ ที่ใช้ซ้ำหลายที่)
 * =======================================================*/

/** 1) แปะให้อยู่รูป YYYY-MM-DD
 * - รับได้ทั้ง Firestore Timestamp, Date, number(ms), string
 * - ถ้าพัง (try/catch) จะคืน ""
 */
const toISODate = (v) => {
  try {
    if (!v) return "";
    if (typeof v.toDate === "function") {
      const d = v.toDate();
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
    return String(v);
  } catch {
    return "";
  }
};

/** 2) แปะให้อยู่รูป ISO เต็ม (ใช้เวลา + โซน)
 * - เหมือนด้านบนแต่ไม่ slice(10) เพื่อเก็บเวลาไปด้วย
 */
const toISODateTime = (v) => {
  try {
    if (!v) return "";
    if (typeof v.toDate === "function") return v.toDate().toISOString(); // full
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "number") return new Date(v).toISOString();
    return String(v);
  } catch {
    return "";
  }
};

/** 3) แปลงเป็น Number แบบเซฟๆ (ถ้าแปลงไม่ได้ให้ใส่ค่า default)
 * - กันค่าพังจาก string/undefined/null
 */
const toNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* =========================================================
 * UI tiles (ปุ่มเลือกประเภทรีพอร์ต)
 * =======================================================*/
const tiles = [
  { id: "customers", label: "ลูกค้า",   icon: Users,     collection: "customers" },
  { id: "cars",      label: "รถยนต์",   icon: Car,       collection: "cars" },
  { id: "repairs",   label: "งานซ่อม",  icon: Wrench,    collection: "repairs" },
  { id: "employees", label: "พนักงาน",  icon: UsersRound,collection: "employees" },
  { id: "inventory", label: "สต๊อกของ", icon: Package,   collection: "inventory" },
  // ถ้าต้องใช้รวมๆ เปิดอันนี้ได้
  // { id: "dashboard", label: "แดชบอร์ดสรุป", icon: BarChart3, collection: "dashboard" },
];

/* =========================================================
 * Map หัวคอลัมน์ภาษาไทย (จะใช้รีแมปก่อน export)
 * =======================================================*/
const HEADER_MAPS = {
  customers: {
    id: "รหัสลูกค้า",
    name: "ชื่อลูกค้า",
    phone: "เบอร์โทร",
    lineId: "ไลน์ไอดี",
    email: "อีเมล",
    address: "ที่อยู่",
    subdistrict: "ตำบล",
    district: "อำเภอ",
    province: "จังหวัด",
    note: "หมายเหตุ",
    dateAdded: "วันที่เพิ่ม",
  },
  cars: {
    id: "รหัสรถ",
    ownBy: "เจ้าของ",
    brand: "ยี่ห้อ",
    model: "รุ่น",
    year: "ปี",
    carType: "ประเภทรถ",
    color: "สี",
    engine: "เครื่องยนต์",
    transmission: "ระบบเกียร์",
    lPlate: "ทะเบียน",
    odometer: "เลขไมล์",
    additional: "หมายเหตุ",
    dateAdded: "วันที่เพิ่ม",
  },
  repairs: {
    code: "เลขที่งาน",
    status: "สถานะ",
    statusNote: "บันทึกสถานะ",
    customerId: "รหัสลูกค้า",
    customerName: "ชื่อลูกค้า",
    customerPhone: "โทรลูกค้า",
    vehicleId: "รหัสรถ",
    vehicleTitle: "ชื่อรถ",
    vehiclePlate: "ทะเบียนรถ",
    vehicleType: "ประเภทรถ",
    transmission: "เกียร์",
    color: "สีรถ",
    createdAt: "วันที่สร้าง",
    updatedAt: "อัปเดตล่าสุด",
    discount: "ส่วนลด",
    paidTotal: "ชำระแล้ว",
    balance: "ยอดคงค้าง",
  },
  employees: {
    id: "รหัสพนักงาน",
    name: "ชื่อ",
    nickname: "ชื่อเล่น",
    phoneNumber: "โทรศัพท์",
    role: "บทบาท",
    type: "ประเภทการจ้าง",
    additional: "หมายเหตุ",
    dateAdded: "วันที่เพิ่ม",
  },
  inventory: {
    category: "หมวดหมู่",
    partId: "รหัสอะไหล่",
    partName: "ชื่ออะไหล่",
    brand: "ยี่ห้อ",
    sellPrice: "ราคาขาย",
    minimumStock: "สต๊อกขั้นต่ำ",
    stockQty: "คงเหลือรวม",
    status: "สถานะสต๊อก",
    lotId: "รหัสล็อต",
    purchasedQty: "จำนวนซื้อ",
    qtyRemaining: "คงเหลือในล็อต",
    purchasePrice: "ราคาต้นทุน",
    lotNote: "หมายเหตุล็อต",
    lotDateAdded: "วันที่รับล็อต",
    partDateAdded: "วันที่เพิ่มอะไหล่",
  },
  dashboard: {
    metric: "ตัวชี้วัด",
    value: "ค่า",
  },
};

/** 4) รีแมปคีย์ของข้อมูลให้หัวตารางเป็นภาษาไทย + คงลำดับคอลัมน์ตาม HEADER_MAPS
 * - อันไหนไม่มี mapping จะต่อท้ายด้วยชื่อคีย์เดิม
 */
function remapRowsToThaiHeaders(rows, collectionName) {
  const map = HEADER_MAPS[collectionName];
  if (!map) return rows; // ไม่มี mapping ก็ไม่แตะ

  const orderedKeys = Object.keys(map);

  return rows.map((row) => {
    const out = {};
    // จัดลำดับตาม mapping ก่อน
    orderedKeys.forEach((k) => {
      const thai = map[k] || k;
      out[thai] = row[k];
    });
    // คีย์อื่นๆ ที่ไม่มีใน mapping ให้ตามไปด้วย (กันข้อมูลโดนทิ้ง)
    Object.keys(row).forEach((k) => {
      if (!map[k]) {
        out[k] = row[k];
      }
    });
    return out;
  });
}

/* =========================================================
 * คอมโพเนนต์หลักหน้า Report + สเตตัส
 * =======================================================*/
export default function ReportPage() {
  const navigate = useNavigate();

  // state หลักของหน้า
  const [selectedReport, setSelectedReport] = useState(null); // รายงานที่ผู้ใช้จิ้มเลือก
  const [showModal, setShowModal] = useState(false);          // เปิด/ปิด modal เลือกไฟล์
  const [isLoading, setIsLoading] = useState(false);          // โชว์โหลดตอน export
  const [error, setError] = useState(null);                   // เก็บ error โชว์บน modal

  /** 21) กดปุ่มย้อนกลับ -> กลับ /admin/home */
  const handleBack = () => navigate("/admin/home");

  /* =========================================================
   * Utilities สำหรับจัดการข้อมูลก่อน export
   * =======================================================*/

  /** 5) สแกนโครงสร้างข้อมูลคร่าวๆ (เช็คฟิลด์ + warning ถ้าข้อความยาวมากๆ) */
  const inspectData = (data, collectionName) => {
    if (!data || data.length === 0) return null;
    const allFields = new Set();
    const longTextFields = [];
    data.forEach((item, index) => {
      Object.entries(item).forEach(([key, value]) => {
        allFields.add(key);
        if (typeof value === "string" && value.length > 1000) {
          longTextFields.push({ index: index + 1, field: key, length: value.length });
        }
      });
    });
    console.log(`[Inspect] ${collectionName}: ${data.length} rows, fields:`, [...allFields]);
    if (longTextFields.length) console.warn("Long text fields:", longTextFields);
    return { fields: [...allFields] };
  };

  /** 6) ตัดสตริงที่ยาวเกิน (กัน Excel เซ็งเพราะเกิน 32,767 char) */
  const truncateTextFields = (data, maxLength = 32000) =>
    data.map((row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = (typeof v === "string" && v.length > maxLength)
          ? v.slice(0, maxLength - 3) + "..."
          : v;
      }
      return out;
    });

  /** 7) ทำความสะอาดข้อมูลก่อนส่งออก (ถ้ามีช่องไหนยาวเกิน limit ก็ย่อตามข้อ 6) */
  const cleanDataForExport = (data) => {
    if (!data || !data.length) return data;
    let tooLong = false;
    data.forEach((r) => {
      Object.values(r).forEach((v) => {
        if (typeof v === "string" && v.length > 32767) tooLong = true;
      });
    });
    return tooLong ? truncateTextFields(data) : data;
  };

  /* =========================================================
   * ดึงข้อมูล “ฐาน” จากคอลเลกชันหลัก (ไม่รวม subcollection)
   * =======================================================*/

  /** 8) โหลดเอกสารทั้งคอลเลกชัน -> แปลงเป็น array ง่ายๆ */
  const fetchCollectionBase = async (collectionName) => {
    const snap = await getDocs(collection(db, collectionName));
    const rows = [];
    snap.forEach((d) => rows.push({ _docId: d.id, ...d.data() }));
    return rows;
  };

  /* =========================================================
   * ชุด builder สำหรับแต่ละรายงาน (customers/cars/repairs/...)
   * =======================================================*/

  /** 9) สร้างแถวข้อมูลลูกค้าแบบเรียบๆ พร้อม format วันที่ */
  const buildCustomers = async () => {
    const base = await fetchCollectionBase("customers");
    const rows = base.map((c) => ({
      id: c.id || "",
      name: c.name || "",
      phone: c.phone || "",
      lineId: c.lineId || "",
      email: c.email || "",
      address: c.address || "",
      subdistrict: c.subdistrict || "",
      district: c.district || "",
      province: c.province || "",
      note: c.note || "",
      dateAdded: toISODate(c.dateAdded || c.createdAt || c.createdDate || c.addedAt)
    }));
    return rows;
  };

  /** 10) สร้างแถวข้อมูลรถ (รวมชื่อเจ้าของถ้ามี) */
  const buildCars = async () => {
    const base = await fetchCollectionBase("cars");
    const rows = base.map((x) => ({
      id: x.id || "",
      ownBy: x.ownBy || x.ownerName || "",
      brand: x.brand || "",
      model: x.model || "",
      year: x.year || "",
      carType: x.carType || x.type || "",
      color: x.color || "",
      engine: x.engine || "",
      transmission: x.transmission || x.gear || "",
      lPlate: x.lPlate || x.plate || "",
      odometer: toNumber(x.odometer),
      additional: x.additional || x.note || "",
      dateAdded: toISODate(x.dateAdded || x.createdAt || x.createdDate || x.addedAt)
    }));
    return rows;
  };

  /* ===== Helpers ฝั่ง repairs: ดึง subcollection ===== */

  /** 11) ดึง parts_used (รองรับทั้งชื่อ 'parts_used' และ 'partsUsed' เพื่อกัน schema เก่า/ใหม่) */
  const fetchPartsUsedOfRepair = async (repairDocId) => {
    const try1 = await getDocs(collection(db, "repairs", repairDocId, "parts_used"));
    const list1 = []; try1.forEach(d => list1.push({ _id: d.id, ...d.data() }));
    if (list1.length) return list1;

    const try2 = await getDocs(collection(db, "repairs", repairDocId, "partsUsed"));
    const list2 = []; try2.forEach(d => list2.push({ _id: d.id, ...d.data() }));
    return list2;
  };

  /** 12) ดึง charges ของแต่ละงานซ่อม */
  const fetchChargesOfRepair = async (repairDocId) => {
    const snap = await getDocs(collection(db, "repairs", repairDocId, "charges"));
    const list = [];
    snap.forEach((d) => list.push({ _id: d.id, ...d.data() }));
    return list;
  };

  /** 13) สร้างข้อมูล “งานซ่อม” แบบ flatten พร้อมสรุปการเงิน (partsTotal/chargesTotal/paid/balance)
   * - ใช้ helpers ข้างบนดึง parts_used + charges ต่อหนึ่งงาน
   * - normalise number และ type ของ charge เพื่อคำนวณง่าย
   */
  const buildRepairs = async () => {
    const [base, customers, cars] = await Promise.all([
      fetchCollectionBase("repairs"),
      fetchCollectionBase("customers"),
      fetchCollectionBase("cars"),
    ]);

    // map docId -> human id (เช่น C001)
    const cusCodeByDoc = Object.fromEntries(customers.map(c => [c._docId, c.id || ""]));
    const carCodeByDoc = Object.fromEntries(cars.map(c => [c._docId, c.id || ""]));

    const rows = await Promise.all(base.map(async (r) => {
      const customerDocId = r.customerRef || r.customerId || "";
      const vehicleDocId  = r.vehicleRef  || r.vehicleId  || "";

      // โหลดซับของงานนี้
      const partsUsed = await fetchPartsUsedOfRepair(r._docId);
      const charges   = await fetchChargesOfRepair(r._docId);

      // ช่วยแปลงเลขแบบปลอดภัย
      const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

      // ปรับ shape ของ charge เพื่อคำนวณง่าย (กัน deleted/type/paid เป็นฟิลด์ที่อ่านสั้นๆ)
      const normCharges = (charges || []).map(c => ({
        ...c,
        __deleted: !!c.deletedAt || c.deleted === true,
        __type: String(c.type || "other").toLowerCase(),
        __amount: n(c.amount),
        __paid: !!c.paid,
      }));

      // รวมเงินอะไหล่
      const partsTotal = (partsUsed || []).reduce((s, p) => s + n(p.qty) * n(p.unitPrice), 0);

      // ค่าแรง/ค่าใช้จ่ายอื่น (ยกเว้น payment)
      const chargesTotal = normCharges
        .filter(c => !c.__deleted && c.__type !== "payment")
        .reduce((s, c) => s + c.__amount, 0);

      // ยอดที่จ่ายแล้ว (รวม deposit/payment/รายการที่จ่ายแล้ว)
      const paidTotal = normCharges
        .filter(c => !c.__deleted && c.__paid)
        .reduce((s, c) => s + c.__amount, 0);

      const discount = n(r.discount);
      const subTotal = partsTotal + chargesTotal;
      const balance  = Math.max(0, subTotal - discount - paidTotal);

      // human readable id แทน docId (ถ้ามี)
      const customerIdDisplay = cusCodeByDoc[customerDocId] || (typeof r.customerId === "string" ? r.customerId : "");
      const vehicleIdDisplay  = carCodeByDoc[vehicleDocId]  || (typeof r.vehicleId  === "string" ? r.vehicleId  : "");

      return {
        code: r.code || r.id || "",
        status: r.status || "",
        statusNote: r.statusNote || "",

        customerId: customerIdDisplay,
        customerName: r.customerName || "",
        customerPhone: r.customerPhone || "",

        vehicleId: vehicleIdDisplay,
        vehicleTitle: r.vehicleTitle || "",
        vehiclePlate: r.vehiclePlate || r.plate || "",
        vehicleType: r.vehicleType || r.type || "",
        transmission: r.transmission || r.vehicleTransmission || "",
        color: r.color || r.vehicleColor || "",

        createdAt: toISODateTime(r.createdAt || r.dateAdded || r.createdDate),
        updatedAt: toISODateTime(r.updatedAt || r.lastUpdated),

        discount,
        paidTotal,
        balance,
      };
    }));

    // เรียงล่าสุดมาก่อน (ตาม createdAt แบบ string ISO)
    rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return rows;
  };

  /** 14) พนักงาน (โครงสร้างตรงไปตรงมา) */
  const buildEmployees = async () => {
    const base = await fetchCollectionBase("employees");
    const rows = base.map((e) => ({
      id: e.id || "",
      name: e.name || "",
      nickname: e.nickname || "",
      phoneNumber: e.phoneNumber || "",
      role: e.role || "",
      type: e.type || "",
      additional: e.additional || "",
      dateAdded: toISODate(e.dateAdded || e.createdAt || e.createdDate || e.addedAt)
    }));
    return rows;
  };

  /* ===== Inventory (ต้องรองรับ schema 2 แบบ: parts เป็น collection หรือเป็น subcollection ใต้หมวด) ===== */

  /** 15) ดึง parts ทั้งหมด โดยลองแบบ A ก่อน (collection เดี่ยว) ถ้าไม่มีค่อยไล่แบบ B (ใต้ part_categories) */
  const fetchAllPartsTryBothLayouts = async (cats) => {
    const partsTryA = async () => {
      const all = await getDocs(collection(db, "parts"));
      const arr = [];
      all.forEach((d) => arr.push({ _id: d.id, ...d.data() }));
      if (!arr.length) return null;
      const mapCatName = Object.fromEntries(cats.map(c => [c._docId, c.name]));
      return arr.map((p) => ({
        ...p,
        _catId: p.categoryId || p.catId || "",
        _catName: mapCatName[p.categoryId || p.catId || ""] || ""
      }));
    };

    const partsTryB = async () => {
      const out = [];
      for (const cat of cats) {
        const sub = await getDocs(collection(db, "part_categories", cat._docId, "parts"));
        sub.forEach((d) =>
          out.push({
            _id: d.id,
            ...d.data(),
            _catId: cat._docId,
            _catName: cat.name || ""
          })
        );
      }
      return out;
    };

    const a = await partsTryA();
    if (a && a.length) return a;
    return await partsTryB();
  };

  /** 16) ดึง lots ของอะไหล่หนึ่งชิ้น (เพื่อคิดคงเหลือรวม + สถานะ) */
  const fetchLotsOfPart = async (partId) => {
    const snap = await getDocs(collection(db, "parts", partId, "lots"));
    const rows = [];
    snap.forEach((d) => rows.push({ _id: d.id, ...d.data() }));
    return rows;
  };

  /** 17) สร้างตาราง Inventory (รวม parts + lots)
   * - คิด stockQty รวม, สถานะ (หมดสต๊อก/ใกล้หมด/มีของ)
   * - แยกกรณีไม่มีล็อต กับมีล็อต เพื่อให้ export ดูง่าย
   */
  const buildInventory = async () => {
    // ดึงหมวดอะไหล่ก่อน
    const catSnap = await getDocs(collection(db, "part_categories"));
    const cats = [];
    catSnap.forEach((d) => cats.push({ _docId: d.id, ...d.data() }));

    // ดึง parts (รองรับ 2 layout)
    const parts = await fetchAllPartsTryBothLayouts(cats);

    // รวมกับ lots เพื่อสรุป
    const rows = [];
    for (const p of parts) {
      const lots = await fetchLotsOfPart(p._id);
      const stockQty = lots.reduce((s, l) => s + toNumber(l.qtyRemaining), 0);
      const status =
        stockQty <= 0 ? "หมดสต๊อก" :
        (toNumber(p.minimumStock) > 0 && stockQty < toNumber(p.minimumStock)) ? "ใกล้หมด" :
        "มีอยู่ในสต๊อก";

      if (!lots.length) {
        // ไม่มีล็อต -> ใส่ข้อมูล part เดี่ยวๆ
        rows.push({
          category: p._catName || "",
          partId: p.code || p.id || "",
          partName: p.name || "",
          brand: p.brand || "",
          sellPrice: toNumber(p.sellPrice),
          minimumStock: toNumber(p.minimumStock),
          stockQty,
          status,
          lotId: "",
          purchasedQty: "",
          qtyRemaining: "",
          purchasePrice: "",
          lotNote: "",
          lotDateAdded: "",
          partDateAdded: toISODate(p.dateAdded || p.createdAt),
        });
      } else {
        // มีล็อต -> แตกแถวตามล็อต เพื่อดูละเอียดได้
        lots.forEach((l) => {
          rows.push({
            category: p._catName || "",
            partId: p.code || p.id || "",
            partName: p.name || "",
            brand: p.brand || "",
            sellPrice: toNumber(p.sellPrice),
            minimumStock: toNumber(p.minimumStock),
            stockQty,
            status,
            lotId: l._id || "",
            purchasedQty: toNumber(l.purchasedQty),
            qtyRemaining: toNumber(l.qtyRemaining),
            purchasePrice: toNumber(l.purchasePrice),
            lotNote: l.note || "",
            lotDateAdded: toISODate(l.dateAdded || l.createdAt),
            partDateAdded: toISODate(p.dateAdded || p.createdAt),
          });
        });
      }
    }

    // เรียงให้กลุ่ม/อ่านง่าย
    rows.sort((a, b) =>
      (a.category || "").localeCompare(b.category || "", "th") ||
      (a.partId || "").localeCompare(b.partId || "", "th") ||
      (a.lotId || "").localeCompare(b.lotId || "", "th")
    );
    return rows;
  };

  /** 18) Dashboard metrics แบบ key-value (เหมาะทำ pivot)
   * - นับจำนวนรวม
   * - รวมยอด “ซ่อมเสร็จสิ้นและชำระครบ (balance=0)” ให้เป็น sales_* */
  const buildDashboard = async () => {
    const [customers, cars, repairs] = await Promise.all([
      fetchCollectionBase("customers"),
      fetchCollectionBase("cars"),
      fetchCollectionBase("repairs"),
    ]);

    // นับงานตามสถานะ
    const statusCounts = repairs.reduce((acc, r) => {
      const s = r.status || "ไม่ระบุ";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // ยอดขายที่ส่งมอบแล้วและจ่ายครบ (balance = 0)
    let salesCount = 0;
    let salesGrand  = 0;
    for (const r of repairs) {
      if ((r.status || "") !== "ซ่อมเสร็จสิ้น") continue;

      // โหลด parts_used + charges ของงานนี้เพื่อคำนวณยอด
      const partsUsed = await getDocs(collection(db, "repairs", r._docId, "parts_used"));
      const charges   = await getDocs(collection(db, "repairs", r._docId, "charges"));

      const partsRows = [];
      partsUsed.forEach((d) => partsRows.push({ _id: d.id, ...d.data() }));
      const chargeRows = [];
      charges.forEach((d) => chargeRows.push({ _id: d.id, ...d.data() }));

      const partsTotal = partsRows.reduce((s, p) => s + toNumber(p.qty) * toNumber(p.unitPrice), 0);
      const chargesTotal = chargeRows
        .filter(c => !c.deletedAt && (c.type || "other") !== "payment")
        .reduce((s, c) => s + toNumber(c.amount), 0);
      const paidTotal = chargeRows.filter(c => !c.deletedAt && c.paid)
        .reduce((s, c) => s + toNumber(c.amount), 0);
      const discount = toNumber(r.discount);
      const subTotal = partsTotal + chargesTotal;
      const balance = Math.max(0, subTotal - discount - paidTotal);

      if (balance === 0) {
        salesCount += 1;
        salesGrand += (subTotal - discount);
      }
    }

    // คืนเป็น metrics array
    const rows = [
      { metric: "customers_total", value: customers.length },
      { metric: "cars_total",      value: cars.length },
      { metric: "repairs_total",   value: repairs.length },
      ...Object.entries(statusCounts).map(([k, v]) => ({ metric: `repairs_status_${k}`, value: v })),
      { metric: "sales_delivered_paid_count", value: salesCount },
      { metric: "sales_delivered_paid_grand", value: salesGrand },
      { metric: "note", value: "metrics นี้ใช้สูตรเดียวกับ sheet 'งานซ่อม' ในการคำนวณยอด paid/ส่วนลด" },
    ];
    return rows;
  };

  /* =========================================================
   * ฟังก์ชัน export กลาง (เลือกชนิด report แล้วแตกไป build ตามชื่อ)
   * =======================================================*/

  /** 19) exportData(format) -> ดึง, ทำความสะอาด, remap หัวเป็นไทย, สร้างไฟล์ xlsx/csv
   * - รองรับ auto width คอลัมน์จาก sample
   * - บังคับ BOM สำหรับ CSV เพื่อให้ Excel เปิดภาษาไทยไม่เพี้ยน
   */
  const exportData = async (format) => {
    if (!selectedReport) return;

    setIsLoading(true);
    setError(null);

    try {
      const { collection: name, label } = selectedReport;

      // เลือก builder ตามประเภท
      let rows = [];
      if (name === "customers") rows = await buildCustomers();
      else if (name === "cars") rows = await buildCars();
      else if (name === "repairs") rows = await buildRepairs();
      else if (name === "employees") rows = await buildEmployees();
      else if (name === "inventory") rows = await buildInventory();
      else if (name === "dashboard") rows = await buildDashboard();
      else throw new Error("ไม่รู้จักชนิดรายงาน");

      if (!rows.length) {
        alert(`ไม่มีข้อมูลใน ${label}`);
        setIsLoading(false);
        return;
      }

      // ส่องโครง + ทำความสะอาดก่อน
      inspectData(rows, name);
      const clean = cleanDataForExport(rows);

      // เปลี่ยนหัวตารางเป็นภาษาไทย
      const thaiRows = remapRowsToThaiHeaders(clean, name);

      // สร้างชีทจาก json
      const ws = XLSX.utils.json_to_sheet(thaiRows, { cellStyles: false, raw: false });

      // คิดความกว้างคอลัมน์แบบง่าย ๆ จากตัวอย่าง 200 แถวแรก
      const sample = thaiRows.slice(0, 200);
      const widths = {};
      sample.forEach(r => {
        Object.entries(r).forEach(([k, v]) => {
          const len = Math.max(String(k).length, String(v ?? "").length);
          widths[k] = Math.min(Math.max(widths[k] || 8, len + 2), 64);
        });
      });
      ws["!cols"] = Object.keys(thaiRows[0]).map(k => ({ wch: widths[k] || 12 }));

      // สร้าง workbook + ตั้งชื่อไฟล์
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `${label}_${stamp}`;

      // เขียนออกเป็น xlsx/csv
      if (format === "xlsx") {
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
        saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
      } else {
        // บังคับ BOM เพื่อ Excel อ่าน UTF-8 ไทยได้ถูก
        const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n", forceQuotes: false });
        saveAs(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
      }

      alert(`ส่งออกข้อมูล ${label} สำเร็จ!`);
      setShowModal(false);
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      alert(`เกิดข้อผิดพลาดในการส่งออก: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  /** 20) เวลา user คลิกที่การ์ดรายงาน -> เปิด modal ให้เลือก export */
  const handleTileClick = (tile) => {
    setSelectedReport(tile);
    setShowModal(true);
    setError(null);
  };

  /* =========================================================
   * Render UI (ปล่อยโครงเดิมไว้ เพื่อไม่กระทบการทำงาน)
   * หมายเหตุ: ตามที่สั่ง “ไม่ต้องเอา body UI มากก็ได้” แต่เพื่อกันพัง
   * เราเก็บ UI เดิมไว้ครบ ๆ (ไม่แก้ logic/การทำงาน)
   * =======================================================*/
  return (
    <div className="rp-container">
      {/* Header */}
      <header className="rp-header">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}><ArrowLeft size={24} /></button>
          <h1 className="page-title">รายงาน</h1>
        </div>
      </header>

      {/* Grid (ปุ่มเลือกประเภทรีพอร์ต) */}
      <main className="rp-main">
        <div className="rp-grid">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              className="rp-card"
              onClick={() => handleTileClick(tile)}
              aria-label={tile.label}
              disabled={isLoading}
            >
              <tile.icon size={40} className="rp-card-icon" />
              <span className="rp-card-label">{tile.label}</span>
            </button>
          ))}
        </div>
      </main>

      {/* Modal เลือกชนิดไฟล์ + ปุ่ม export */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>เลือกประเภทไฟล์สำหรับ {selectedReport?.label}</h3>

            {error && (
              <div style={{
                color: 'red',
                marginBottom: '1rem',
                padding: '0.5rem',
                backgroundColor: '#ffe6e6',
                border: '1px solid #ff0000',
                borderRadius: '4px',
                fontSize: '0.9rem'
              }}>
                {error}
              </div>
            )}

            {isLoading && (
              <div style={{
                textAlign: 'center',
                marginBottom: '1rem',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}>
                <Loader2 size={16} className="animate-spin" />
                กำลังประมวลผลข้อมูล...
              </div>
            )}

            <div className="modal-buttons">
              <button
                className="export-btn"
                onClick={() => exportData("xlsx")}
                disabled={isLoading}
                style={{ opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                Export XLSX
              </button>
              <button
                className="export-btn"
                onClick={() => exportData("csv")}
                disabled={isLoading}
                style={{ opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                Export CSV
              </button>
            </div>

            <button
              className="cancel-btn"
              onClick={() => setShowModal(false)}
              disabled={isLoading}
              style={{ opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
