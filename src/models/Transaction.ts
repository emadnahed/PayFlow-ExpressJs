import mongoose, { Document, Schema } from 'mongoose';

import { TransactionStatus } from '../types/events';

export interface ITransaction extends Document {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description?: string;
  metadata?: Record<string, unknown>;
  failureReason?: string;
  initiatedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    receiverId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.INITIATED,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    failureReason: {
      type: String,
    },
    initiatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
transactionSchema.index({ senderId: 1, status: 1 });
transactionSchema.index({ receiverId: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
