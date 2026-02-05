// server.js (Versi Backend Render untuk WebSocket + API)

require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const http = require('http'); // Tambahan untuk server HTTP
const socketIo = require('socket.io'); // Tambahan untuk Socket.io

const app = express();

// --- SETUP SERVER & SOCKET.IO ---
// Kita bungkus app Express ke dalam HTTP Server
const server = http.createServer(app);

// Inisialisasi Socket.io dengan konfigurasi CORS
const io = socketIo(server, {
  cors: {
    // GANTI BINTANG (*) DENGAN DOMAIN VERCEL KAMU SAAT PRODUCTION BIAR AMAN
    // Contoh: origin: "https://simrs-project.vercel.app"
    origin: "simrs-rcellhealth.vercel.app", 
    methods: ["GET", "POST"]
  }
});

// Middleware JSON
app.use(express.json());
// Middleware CORS untuk API biasa (Express)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // Sesuaikan dengan domain frontend nanti
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// --- KONEKSI DATABASE ---
const mongoUri = process.env.MONGO;
const dbName = process.env.dbname;
let db;

async function connectToDatabase() {
  if (db) return db;
  try {
    const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('MongoDB connected successfully');
    db = client.db(dbName);

    // Inisialisasi admin (code lama kamu)
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
        password: '$2b$10$xZ22.NIdyoSP65nPTRUf2uN9.Dd4gkCbChwD5fOCjTm4kSPHylS4a',
        updated: Date.now()
      });
    }
    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

connectToDatabase();

// --- LOGIKA REAL-TIME (SOCKET.IO) ---
io.on('connection', (socket) => {
  console.log('User terkoneksi via WebSocket:', socket.id);

  // Contoh: Jika client mengirim pesan 'update_data', server akan memberitahu semua client lain
  socket.on('update_data', (data) => {
    console.log('Ada update data:', data);
    // Broadcast ke semua user lain bahwa ada data baru
    socket.broadcast.emit('refresh_data', data); 
  });

  socket.on('disconnect', () => {
    console.log('User disconnect:', socket.id);
  });
});

// --- ENDPOINTS API (Code lama kamu tetap jalan) ---

app.get('/', (req, res) => {
    res.send('Server Backend SIMRS (API + WebSocket) is Running on Render!');
});

app.get('/api', (req, res) => {
  res.status(200).json({ message: 'API SIMRS RCELLHEALTH V4 is running' });
});

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
      const { password, ...userData } = user;
      res.status(200).json({ success: true, user: userData });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/bcrypt', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });
  const hash = await bcrypt.hash(text, 10);
  res.status(200).json({ hash });
});

app.post('/api/db', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database service unavailable' });
  const { collection, method, projection, options, _id, document, documents, clientColl } = req.body;
  const coll = db.collection(collection);

  try {
    let result;
    // ... (Logika switch case kamu sama persis seperti sebelumnya) ...
    // Saya persingkat di sini supaya tidak kepanjangan, 
    // TAPI PASTE KODE SWITCH CASE LENGKAP KAMU DI SINI
    switch (method) {
        case 'find':
          result = await coll.find(projection || {}, options || {}).toArray();
          break;
        case 'findOne':
          result = await coll.findOne({ _id });
          break;
        case 'insertOne':
          result = await coll.insertOne(document);
          // OPTIONAL: Trigger socket saat ada data baru masuk
          io.emit('data_changed', { collection, action: 'insert' }); 
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

// --- MENJALANKAN SERVER (PENTING UNTUK RENDER) ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Backend berjalan di port ${PORT}`);
});
