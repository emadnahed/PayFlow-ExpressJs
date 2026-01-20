import Redis from 'ioredis';

import { config } from '../config';
import { logger } from '../observability';
import { EventType, BaseEvent, EventHandler } from '../types/events';

class EventBus {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    };

    this.publisher = new Redis(redisConfig);
    // Subscriber needs enableReadyCheck: false because ioredis's ready check
    // uses INFO command which is not allowed in subscriber mode
    this.subscriber = new Redis({ ...redisConfig, enableReadyCheck: false });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.publisher!.on('connect', () => resolve());
        this.publisher!.on('error', (err) => reject(err));
      }),
      new Promise<void>((resolve, reject) => {
        this.subscriber!.on('connect', () => resolve());
        this.subscriber!.on('error', (err) => reject(err));
      }),
    ]);

    this.subscriber.on('message', async (channel: string, message: string) => {
      try {
        const event: BaseEvent = JSON.parse(message);
        const handlers = this.handlers.get(event.eventType as EventType) || [];

        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (error) {
            logger.error({ err: error, eventType: event.eventType }, 'Error handling event');
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'Error parsing event message');
      }
    });

    this.isConnected = true;
    logger.info('Event bus connected to Redis');
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }

    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    this.handlers.clear();
    this.isConnected = false;
    logger.info('Event bus disconnected');
  }

  async publish(event: BaseEvent): Promise<void> {
    if (!this.publisher || !this.isConnected) {
      // In test mode or when not connected, log and skip publishing
      if (process.env.NODE_ENV !== 'test') {
        logger.warn({ eventType: event.eventType }, 'Event bus not connected, skipping publish');
      }
      return;
    }

    const channel = event.eventType;
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date(),
    });

    await this.publisher.publish(channel, message);
    logger.debug({ eventType: event.eventType, transactionId: event.transactionId }, 'Event published');
  }

  async subscribe(eventType: EventType, handler: EventHandler): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      throw new Error('Event bus not connected');
    }

    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);

    await this.subscriber.subscribe(eventType);
    logger.debug({ eventType }, 'Subscribed to event');
  }

  async unsubscribe(eventType: EventType): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      return;
    }

    this.handlers.delete(eventType);
    await this.subscriber.unsubscribe(eventType);
    logger.debug({ eventType }, 'Unsubscribed from event');
  }

  getStatus(): { connected: boolean } {
    return { connected: this.isConnected };
  }
}

export const eventBus = new EventBus();
