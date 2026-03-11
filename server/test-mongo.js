require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB Connection...');
console.log('MongoDB URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/password=([^&]+)|:([^:/@]+)@/, '***') : 'NOT SET');

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
})
  .then(() => {
    console.log('✅ MongoDB Connection Successful!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Failed!');
    console.error('Error:', err.message);
    console.error('\nPossible Solutions:');
    console.error('1. Check internet connection');
    console.error('2. Verify MongoDB Atlas cluster is running');
    console.error('3. Check MongoDB URI is correct');
    console.error('4. Whitelist your IP in MongoDB Atlas Network Access');
    console.error('5. Try with local MongoDB (change URI to: mongodb://localhost:27017/pharmacy)');
    process.exit(1);
  });

setTimeout(() => {
  console.error('❌ Connection test timed out');
  process.exit(1);
}, 15000);
