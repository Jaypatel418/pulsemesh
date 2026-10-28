require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log('Database:', db.databaseName);
  for (const c of ['users', 'endpoints', 'incidents', 'pingresults']) {
    const r = await db.collection(c).deleteMany({});
    console.log(c, 'deleted:', r.deletedCount);
  }
  await mongoose.disconnect();
})();