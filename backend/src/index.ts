import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase, sanitizeMongoError } from './config/database';
import { seedBaselineData } from './config/seed';
import { logger } from './lib/logger';

const startServer = async () => {
  const app = createApp();

  try {
    // Attempt database connection before accepting any incoming requests
    await connectDatabase();

    // In development mode, only seed baseline demo data if explicitly requested
    if (env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true') {
      await seedBaselineData();
    }

    // In production, strictly require connected database and active replica set for transactions
    if (env.NODE_ENV === 'production') {
      const client = mongoose.connection.getClient() as unknown as {
        topology?: { description?: { type?: string } };
      };
      const topologyType = client?.topology?.description?.type;
      const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
      if (!supportsTransactions) {
        logger.error('Fatal: Connected MongoDB instance does not support replica set transactions in production');
        process.exit(1);
      }
    }
  } catch (err) {
    const sanitizedError = sanitizeMongoError(err);
    logger.error({ error: sanitizedError }, 'Fatal: Database connection failure during startup');
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`MediBridge Backend listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Health check available at http://localhost:${env.PORT}${env.API_PREFIX}/health`);
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Closed out remaining connections. Exiting process.');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startServer().catch((error) => {
  const sanitizedError = sanitizeMongoError(error);
  logger.error({ error: sanitizedError }, 'Fatal error during server startup');
  process.exit(1);
});
