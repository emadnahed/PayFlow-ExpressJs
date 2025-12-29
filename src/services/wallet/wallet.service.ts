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

type OperationTypeValue = 'DEBIT' | 'CREDIT' | 'REFUND' | 'DEPOSIT';

type IdempotencyCheckResult<T extends OperationTypeValue> =
  | {
      isIdempotent: true;
      result: {
        success: boolean;
        newBalance: number;
        operationId: string;
        idempotent: boolean;
        type: T;
      };
    }
  | {
      isIdempotent: false;
    };

export class WalletService {
  /**
   * Private helper for idempotency check
   * Reduces code duplication across debit, credit, refund, and deposit methods
   */
  private async checkIdempotency<T extends OperationTypeValue>(
    operationId: string,
    operationType: T
  ): Promise<IdempotencyCheckResult<T>> {
    const existing = await WalletOperation.findOne({ operationId });
    if (existing) {
      return {
        isIdempotent: true,
        result: {
          success: true,
          newBalance: existing.resultBalance,
          operationId,
          idempotent: true,
          type: operationType,
        },
      };
    }
    return { isIdempotent: false };
  }

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
    const idempotencyCheck = await this.checkIdempotency(operationId, 'DEBIT');
    if (idempotencyCheck.isIdempotent) {
      return idempotencyCheck.result;
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
      type: 'DEBIT',
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
    const idempotencyCheck = await this.checkIdempotency(operationId, 'CREDIT');
    if (idempotencyCheck.isIdempotent) {
      return idempotencyCheck.result;
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
      type: 'CREDIT',
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
    const idempotencyCheck = await this.checkIdempotency(operationId, 'REFUND');
    if (idempotencyCheck.isIdempotent) {
      return idempotencyCheck.result;
    }

    // Check wallet exists before attempting refund
    const walletCheck = await Wallet.findOne({ userId });
    if (!walletCheck) {
      await eventBus.publish({
        eventType: EventType.REFUND_FAILED,
        transactionId: txnId,
        timestamp: new Date(),
        payload: { userId, amount, reason: 'WALLET_NOT_FOUND' },
      });
      throw new ApiError(404, 'Wallet not found');
    }

    // Perform atomic refund (credit back)
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true }
    );

    if (!wallet) {
      await eventBus.publish({
        eventType: EventType.REFUND_FAILED,
        transactionId: txnId,
        timestamp: new Date(),
        payload: { userId, amount, reason: 'WALLET_UPDATE_FAILED' },
      });
      throw new ApiError(404, 'Wallet not found');
    }

    // Log operation for idempotency
    await WalletOperation.create({
      operationId,
      walletId: wallet.walletId,
      userId,
      type: 'REFUND',
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
   * Deposit operation - add funds to wallet with idempotency
   * Requires client-provided idempotency key to prevent duplicate deposits
   */
  async deposit(userId: string, amount: number, idempotencyKey?: string): Promise<DepositResult> {
    // Use client-provided key or generate one (non-idempotent fallback for testing)
    const operationId = idempotencyKey
      ? `deposit:${idempotencyKey}`
      : `deposit:${userId}:${Date.now()}:${Math.random().toString(36).substring(7)}`;

    // Validate amount
    if (amount <= 0) {
      throw new ApiError(400, 'Deposit amount must be positive');
    }

    // Check for existing operation (idempotency) - only if key was provided
    if (idempotencyKey) {
      const idempotencyCheck = await this.checkIdempotency(operationId, 'DEPOSIT');
      if (idempotencyCheck.isIdempotent) {
        return idempotencyCheck.result;
      }
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
      type: 'DEPOSIT',
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
