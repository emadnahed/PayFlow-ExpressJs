/**
 * Ledger Failure Simulation Module
 *
 * Allows injecting failures for testing the Saga compensation flow.
 * Only enabled in test/development environments.
 */

import { config } from '../../config';

export type FailureType = 'ERROR' | 'TIMEOUT';

export interface FailureSimulationConfig {
  enabled: boolean;
  failureRate: number; // 0-1, percentage of operations that should fail
  failTransactionIds: Set<string>; // Specific transaction IDs to fail
  failureType: FailureType;
}

export class SimulatedFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulatedFailureError';
  }
}

class LedgerSimulation {
  private config: FailureSimulationConfig = {
    enabled: false,
    failureRate: 0,
    failTransactionIds: new Set(),
    failureType: 'ERROR',
  };

  /**
   * Check if simulation should be allowed based on environment
   */
  private isSimulationAllowed(): boolean {
    return config.isTest || config.isDevelopment;
  }

  /**
   * Enable failure simulation with configuration
   */
  enable(options: Partial<Omit<FailureSimulationConfig, 'enabled'>> = {}): void {
    if (!this.isSimulationAllowed()) {
      console.warn('[Ledger Simulation] Simulation not allowed in production environment');
      return;
    }

    this.config = {
      enabled: true,
      failureRate: options.failureRate ?? this.config.failureRate,
      failTransactionIds: options.failTransactionIds ?? this.config.failTransactionIds,
      failureType: options.failureType ?? this.config.failureType,
    };

    console.log('[Ledger Simulation] Enabled with config:', {
      failureRate: this.config.failureRate,
      failTransactionIds: Array.from(this.config.failTransactionIds),
      failureType: this.config.failureType,
    });
  }

  /**
   * Disable failure simulation
   */
  disable(): void {
    this.config.enabled = false;
    this.config.failTransactionIds.clear();
    console.log('[Ledger Simulation] Disabled');
  }

  /**
   * Add specific transaction IDs to fail
   */
  addFailingTransactionIds(transactionIds: string[]): void {
    if (!this.isSimulationAllowed()) {return;}

    transactionIds.forEach((id) => this.config.failTransactionIds.add(id));
    console.log('[Ledger Simulation] Added failing transaction IDs:', transactionIds);
  }

  /**
   * Remove transaction IDs from failing list
   */
  removeFailingTransactionIds(transactionIds: string[]): void {
    transactionIds.forEach((id) => this.config.failTransactionIds.delete(id));
  }

  /**
   * Clear all failing transaction IDs
   */
  clearFailingTransactionIds(): void {
    this.config.failTransactionIds.clear();
  }

  /**
   * Get current simulation configuration
   */
  getConfig(): Omit<FailureSimulationConfig, 'failTransactionIds'> & {
    failTransactionIds: string[];
  } {
    return {
      ...this.config,
      failTransactionIds: Array.from(this.config.failTransactionIds),
    };
  }

  /**
   * Check if a specific transaction should fail
   */
  shouldFail(transactionId: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Check if this specific transaction ID is marked to fail
    if (this.config.failTransactionIds.has(transactionId)) {
      console.log(`[Ledger Simulation] Transaction ${transactionId} marked for failure`);
      return true;
    }

    // Check failure rate (random failure)
    if (this.config.failureRate > 0 && Math.random() < this.config.failureRate) {
      console.log(
        `[Ledger Simulation] Transaction ${transactionId} failed by rate (${this.config.failureRate})`
      );
      return true;
    }

    return false;
  }

  /**
   * Simulate failure based on configuration
   * Throws SimulatedFailureError or delays based on failure type
   */
  async simulateFailure(transactionId: string): Promise<void> {
    if (!this.shouldFail(transactionId)) {
      return;
    }

    if (this.config.failureType === 'TIMEOUT') {
      // Simulate timeout by delaying for a long time (will be interrupted by request timeout)
      console.log(`[Ledger Simulation] Simulating timeout for transaction ${transactionId}`);
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    // Default: throw error
    throw new SimulatedFailureError(`Simulated credit failure for transaction ${transactionId}`);
  }

  /**
   * Reset all simulation state
   */
  reset(): void {
    this.config = {
      enabled: false,
      failureRate: 0,
      failTransactionIds: new Set(),
      failureType: 'ERROR',
    };
    console.log('[Ledger Simulation] Reset to defaults');
  }
}

// Export singleton instance
export const ledgerSimulation = new LedgerSimulation();
