import { body, param, query } from 'express-validator';

import { TransactionStatus } from '../../types/events';

export const createTransactionValidation = [
  body('receiverId')
    .notEmpty()
    .withMessage('Receiver ID is required')
    .isString()
    .withMessage('Receiver ID must be a string'),
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
  body('currency')
    .optional()
    .isString()
    .withMessage('Currency must be a string')
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter code'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 255 })
    .withMessage('Description cannot exceed 255 characters'),
];

export const getTransactionValidation = [
  param('id')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isString()
    .withMessage('Transaction ID must be a string'),
];

export const listTransactionsValidation = [
  query('status')
    .optional()
    .isIn(Object.values(TransactionStatus))
    .withMessage(`Status must be one of: ${Object.values(TransactionStatus).join(', ')}`),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
];
