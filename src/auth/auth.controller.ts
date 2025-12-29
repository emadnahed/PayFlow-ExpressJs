import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { authService } from './auth.service';
import { AuthRequest, RegisterDTO, LoginDTO } from './auth.types';
import { ApiError } from '../middlewares/errorHandler';

export class AuthController {
  async register(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const error = new ApiError(400, 'Validation failed');
        (error as ApiError & { validationErrors: Record<string, string[]> }).validationErrors = errors.array().reduce((acc, err) => {
          const field = (err as { path: string }).path;
          if (!acc[field]) acc[field] = [];
          acc[field].push(err.msg);
          return acc;
        }, {} as Record<string, string[]>);
        throw error;
      }

      const dto: RegisterDTO = {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        phone: req.body.phone,
      };

      const result = await authService.register(dto);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, 'Validation failed');
      }

      const dto: LoginDTO = {
        email: req.body.email,
        password: req.body.password,
      };

      const result = await authService.login(dto);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, 'Validation failed');
      }

      const { refreshToken } = req.body;
      const tokens = await authService.refreshTokens(refreshToken);

      res.status(200).json({
        success: true,
        data: { tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            userId: req.user.userId,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            isEmailVerified: req.user.isEmailVerified,
            isActive: req.user.isActive,
            createdAt: req.user.createdAt,
            lastLoginAt: req.user.lastLoginAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
