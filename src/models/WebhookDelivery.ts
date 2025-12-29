import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';
import { EventType } from '../types/events';

export type DeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';

export interface IWebhookDelivery extends Document {
  deliveryId: string;
  webhookId: string;
  transactionId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attemptCount: number;
  responseCode?: number;
  responseBody?: string;
  error?: string;
  nextRetryAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `dlv_${crypto.randomUUID().replace(/-/g, '')}`,
    },
    webhookId: {
      type: String,
      required: true,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: Object.values(EventType),
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'RETRYING'],
      default: 'PENDING',
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    responseCode: {
      type: Number,
    },
    responseBody: {
      type: String,
      maxlength: 1000, // Truncate long responses
    },
    error: {
      type: String,
    },
    nextRetryAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying delivery history
webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });

// Index for finding pending/retrying deliveries
webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 });

// Index for transaction history
webhookDeliverySchema.index({ transactionId: 1, createdAt: -1 });

export const WebhookDelivery = mongoose.model<IWebhookDelivery>(
  'WebhookDelivery',
  webhookDeliverySchema
);
