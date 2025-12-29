import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import healthRoutes from './routes/health';
import { authRoutes } from './auth';
import { walletRoutes } from './services/wallet';
import { transactionRoutes } from './services/transaction';
import { ledgerRoutes } from './services/ledger';
import { webhookRoutes } from './services/webhook';
import {
  correlationMiddleware,
  metricsMiddleware,
  getMetrics,
  getMetricsContentType,
} from './observability';

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Request parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Observability middleware (applied early to capture all requests)
  app.use(correlationMiddleware);
  app.use(metricsMiddleware);

  // Routes
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/wallets', walletRoutes);
  app.use('/transactions', transactionRoutes);
  app.use('/ledger', ledgerRoutes);
  app.use('/webhooks', webhookRoutes);

  // Metrics endpoint (Prometheus format)
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', getMetricsContentType());
      res.send(await getMetrics());
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  });

  // Root route
  app.get('/', (_req, res) => {
    res.json({
      name: 'PayFlow API',
      version: '1.0.0',
      description: 'Event-driven UPI-like transaction system',
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
