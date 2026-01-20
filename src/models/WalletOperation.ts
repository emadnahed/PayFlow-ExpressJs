import mongoose, { Document, Schema } from 'mongoose';

export type OperationType = 'DEBIT' | 'CREDIT' | 'REFUND' | 'DEPOSIT';

export interface IWalletOperation extends Document {
  operationId: string;
  walletId: string;
  userId: string;
  type: OperationType;
  amount: number;
  resultBalance: number;
  transactionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const walletOperationSchema = new Schema<IWalletOperation>(
  {
    operationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    walletId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['DEBIT', 'CREDIT', 'REFUND', 'DEPOSIT'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    resultBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    transactionId: {
      type: String,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
walletOperationSchema.index({ walletId: 1, createdAt: -1 });
walletOperationSchema.index({ transactionId: 1, type: 1 });

export const WalletOperation = mongoose.model<IWalletOperation>(
  'WalletOperation',
  walletOperationSchema
);
