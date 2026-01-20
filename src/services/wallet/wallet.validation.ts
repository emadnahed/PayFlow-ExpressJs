import { body, param, query } from 'express-validator';

export const depositValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number greater than 0')
    .custom((value) => {
      // Check for maximum 2 decimal places
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Amount can have at most 2 decimal places');
      }
      return true;
    }),
  body('idempotencyKey')
    .optional()
    .isString()
    .withMessage('Idempotency key must be a string')
    .isLength({ min: 1, max: 64 })
    .withMessage('Idempotency key must be between 1 and 64 characters'),
];

export const getBalanceValidation = [
  param('id')
    .notEmpty()
    .withMessage('Wallet ID is required')
    .isString()
    .withMessage('Wallet ID must be a string'),
];

export const historyQueryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];
