// src/ai/aiSuggestLocal.js
// --------------------------------------------------------------
// โค้ดนี้ทำ “แนะนำสาเหตุ + แนวทางแก้” อาการรถ แบบ on-device
// ไม่มีการเรียก API ภายนอก ใช้โมเดล NLI (zero-shot) ของ @xenova/transformers
// หลัก ๆ มี 2 โหมด:
//   1) ruleMatch: จับคู่จาก rule (คีย์เวิร์ด) 
//   2) NLI: ให้โมเดลช่วยจัดอันดับความเกี่ยวข้องของกฎ (ช้าแต่ฉลาดกว่า)
// --------------------------------------------------------------

import { pipeline, env } from '@xenova/transformers';

// เก็บ pipeline NLI ไว้ (โหลดครั้งเดียว)
let nliPipelinePromise = null;

// ค่าพื้นฐาน
const MAX_RESULTS = 3;           // แสดงผลสูงสุด 3 รายการ
const NLI_RULE_THRESHOLD = 0.45; // เกณฑ์คะแนน NLI ที่ถือว่า “เกี่ยวข้องพอ”

// ===== Dynamic rules (โหลด/อัปเดตจากฐานข้อมูลได้) =====
let DYN_RULES = [];

/** sanitizeRule(r)
 *  — ทำความสะอาด rule จาก DB ให้เป็นรูปแบบเดียวกัน
 *    - keys: บังคับเป็น lower-case
 *    - fix: รับได้ทั้ง array/string (string จะถูก split เป็นรายการ)
 */
function sanitizeRule(r) {
  return {
    _id: r._id || null,
    keys: (r.keys || []).map(k => String(k).toLowerCase()),
    cause: r.cause || "",
    fix: Array.isArray(r.fix) ? r.fix : splitFixList(r.fix),
    tags: Array.isArray(r.tags) ? r.tags : [],
  };
}

/** setDynamicRulesFromDB(list)
 *  — ฟังก์ชัน public สำหรับตั้งค่า dynamic rules จากฐานข้อมูล
 */
export function setDynamicRulesFromDB(list = []) {
  DYN_RULES = list.map(sanitizeRule);
}

/** allRules()
 *  — รวม “กฎจากฐาน” + “กฎ builtin ในไฟล์นี้” (ให้ฐานมาก่อน)
 */
function allRules() {
  return [
    ...DYN_RULES,
    ...RULES.map(r => ({ _id: null, keys: r.keys, cause: r.cause, fix: r.fix, tags: r.tags }))
  ];
}

/** ---------- RULES พื้นฐาน (ไทย) ----------
 *  โครงสร้าง: { keys: [...], cause: "...", fix: [ "...", "..." ], tags: [...] }
 *  สามารถแก้/เพิ่มได้เองตามบริบทอู่
 */
const RULES = [
  {
    keys: ["สตาร์ทไม่ติด", "สตาร์ทติดยาก", "สตาท", "สตาร์ต"],
    cause: "ระบบสตาร์ท/ไฟชาร์จ/แบตเตอรี่",
    fix: [
      "ตรวจแรงดันแบต (>12.4V) และ CCA",
      "เช็กขั้ว/สายกราวด์ จุดหลวม/สนิม",
      "ทดสอบไดสตาร์ท/รีเลย์/ฟิวส์",
      "สแกนโค้ด ECU หากมีไฟเครื่องโชว์"
    ],
    tags: ["ไฟฟ้า", "สตาร์ท", "แบตเตอรี่"]
  },
  {
    keys: ["เดินเบาไม่นิ่ง", "สั่นตอนเดินเบา", "รอบไม่นิ่ง", "ดับตอนจอด", "เครื่องสั่นตอนสตาร์ท"],
    cause: "ระบบอากาศเชื้อเพลิง/ไอดี (ลมรั่ว/คราบเขม่า)",
    fix: [
      "ทำความสะอาดลิ้นปีกผีเสื้อ/ไอดี",
      "ตรวจท่อสุญญากาศรั่ว",
      "เช็กคอยล์/หัวเทียน/เขม่าหัวฉีด",
      "รีเซ็ตรอบเดินเบาด้วยสแกนเนอร์"
    ],
    tags: ["เครื่องยนต์", "ไอดี", "เชื้อเพลิง"]
  },
  {
    keys: ["เครื่องกระตุก", "เร่งไม่ขึ้น", "อืด", "สะดุด"],
    cause: "ระบบจุดระเบิด/เชื้อเพลิง (หัวเทียน/คอยล์/ปั๊ม/กรอง)",
    fix: [
      "ตรวจแรงดันเชื้อเพลิง/กรองตัน",
      "สลับคอยล์ดูอาการย้ายตาม",
      "ตรวจหัวเทียน/ระยะเขี้ยว",
      "อ่านค่า LTFT/STFT หาความผิดปกติ"
    ],
    tags: ["เครื่องยนต์", "จุดระเบิด", "เชื้อเพลิง"]
  },
  {
    // โฟกัสเคสเบรก: เสียง/สั่น/ระยะยาว
    keys: ["เบรกมีเสียง", "เบรกสั่น", "ระยะเบรกยาว"],
    cause: "จาน/ผ้าเบรกสึก/คาลิปเปอร์ติด/น้ำมันเบรกเสื่อม",
    fix: [
      "วัดความหนาผ้า/สภาพจาน (คด/เป็นคลื่น)",
      "เช็กคาลิปเปอร์/รางคาลิปเปอร์",
      "ไล่ลม/เปลี่ยนน้ำมันเบรกตามระยะ"
    ],
    tags: ["ระบบเบรก"]
  },
  {
    keys: ["พวงมาลัยสั่น", "สั่นที่ความเร็ว", "หน้าไวบรา"],
    cause: "ล้อ/ยาง/ศูนย์ล้อ/ช่วงล่าง",
    fix: [
      "ถ่วงล้อ เช็กดอก/บวม/กินใน",
      "ตรวจลูกหมาก/คันชักคันส่ง",
      "ตั้งศูนย์/ตรวจช็อคอัพรั่ว"
    ],
    tags: ["ช่วงล่าง", "ล้อ/ยาง", "ศูนย์ล้อ"]
  },
  {
    keys: ["มีกลิ่นน้ำมัน", "กลิ่นเบนซิน", "กลิ่นดีเซล"],
    cause: "ท่อเชื้อเพลิงรั่ว/โอริงหัวฉีด/ฝาถัง/คานิสเตอร์",
    fix: [
      "ตรวจรอยรั่วตามแนวท่อ/รอยต่อ",
      "เช็กโอริงหัวฉีด/รางหัวฉีด",
      "ตรวจระบบ EVAP/ฝาถังไม่ซีล"
    ],
    tags: ["เชื้อเพลิง", "ความปลอดภัย"]
  },
  {
    keys: [
      "น้ำมันหมดไว", "กินน้ำมัน", "สิ้นเปลืองน้ำมัน",
      "ประหยัดน้ำมันลดลง", "อัตราสิ้นเปลืองสูง", "เปลืองน้ำมัน"
    ],
    cause: "อัตราสิ้นเปลืองสูง (โหลดกล/ส่วนผสมเข้ม/รั่ว/เผาไหม้ไม่สมบูรณ์)",
    fix: [
      "เช็กลมยางตามสเปค/ตั้งศูนย์ล้อ — เบรกค้าง/ลูกปืนล้อฝืดทำให้เปลือง",
      "เปลี่ยนกรองอากาศ/ทำความสะอาด MAF/ลิ้นปีกผีเสื้อ",
      "สแกนค่า O2/Fuel Trim (LTFT/STFT) เพื่อดูส่วนผสมเข้มหรือบางผิดปกติ",
      "ตรวจเทอร์โมสตัท (ถ้าค้างเปิด เครื่องเย็นนาน ทำให้จ่ายเชื้อเพลิงมาก)",
      "ตรวจแรงดันเชื้อเพลิง/เรกูเลเตอร์ และรอยรั่วแนวท่อ/คานิสเตอร์/ฝาถัง",
      "ตรวจหัวฉีดติดค้าง/ซึม — ทดสอบแรงดันตกหลังดับเครื่อง"
    ],
    tags: ["เชื้อเพลิง", "เครื่องยนต์", "ล้อ/ช่วงล่าง"]
  }
];

// ===== ตัวช่วยภาษาไทยแบบเบา ๆ (preprocess string) =====

/** normalizeTH(s)
 *  — ทำตัวพิมพ์เล็ก, กรองอักขระที่ไม่ใช่ ไทย/อังกฤษ/ตัวเลข, ตัดช่องว่างส่วนเกิน
 */
function normalizeTH(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** tokenizeTH(s)
 *  — แยกเป็นคำด้วย space หลัง normalize
 */
function tokenizeTH(s) {
  return normalizeTH(s).split(" ").filter(Boolean);
}

/** charBigrams(s)
 *  — สร้าง bigram ตัวอักษร 
 */
function charBigrams(s) {
  const t = normalizeTH(s);
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out.length ? out : [t];
}

/** diceSim(a, b)
 *  — ค่าคล้ายกันของสตริง a,b ระหว่าง bigrams 
 */
function diceSim(a, b) {
  const A = new Map();
  for (const g of charBigrams(a)) A.set(g, (A.get(g) || 0) + 1);
  let inter = 0, total = charBigrams(a).length + charBigrams(b).length;
  for (const g of charBigrams(b)) {
    const c = A.get(g) || 0;
    if (c > 0) { inter++; A.set(g, c - 1); }
  }
  return (2 * inter) / (total || 1);
}

/** ruleMatch(symptom)
 *  — “ตัวแกนไว” จับคู่กฎจากคีย์เวิร์ด + overlap + fuzzy
 *  คืน [{ cause, solution, tags, _meta... }] เรียงตามคะแนน
 */
function ruleMatch(symptom) {
  const toks = tokenizeTH(symptom);
  const tokSet = new Set(toks);
  const tstr = toks.join(" ");

  // ให้คะแนนต่อ rule
  const scoreRule = (rule) => {
    // 1) exact/substring
    const scExact = rule.keys.reduce(
      (acc, k) => acc + (tstr.includes(normalizeTH(k)) ? 1 : 0),
      0
    );
    // 2) token overlap
    const scTok = rule.keys.reduce((acc, k) => {
      const ov = tokenizeTH(k).filter(w => tokSet.has(w)).length;
      return acc + (ov > 0 ? 0.5 : 0);
    }, 0);
    // 3) fuzzy
    const scFuzzy = rule.keys.reduce((mx, k) => Math.max(mx, diceSim(symptom, k)), 0);

    // รวมเป็นคะแนนเดียว (ปรับน้ำหนักแบบ conservative)
    let sc = (2.0 * scExact) + (1.2 * scTok) + (scFuzzy >= 0.36 ? (3.0 * scFuzzy) : 0);

    // 4) ถ้าคำใน cause ไปโผล่ในอาการ ให้บูสต์
    const cause = normalizeTH(rule.cause || "");
    for (const w of tokSet) if (w && cause.includes(w)) { sc += 0.75; break; }

    return sc;
  };

  // จัดอันดับ + สร้างเอาต์พุตอ่านง่าย
  const ranked = allRules()
    .map(r => ({ r, sc: scoreRule(r) }))
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, MAX_RESULTS)
    .map(x => ({
      cause: x.r.cause,
      solution: x.r.fix.join(" • "),
      tags: x.r.tags,
      _ruleId: x.r._id || null,
      _source: x.r._id ? "db" : "builtin",
      _kwScore: x.sc
    }));

  return ranked;
}

/** shortlistRulesForNLI(symptom, limit)
 *  — เลือก “กฎจำนวนเล็ก ๆ” ที่น่าจะเกี่ยวข้อง ส่งให้ NLI ช่วยจัดอันดับ
 *    (จำกัดเพื่อความเร็ว/ประหยัด)
 */
function shortlistRulesForNLI(symptom, limit = 12) {
  const toks = tokenizeTH(symptom);
  const tokSet = new Set(toks);
  const tstr = toks.join(" ");

  const scoreRule = (r) => {
    const scExact = r.keys.reduce((acc, k) => acc + (tstr.includes(normalizeTH(k)) ? 1 : 0), 0);
    const scTok = r.keys.reduce((acc, k) => acc + (tokenizeTH(k).some(w => tokSet.has(w)) ? 0.5 : 0), 0);
    const scFuzzy = r.keys.reduce((mx, k) => Math.max(mx, diceSim(symptom, k)), 0);
    let sc = (2.0 * scExact) + (1.2 * scTok) + (scFuzzy >= 0.36 ? (3.0 * scFuzzy) : 0);
    const cause = normalizeTH(r.cause || "");
    for (const w of tokSet) if (w && cause.includes(w)) { sc += 0.75; break; }
    return sc;
  };

  let pool = allRules().map(r => ({ r, sc: scoreRule(r) }))
                       .sort((a,b) => b.sc - a.sc);

  if (pool.length === 0) pool = allRules().map(r => ({ r, sc: 0 }));

  return pool.slice(0, limit).map(x => x.r);
}

/** splitFixList(text)
 *  — แปลงข้อความแนวทางแก้ให้เป็น array โดยตัดด้วยตัวคั่นที่พบบ่อย
 */
function splitFixList(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n|•|\||;|,/g)
    .map(s => s.trim())
    .filter(Boolean);
}

/** makeRuleFromExample(symptom, cause, solution)
 *  — อำนวยความสะดวกเวลาอยากสร้าง rule ใหม่ (เอา symptom เป็น key)
 */
export function makeRuleFromExample(symptom, cause, solution) {
  const s = (symptom || "").trim();
  const keys = [s].filter(Boolean);
  const fix  = splitFixList(solution);
  const tags = [];
  return { keys, cause: cause || "", fix, tags };
}

/** ensureNLI()
 *  — เปิดใช้งาน NLI (zero-shot) แบบ on-device
 *    - พยายามโหลด model จาก local assets ก่อน ถ้าไม่มีจึง fallback โหลด remote
 *    - cache ไว้ใน nliPipelinePromise
 */
export async function ensureNLI() {
  if (nliPipelinePromise) return nliPipelinePromise;

  // เซ็ต backend onnx + cache ให้เหมาะกับ browser
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = true;
  env.useBrowserCache = true;
  env.cacheDir = 'indexeddb://transformers';

  // ชี้ path local model (ถ้าเรามีไฟล์ไว้ใน public)
  env.localModelPath = '/models/local';
  const MODEL_ID = 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';

  // เช็คว่ามีไฟล์โมเดลอยู่ใน local ไหม (HEAD)
  const haveLocalAssets = async () => {
    const root = '/models/local/Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';
    const need = ['config.json', 'tokenizer.json', 'spm.model', 'onnx/model_quantized.onnx'];
    try {
      const res = await Promise.all(need.map(p => fetch(`${root}/${p}`, { method: 'HEAD' })));
      return res.every(r => r.ok && (r.status === 200));
    } catch { return false; }
  };

  // loader 2 แบบ: local / remote
  const tryLocal = async () => { env.allowLocalModels = true;  return await pipeline('zero-shot-classification', MODEL_ID); };
  const tryRemote = async () => { env.allowLocalModels = false; return await pipeline('zero-shot-classification', MODEL_ID); };

  try {
    nliPipelinePromise = (await haveLocalAssets()) ? tryLocal() : tryRemote();
    return await nliPipelinePromise;
  } catch (e1) {
    console.warn('[NLI] local load failed, fallback to remote:', e1);
    env.allowLocalModels = false;
    nliPipelinePromise = tryRemote();
    return await nliPipelinePromise;
  }
}

/** nliSuggestOverRules(symptom)
 *  — ใช้ NLI จัดอันดับ “กฎที่คัดมาแล้ว” ให้เหลือตัวที่ตรงจริง ๆ
 */
async function nliSuggestOverRules(symptom) {
  try {
    const nli = await ensureNLI();
    if (!nli) return [];

    const cands = shortlistRulesForNLI(symptom, 12);
    if (cands.length === 0) return [];

    // labels: ยัดทั้ง cause + ตัวอย่าง key บางตัว เพื่อเป็น hint ให้ NLI
    const labels = cands.map((r, i) => {
      const keyHint = (r.keys?.[0] ? ` | ${r.keys[0]}` : "");
      return `[R${i}] ${r.cause}${keyHint}`;
    });

    const infer = nli(
      symptom,
      labels,
      { multi_label: true, hypothesis_template: "อาการนี้เกี่ยวข้องกับ {} หรือไม่?" }
    );

    // กันเงียบ: ถ้า infer เกิน 8 วิ ถือว่าไม่พร้อม
    const out = await Promise.race([
      infer,
      new Promise((_, rej) => setTimeout(() => rej(new Error('NLI timeout')), 8000))
    ]);

    const labs = Array.isArray(out?.labels) ? out.labels : [];
    const scs  = Array.isArray(out?.scores) ? out.scores : [];

    // map label -> rule + score
    const pairs = labs.map((lbl, i) => {
      const idx = labels.indexOf(lbl);
      return idx >= 0 ? { r: cands[idx], s: scs[i] || 0 } : null;
    }).filter(Boolean);

    return pairs
      .filter(x => x.s >= NLI_RULE_THRESHOLD)
      .slice(0, MAX_RESULTS)
      .map(({ r, s }) => ({
        cause: r.cause,
        solution: Array.isArray(r.fix) ? r.fix.join(" • ") : String(r.fix || ""),
        tags: r.tags || [],
        _ruleId: r._id || null,
        _source: "nli",
        _score: s
      }));
  } catch {
    return [];
  }
}

// cache readiness (กันเรียก ensureNLI บ่อย ๆ)
let nliReadyCache = null;

/** isNLIReady()
 *  — เช็คว่าเปิดใช้ NLI สำเร็จหรือยัง (true/false)
 */
export async function isNLIReady() {
  if (nliReadyCache === true) return true;
  try {
    await ensureNLI();
    nliReadyCache = true;
    return true;
  } catch (e) {
    console.error('[NLI] init failed:', e);
    nliReadyCache = false;
    return false;
  }
}

/** getSuggestionsForSymptom(symptom, { useNLI })
 *  — API หลักที่ UI ควรเรียก
 *    - ถ้า useNLI=false: ใช้ ruleMatch อย่างเดียว (เร็ว)
 *    - ถ้า useNLI=true : รวมผล NLI (ฉลาดขึ้น) แล้ว dedupe + จัดอันดับรวม
 */
export async function getSuggestionsForSymptom(symptom, { useNLI = false } = {}) {
  const base = ruleMatch(symptom); // แมตช์คีย์เวิร์ด (เร็ว)
  if (!useNLI) {
    return base.slice(0, MAX_RESULTS);
  }

  // ใช้ NLI เพื่อ “จัดอันดับกฎ” แล้วรวมกับ base
  const fromRules = await nliSuggestOverRules(symptom);

  // รวมผลแบบไม่ซ้ำ (คีย์ = ruleId + cause)
  const seen = new Set();
  const merged = [...fromRules, ...base].filter(x => {
    const key = (x._ruleId || '') + '|' + x.cause;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // จัดอันดับรวม: ถ้ามี _score (NLI) ให้ความสำคัญก่อน แล้วตามด้วย _kwScore
  const priority = (it) =>
    Math.round((it._score || 0) * 1000) + Math.round((it._kwScore || 0) * 10)
    + (it._source === "db" ? 5 : 0); // ดันกฎจากฐานเล็กน้อย

  merged.sort((a,b) => priority(b) - priority(a));
  return merged.slice(0, MAX_RESULTS);
}

/** debugCheckLocalNLIAssets()
 *  — ตัวช่วยเช็คว่าไฟล์โมเดลใน public พร้อมไหม (ไว้ debug เท่านั้น)
 */
export async function debugCheckLocalNLIAssets() {
  const base = (import.meta?.env?.BASE_URL || '/').replace(/\/+$/, '');
  const root = `${base}/models/local/Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`;
  const list = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'spm.model',
    'onnx/model_quantized.onnx',
    'onnx/model.onnx'
  ];
  for (const p of list) {
    const url = `${root}/${p}`;
    const r = await fetch(url);
    const ct = r.headers.get('content-type') || '';
    console.log('[NLI asset]', p, r.status, ct);
    if (!r.ok) console.warn('❌ missing:', p);
    else if (ct.includes('text/html')) console.warn('⚠️ served as HTML (rewrite?):', p);
  }
}
