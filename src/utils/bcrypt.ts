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

interface QueuedTask {
  type: 'hash' | 'compare';
  password: string;
  saltOrHash: string | number;
  resolve: (value: string | boolean) => void;
  reject: (error: Error) => void;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

// Check if we're running in production (compiled) or development (ts-node)
const isProduction = fs.existsSync(path.join(__dirname, 'bcryptWorker.js'));

// Worker pool configuration
const POOL_SIZE = parseInt(process.env.BCRYPT_POOL_SIZE || '', 10) || 4;
const workerPool: PoolWorker[] = [];
const taskQueue: QueuedTask[] = [];
let poolInitialized = false;

function createWorker(): PoolWorker {
  const workerPath = path.join(__dirname, 'bcryptWorker.js');
  const worker = new Worker(workerPath);

  const poolWorker: PoolWorker = {
    worker,
    busy: false,
  };

  worker.on('error', (error) => {
    console.error('Bcrypt worker error:', error);
    // Replace the failed worker
    const index = workerPool.indexOf(poolWorker);
    if (index !== -1) {
      workerPool.splice(index, 1);
      workerPool.push(createWorker());
    }
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Bcrypt worker exited with code ${code}`);
      // Replace the exited worker
      const index = workerPool.indexOf(poolWorker);
      if (index !== -1) {
        workerPool.splice(index, 1);
        workerPool.push(createWorker());
      }
    }
  });

  return poolWorker;
}

function initializePool(): void {
  if (poolInitialized || !isProduction) return;

  for (let i = 0; i < POOL_SIZE; i++) {
    workerPool.push(createWorker());
  }
  poolInitialized = true;
}

function processNextTask(): void {
  if (taskQueue.length === 0) return;

  const availableWorker = workerPool.find((w) => !w.busy);
  if (!availableWorker) return;

  const task = taskQueue.shift()!;
  availableWorker.busy = true;

  const messageHandler = (data: WorkerResult) => {
    availableWorker.busy = false;
    availableWorker.worker.off('message', messageHandler);

    if (data.success) {
      task.resolve(data.result!);
    } else {
      task.reject(new Error(data.error));
    }

    // Process next task in queue
    processNextTask();
  };

  availableWorker.worker.on('message', messageHandler);
  availableWorker.worker.postMessage({
    type: task.type,
    password: task.password,
    saltOrHash: task.saltOrHash,
  });
}

function runWorkerPooled(
  type: 'hash' | 'compare',
  password: string,
  saltOrHash: string | number
): Promise<string | boolean> {
  initializePool();

  return new Promise((resolve, reject) => {
    taskQueue.push({ type, password, saltOrHash, resolve, reject });
    processNextTask();
  });
}

/**
 * Hash a password using bcrypt (uses worker pool in production, direct in dev)
 */
export async function hashPassword(password: string): Promise<string> {
  if (isProduction) {
    return runWorkerPooled('hash', password, config.bcrypt.rounds) as Promise<string>;
  }
  // Fallback for development (ts-node) - still benefits from reduced rounds
  const salt = await bcrypt.genSalt(config.bcrypt.rounds);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a password with a hash using bcrypt (uses worker pool in production, direct in dev)
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (isProduction) {
    return runWorkerPooled('compare', password, hash) as Promise<boolean>;
  }
  // Fallback for development (ts-node)
  return bcrypt.compare(password, hash);
}

/**
 * Gracefully shutdown the worker pool
 */
export async function shutdownBcryptPool(): Promise<void> {
  const terminatePromises = workerPool.map((pw) => pw.worker.terminate());
  await Promise.all(terminatePromises);
  workerPool.length = 0;
  poolInitialized = false;
}
