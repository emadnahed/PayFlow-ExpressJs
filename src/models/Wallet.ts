import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  walletId: string;
  userId: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    walletId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user-currency lookup
walletSchema.index({ userId: 1, currency: 1 });

export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema);
