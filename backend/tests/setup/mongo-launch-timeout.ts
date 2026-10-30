import fs from 'node:fs';
import { MongoInstance } from 'mongodb-memory-server-core';

// Automatically detect local Windows MongoDB installation if MONGOMS_SYSTEM_BINARY is not set
if (!process.env.MONGOMS_SYSTEM_BINARY) {
  const commonWindowsPaths = [
    'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\5.0\\bin\\mongod.exe',
  ];
  for (const candidate of commonWindowsPaths) {
    if (fs.existsSync(candidate)) {
      process.env.MONGOMS_SYSTEM_BINARY = candidate;
      break;
    }
  }
}

// Ensure tests always default to deterministic offline mock AI provider unless explicitly running live tests
if (!process.env.LIVE_AI_TEST) {
  process.env.AI_PROVIDER = 'mock';
  process.env.AI_MODEL = 'mock-model';
}

// mongod can take longer than mongodb-memory-server's default 10s to boot on slower or
// memory-constrained machines. Give every in-memory instance a more generous launch window.
const LAUNCH_TIMEOUT_MS = Number(process.env.MONGOMS_TEST_LAUNCH_TIMEOUT_MS ?? 45000);

const originalStart = MongoInstance.prototype.start;
MongoInstance.prototype.start = function patchedStart(this: MongoInstance) {
  if (!this.instanceOpts.launchTimeout) {
    this.instanceOpts.launchTimeout = LAUNCH_TIMEOUT_MS;
  }
  return originalStart.call(this);
};
