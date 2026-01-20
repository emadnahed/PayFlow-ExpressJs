// Initialize tracing first (before any other imports)
// eslint-disable-next-line import/order
import { initTracing, shutdownTracing, logger } from './observability';
initTracing();

import { createApp } from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './config/database';
import { eventBus } from './events/eventBus';
import {
  startWebhookWorker,
  stopWebhookWorker,
  startNotificationWorker,
  stopNotificationWorker,
  closeWebhookQueue,
  closeNotificationQueue,
} from './queues';
import { registerLedgerEventHandlers, unregisterLedgerEventHandlers } from './services/ledger';
import {
  registerNotificationEventHandlers,
  unregisterNotificationEventHandlers,
} from './services/notification';
import {
  registerTransactionEventHandlers,
  unregisterTransactionEventHandlers,
} from './services/transaction';
import { registerWalletEventHandlers, unregisterWalletEventHandlers } from './services/wallet';
import { registerWebhookEventHandlers, unregisterWebhookEventHandlers } from './services/webhook';

const app = createApp();

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to event bus
    await eventBus.connect();
    logger.info('Event bus connected successfully');

    // Register event handlers (order matters: wallet -> transaction -> ledger -> webhook -> notification)
    await registerWalletEventHandlers();
    await registerTransactionEventHandlers();
    await registerLedgerEventHandlers();
    await registerWebhookEventHandlers();
    await registerNotificationEventHandlers();
    logger.info('Event handlers registered successfully');

    // Start queue workers
    startWebhookWorker();
    startNotificationWorker();
    logger.info('Queue workers started successfully');

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          env: config.nodeEnv,
          healthCheck: `http://localhost:${config.port}/health`,
          metricsEndpoint: `http://localhost:${config.port}/metrics`,
        },
        'Server started'
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Starting graceful shutdown');

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Stop queue workers
          await stopWebhookWorker();
          await stopNotificationWorker();

          // Close queues
          await closeWebhookQueue();
          await closeNotificationQueue();

          // Unregister event handlers
          await unregisterNotificationEventHandlers();
          await unregisterWebhookEventHandlers();
          await unregisterLedgerEventHandlers();
          await unregisterTransactionEventHandlers();
          await unregisterWalletEventHandlers();

          await eventBus.disconnect();
          await disconnectDatabase();

          // Shutdown tracing
          await shutdownTracing();

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during shutdown');
          process.exit(1);
        }
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
