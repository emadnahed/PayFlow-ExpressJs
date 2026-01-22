import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { config } from '../config';

interface WorkerResult {
  success: boolean;
  result?: string | boolean;
  error?: string;
}

// Check if we're running in production (compiled) or development (ts-node)
const isProduction = fs.existsSync(path.join(__dirname, 'bcryptWorker.js'));

function runWorker(type: 'hash' | 'compare', password: string, saltOrHash: string | number): Promise<string | boolean> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'bcryptWorker.js');

    const worker = new Worker(workerPath, {
      workerData: { type, password, saltOrHash },
    });

    worker.on('message', (data: WorkerResult) => {
      if (data.success) {
        resolve(data.result!);
      } else {
        reject(new Error(data.error));
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Hash a password using bcrypt (uses worker threads in production, direct in dev)
 */
export async function hashPassword(password: string): Promise<string> {
  if (isProduction) {
    return runWorker('hash', password, config.bcrypt.rounds) as Promise<string>;
  }
  // Fallback for development (ts-node) - still benefits from reduced rounds
  const salt = await bcrypt.genSalt(config.bcrypt.rounds);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a password with a hash using bcrypt (uses worker threads in production, direct in dev)
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (isProduction) {
    return runWorker('compare', password, hash) as Promise<boolean>;
  }
  // Fallback for development (ts-node)
  return bcrypt.compare(password, hash);
}
