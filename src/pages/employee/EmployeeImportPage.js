// src/pages/EmployeeImportPage.js
// ===============================
// หน้านำเข้าข้อมูล "พนักงาน" จากไฟล์ CSV/Excel
// โฟลว์หลักจริง ๆ คือ:
//   1) ผู้ใช้เลือก/ลากไฟล์ -> เรา parse (CSV ใช้ Papa, Excel ใช้ XLSX)
//   2) เช็คหัวคอลัมน์ขั้นต่ำ, normalize แต่ละแถว, validate ข้อมูลสำคัญ
//   3) สแกนหาข้อมูลซ้ำ (ทั้งในไฟล์เอง และชนกับฐานเดิม) แบบ realtime
//   4) พรีวิว 5 แถวแรก + แสดง error
//   5) ผู้ใช้กด "นำเข้าข้อมูล" -> confirm ถ้าพบซ้ำ -> ยิง import แบบ batch
// ===============================

import React, { useMemo, useRef, useState, useEffect } from "react";
import { ArrowLeft, AlertCircle, Upload, CheckCircle2, FileSpreadsheet, Info } from "lucide-react";
import "../../styles/EmployeeImportPage.css";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { auth } from "../../firebase/firebase";
import { importEmployeesBatch, fetchEmployeeIndex } from "../../services/employeeService";

// ฟิลด์ที่ "ต้องมีจริง ๆ" สำหรับพนักงาน
// name = ชื่อ, phoneNumber = เบอร์โทร
const REQUIRED = ["name", "phoneNumber"];
// นามสกุลไฟล์ที่รองรับ
const SUPPORTED = [".csv", ".xlsx", ".xls"];

// ดีไซน์ header:
// - BASE_HEADERS = คอลัมน์หลักที่ระบบรองรับ (สำหรับเช็คว่าไฟล์มีโครงพื้นฐานครบไหม)
// - OPTIONAL_HEADERS = อันที่อยากรับแต่ไม่บังคับ (เช่น id)
// - HEADERS_FOR_PREVIEW = เฮดเดอร์ที่ใช้เรียงตอนพรีวิว/ทำเทมเพลต
const BASE_HEADERS = ["name","nickname","phoneNumber","role","type","additional","dateAdded"]; // ต้องมีอย่างน้อยคอลัมน์เหล่านี้
const OPTIONAL_HEADERS = ["id"]; // มี/ไม่มีก็ได้
const HEADERS_FOR_PREVIEW = ["id", ...BASE_HEADERS]; // ใช้เรียงพรีวิวและ template

export default function EmployeeImportPage() {
  const navigate = useNavigate();

  // state UI หลัก ๆ
  const [fileName, setFileName] = useState("");     // เก็บชื่อไฟล์ที่เลือกไว้โชว์เฉย ๆ
  const [rows, setRows] = useState([]);             // แถวข้อมูลหลังผ่าน finalize (จะมีธง __valid และ __row)
  const [errors, setErrors] = useState([]);         // รวม error จาก validate/format
  const [parsing, setParsing] = useState(false);    // กำลังอ่าน/แปลงไฟล์อยู่ไหม
  const [importing, setImporting] = useState(false);// กำลังยิง import จริงอยู่ไหม
  const [dragOver, setDragOver] = useState(false);  // ไว้ไฮไลต์ dropzone ตอนลากไฟล์ทับ

  // สถานะ/ผลการตรวจข้อมูลซ้ำ
  // - existing = ซ้ำกับฐานข้อมูลเดิม (อิง index ที่ดึงมาครั้งแรกแล้ว cache)
  // - inFile   = ซ้ำกันเองในไฟล์ที่อัปโหลด
  const [dupReport, setDupReport] = useState({ existing: [], inFile: [] });
  const [checkingDup, setCheckingDup] = useState(false);
  const dbIndexRef = useRef(null); // cache {idSet, phoneSet} เพื่อไม่ดึง index บ่อย ๆ

  // ใช้นับแถว valid ที่พร้อมจะนำเข้า (เอาไว้โชว์ badge)
  const validCount = useMemo(() => rows.filter(r => r.__valid).length, [rows]);

  // ปุ่ม "ย้อนกลับ" กลับไปหน้ารายชื่อพนักงาน
  const handleBack = () => navigate("/admin/employees");

  // util เล็ก ๆ สำหรับ normalize คีย์ที่ใช้เช็คซ้ำ
  const normPhone = (p) => (p ?? "").toString().replace(/[^\d+]/g, ""); // เก็บเฉพาะตัวเลข/+
  const toIdKey  = (id) => (id ?? "").toString().trim().toLowerCase();   // id เทียบแบบไม่สนเคส/เว้นวรรค

  // ---------------------------------------------------
  // ฟังก์ชันหลัก #1: normalizeRow
  // แปลงแถวดิบจาก CSV/Excel ให้คีย์ตรง spec และ trim string
  // เพื่อให้ข้อมูลพร้อมสำหรับ validate และใช้งานต่อ
  // ---------------------------------------------------
  function normalizeRow(raw) {
    // รองรับเคสไม่มีคอลัมน์ id
    const o = {};
    // รวมหัวที่จะอ่าน = optional + base
    const keys = [...OPTIONAL_HEADERS, ...BASE_HEADERS];
    keys.forEach(k => {
      const v = raw[k] ?? raw[k?.trim?.()] ?? "";
      o[k] = typeof v === "string" ? v.trim() : v;
    });
    return o;
  }

  // ---------------------------------------------------
  // ฟังก์ชันหลัก #2: validateRow
  // เช็คฟิลด์จำเป็น (name/phoneNumber) และรูปแบบ phone แบบกว้าง ๆ
  // เพิ่มเติม: ถ้า type มีค่า ต้องเป็น full-time หรือ part-time เท่านั้น
  // คืนเป็นรายการ error (ถ้าว่าง = ผ่าน)
  // ---------------------------------------------------
  function validateRow(o, index) {
    const rowErrors = [];
    REQUIRED.forEach(k => {
      if (!o[k] || `${o[k]}`.trim() === "") rowErrors.push(`แถว ${index+1}: ต้องมี "${k}"`);
    });
    if (o.phoneNumber) {
      const phone = `${o.phoneNumber}`.trim();
      if (!/^[0-9+\-\s()]{6,}$/.test(phone)) rowErrors.push(`แถว ${index+1}: เบอร์โทรไม่ถูกต้อง`);
    }
    if (o.type) {
      const t = `${o.type}`.toLowerCase();
      if (!["full-time","part-time"].includes(t)) {
        rowErrors.push(`แถว ${index+1}: ประเภทการจ้างต้องเป็น "full-time" หรือ "part-time"`);
      }
    }
    return rowErrors;
  }

  // ---------------------------------------------------
  // ฟังก์ชันหลัก #3: finalize
  // รับข้อมูลดิบทั้งชีต -> ตัดเหลือ 500 แถวเพื่อความเร็ว UI
  // -> normalize + validate ทีละแถว -> ติดธง __valid และเลขแถว __row
  // สุดท้ายอัปเดต state rows + errors + reset รายงานซ้ำ
  // ---------------------------------------------------
  function finalize(rowsRaw) {
    const limited = rowsRaw.slice(0, 500);
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

  // ---------------------------------------------------
  // ฟังก์ชันหลัก #4: parseFile (async)
  // ตรวจนามสกุล -> ใช้ Papa หรือ XLSX อ่านข้อมูล
  // เช็ค header ขั้นต่ำ -> แล้วส่งเข้า finalize
  // ---------------------------------------------------
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
        const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        checkHeaders(data[0] || {});
        finalize(data);
        setParsing(false);
      }
    } catch (e) {
      setErrors([`เกิดข้อผิดพลาดในการอ่านไฟล์: ${e.message}`]);
      setParsing(false);
    }
  }

  // handler สำหรับลากไฟล์วางใน dropzone
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };
  // handler สำหรับ input[type=file]
  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
  };

  // ดาวน์โหลดไฟล์เทมเพลต CSV (ช่วยให้กรอกข้อมูลได้รูปแบบที่ถูก)
  const downloadTemplateCSV = () => {
    const header = HEADERS_FOR_PREVIEW.join(",");
    // ใส่ id ตัวอย่าง (optional) — จะลบออกก็ยัง valid
    const sample = ["E001","สมชาย ใจดี","ชาย","0812345678","ช่างซ่อม","full-time","ชำนาญแอร์รถ","2024-01-01"].join(",");
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ===================================================
  // ฟังก์ชันหลัก #5: ตรวจข้อมูลซ้ำแบบ realtime (useEffect)
  // ทุกครั้งที่ rows เปลี่ยน:
  //   - สแกนซ้ำ "ภายในไฟล์" เอง (id/phoneNumber) เฉพาะแถวที่ __valid
  //   - ครั้งแรกดึง index จากฐาน (idSet/phoneSet) แล้ว cache ไว้
  //   - เทียบหา "existing" คือแถวที่ชนฐานเดิม -> เก็บลง dupReport
  // ===================================================
  useEffect(() => {
    const run = async () => {
      if (!rows.length) { setDupReport({ existing: [], inFile: [] }); return; }

      setCheckingDup(true);

      // (1) ซ้ำกันเองภายในไฟล์ (ดูเฉพาะแถวที่ valid)
      const validRows = rows.filter(r => r.__valid);
      const idMap = new Map();
      const phoneMap = new Map();

      validRows.forEach(r => {
        const idK = toIdKey(r.id);
        if (idK) {
          if (!idMap.has(idK)) idMap.set(idK, { value: r.id, rows: [] });
          idMap.get(idK).rows.push(r.__row);
        }
        const phK = normPhone(r.phoneNumber);
        if (phK) {
          if (!phoneMap.has(phK)) phoneMap.set(phK, { value: r.phoneNumber, rows: [] });
          phoneMap.get(phK).rows.push(r.__row);
        }
      });

      const inFile = [];
      idMap.forEach(v => { if (v.rows.length > 1) inFile.push({ field: "id", value: v.value, rows: v.rows.sort((a,b)=>a-b) }); });
      phoneMap.forEach(v => { if (v.rows.length > 1) inFile.push({ field: "phoneNumber", value: v.value, rows: v.rows.sort((a,b)=>a-b) }); });

      // (2) ซ้ำกับฐานเดิม (ดึง index หนึ่งครั้งและ cache)
      if (!dbIndexRef.current) {
        try {
          const idx = await fetchEmployeeIndex(); // {idSet, phoneSet}
          dbIndexRef.current = idx;
        } catch (e) {
          console.error("fetchEmployeeIndex failed:", e);
          setDupReport({ existing: [], inFile });
          setCheckingDup(false);
          return;
        }
      }

      const { idSet, phoneSet } = dbIndexRef.current || { idSet: new Set(), phoneSet: new Set() };
      const existing = [];
      validRows.forEach(r => {
        const causes = [];
        if (r.id && idSet.has(toIdKey(r.id))) causes.push({ field: "id", value: r.id });
        const phK = normPhone(r.phoneNumber);
        if (phK && phoneSet.has(phK)) causes.push({ field: "phoneNumber", value: r.phoneNumber });
        if (causes.length) existing.push({ row: r.__row, causes });
      });

      setDupReport({ existing, inFile });
      setCheckingDup(false);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // ---------------------------------------------------
  // ฟังก์ชันหลัก #6: handleImport (async)
  // รวมข้อมูลที่ __valid -> ถ้าพบซ้ำ แสดงสรุปให้ยืนยันก่อน
  // แล้วส่ง payload ไป importEmployeesBatch
  // ---------------------------------------------------
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
      }

      const payload = validRows.map(({__row, __valid, ...rest}) => rest);
      const { imported, skipped } = await importEmployeesBatch(payload, auth.currentUser?.uid || null);
      alert(`นำเข้าข้อมูลสำเร็จ ${imported} รายการ${skipped>0?` (ตัดเกิน 500 ออก ${skipped})`:""}`);
      navigate("/admin/employees");
    } catch (e) {
      console.error(e);
      alert("นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  };

  // ===== UI render ส่วนล่างนี้เป็นโครงหน้าจอ (แยกส่วน ๆ) =====
  return (
    <div className="import-page">
      {/* Header */}
      <header className="profile-header">
        <div className="header-left">
          <button className="back-button" onClick={handleBack}><ArrowLeft size={24} /></button>
          <h1 className="page-title">Import ข้อมูลพนักงาน</h1>
        </div>
      </header>

      <div className="import-card">
        {/* แถวบอกว่าไฟล์แบบไหนที่ระบบรองรับ / limit / ควรตรวจ format */}
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

        {/* อธิบายรูปแบบข้อมูล + ตัวอย่าง + ปุ่มโหลดเทมเพลต */}
        <section className="format-section">
          <h3>รูปแบบของข้อมูล</h3>
          <p className="hint">
            ต้องมีคอลัมน์: {BASE_HEADERS.join(", ")} <br/>
            <strong>คอลัมน์ id เป็นตัวเลือก (ใส่/ไม่ใส่ก็ได้)</strong>
          </p>
          <div style={{margin:"8px 0 12px"}}>
            <button className="btn-outline" onClick={downloadTemplateCSV}>ดาวน์โหลดเทมเพลต CSV</button>
          </div>
          <div className="sample-table">
            <div className="thead">
              {HEADERS_FOR_PREVIEW.map(h => <div key={h} className="th">{h}</div>)}
            </div>
            <div className="tbody">
              <div className="tr">
                <div className="td">E001</div>
                <div className="td">สมชาย ใจดี</div>
                <div className="td">ชาย</div>
                <div className="td">0812345678</div>
                <div className="td">ช่างซ่อม</div>
                <div className="td">full-time</div>
                <div className="td">ชำนาญแอร์รถ</div>
                <div className="td">2024-01-01</div>
              </div>
            </div>
          </div>
        </section>

        {/* โซนอัปโหลดไฟล์: รองรับทั้งคลิกเลือกและลากวาง */}
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
              <p className="drop-title">คลิกเพื่อ Upload หรือ ลากไฟล์มาวาง</p>
              <p className="drop-sub">รองรับ .CSV / .XLSX / .XLS</p>
              {fileName && <p className="file-name">ไฟล์ที่เลือก: {fileName}</p>}
            </div>
          </div>
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={onInputChange} style={{display:"none"}} />
        </section>

        {/* ส่วนสรุปผล parse + พรีวิว + error */}
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
                <div className="preview-table">
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

        {/* รายงานข้อมูลซ้ำ (ทั้งในไฟล์และชนฐานเดิม) */}
        {(dupReport.existing.length>0 || dupReport.inFile.length>0) && (
          <section className="result-section">
            <h3>ข้อมูลซ้ำที่ตรวจพบ</h3>

            {dupReport.existing.length>0 && (
              <>
                <div className="pill danger">ซ้ำกับข้อมูลที่มีอยู่: {dupReport.existing.length} รายการ</div>
                <div className="preview-table" style={{marginTop:8}}>
                  <div className="thead">
                    <div className="th">แถว (จากพรีวิว)</div>
                    <div className="th">ฟิลด์ที่ซ้ำ</div>
                    <div className="th">ค่า</div>
                  </div>
                  <div className="tbody">
                    {dupReport.existing.slice(0,50).map((e,i)=>(
                      e.causes.map((c,j)=>(
                        <div className="tr invalid" key={`${i}-${j}`}>
                          <div className="td">{e.row}</div>
                          <div className="td">{c.field}</div>
                          <div className="td">{c.value}</div>
                        </div>
                      ))
                    ))}
                  </div>
                </div>
                {dupReport.existing.length>50 && <p className="preview-note">...แสดง 50 รายการแรก</p>}
              </>
            )}

            {dupReport.inFile.length>0 && (
              <>
                <div className="pill danger" style={{marginTop:12}}>ซ้ำกันเองภายในไฟล์: {dupReport.inFile.length} กลุ่ม</div>
                <div className="preview-table" style={{marginTop:8}}>
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

        {/* ปุ่ม action สุดท้าย */}
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
