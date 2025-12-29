import { Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { AuthRequest } from './auth.types';
import { ApiError } from '../middlewares/errorHandler';

export const authMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ApiError(401, 'No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Invalid authorization format. Use: Bearer <token>');
    }

    const token = authHeader.substring(7);

    if (!token) {
      throw new ApiError(401, 'No token provided');
    }

    const payload = authService.verifyToken(token);
    const user = await authService.getUserById(payload.userId);

    if (!user) {
      throw new ApiError(401, 'User not found');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuthMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      return next();
    }

    const payload = authService.verifyToken(token);
    const user = await authService.getUserById(payload.userId);

    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch {
    next();
  }
};
