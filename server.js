require('dotenv').config();
const express = require('express');
const mongoDB = require('mongodb');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const withAs = (obj, cb) => cb(obj);

const app = express()
  .use(express.static(process.env.production ? 'production' : 'development'));

const server = http.createServer(app);
const io = socketIo(server);

// Listen on specified PORT or 3000 by default
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Connect to MongoDB
mongoDB.MongoClient.connect(
  process.env.MONGO,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err, client) => {
    if (err) {
      console.error('Failed to connect to MongoDB:', err);
      return;
    }
    
    const db = client.db(process.env.dbname);
    
    io.on('connection', (socket) => {
      console.log('New client connected');

      socket.on('datachange', (name, doc) => {
        socket.broadcast.emit('datachange', name, doc);
      });

      socket.on('bcrypt', (text, cb) => {
        bcrypt.hash(text, 10, (err, res) => {
          if (res) cb(res);
        });
      });

      socket.on('login', (creds, cb) => {
        db.collection('users').findOne(
          { username: creds.username, keaktifan: 1 },
          (err, res) => {
            if (res) {
              bcrypt.compare(creds.password, res.password, (err, result) => {
                cb({ res: result && res });
              });
            }
          }
        );
      });

      socket.on('dbCall', (obj, cb) => {
        const coll = db.collection(obj.collection);
        const methods = {
          find: () => coll.find(obj.projection, obj.options).toArray((err, res) => res && cb(res)),
          findOne: () => coll.findOne({ _id: obj._id }, (err, res) => res && cb(res)),
          insertOne: () => coll.insertOne(obj.document, (err, res) => res && cb(res)),
          insertMany: () => coll.insertMany(obj.documents, (err, res) => res && cb(res)),
          updateOne: () => coll.updateOne({ _id: obj._id }, { $set: obj.document }, { upsert: true }, (err, res) => res && cb(res)),
          updateMany: () => (obj.documents || []).map(doc => coll.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true }, (err, res) => res && cb(res))),
          deleteOne: () => coll.deleteOne({ _id: obj._id }, (err, res) => res && cb(res)),
          getDifference: () => {
            const ids = obj.clientColl.map(i => i._id);
            const latest = obj.clientColl.reduce((acc, inc) => (inc.updated > acc ? inc.updated : acc), 0);
            coll.find({ $or: [{ _id: { $nin: ids } }, { updated: { $gt: latest } }] }).toArray((err, res) => res && cb(res));
          }
        };
        methods[obj.method]();
      });

      db.collection('users').findOne({}, (err, res) => {
        if (!res) {
          db.collection('users').insertOne({
            _id: '050zjiki5pqoi0f2ua0xdm',
            username: 'admin',
            nama: 'admin',
            bidang: 5,
            peranan: 4,
            keaktifan: 1,
            password: '$2b$10$xZ22.NIdyoSP65nPTRUf2uN9.Dd4gkCbChwD5fOCjTm4kSPHylS4a',
            updated: 1590416308426
          });
        }
      });
    });
  }
);
