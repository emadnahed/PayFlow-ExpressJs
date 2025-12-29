import crypto from 'crypto';
import { Wallet, IWallet } from '../../models/Wallet';
import { WalletOperation, IWalletOperation, OperationType } from '../../models/WalletOperation';
import { ApiError } from '../../middlewares/errorHandler';
import { eventBus } from '../../events/eventBus';
import { EventType } from '../../types/events';

export interface OperationResult {
  success: boolean;
  newBalance: number;
  operationId: string;
  idempotent: boolean;
}

export interface DebitResult extends OperationResult {
  type: 'DEBIT';
}

export interface CreditResult extends OperationResult {
  type: 'CREDIT';
}

export interface RefundResult extends OperationResult {
  type: 'REFUND';
}

export interface DepositResult extends OperationResult {
  type: 'DEPOSIT';
}

export class WalletService {
  /**
   * Get wallet by userId
   */
  async getWallet(userId: string): Promise<IWallet> {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }
    return wallet;
  }

  /**
   * Get wallet by walletId
   */
  async getWalletById(walletId: string): Promise<IWallet> {
    const wallet = await Wallet.findOne({ walletId });
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }
    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getWallet(userId);
    return wallet.balance;
  }

  /**
   * Debit operation - reduces balance atomically with idempotency
   * Used by Saga for payment processing
   */
  async debit(userId: string, amount: number, txnId: string): Promise<DebitResult> {
    const operationId = `${txnId}:DEBIT`;

    // Check for existing operation (idempotency)
    const existing = await WalletOperation.findOne({ operationId });
    if (existing) {
      return {
        success: true,
        newBalance: existing.resultBalance,
        operationId,
        idempotent: true,
        type: 'DEBIT',
      };
    }

    // Get wallet first to get walletId
    const walletCheck = await Wallet.findOne({ userId });
    if (!walletCheck) {
      // Publish failure event
      await eventBus.publish({
        eventType: EventType.DEBIT_FAILED,
        transactionId: txnId,
        timestamp: new Date(),
        payload: { userId, amount, reason: 'WALLET_NOT_FOUND' },
      });
      throw new ApiError(404, 'Wallet not found');
    }

    // Perform atomic debit with balance check
    const wallet = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (!wallet) {
      // Publish failure event
      await eventBus.publish({
        eventType: EventType.DEBIT_FAILED,
        transactionId: txnId,
        timestamp: new Date(),
        payload: { userId, amount, reason: 'INSUFFICIENT_BALANCE' },
      });
      throw new ApiError(400, 'Insufficient balance');
    }

    // Log operation for idempotency
    await WalletOperation.create({
      operationId,
      walletId: wallet.walletId,
      userId,
      type: 'DEBIT' as OperationType,
      amount,
      resultBalance: wallet.balance,
      transactionId: txnId,
    });

    // Publish success event
    await eventBus.publish({
      eventType: EventType.DEBIT_SUCCESS,
      transactionId: txnId,
      timestamp: new Date(),
      payload: { userId, amount, newBalance: wallet.balance },
    });

    return {
      success: true,
      newBalance: wallet.balance,
      operationId,
      idempotent: false,
      type: 'DEBIT',
    };
  }

  /**
   * Credit operation - increases balance atomically with idempotency
   * Used by Saga for payment processing
   */
  async credit(userId: string, amount: number, txnId: string): Promise<CreditResult> {
    const operationId = `${txnId}:CREDIT`;

    // Check for existing operation (idempotency)
    const existing = await WalletOperation.findOne({ operationId });
    if (existing) {
      return {
        success: true,
        newBalance: existing.resultBalance,
        operationId,
        idempotent: true,
        type: 'CREDIT',
      };
    }

    // Get wallet first to verify existence
    const walletCheck = await Wallet.findOne({ userId });
    if (!walletCheck) {
      await eventBus.publish({
        eventType: EventType.CREDIT_FAILED,
        transactionId: txnId,
        timestamp: new Date(),
        payload: { userId, amount, reason: 'WALLET_NOT_FOUND' },
      });
      throw new ApiError(404, 'Wallet not found');
    }

    // Perform atomic credit
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true }
    );

    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }

    // Log operation for idempotency
    await WalletOperation.create({
      operationId,
      walletId: wallet.walletId,
      userId,
      type: 'CREDIT' as OperationType,
      amount,
      resultBalance: wallet.balance,
      transactionId: txnId,
    });

    // Publish success event
    await eventBus.publish({
      eventType: EventType.CREDIT_SUCCESS,
      transactionId: txnId,
      timestamp: new Date(),
      payload: { userId, amount, newBalance: wallet.balance },
    });

    return {
      success: true,
      newBalance: wallet.balance,
      operationId,
      idempotent: false,
      type: 'CREDIT',
    };
  }

  /**
   * Refund operation - restores balance (compensating transaction)
   * Used by Saga for rollback
   */
  async refund(userId: string, amount: number, txnId: string): Promise<RefundResult> {
    const operationId = `${txnId}:REFUND`;

    // Check for existing operation (idempotency)
    const existing = await WalletOperation.findOne({ operationId });
    if (existing) {
      return {
        success: true,
        newBalance: existing.resultBalance,
        operationId,
        idempotent: true,
        type: 'REFUND',
      };
    }

    // Perform atomic refund (credit back)
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true }
    );

    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }

    // Log operation for idempotency
    await WalletOperation.create({
      operationId,
      walletId: wallet.walletId,
      userId,
      type: 'REFUND' as OperationType,
      amount,
      resultBalance: wallet.balance,
      transactionId: txnId,
    });

    // Publish refund event
    await eventBus.publish({
      eventType: EventType.REFUND_COMPLETED,
      transactionId: txnId,
      timestamp: new Date(),
      payload: { userId, amount, newBalance: wallet.balance },
    });

    return {
      success: true,
      newBalance: wallet.balance,
      operationId,
      idempotent: false,
      type: 'REFUND',
    };
  }

  /**
   * Deposit operation - add funds to wallet (for testing/admin)
   */
  async deposit(userId: string, amount: number): Promise<DepositResult> {
    const operationId = `deposit_${crypto.randomUUID().replace(/-/g, '')}`;

    // Validate amount
    if (amount <= 0) {
      throw new ApiError(400, 'Deposit amount must be positive');
    }

    // Perform atomic deposit
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true }
    );

    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }

    // Log operation
    await WalletOperation.create({
      operationId,
      walletId: wallet.walletId,
      userId,
      type: 'DEPOSIT' as OperationType,
      amount,
      resultBalance: wallet.balance,
    });

    return {
      success: true,
      newBalance: wallet.balance,
      operationId,
      idempotent: false,
      type: 'DEPOSIT',
    };
  }

  /**
   * Get operation history for a wallet
   */
  async getOperationHistory(userId: string, limit = 20): Promise<IWalletOperation[]> {
    const wallet = await this.getWallet(userId);
    const operations = await WalletOperation.find({ walletId: wallet.walletId })
      .sort({ createdAt: -1 })
      .limit(limit);
    return operations;
  }
}

export const walletService = new WalletService();
