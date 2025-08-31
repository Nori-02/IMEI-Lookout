import express from 'express';
import { initDB, query } from './db.js';

const app = express();
app.use(express.json());

// تهيئة قاعدة البيانات
await initDB();

// إنشاء جدول (مرة واحدة فقط)
const isPostgres = !!process.env.DATABASE_URL;
const idType = isPostgres ? 'SERIAL' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
await query(`
  CREATE TABLE IF NOT EXISTS reports (
    id ${idType},
    imei TEXT NOT NULL,
    status TEXT NOT NULL
  )
`);

// إضافة تقرير جديد
app.post('/api/reports', async (req, res) => {
  const { imei, status } = req.body;
  try {
    const insertQuery = isPostgres
      ? "INSERT INTO reports (imei, status) VALUES ($1, $2)"
      : "INSERT INTO reports (imei, status) VALUES (?, ?)";
    await query(insertQuery, [imei, status]);
    res.json({ message: 'تمت الإضافة بنجاح.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// جلب جميع التقارير
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await query("SELECT * FROM reports");
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// الصفحة الرئيسية (اختياري)
app.get('/', (req, res) => {
  res.send('IMEI Report API');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});