import crypto from 'crypto';

import mongoose, { Document, Schema } from 'mongoose';

import { EventType } from '../types/events';

export interface IWebhookSubscription extends Document {
  webhookId: string;
  userId: string;
  url: string;
  secret: string;
  events: EventType[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSubscriptionSchema = new Schema<IWebhookSubscription>(
  {
    webhookId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `whk_${crypto.randomUUID().replace(/-/g, '')}`,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          try {
            const url = new URL(v);
            // Only allow HTTPS for secure webhook delivery
            return url.protocol === 'https:';
          } catch {
            return false;
          }
        },
        message: 'Invalid URL format. Only HTTPS URLs are allowed.',
      },
    },
    secret: {
      type: String,
      required: true,
      default: () => crypto.randomBytes(32).toString('hex'),
    },
    events: {
      type: [String],
      required: true,
      enum: Object.values(EventType),
      validate: {
        validator: function (v: string[]) {
          return v.length > 0;
        },
        message: 'At least one event type is required',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    lastDeliveryAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user queries
webhookSubscriptionSchema.index({ userId: 1, isActive: 1 });

// Index for finding webhooks by event type
webhookSubscriptionSchema.index({ events: 1, isActive: 1 });

export const WebhookSubscription = mongoose.model<IWebhookSubscription>(
  'WebhookSubscription',
  webhookSubscriptionSchema
);
