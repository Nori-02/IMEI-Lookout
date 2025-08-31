import dotenv from 'dotenv';
dotenv.config();

let db = null;
let isPostgres = false;

// دالة تهيئة الاتصال بقاعدة البيانات
export async function initDB() {
  if (process.env.DATABASE_URL) {
    // PostgreSQL على Render
    const { Client } = await import('pg');
    db = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await db.connect();
    isPostgres = true;
    console.log('✅ Connected to PostgreSQL!');
  } else {
    // SQLite محليًا
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    db = await open({
      filename: './local.db',
      driver: sqlite3.Database
    });
    isPostgres = false;
    console.log('✅ Connected to SQLite!');
  }
}

// استعلام موحد (يدعم SELECT/INSERT/UPDATE/DELETE)
export async function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized!');
  if (isPostgres) {
    const res = await db.query(sql, params);
    return res.rows;
  } else {
    // SQLite: إذا كان الاستعلام SELECT
    if (/^\s*select/i.test(sql)) {
      return await db.all(sql, params);
    } else {
      return await db.run(sql, params);
    }
  }
}

// إغلاق الاتصال (اختياري)
export async function closeDB() {
  if (!db) return;
  if (isPostgres) {
    await db.end();
  } else {
    await db.close();
  }
}