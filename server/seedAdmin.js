require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('./models/admin');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const username = 'admin';
  const plainPassword = 'pulsemesh123'; // change this to whatever you want

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await Admin.deleteMany({ username }); // clear old one if exists
  await Admin.create({ username, passwordHash });

  console.log(`Admin created: ${username} / ${plainPassword}`);
  process.exit();
}

seed();