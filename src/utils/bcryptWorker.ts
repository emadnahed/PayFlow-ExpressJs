import { parentPort } from 'worker_threads';
import bcrypt from 'bcryptjs';

interface WorkerData {
  type: 'hash' | 'compare';
  password: string;
  saltOrHash: string | number;
}

async function processTask(data: WorkerData): Promise<void> {
  try {
    let result: string | boolean;

    if (data.type === 'hash') {
      const salt = await bcrypt.genSalt(data.saltOrHash as number);
      result = await bcrypt.hash(data.password, salt);
    } else {
      result = await bcrypt.compare(data.password, data.saltOrHash as string);
    }

    parentPort?.postMessage({ success: true, result });
  } catch (error) {
    parentPort?.postMessage({ success: false, error: (error as Error).message });
  }
}

// Listen for incoming tasks from the pool manager
parentPort?.on('message', (data: WorkerData) => {
  processTask(data);
});
