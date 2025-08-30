// 📦 الاستيراد
import express from "express";
import session from "express-session";
import "dotenv/config";
import bcrypt from "bcrypt";
import crypto from "crypto";
import pkg from "pg";
const { Pool } = pkg;

// 🚀 إعداد الخادم
const app = express();
const PORT = process.env.PORT || 8080;

// 🛠️ إعداد الاتصال بقاعدة PostgreSQL
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

// 🧱 إنشاء جدول البلاغات
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        ref TEXT UNIQUE NOT NULL,
        imei TEXT NOT NULL,
        status TEXT CHECK(status IN ('lost','stolen','recovered')) NOT NULL,
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
        is_public BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ PostgreSQL table ready");
  } catch (err) {
    console.error("❌ Failed to initialize DB:", err);
  }
})();

// 🍪 إعداد الجلسات
app.use(session({
  name: "sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8 // 8 ساعات
  }
}));

// ⚙️ إعدادات عامة
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// 🔍 التحقق من رقم IMEI
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

// 🔐 حماية واجهات الإدارة
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

// ✅ واجهة صحية
app.get("/api/health", (_, res) => res.json({ ok: true }));

// 📝 تقديم بلاغ جديد
app.post("/api/report", async (req, res) => {
  try {
    const {
      imei, status, brand, model, color, description,
      lost_date, location, contact_name, contact_email,
      contact_phone, police_report, is_public
    } = req.body || {};

    if (!isValidIMEI(imei)) return res.status(400).json({ error: "Invalid IMEI" });
    if (!["lost", "stolen"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const ref = crypto.randomUUID();
    await pool.query(`
      INSERT INTO reports (
        ref, imei, status, brand, model, color, description, lost_date, location,
        contact_name, contact_email, contact_phone, police_report, is_public
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [
      ref, imei, status, brand, model, color, description, lost_date, location,
      contact_name, contact_email, contact_phone, police_report, is_public ? true : false
    ]);

    res.status(201).json({ ok: true, ref });
  } catch (err) {
    console.error("❌ /api/report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔎 فحص حالة IMEI
app.get("/api/check", async (req, res) => {
  try {
    const imei = (req.query.imei || "").trim();
    if (!isValidIMEI(imei)) return res.status(400).json({ error: "Invalid IMEI" });

    const { rows } = await pool.query(`
      SELECT ref, imei, status, brand, model, color, lost_date, location, created_at
      FROM reports WHERE imei = $1 AND is_public = true ORDER BY created_at DESC
    `, [imei]);

    res.json({ imei, count: rows.length, reports: rows });
  } catch (err) {
    console.error("❌ /api/check error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔐 تسجيل الدخول
app.post("/api/auth/login", async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Password required" });

    const stored = process.env.ADMIN_PASSWORD;
    const ok = crypto.timingSafeEqual(Buffer.from(password), Buffer.from(stored));
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    req.session.isAdmin = true;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 🔓 تسجيل الخروج
app.post("/api/auth/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

// 🧾 التحقق من الجلسة
app.get("/api/auth/me", (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// 📋 عرض البلاغات (لوحة الإدارة)
app.get("/api/reports", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM reports ORDER BY created_at DESC LIMIT 500
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✏️ تحديث بلاغ معين
app.patch("/api/reports/:ref", requireAdmin, async (req, res) => {
  try {
    const { ref } = req.params;
    const { status, is_public } = req.body || {};

    if (!["lost", "stolen", "recovered"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await pool.query(`
      UPDATE reports SET status = $1, is_public = $2 WHERE ref = $3
    `, [status, is_public ? true : false, ref]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 🟢 تشغيل الخادم
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
