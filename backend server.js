import express from "express";
import cors from "cors";
import Database from 'better-sqlite3';
import "dotenv/config";
import crypto from "crypto";
import session from "express-session";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

const db = new Database('./data.db');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

// --- Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(session({
  name: "sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8 // 8 ساعات
  }
}));

// Static public assets (site UI)
app.use(express.static(path.join(__dirname, "..", "public")));

let db;
(async () => {
  db = await open({
    filename: path.join(__dirname, "..", "data.db"),
    driver: better-sqlite3.Database
  });
  await db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT UNIQUE NOT NULL,
      imei TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('lost','stolen','recovered')),
      brand TEXT,
      model TEXT,
      color TEXT,
      description TEXT,
      lost_date TEXT,
      location TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      police_report TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reports_imei ON reports (imei);
    CREATE INDEX IF NOT EXISTS idx_reports_public ON reports (is_public);
  `);
})();

// --- Helpers

const isValidIMEI = (s) => {
  if (!/^\d{15}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(s[i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

// بسيط: تحديد محاولات الدخول لكل IP
const loginAttempts = new Map(); // ip -> { count, ts }
const maxAttempts = 7;
const windowMs = 15 * 60 * 1000;

const gateLogin = (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "ip";
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, ts: now };
  if (now - rec.ts > windowMs) { rec.count = 0; rec.ts = now; }
  if (rec.count >= maxAttempts) return res.status(429).json({ error: "Too many attempts. Try later." });
  loginAttempts.set(ip, rec);
  req._rate = { rec, ip };
  next();
};

// --- Auth routes

app.post("/api/auth/login", gateLogin, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Password required" });

    let ok = false;
    if (ADMIN_PASSWORD_HASH) {
      ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    } else if (ADMIN_PASSWORD) {
      // للمشاريع الصغيرة/التجربة فقط
      ok = crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));
    } else {
      return res.status(500).json({ error: "Admin password not configured" });
    }

    if (!ok) {
      req._rate.rec.count++;
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // نجاح
    req.session.isAdmin = true;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// --- Public API

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/check", async (req, res) => {
  try {
    const imei = (req.query.imei || "").trim();
    if (!isValidIMEI(imei)) return res.status(400).json({ error: "Invalid IMEI" });
    const rows = await db.all(
      `SELECT ref, imei, status, brand, model, color, lost_date, location, created_at
       FROM reports WHERE imei = ? AND is_public = 1 ORDER BY created_at DESC`,
      imei
    );
    res.json({ imei, count: rows.length, reports: rows });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/report", async (req, res) => {
  try {
    const {
      imei, status, brand, model, color, description,
      lost_date, location, contact_name, contact_email,
      contact_phone, police_report, is_public
    } = req.body || {};

    if (!isValidIMEI(imei)) return res.status(400).json({ error: "Invalid IMEI" });
    if (!["lost", "stolen"].includes(status)) {
      return res.status(400).json({ error: "Invalid status (lost|stolen)" });
    }

    const ref = crypto.randomUUID();
    await db.run(
      `INSERT INTO reports
        (ref, imei, status, brand, model, color, description, lost_date, location,
         contact_name, contact_email, contact_phone, police_report, is_public)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ref, imei, status, brand || null, model || null, color || null,
        description || null, lost_date || null, location || null,
        contact_name || null, contact_email || null, contact_phone || null,
        police_report || null, is_public ? 1 : 0
      ]
    );

    res.status(201).json({ ok: true, ref });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// --- Admin API (session-protected)

app.get("/api/reports", requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM reports ORDER BY created_at DESC LIMIT 500`
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/reports/:ref", requireAdmin, async (req, res) => {
  try {
    const { ref } = req.params;
    const fields = [];
    const values = [];
    const updatable = {
      status: (v) => ["lost", "stolen", "recovered"].includes(v),
      is_public: (v) => v === 0 || v === 1
    };
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k in updatable && updatable[k](v)) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
    }
    if (!fields.length) return res.status(400).json({ error: "No valid fields" });
    values.push(ref);
    const r = await db.run(`UPDATE reports SET ${fields.join(", ")} WHERE ref = ?`, values);
    if (r.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// --- Admin page (HTML) protected by session
app.get("/admin", (req, res) => {
  // إن لم يكن مسجلاً، اعرض نموذج الدخول؛ وإلا أعرض اللوحة
  res.sendFile(path.join(__dirname, "..", "admin", "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


