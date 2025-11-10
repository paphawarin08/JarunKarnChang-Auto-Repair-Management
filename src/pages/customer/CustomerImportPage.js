// src/pages/customers/CustomerImportPage.js
// =====================
// ไฟล์หน้านำเข้าลูกค้า (CSV/Excel)
// โฟลว์หลัก: เลือกไฟล์ -> parse -> ตรวจ format -> validate แต่ละแถว -> เช็คข้อมูลซ้ำ
// -> preview ข้อมูล -> ยืนยันนำเข้า -> ส่งขึ้น service
// =====================

import React, { useMemo, useRef, useState, useEffect } from "react";
import { ArrowLeft, AlertCircle, Upload, CheckCircle2, FileSpreadsheet, Info } from "lucide-react";
import "../../styles/CustomerImportPage.css";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { auth } from "../../firebase/firebase";
import { importCustomersBatch, fetchCustomerIndex } from "../../services/customerService";

// คอลัมน์ที่ "ต้องมี" สำหรับการนำเข้า
const REQUIRED = ["name", "phone"];
// นามสกุลไฟล์ที่ยอมรับ
const SUPPORTED = [".csv", ".xlsx", ".xls"];

// ออกแบบให้ id เป็น optional (ไม่ใส่ก็ได้)
// BASE_HEADERS = โครงหลักของข้อมูลที่ต้องมี
const BASE_HEADERS = ["name","phone","email","lineId","address","subdistrict","district","province","note","dateAdded"];
const OPTIONAL_HEADERS = ["id"];
// เฮดเดอร์ที่ใช้แสดงตัวอย่างในพรีวิว (อยากให้เห็น id ด้วยเลยเอามารวม)
const HEADERS_FOR_PREVIEW = ["id", ...BASE_HEADERS];

export default function CustomerImportPage() {
  const navigate = useNavigate();

  // state หลักของหน้าจอ
  const [fileName, setFileName] = useState("");     // ชื่อไฟล์ที่เลือก
  const [rows, setRows] = useState([]);             // ข้อมูลแถว ๆ หลัง parse + finalize แล้ว
  const [errors, setErrors] = useState([]);         // ข้อผิดพลาดจากการ validate/format
  const [parsing, setParsing] = useState(false);    // กำลังอ่านไฟล์อยู่ไหม
  const [importing, setImporting] = useState(false);// กำลังอัปโหลดนำเข้าไหม
  const [dragOver, setDragOver] = useState(false);  // ไฮไลต์ dropzone ตอนลากไฟล์ทับ

  // รายงานข้อมูลซ้ำ
  // - existing: ซ้ำกับข้อมูลในฐานเดิม
  // - inFile: ซ้ำกันเองภายในไฟล์
  const [dupReport, setDupReport] = useState({ existing: [], inFile: [] });
  const [checkingDup, setCheckingDup] = useState(false);
  const dbIndexRef = useRef(null); // cache index จากฐาน (idSet, phoneSet)

  // นับจำนวนแถวที่ผ่าน validate
  const validCount = useMemo(() => rows.filter(r => r.__valid).length, [rows]);

  // ปุ่มย้อนกลับ (ไปหน้ารายชื่อลูกค้า)
  const handleBack = () => navigate("/admin/customers");

  // === util สำหรับ normalize คีย์ซ้ำ (ไว้ใช้ตอนเช็ค dup) ===
  const normPhone = (p) => (p ?? "").toString().replace(/[^\d+]/g, "");    // เก็บเฉพาะตัวเลข/+
  const toIdKey   = (id) => (id ?? "").toString().trim().toLowerCase();    // id ไม่สนเคส/เว้นวรรค

  // ---------------------------
  // ฟังก์ชันแกน #1: normalizeRow
  // แปลงแถวดิบจาก CSV/Excel -> ให้คีย์ตรง spec, trim ช่องว่าง
  // ทำให้ข้อมูลอยู่ในรูปพร้อมตรวจ/แสดง
  // ---------------------------
  function normalizeRow(raw) {
    const o = {};
    const keys = [...OPTIONAL_HEADERS, ...BASE_HEADERS];
    keys.forEach(k => {
      const v = raw[k] ?? raw[k?.trim?.()] ?? "";
      o[k] = typeof v === "string" ? v.trim() : v;
    });
    return o;
  }

  // ---------------------------
  // ฟังก์ชันแกน #2: validateRow
  // เช็คค่าว่างของ REQUIRED และรูปแบบเบอร์โทรอย่างหยาบ ๆ
  // คืน array ของ error ของแถวนี้ (ถ้าว่างคือผ่าน)
  // ---------------------------
  function validateRow(o, index) {
    const rowErrors = [];
    REQUIRED.forEach(k => {
      if (!o[k] || `${o[k]}`.trim() === "") rowErrors.push(`แถว ${index+1}: ต้องมี "${k}"`);
    });
    if (o.phone) {
      const phone = `${o.phone}`.trim();
      if (!/^[0-9+\-\s()]{6,}$/.test(phone)) rowErrors.push(`แถว ${index+1}: เบอร์โทรไม่ถูกต้อง`);
    }
    return rowErrors;
  }

  // ---------------------------
  // ฟังก์ชันแกน #3: finalize
  // รับข้อมูลดิบทั้งชีต -> จำกัด 500 แถวเพื่อ UI -> normalize + validate ทีละแถว
  // ติดธง __valid (ผ่าน/ไม่ผ่าน) และ __row (เลขแถว) แล้วอัปเดต state
  // ---------------------------
  function finalize(rowsRaw) {
    const limited = rowsRaw.slice(0, 500); // limit UI
    const out = [];
    const errs = [];
    limited.forEach((rr, i) => {
      const o = normalizeRow(rr);
      const rowErr = validateRow(o, i);
      out.push({ ...o, __valid: rowErr.length === 0, __row: i + 1 });
      errs.push(...rowErr);
    });
    setRows(out);
    setErrors(errs);
    setDupReport({ existing: [], inFile: [] }); // reset เมื่อเลือกไฟล์ใหม่
  }

  // ---------------------------
  // ฟังก์ชันแกน #4: parseFile (async)
  // อ่านไฟล์ตามนามสกุล -> CSV ใช้ Papa.parse / Excel ใช้ XLSX
  // เช็คเฮดเดอร์ขั้นต่ำ ถ้าครบค่อย finalize
  // ---------------------------
  async function parseFile(file) {
    setParsing(true);
    setErrors([]);
    setRows([]);
    setDupReport({ existing: [], inFile: [] });
    setFileName(file.name);

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!SUPPORTED.includes(ext)) {
      setErrors([`ไฟล์ "${file.name}" ไม่รองรับ (รองรับ: ${SUPPORTED.join(", ")})`]);
      setParsing(false);
      return;
    }

    try {
      const checkHeaders = (firstRowObj) => {
        const first = Object.keys(firstRowObj || {});
        const missingBase = BASE_HEADERS.filter(h => !first.includes(h));
        if (missingBase.length) {
          setErrors([`หัวคอลัมน์ไม่ครบ: ต้องมี ${missingBase.join(", ")} (คอลัมน์ id ไม่บังคับ)`]);
        }
      };

      if (ext === ".csv") {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => {
            const first = res.data?.[0] || {};
            checkHeaders(first);
            finalize(res.data);
            setParsing(false);
          },
          error: (err) => {
            setErrors([`อ่านไฟล์ CSV ไม่สำเร็จ: ${err.message}`]);
            setParsing(false);
          }
        });
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: "" }); // header แถวแรก
        checkHeaders(data[0] || {});
        finalize(data);
        setParsing(false);
      }
    } catch (e) {
      setErrors([`เกิดข้อผิดพลาดในการอ่านไฟล์: ${e.message}`]);
      setParsing(false);
    }
  }

  // UI handlers เล็ก ๆ สำหรับลากไฟล์/เลือกไฟล์ (เรียก parseFile ต่อ)
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };
  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = ""; // reset เลือกไฟล์เดิมได้อีก
  };

  // ปุ่มโหลดเทมเพลต CSV (ไม่กระทบการนำเข้า แค่ช่วยให้ผู้ใช้กรอกได้ถูก)
  const downloadTemplateCSV = () => {
    const header = HEADERS_FOR_PREVIEW.join(",");
    // ใส่ id เป็นตัวอย่าง (optional)
    const sample = ["001","คุณอรากัน","0812345678","somchai@gmail.com","som.chai","บ้านเลขที่ 123","ลาดพร้าว","ห้วยขวาง","กรุงเทพฯ","ลูกค้าVIP","2023-01-01"].join(",");
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ==========================
  // ฟังก์ชันแกน #5: เช็คข้อมูลซ้ำแบบ realtime (useEffect)
  // ไอเดีย: ทุกครั้งที่ rows เปลี่ยน -> สแกน 2 ชั้น
  //   (1) ซ้ำกันเองในไฟล์ (ดูจาก id/phone ที่ valid เท่านั้น)
  //   (2) ซ้ำกับฐานเดิม (ดึง index ครั้งแรกแล้ว cache ไว้)
  // ผลลัพธ์ไปเก็บใน dupReport เพื่อแจ้งเตือนก่อนนำเข้า
  // ==========================
  useEffect(() => {
    const run = async () => {
      if (!rows.length) { setDupReport({ existing: [], inFile: [] }); return; }

      setCheckingDup(true);

      // --- (1) หา "กลุ่ม" ที่ซ้ำกันในไฟล์เอง ---
      const validRows = rows.filter(r => r.__valid);
      const idMap = new Map();
      const phoneMap = new Map();
      validRows.forEach(r => {
        // รวมแถวที่มี id ซ้ำกัน
        const idK = toIdKey(r.id);
        if (idK) {
          if (!idMap.has(idK)) idMap.set(idK, { value: r.id, rows: [] });
          idMap.get(idK).rows.push(r.__row);
        }
        // รวมแถวที่มีเบอร์ซ้ำกัน (เทียบเฉพาะตัวเลข/เครื่องหมาย +)
        const phK = normPhone(r.phone);
        if (phK) {
          if (!phoneMap.has(phK)) phoneMap.set(phK, { value: r.phone, rows: [] });
          phoneMap.get(phK).rows.push(r.__row);
        }
      });
      const inFile = [];
      idMap.forEach(v => { if (v.rows.length > 1) inFile.push({ field: "id", value: v.value, rows: v.rows.sort((a,b)=>a-b) }); });
      phoneMap.forEach(v => { if (v.rows.length > 1) inFile.push({ field: "phone", value: v.value, rows: v.rows.sort((a,b)=>a-b) }); });

      // --- (2) เช็คกับฐานเดิม (ดึงดัชนีครั้งแรกแล้ว cache) ---
      if (!dbIndexRef.current) {
        try {
          const idx = await fetchCustomerIndex(); // { idSet, phoneSet }
          dbIndexRef.current = idx;
        } catch (e) {
          console.error("fetchCustomerIndex failed:", e);
          setDupReport({ existing: [], inFile }); // ถ้าดึงดัชนีไม่ได้ ก็รายงานเฉพาะในไฟล์ไปก่อน
          setCheckingDup(false);
          return;
        }
      }
      const { idSet, phoneSet } = dbIndexRef.current || { idSet: new Set(), phoneSet: new Set() };
      const existing = [];
      validRows.forEach(r => {
        const causes = [];
        if (r.id && idSet.has(toIdKey(r.id))) causes.push({ field: "id", value: r.id });
        const phK = normPhone(r.phone);
        if (phK && phoneSet.has(phK)) causes.push({ field: "phone", value: r.phone });
        if (causes.length) existing.push({ row: r.__row, causes });
      });

      setDupReport({ existing, inFile });
      setCheckingDup(false);
    };

    run();
  }, [rows]);

  // ---------------------------
  // ฟังก์ชันแกน #6: handleImport (async)
  // รวมทุกอย่างเข้าด้วยกันก่อนยิง service:
  // - เอาเฉพาะแถวที่ valid
  // - ถ้ามีข้อมูลซ้ำ -> สรุปรายการให้ผู้ใช้ confirm
  // - ตกลงแล้ว ส่ง batch import ไปที่ service
  // ---------------------------
  const handleImport = async () => {
    if (!rows.length) return;

    let validRows = rows.filter(r => r.__valid).map(r => ({ ...r }));
    if (!validRows.length) {
      alert("ไม่พบข้อมูลที่ถูกต้องเพียงพอสำหรับนำเข้า");
      return;
    }

    setImporting(true);
    try {
      const MAX_SHOW = 10;
      const { existing, inFile } = dupReport;

      if (existing.length || inFile.length) {
        // สรุปข้อความให้อ่านง่ายก่อน confirm
        const exLines = existing.slice(0, MAX_SHOW).map(e =>
          `แถว ${e.row}: ` + e.causes.map(c => `${c.field}="${c.value}"`).join(", ")
        );
        const inLines = inFile.slice(0, MAX_SHOW).map(g =>
          `${g.field}="${g.value}" พบในแถว ${g.rows.join(", ")}`
        );

        const msg =
          `ตรวจพบข้อมูลซ้ำ\n` +
          (existing.length ? `- ซ้ำกับข้อมูลที่มีอยู่: ${existing.length} รายการ\n  ${exLines.join("\n  ")}${existing.length>MAX_SHOW?`\n  ...`:""}\n` : "") +
          (inFile.length ? `- ซ้ำกันเองภายในไฟล์: ${inFile.length} กลุ่ม\n  ${inLines.join("\n  ")}${inFile.length>MAX_SHOW?`\n  ...`:""}\n` : "") +
          `\nคุณต้องการเพิ่มข้อมูลต่อไปหรือไม่?`;
        const ok = window.confirm(msg);
        if (!ok) { setImporting(false); return; }

        // ถ้าจะ "ข้ามรายการที่ซ้ำ" ก็สามารถเปิดฟิลเตอร์นี้ได้ (มีตัวอย่างให้)
//         validRows = validRows.filter(r =>
//           !existing.some(e => e.row === r.__row) &&
//           !inFile.some(g => g.rows.includes(r.__row))
//         );
      }

      // ตัด field ภายใน (__row/__valid) ออกก่อนส่ง
      const payload = validRows.map(({__row, __valid, ...rest}) => rest);
      const { imported, skipped } = await importCustomersBatch(payload, auth.currentUser?.uid || null);
      alert(`นำเข้าข้อมูลสำเร็จ ${imported} รายการ${skipped>0?` (ตัดเกิน 500 ออก ${skipped})`:""}`);
      navigate("/admin/customers");
    } catch (e) {
      console.error(e);
      alert("นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  };

  // ==== UI ส่วนแสดงผล (คอมเมนต์อธิบายเฉย ๆ ไม่ยุ่งกับ logic ข้างบน) ====
  return (
    <div className="import-page">
      {/* Header */}
      <header className="profile-header">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}><ArrowLeft size={24} /></button>
          <h1 className="page-title">Import ข้อมูลลูกค้า</h1>
        </div>
      </header>

      <div className="import-card">
        {/* แถบแนะนำ/ข้อกำหนดไฟล์ */}
        <section className="supported-row">
          <div className="support-pill success">
            <AlertCircle size={20} />
            <span>นำเข้าข้อมูลด้วยไฟล์ CSV / Excel</span>
            <span className="small">(.csv, .xlsx, .xls)</span>
          </div>
          <div className="support-pill success">
            <Upload size={20} />
            <span>Limit ของการนำเข้าข้อมูลคือ 500</span>
          </div>
          <div className="support-pill success">
            <CheckCircle2 size={20} />
            <span>เช็คว่าใช้ Format ที่ถูกต้อง</span>
          </div>
        </section>

        {/* อธิบายรูปแบบข้อมูล + ปุ่มโหลดเทมเพลต */}
        <section className="format-section">
          <h3>รูปแบบของข้อมูล</h3>
          <p className="hint">
            ต้องมีคอลัมน์: {BASE_HEADERS.join(", ")} <br/>
            <strong>คอลัมน์ id เป็นตัวเลือก (ใส่/ไม่ใส่ก็ได้)</strong>
          </p>
          <div style={{margin:"8px 0 12px"}}>
            <button className="btn-outline" onClick={downloadTemplateCSV}>ดาวน์โหลดเทมเพลต CSV</button>
          </div>
          {/* ตัวอย่างหน้าตาตาราง */}
          <div className="sample-table1">
            <div className="thead">
              {HEADERS_FOR_PREVIEW.map(h => <div key={h} className="th">{h}</div>)}
            </div>
            <div className="tbody1">
              <div className="tr">
                <div className="td">001</div>
                <div className="td">คุณอรากัน</div>
                <div className="td">0812345678</div>
                <div className="td">somchai@gmail.com</div>
                <div className="td">som.chai</div>
                <div className="td">บ้านเลขที่ 123</div>
                <div className="td">ลาดพร้าว</div>
                <div className="td">ห้วยขวาง</div>
                <div className="td">กรุงเทพฯ</div>
                <div className="td">ลูกค้าVIP</div>
                <div className="td">2023-01-01</div>
              </div>
            </div>
          </div>
        </section>

        {/* โซนอัปโหลดไฟล์ (คลิก/ลากวาง) */}
        <section className="upload-section">
          <h3>อัปโหลดไฟล์</h3>
          <div
            className={`dropzone ${dragOver ? "drag-over" : ""}`}
            onDragOver={(e)=>{e.preventDefault(); setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
            onClick={()=>document.getElementById("file-input")?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="drop-inner">
              <FileSpreadsheet size={28} />
              <p className="drop-title">คลิกที่นี่เพื่อ Upload หรือ ลากมาวางในพื้นที่นี้</p>
              <p className="drop-sub">ใช้ไฟล์ .CSV / .XLSX / .XLS รูปแบบตามตัวอย่างด้านบน</p>
              {fileName && <p className="file-name">ไฟล์ที่เลือก: {fileName}</p>}
            </div>
          </div>
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={onInputChange} style={{display:"none"}} />
        </section>

        {/* พรีวิวผลการอ่านไฟล์ + error + ตัวอย่าง 5 แถว */}
        {(parsing || rows.length>0 || errors.length>0) && (
          <section className="result-section">
            <div className="result-row">
              <div className="pill neutral">
                {parsing ? "กำลังอ่านไฟล์..." : `ข้อมูลทั้งหมด: ${rows.length} แถว (ถูกต้อง: ${validCount})`}
              </div>
              {checkingDup && <div className="pill neutral">กำลังตรวจสอบข้อมูลซ้ำ...</div>}
              {errors.length>0 && <div className="pill danger">{`พบข้อผิดพลาด ${errors.length} รายการ`}</div>}
            </div>

            {errors.length>0 && (
              <ul className="error-list">
                {errors.slice(0,5).map((e,i)=><li key={i}><Info size={14}/>{e}</li>)}
                {errors.length>5 && <li>... และอื่น ๆ</li>}
              </ul>
            )}

            {rows.length>0 && (
              <>
                <div className="preview-table1">
                  <div className="thead">
                    {HEADERS_FOR_PREVIEW.map(h => <div key={h} className="th">{h}</div>)}
                  </div>
                  <div className="tbody">
                    {rows.slice(0,5).map((r,idx)=>(
                      <div className={`tr ${r.__valid ? "" : "invalid"}`} key={idx}>
                        {HEADERS_FOR_PREVIEW.map(h => <div key={h} className="td">{r[h] ?? ""}</div>)}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="preview-note">แสดงตัวอย่าง 5 แถวแรก</p>
              </>
            )}
          </section>
        )}

        {/* สรุปข้อมูลซ้ำที่ตรวจพบ (ในไฟล์ / กับฐานเดิม) */}
        {(dupReport.existing.length>0 || dupReport.inFile.length>0) && (
          <section className="result-section">
            <h3>ข้อมูลซ้ำที่ตรวจพบ</h3>

            {dupReport.existing.length>0 && (
              <>
                <div className="pill danger">ซ้ำกับข้อมูลที่มีอยู่: {dupReport.existing.length} รายการ</div>
                <div className="preview-table1" style={{marginTop:8}}>
                  <div className="thead">
                    <div className="th">แถว (จากพรีวิว)</div>
                    <div className="th">ฟิลด์ที่ซ้ำ</div>
                    <div className="th">ค่า</div>
                  </div>
                  <div className="tbody">
                    {dupReport.existing.slice(0,50).flatMap((e,i) =>
                      e.causes.map((c,j)=>(
                        <div className="tr invalid" key={`${i}-${j}`}>
                          <div className="td">{e.row}</div>
                          <div className="td">{c.field}</div>
                          <div className="td">{c.value}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {dupReport.existing.length>50 && <p className="preview-note">...แสดง 50 รายการแรก</p>}
              </>
            )}

            {dupReport.inFile.length>0 && (
              <>
                <div className="pill danger" style={{marginTop:12}}>ซ้ำกันเองภายในไฟล์: {dupReport.inFile.length} กลุ่ม</div>
                <div className="preview-table1" style={{marginTop:8}}>
                  <div className="thead">
                    <div className="th">ฟิลด์</div>
                    <div className="th">ค่า</div>
                    <div className="th">พบในแถว</div>
                  </div>
                  <div className="tbody">
                    {dupReport.inFile.slice(0,50).map((g,idx)=>(
                      <div className="tr invalid" key={idx}>
                        <div className="td">{g.field}</div>
                        <div className="td">{g.value}</div>
                        <div className="td">{g.rows.join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {dupReport.inFile.length>50 && <p className="preview-note">...แสดง 50 กลุ่มแรก</p>}
              </>
            )}
          </section>
        )}

        {/* ปุ่มชุดสุดท้าย: นำเข้า/ยกเลิก */}
        <div className="import-actions">
          <button className="btn-primary" disabled={!rows.length || parsing || importing} onClick={handleImport}>
            {importing ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
          </button>
          <button className="btn-outline" onClick={handleBack}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}
