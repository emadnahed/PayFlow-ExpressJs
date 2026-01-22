import cluster from 'cluster';
import os from 'os';
import { logger } from './observability';

const numCPUsFromEnv = parseInt(process.env.CLUSTER_WORKERS || '', 10);
const numCPUs = numCPUsFromEnv > 0 ? numCPUsFromEnv : os.cpus().length;

if (cluster.isPrimary) {
  logger.info({ numCPUs, pid: process.pid }, 'Primary process started');

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(
      { workerId: worker.id, pid: worker.process.pid, code, signal },
      'Worker died, restarting...'
    );
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    logger.info({ workerId: worker.id, pid: worker.process.pid }, 'Worker is online');
  });
} else {
  // Workers run the server
  require('./server');
}
