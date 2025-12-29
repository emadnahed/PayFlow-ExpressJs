/**
 * Ledger Service Module
 *
 * Manages receiver credits in the Saga pattern.
 * Separated from Wallet Service to allow:
 * - Independent scaling
 * - Different failure domains
 * - Clearer audit trails
 * - Testing compensation logic
 */

// Service
export { ledgerService, LedgerService, CreditRequest, CreditResponse } from './ledger.service';

// Simulation
export {
  ledgerSimulation,
  SimulatedFailureError,
  FailureType,
  FailureSimulationConfig,
} from './ledger.simulation';

// Event handlers
export {
  registerLedgerEventHandlers,
  unregisterLedgerEventHandlers,
} from './ledger.events';

// Controller
export { ledgerController } from './ledger.controller';

// Routes
export { default as ledgerRoutes } from './ledger.routes';
