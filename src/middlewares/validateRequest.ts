import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiError } from './errorHandler';

/**
 * Reusable validation middleware that extracts express-validator errors
 * and formats them into a consistent error response
 */
export const validateRequest = (req: Request, _res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new ApiError(400, 'Validation failed');
    (error as ApiError & { validationErrors: Record<string, string[]> }).validationErrors =
      errors.array().reduce((acc, err) => {
        const field = (err as { path: string }).path;
        if (!acc[field]) acc[field] = [];
        acc[field].push(err.msg);
        return acc;
      }, {} as Record<string, string[]>);
    throw error;
  }

  next();
};
