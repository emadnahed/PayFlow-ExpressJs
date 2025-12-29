import { createApp } from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './config/database';
import { eventBus } from './events/eventBus';
import { registerWalletEventHandlers, unregisterWalletEventHandlers } from './services/wallet';
import { registerTransactionEventHandlers, unregisterTransactionEventHandlers } from './services/transaction';
import { registerLedgerEventHandlers, unregisterLedgerEventHandlers } from './services/ledger';

const app = createApp();

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();
    console.log('Database connected successfully');

    // Connect to event bus
    await eventBus.connect();
    console.log('Event bus connected successfully');

    // Register event handlers (order matters: wallet -> transaction -> ledger)
    await registerWalletEventHandlers();
    await registerTransactionEventHandlers();
    await registerLedgerEventHandlers();
    console.log('Event handlers registered successfully');

    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        console.log('HTTP server closed');

        try {
          // Unregister event handlers
          await unregisterLedgerEventHandlers();
          await unregisterTransactionEventHandlers();
          await unregisterWalletEventHandlers();

          await eventBus.disconnect();
          await disconnectDatabase();
          console.log('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
