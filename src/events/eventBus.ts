import Redis from 'ioredis';
import { config } from '../config';
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
    this.subscriber = new Redis(redisConfig);

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
            console.error(`Error handling event ${event.eventType}:`, error);
          }
        }
      } catch (error) {
        console.error('Error parsing event message:', error);
      }
    });

    this.isConnected = true;
    console.log('Event bus connected to Redis');
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
    console.log('Event bus disconnected');
  }

  async publish(event: BaseEvent): Promise<void> {
    if (!this.publisher || !this.isConnected) {
      throw new Error('Event bus not connected');
    }

    const channel = event.eventType;
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date(),
    });

    await this.publisher.publish(channel, message);
    console.log(`Event published: ${event.eventType} for transaction ${event.transactionId}`);
  }

  async subscribe(eventType: EventType, handler: EventHandler): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      throw new Error('Event bus not connected');
    }

    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);

    await this.subscriber.subscribe(eventType);
    console.log(`Subscribed to event: ${eventType}`);
  }

  async unsubscribe(eventType: EventType): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      return;
    }

    this.handlers.delete(eventType);
    await this.subscriber.unsubscribe(eventType);
    console.log(`Unsubscribed from event: ${eventType}`);
  }

  getStatus(): { connected: boolean } {
    return { connected: this.isConnected };
  }
}

export const eventBus = new EventBus();
