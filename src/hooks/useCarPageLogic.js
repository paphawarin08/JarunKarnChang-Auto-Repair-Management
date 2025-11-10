// src/hooks/useCarPageLogic.js

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";
import {
  subscribeCars, addCar, deleteCar, updateCar
} from "../services/carService";
import { subscribeCustomers } from "../services/customerService";

/** util: แปลงเป็นสตริงไว้ sort/compare
 *  - ใช้กับค่าหลายแบบ (null, Date, Firestore Timestamp, string)
 *  - สุดท้ายให้ได้ string เพื่อใช้ localeCompare ได้เสมอ
 */
const normalize = (v) =>
  v == null
    ? ""
    : typeof v.toDate === "function"
    ? v.toDate().getTime().toString()
    : String(v);

/** util: toLowerCase แบบกัน null/undefined ให้เป็น string เสมอ */
const toS = (v) => (v ?? "").toString().toLowerCase();

/** อ่านไฟล์รูป <= ~1MB เป็น dataURL
 *  - ใช้ FileReader แปลงไฟล์ภาพเป็น base64 data URL
 *  - ถ้าใหญ่กว่า maxBytes โยน error ทันที (กันรูปใหญ่)
 */
export const fileToDataUrl = (file, maxBytes = 1024 * 1024) =>
  new Promise((resolve, reject) => {
    if (!file) return reject(new Error("no file"));
    if (file.size > maxBytes) return reject(new Error("รูปภาพต้องไม่เกิน 1 MB"));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** ฮุคหลักของหน้า CarPage
 *  - รวม state ทั้งหมด + ตัวจัดการ (handlers)
 *  - จัดการ subscribe cars/customers แบบ realtime
 *  - มี logic ค้นหา/จัดอันดับ + sort
 */
export function useCarPageLogic() {
  // ======= states you highlighted =======
  const [view, setView] = useState("table"); // โหมดแสดงผล: table | list
  const [searchTerm, setSearchTerm] = useState(""); // ข้อความค้นหา
  const [sortField, setSortField] = useState("id"); // ฟิลด์ที่ใช้ sort
  const [sortDirection, setSortDirection] = useState("asc"); // asc | desc
  const [loading, setLoading] = useState(true); // กำลังโหลดรายการรถ

  const [cars, setCars] = useState([]); // รายการรถทั้งหมด (จาก Firestore)
  const [selected, setSelected] = useState(null); // รถที่ถูกเลือกใน modal
  const [showDetail, setShowDetail] = useState(false); // เปิด/ปิด modal รายละเอียด

  // โหมดแก้ไข + แบบฟอร์มแก้ไข
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "", ownBy: "", ownerRefId: "", ownerName: "", ownerCode: "",
    brand: "", model: "", carType: "", color: "", engine: "",
    engineType: "", transmission: "", lPlate: "", odometer: "",
    year: "", additional: "", imageDataUrl: ""
  });

  // โมดัลเพิ่มรถใหม่ + แบบฟอร์มเพิ่ม
  const [showAdd, setShowAdd] = useState(false);
  const [newCar, setNewCar] = useState({
    id: "", ownBy: "", ownerRefId: "", ownerName: "", ownerCode: "",
    brand: "", model: "", carType: "", color: "", engine: "",
    engineType: "", transmission: "", lPlate: "", odometer: "",
    year: "", additional: "", imageDataUrl: ""
  });

  // ===== รายชื่อลูกค้าที่ใช้ค้นหาเจ้าของ =====
  const [allCustomers, setAllCustomers] = useState([]); // เอาไว้ทำ typeahead
  const [addOwnerQuery, setAddOwnerQuery] = useState(""); // ข้อความค้นหาเจ้าของ (ตอนเพิ่ม)
  const [editOwnerQuery, setEditOwnerQuery] = useState(""); // ข้อความค้นหาเจ้าของ (ตอนแก้ไข)

  const navigate = useNavigate();

  // ===== effects =====
  // โหลดรายการรถแบบ realtime; ถ้า modal เปิดอยู่จะ sync รายการที่เลือกให้ใหม่ด้วย
  useEffect(() => {
    const unsub = subscribeCars((list) => {
      setCars(list);
      setLoading(false);
      if (showDetail && selected?._id) {
        const latest = list.find((x) => x._id === selected._id);
        if (latest) setSelected(latest);
      }
    });
    return () => unsub && unsub();
  }, [showDetail, selected?._id]);

  // โหลดลูกค้าทั้งหมด (ใช้หาคนเป็นเจ้าของรถตอนเลือก)
  useEffect(() => {
    const unsub = subscribeCustomers((list) => {
      setAllCustomers(list);
    });
    return () => unsub && unsub();
  }, []);

  // ===== sort options (ไว้ไปโชว์ใน UI) =====
  const sortOptions = [
    { value: "id", label: "ไอดี" },
    { value: "brand", label: "ยี่ห้อ" },
    { value: "year", label: "ปี" },
    { value: "dateAdded", label: "วันที่เพิ่ม" },
  ];

  // ปุ่มย้อนกลับ/ไปหน้า import (เน้นนำทาง)
  const handleBack = () => navigate("/admin/home");
  const handleGoImport = () => navigate("/admin/cars/import");

  // === ค้นหา+จัดอันดับผลลัพธ์
  // - รองรับคิวรีแบบ id:4 หรือ #4 เพื่อหาเฉพาะไอดีได้เร็ว
  // - ถ้าไม่มีค้นหา จะ sort ตาม sortField/sortDirection ปัจจุบัน
  const filteredAndSortedCars = useMemo(() => {
    const raw = (searchTerm ?? "").trim();
    const term = raw.toLowerCase();
    const idOnly = term.startsWith("id:") || raw.startsWith("#");
    const termForId = idOnly ? term.replace(/^id:|^#/i, "").trim() : term;

    const sortByField = (arr) =>
      arr.sort((a, b) => {
        const av = normalize(a[sortField]);
        const bv = normalize(b[sortField]);
        return sortDirection === "asc"
          ? av.localeCompare(bv, "th")
          : bv.localeCompare(av, "th");
      });

    if (!raw) return sortByField([...cars]);

    // ฟังก์ชันให้คะแนนความเกี่ยวข้องของรถแต่ละคันกับคำค้นหา
    const scoreOf = (c) => {
      const id = toS(c.id);
      const lPlate = toS(c.lPlate);
      const ownerName = toS(c.ownerName);
      const ownerCode = toS(c.ownerCode);
      const ownBy = toS(c.ownBy);
      const brand = toS(c.brand);
      const model = toS(c.model);
      const carType = toS(c.carType);
      const engine = toS(c.engine);
      const engineType = toS(c.engineType);
      const transmission = toS(c.transmission);
      const color = toS(c.color);

      // โหมดค้นหาเฉพาะไอดี
      if (idOnly) {
        if (!termForId) return 0;
        if (id === termForId) return 1000;
        if (id.startsWith(termForId)) return 800;
        if (id.includes(termForId)) return 600;
        return 0;
      }

      let score = 0;

      // ID – ให้ weight สูงสุด
      if (id === term) score = Math.max(score, 1000);
      else if (id.startsWith(term)) score = Math.max(score, 850);
      else if (id.includes(term)) score = Math.max(score, 700);

      // ทะเบียนรถ
      if (lPlate === term) score = Math.max(score, 620);
      else if (lPlate.startsWith(term)) score = Math.max(score, 560);
      else if (lPlate.includes(term)) score = Math.max(score, 520);

      // เจ้าของ (รหัส/ชื่อ/ฟิลด์เก่า)
      const ownerFields = [ownerCode, ownerName, ownBy];
      if (ownerFields.some((v) => v === term)) score = Math.max(score, 480);
      else if (ownerFields.some((v) => v.startsWith(term))) score = Math.max(score, 440);
      else if (ownerFields.some((v) => v.includes(term))) score = Math.max(score, 400);

      // ยี่ห้อ/รุ่น
      if (brand === term) score = Math.max(score, 360);
      else if (brand.startsWith(term)) score = Math.max(score, 340);
      else if (brand.includes(term)) score = Math.max(score, 320);

      if (model === term) score = Math.max(score, 300);
      else if (model.startsWith(term)) score = Math.max(score, 280);
      else if (model.includes(term)) score = Math.max(score, 260);

      // ฟิลด์อื่น ๆ
      const others = [carType, engine, engineType, transmission, color];
      if (others.some((v) => v.includes(term))) score = Math.max(score, 200);

      return score;
    };

    // จัดอันดับตามคะแนน + ถ้าคะแนนเท่ากันค่อย sort ตามฟิลด์
    const ranked = cars
      .map((c) => ({ c, score: scoreOf(c) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const av = normalize(a.c[sortField]);
        const bv = normalize(b.c[sortField]);
        return sortDirection === "asc"
          ? av.localeCompare(bv, "th")
          : bv.localeCompare(av, "th");
      })
      .map((x) => x.c);

    return ranked;
  }, [cars, searchTerm, sortField, sortDirection]);

  // กดหัวคอลัมน์เพื่อสลับเรียง asc/desc หรือเปลี่ยนฟิลด์ที่ sort
  const handleSort = (field) => {
    if (sortField === field) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection("asc"); }
  };

  // ===== Typeahead เจ้าของรถ =====
  // หา candidate ลูกค้าจาก allCustomers ตามข้อความ q (ชื่อ/รหัสลูกค้า)
  const findMatches = (q) => {
    const sTerm = (q || "").toLowerCase().trim();
    if (!sTerm) return [];
    return allCustomers
      .filter(
        (c) =>
          (c.name || "").toLowerCase().includes(sTerm) ||
          (c.id || "").toString().toLowerCase().includes(sTerm)
      )
      .slice(0, 8);
  };
  // รายการแนะนำ (เพิ่มรถ)
  const addOwnerMatches = useMemo(
    () => findMatches(addOwnerQuery),
    [addOwnerQuery, allCustomers]
  );
  // รายการแนะนำ (แก้ไขรถ)
  const editOwnerMatches = useMemo(
    () => findMatches(editOwnerQuery),
    [editOwnerQuery, allCustomers]
  );

  // เลือกลูกค้าเป็นเจ้าของ (ตอนเพิ่ม)
  const chooseAddOwner = (c) => {
    setNewCar((p) => ({
      ...p,
      ownerRefId: c._id,
      ownerName: c.name || "",
      ownerCode: c.id || "",
      ownBy: c.id || "", // คงฟิลด์เดิม
    }));
    setAddOwnerQuery("");
  };
  // ล้างเจ้าของ (ตอนเพิ่ม)
  const clearAddOwner = () => {
    setNewCar((p) => ({
      ...p,
      ownerRefId: "",
      ownerName: "",
      ownerCode: "",
      ownBy: "",
    }));
  };
  // เลือกลูกค้าเป็นเจ้าของ (ตอนแก้ไข)
  const chooseEditOwner = (c) => {
    setEditForm((p) => ({
      ...p,
      ownerRefId: c._id,
      ownerName: c.name || "",
      ownerCode: c.id || "",
      ownBy: c.id || "",
    }));
    setEditOwnerQuery("");
  };
  // ล้างเจ้าของ (ตอนแก้ไข)
  const clearEditOwner = () => {
    setEditForm((p) => ({
      ...p,
      ownerRefId: "",
      ownerName: "",
      ownerCode: "",
      ownBy: "",
    }));
  };

  // ===== open/close/edit/save =====
  // เปิด modal รายละเอียด + เตรียมฟอร์มแก้ไขจากข้อมูลที่เลือก
  const openDetail = (car) => {
    setSelected(car);
    setEditMode(false);
    setEditForm({
      id: car.id || "",
      ownBy: car.ownBy || "",
      ownerRefId: car.ownerRefId || "",
      ownerName: car.ownerName || "",
      ownerCode: car.ownerCode || "",
      brand: car.brand || "",
      model: car.model || "",
      carType: car.carType || "",
      color: car.color || "",
      engine: car.engine || "",
      engineType: car.engineType || "",
      transmission: car.transmission || "",
      lPlate: car.lPlate || "",
      odometer: car.odometer || "",
      year: car.year || "",
      additional: car.additional || "",
      imageDataUrl: car.imageDataUrl || "",
    });
    setShowDetail(true);
  };
  // ปิด modal รายละเอียด
  const closeDetail = () => {
    setShowDetail(false);
    setSelected(null);
    setEditMode(false);
  };
  // เข้าโหมดแก้ไข
  const startEdit = () => setEditMode(true);
  // ยกเลิกแก้ไข (รีโหลดค่าจาก selected กลับเข้า form)
  const cancelEdit = () => {
    if (selected) openDetail(selected);
    setEditMode(false);
  };

  // บันทึกการแก้ไขรถที่เลือก
  const saveEdit = async () => {
    if (!selected?._id) return;
    if (!editForm.brand || !editForm.model) {
      alert("กรุณากรอก 'ยี่ห้อ' และ 'รุ่น'");
      return;
    }
    try {
      setSavingEdit(true);
      await updateCar(selected._id, {
        ...editForm,
        updatedBy: auth.currentUser?.uid || null,
      });
      setEditMode(false);
      setSelected((prev) => (prev ? { ...prev, ...editForm } : prev));
    } catch (e) {
      console.error(e);
      alert("บันทึกการแก้ไขไม่สำเร็จ");
    } finally {
      setSavingEdit(false);
    }
  };

  // ===== add modal =====
  // เปิด modal เพิ่มรถ + รีเซ็ตแบบฟอร์ม
  const openAdd = () => {
    setNewCar({
      id: "", ownBy: "", ownerRefId: "", ownerName: "", ownerCode: "",
      brand: "", model: "", carType: "", color: "", engine: "",
      engineType: "", transmission: "", lPlate: "", odometer: "",
      year: "", additional: "", imageDataUrl: ""
    });
    setAddOwnerQuery("");
    setShowAdd(true);
  };
  // ปิด modal เพิ่มรถ
  const closeAdd = () => setShowAdd(false);

  // จัดการเลือกรูป (ตอนเพิ่ม) → โหลดเป็น dataURL
  const handleAddImagePicked = async (file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setNewCar((prev) => ({ ...prev, imageDataUrl: dataUrl }));
  };
  // จัดการเลือกรูป (ตอนแก้ไข) → โหลดเป็น dataURL
  const handleEditImagePicked = async (file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setEditForm((prev) => ({ ...prev, imageDataUrl: dataUrl }));
  };
  // ^^^ NOTE: ↑↑↑ ตรงนี้เป็นโค้ดเดิมของคุณ (คงไว้ตามที่ให้มา) ^^^
  // (ถ้าพบวงเล็บเกิน/ขาดในโปรเจกต์จริง ให้แก้ในที่ทำงานของคุณเองนะครับ)

  // submit ฟอร์มเพิ่มรถใหม่
  const handleAddSubmit = async (e) => {
    e?.preventDefault?.();
    if (!newCar.brand || !newCar.model) {
      alert("กรุณากรอก 'ยี่ห้อ' และ 'รุ่น'");
      return;
    }
    try {
      await addCar(newCar, auth.currentUser?.uid || null);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert("บันทึกข้อมูลรถไม่สำเร็จ");
    }
  };

  // ลบรถที่เลือก (มี confirm ป้องกันพลาด)
  const handleDeleteSelected = async () => {
    if (!selected?._id) {
      alert("กรุณาเลือกข้อมูลที่จะลบ (เปิดหน้ารายละเอียดก่อน)");
      return;
    }
    if (
      !window.confirm(
        `ยืนยันลบรถ: ${selected.brand || ""} ${selected.model || ""} (${selected.id || ""}) ?`
      )
    )
      return;
    try {
      await deleteCar(selected._id);
      closeDetail();
    } catch (err) {
      console.error(err);
      alert("ลบรถไม่สำเร็จ");
    }
  };

  // ลิงก์ไปหน้า Customers แล้วใส่คิวรีให้ค้นหาเจ้าของคันนี้อัตโนมัติ
  const gotoOwnerInCustomerPage = () => {
    let q = "";
    if (selected?.ownerCode) {
      q = `id:${selected.ownerCode}`; // ค้นหาด้วยรหัสลูกค้าให้ตรงเป๊ะ
    } else if (selected?.ownerName) {
      q = selected.ownerName;
    } else if (selected?.ownBy) {
      q = selected.ownBy;
    }
    navigate(`/admin/customers?q=${encodeURIComponent(q)}`);
  };

  // คืน state + handlers ทั้งหมดไปให้หน้า UI ใช้งาน
  return {
    // state & setters
    view, setView,
    searchTerm, setSearchTerm,
    sortField, setSortField,
    sortDirection, setSortDirection,
    loading,

    cars,
    selected, setSelected,
    showDetail, setShowDetail,

    editMode, setEditMode,
    savingEdit,
    editForm, setEditForm,

    showAdd, setShowAdd,
    newCar, setNewCar,

    allCustomers,
    addOwnerQuery, setAddOwnerQuery,
    editOwnerQuery, setEditOwnerQuery,

    // lists & options
    sortOptions,
    filteredAndSortedCars,

    // handlers
    handleBack,
    handleGoImport,
    handleSort,

    addOwnerMatches,
    editOwnerMatches,
    chooseAddOwner,
    clearAddOwner,
    chooseEditOwner,
    clearEditOwner,

    openDetail,
    closeDetail,
    startEdit,
    cancelEdit,
    saveEdit,

    openAdd,
    closeAdd,
    handleAddSubmit,
    handleDeleteSelected,

    handleAddImagePicked,
    handleEditImagePicked,

    gotoOwnerInCustomerPage,
  };
}
