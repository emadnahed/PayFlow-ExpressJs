import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import healthRoutes from './routes/health';
import { authRoutes } from './auth';
import { walletRoutes } from './services/wallet';

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Request parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging (skip in test environment)
  if (!config.isTest) {
    app.use(morgan('dev'));
  }

  // Routes
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/wallets', walletRoutes);

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
