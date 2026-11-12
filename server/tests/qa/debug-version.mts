import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';

if (String(process.env.MONGODB_URI).startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: process.env.DB_NAME });
  const db = mongoose.connection.db!;
  const info = await db.admin().command({ buildInfo: 1 });
  console.log('VERSION', info.version);
  console.log('VERSION_ARRAY', JSON.stringify(info.versionArray));
  console.log('MODULES', JSON.stringify(info.modules ?? []));
  await mongoose.disconnect();
})();
