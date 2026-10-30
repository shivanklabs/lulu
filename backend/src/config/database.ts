import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../lib/logger';

export const sanitizeMongoUri = (uri: string): string => {
  return uri.replace(/mongodb(\+srv)?:\/\/.+@/, 'mongodb$1://<redacted-credentials>@');
};

export const sanitizeMongoError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.replace(/mongodb(\+srv)?:\/\/[^\s]+@/g, (match) => {
      const isSrv = match.includes('+srv');
      return `mongodb${isSrv ? '+srv' : ''}://<redacted-credentials>@`;
    });
  }
  return String(error).replace(/mongodb(\+srv)?:\/\/[^\s]+@/g, (match) => {
    const isSrv = match.includes('+srv');
    return `mongodb${isSrv ? '+srv' : ''}://<redacted-credentials>@`;
  });
};

export const connectDatabase = async (uri: string = env.MONGODB_URI): Promise<typeof mongoose> => {
  const sanitizedUri = sanitizeMongoUri(uri);
  try {
    const connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info({ uri: sanitizedUri }, 'MongoDB connected successfully');
    return connection;
  } catch (error) {
    const sanitizedError = sanitizeMongoError(error);
    logger.error({ error: sanitizedError, uri: sanitizedUri }, 'MongoDB connection failure');
    throw new Error(sanitizedError);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    const sanitizedError = sanitizeMongoError(error);
    logger.error({ error: sanitizedError }, 'Error during MongoDB disconnection');
    throw new Error(sanitizedError);
  }
};

export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

export const getDatabaseReadyState = (): string => {
  const states: Record<number, string> = {
    0: 'DISCONNECTED',
    1: 'CONNECTED',
    2: 'CONNECTING',
    3: 'DISCONNECTING',
  };
  return states[mongoose.connection.readyState] || 'UNKNOWN';
};
