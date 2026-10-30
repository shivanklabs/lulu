import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { sanitizeMongoUri, sanitizeMongoError, disconnectDatabase } from '../config/database';
import { logger } from '../lib/logger';

export interface AtlasVerificationResult {
  success: boolean;
  sanitizedUri: string;
  isAtlas: boolean;
  topologyType?: string;
  supportsTransactions: boolean;
  databaseName?: string;
  collectionCount?: number;
  collections?: string[];
  error?: string;
  blocker?: string;
}

export const verifyAtlasConnection = async (customUri?: string): Promise<AtlasVerificationResult> => {
  const uri = customUri || env.MONGODB_URI;
  const sanitizedUri = sanitizeMongoUri(uri);

  // 1. Detect placeholder credentials or missing configuration
  const isPlaceholder =
    uri.includes('<username>') ||
    uri.includes('<password>') ||
    uri.includes('<cluster-host>') ||
    uri.includes('USER:PASSWORD');

  if (isPlaceholder) {
    const blocker =
      'MongoDB Atlas connection URI in backend/.env contains placeholder tokens (<username>, <password>, or <cluster-host>). Please configure real credentials in backend/.env.';
    logger.warn({ uri: sanitizedUri }, blocker);
    return {
      success: false,
      sanitizedUri,
      isAtlas: uri.startsWith('mongodb+srv://'),
      supportsTransactions: false,
      blocker,
      error: 'PLACEHOLDER_CREDENTIALS',
    };
  }

  // 2. Attempt secure connection
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    const db = conn.connection.db;
    if (!db) {
      throw new Error('Database handle is undefined after successful connection');
    }

    // 3. Safe read-only ping
    await db.admin().ping();

    // 4. Inspect topology and transaction capabilities
    let topologyType = 'Standalone';
    let supportsTransactions = false;

    try {
      const helloResult = await db.admin().command({ hello: 1 });
      if (helloResult.setName) {
        topologyType = `ReplicaSet (${helloResult.setName})`;
        supportsTransactions = true;
      } else if (helloResult.msg === 'isdbgrid') {
        topologyType = 'ShardedCluster';
        supportsTransactions = true;
      }
    } catch {
      // Fallback topology check
      const client = conn.connection.getClient() as unknown as {
        topology?: { description?: { type?: string } };
      };
      topologyType = client?.topology?.description?.type || 'Unknown';
      supportsTransactions =
        topologyType === 'ReplicaSetWithPrimary' ||
        topologyType === 'Sharded' ||
        topologyType.includes('ReplicaSet');
    }

    // 5. Read-only collection enumeration (Zero mutation)
    const collectionsList = await db.listCollections().toArray();
    const collectionNames = collectionsList.map((c) => c.name);

    const isAtlas =
      uri.startsWith('mongodb+srv://') ||
      uri.includes('mongodb.net') ||
      uri.includes('atlas');

    await disconnectDatabase();

    return {
      success: true,
      sanitizedUri,
      isAtlas,
      topologyType,
      supportsTransactions,
      databaseName: db.databaseName,
      collectionCount: collectionsList.length,
      collections: collectionNames,
    };
  } catch (error) {
    const sanitizedError = sanitizeMongoError(error);
    return {
      success: false,
      sanitizedUri,
      isAtlas: uri.startsWith('mongodb+srv://'),
      supportsTransactions: false,
      error: sanitizedError,
      blocker: `Database connection failed: ${sanitizedError}`,
    };
  }
};

// Direct script execution entry point
if (require.main === module) {
  (async () => {
    logger.info('Starting safe MongoDB Atlas connection verification...');
    const result = await verifyAtlasConnection();

    if (result.success) {
      process.stdout.write('\n=== MongoDB Atlas Verification: SUCCESS ===\n');
      process.stdout.write(`Target URI: ${result.sanitizedUri}\n`);
      process.stdout.write(`Is Atlas Cluster: ${result.isAtlas}\n`);
      process.stdout.write(`Topology: ${result.topologyType}\n`);
      process.stdout.write(`Transactions Supported: ${result.supportsTransactions}\n`);
      process.stdout.write(`Database: ${result.databaseName}\n`);
      process.stdout.write(`Existing Collections: ${result.collectionCount}\n`);
      process.stdout.write('Zero database mutations performed. All existing data preserved.\n\n');
      process.exit(0);
    } else {
      process.stderr.write('\n=== MongoDB Atlas Verification: BLOCKED / FAILED ===\n');
      process.stderr.write(`Target URI: ${result.sanitizedUri}\n`);
      process.stderr.write(`Blocker: ${result.blocker}\n`);
      process.stderr.write(`Sanitized Error: ${result.error}\n\n`);
      process.exit(1);
    }
  })();
}
