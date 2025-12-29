/**
 * Ledger Service
 *
 * Manages receiver credits in the Saga pattern.
 * Separated from Wallet Service to allow:
 * - Independent scaling
 * - Different failure domains
 * - Clearer audit trails
 * - Testing compensation logic
 */

import { Transaction } from '../../models/Transaction';
import { walletService, CreditResult } from '../wallet/wallet.service';
import { eventBus } from '../../events/eventBus';
import { EventType } from '../../types/events';
import { ledgerSimulation, SimulatedFailureError } from './ledger.simulation';
import { ApiError } from '../../middlewares/errorHandler';

export interface CreditRequest {
  transactionId: string;
  receiverId: string;
  amount: number;
}

export interface CreditResponse {
  success: boolean;
  transactionId: string;
  receiverId: string;
  amount: number;
  newBalance?: number;
  error?: string;
}

export class LedgerService {
  /**
   * Get transaction details from database
   */
  private async getTransactionDetails(
    transactionId: string
  ): Promise<{ receiverId: string; amount: number }> {
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      throw new ApiError(404, `Transaction not found: ${transactionId}`);
    }
    return {
      receiverId: transaction.receiverId,
      amount: transaction.amount,
    };
  }

  /**
   * Process credit for a receiver
   * Called when DEBIT_SUCCESS event is received
   */
  async processCredit(transactionId: string): Promise<CreditResponse> {
    console.log(`[Ledger Service] Processing credit for transaction ${transactionId}`);

    // Get transaction details
    let receiverId: string;
    let amount: number;
    try {
      const details = await this.getTransactionDetails(transactionId);
      receiverId = details.receiverId;
      amount = details.amount;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get transaction details';
      console.error(`[Ledger Service] Transaction lookup failed: ${errorMessage}`);
      return {
        success: false,
        transactionId,
        receiverId: '',
        amount: 0,
        error: errorMessage,
      };
    }

    try {
      // Check for simulated failure (testing only)
      await ledgerSimulation.simulateFailure(transactionId);

      // Perform the credit via wallet service
      const result: CreditResult = await walletService.credit(receiverId, amount, transactionId);

      console.log(
        `[Ledger Service] Credit successful for transaction ${transactionId}, new balance: ${result.newBalance}`
      );

      // Note: walletService.credit already publishes CREDIT_SUCCESS event
      // We just return the result

      return {
        success: true,
        transactionId,
        receiverId,
        amount,
        newBalance: result.newBalance,
      };
    } catch (error) {
      const errorMessage =
        error instanceof SimulatedFailureError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown error during credit';

      console.error(
        `[Ledger Service] Credit failed for transaction ${transactionId}: ${errorMessage}`
      );

      // If it's a simulated failure, we need to publish CREDIT_FAILED event
      // since walletService.credit was never called
      if (error instanceof SimulatedFailureError) {
        await eventBus.publish({
          eventType: EventType.CREDIT_FAILED,
          transactionId,
          timestamp: new Date(),
          payload: {
            receiverId,
            amount,
            reason: errorMessage,
          },
        });
      }

      // Note: If walletService.credit failed, it already published CREDIT_FAILED

      return {
        success: false,
        transactionId,
        receiverId,
        amount,
        error: errorMessage,
      };
    }
  }

  /**
   * Process credit directly with provided details
   * Useful for manual/admin operations
   */
  async processCreditWithDetails(request: CreditRequest): Promise<CreditResponse> {
    const { transactionId, receiverId, amount } = request;

    console.log(
      `[Ledger Service] Processing direct credit for receiver ${receiverId}, amount: ${amount}`
    );

    try {
      // Check for simulated failure (testing only)
      await ledgerSimulation.simulateFailure(transactionId);

      // Perform the credit via wallet service
      const result: CreditResult = await walletService.credit(receiverId, amount, transactionId);

      return {
        success: true,
        transactionId,
        receiverId,
        amount,
        newBalance: result.newBalance,
      };
    } catch (error) {
      const errorMessage =
        error instanceof SimulatedFailureError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown error during credit';

      // Publish CREDIT_FAILED for simulated failures
      if (error instanceof SimulatedFailureError) {
        await eventBus.publish({
          eventType: EventType.CREDIT_FAILED,
          transactionId,
          timestamp: new Date(),
          payload: {
            receiverId,
            amount,
            reason: errorMessage,
          },
        });
      }

      return {
        success: false,
        transactionId,
        receiverId,
        amount,
        error: errorMessage,
      };
    }
  }
}

// Export singleton instance
export const ledgerService = new LedgerService();
