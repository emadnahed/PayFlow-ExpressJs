import { Router, Request, Response, NextFunction } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from './auth.middleware';
import { registerValidation, loginValidation, refreshTokenValidation } from './auth.validation';

const router = Router();

router.post('/register', registerValidation, (req: Request, res: Response, next: NextFunction) => authController.register(req, res, next));

router.post('/login', loginValidation, (req: Request, res: Response, next: NextFunction) => authController.login(req, res, next));

router.post('/refresh', refreshTokenValidation, (req: Request, res: Response, next: NextFunction) => authController.refresh(req, res, next));

router.get('/me', authMiddleware, (req: Request, res: Response, next: NextFunction) => authController.me(req, res, next));

export default router;
