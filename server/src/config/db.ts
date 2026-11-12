import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDB(): Promise<void> {
  if (env.MONGODB_URI.startsWith('mongodb+srv://')) {
    const servers = env.DNS_SERVERS.split(',')
      .map((server) => server.trim())
      .filter(Boolean);
    if (servers.length > 0) dns.setServers(servers);
  }

  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', env.NODE_ENV !== 'production');

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'MongoDB connection error'));

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.DB_NAME || undefined,
    serverSelectionTimeoutMS: 20_000,
    maxPoolSize: 20,
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
