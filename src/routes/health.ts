import { Router, Request, Response } from 'express';
import { getDatabaseStatus } from '../config/database';
import { eventBus } from '../events/eventBus';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const eventBusStatus = eventBus.getStatus();

  const isHealthy = dbStatus.connected && eventBusStatus.connected;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        connected: dbStatus.connected,
        readyState: dbStatus.readyState,
      },
      eventBus: {
        connected: eventBusStatus.connected,
      },
    },
  });
});

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const eventBusStatus = eventBus.getStatus();

  const isReady = dbStatus.connected && eventBusStatus.connected;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

export default router;
