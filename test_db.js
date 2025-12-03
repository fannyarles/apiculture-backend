// test.js
const mongoose = require('mongoose');

const uri = "mongodb+srv://fannyarles.design+apiculture@gmail.com:*Fanny97415228@mongodb-615f9f70-o2c747902.30e4c693.database.cloud.ovh.net/admin?replicaSet=replicaset&tls=true";

mongoose.connect(uri)
  .then(() => console.log("✅ Connecté !"))
  .catch(err => console.error("❌ Erreur :", err));
