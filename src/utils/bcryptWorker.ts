import { parentPort, workerData } from 'worker_threads';
import bcrypt from 'bcryptjs';

interface WorkerData {
  type: 'hash' | 'compare';
  password: string;
  saltOrHash: string | number;
}

const { type, password, saltOrHash } = workerData as WorkerData;

async function run(): Promise<void> {
  try {
    let result: string | boolean;

    if (type === 'hash') {
      const salt = await bcrypt.genSalt(saltOrHash as number);
      result = await bcrypt.hash(password, salt);
    } else {
      result = await bcrypt.compare(password, saltOrHash as string);
    }

    parentPort?.postMessage({ success: true, result });
  } catch (error) {
    parentPort?.postMessage({ success: false, error: (error as Error).message });
  }
}

run();
