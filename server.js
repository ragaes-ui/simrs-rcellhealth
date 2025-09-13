// server.js (Sudah diperbaiki untuk Vercel)

require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const app = express();
// Middleware untuk mengizinkan Express membaca body request dalam format JSON
app.use(express.json());

// --- KONEKSI DATABASE ---
// URL koneksi dan nama database diambil dari Environment Variables
const mongoUri = process.env.MONGO;
const dbName = process.env.dbname;

let db;

// Fungsi untuk menghubungkan ke MongoDB
async function connectToDatabase() {
  if (db) return db; // Jika sudah terhubung, kembalikan koneksi yang ada
  try {
    const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('MongoDB connected successfully');
    db = client.db(dbName);

    // Inisialisasi data awal (membuat user admin jika belum ada)
    const adminUser = await db.collection('users').findOne({ username: 'admin' });
    if (!adminUser) {
      console.log('Creating initial admin user...');
      await db.collection('users').insertOne({
        _id: '050zjiki5pqoi0f2ua0xdm',
        username: 'admin',
        nama: 'admin',
        bidang: 5,
        peranan: 4,
        keaktifan: 1,
        password: '$2b$10$xZ22.NIdyoSP65nPTRUf2uN9.Dd4gkCbChwD5fOCjTm4kSPHylS4a', // Password: admin
        updated: Date.now()
      });
    }
    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    // Hentikan aplikasi jika gagal terhubung ke DB saat startup
    process.exit(1);
  }
}

// Panggil fungsi koneksi saat aplikasi mulai
connectToDatabase();

// --- ENDPOINTS API ---

// Endpoint dasar untuk cek apakah server berjalan
app.get('/api', (req, res) => {
  res.status(200).json({ message: 'API SIMRS RCELLHEALTH V4 is running' });
});

// Endpoint untuk login user
app.post('/api/login', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database service unavailable' });
  
  const { username, password } = req.body;
  try {
    const user = await db.collection('users').findOne({ username: username, keaktifan: 1 });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found or inactive' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      const { password, ...userData } = user; // Hapus password dari data yang dikirim kembali
      res.status(200).json({ success: true, user: userData });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Endpoint untuk utility bcrypt (jika masih diperlukan oleh front-end)
app.post('/api/bcrypt', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }
  const hash = await bcrypt.hash(text, 10);
  res.status(200).json({ hash });
});

// Endpoint generic untuk semua operasi database (menggantikan 'dbCall')
app.post('/api/db', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database service unavailable' });

  const { collection, method, projection, options, _id, document, documents, clientColl } = req.body;
  const coll = db.collection(collection);

  try {
    let result;
    switch (method) {
      case 'find':
        result = await coll.find(projection || {}, options || {}).toArray();
        break;
      case 'findOne':
        result = await coll.findOne({ _id });
        break;
      case 'insertOne':
        result = await coll.insertOne(document);
        break;
      case 'insertMany':
        result = await coll.insertMany(documents);
        break;
      case 'updateOne':
        result = await coll.updateOne({ _id }, { $set: document }, { upsert: true });
        break;
      case 'updateMany':
        const updatePromises = (documents || []).map(doc =>
          coll.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true })
        );
        result = await Promise.all(updatePromises);
        break;
      case 'deleteOne':
        result = await coll.deleteOne({ _id });
        break;
      case 'getDifference':
        const ids = clientColl.map(i => i._id);
        const latest = clientColl.reduce((acc, inc) => (inc.updated > acc ? inc.updated : acc), 0);
        result = await coll.find({ $or: [{ _id: { $nin: ids } }, { updated: { $gt: latest } }] }).toArray();
        break;
      default:
        return res.status(400).json({ error: `Method '${method}' not recognized` });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Database operation failed', details: error.message });
  }
});

// Export aplikasi Express agar Vercel bisa menjalankannya
module.exports = app;
