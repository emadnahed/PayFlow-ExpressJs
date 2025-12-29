/**
 * Ledger API Validation Rules
 */

import { body } from 'express-validator';

/**
 * Validation rules for simulation configuration
 */
export const simulationConfigValidation = [
  body('enabled')
    .isBoolean()
    .withMessage('enabled must be a boolean'),

  body('failureRate')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('failureRate must be between 0 and 1'),

  body('failTransactionIds')
    .optional()
    .isArray()
    .withMessage('failTransactionIds must be an array'),

  body('failTransactionIds.*')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('Each transaction ID must be a non-empty string'),

  body('failureType')
    .optional()
    .isIn(['ERROR', 'TIMEOUT'])
    .withMessage('failureType must be ERROR or TIMEOUT'),
];
