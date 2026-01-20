import crypto from 'crypto';

import jwt, { SignOptions } from 'jsonwebtoken';

import { config } from '../config';
import { ApiError } from '../middlewares/errorHandler';
import { User, IUser } from '../models/User';
import { Wallet } from '../models/Wallet';

import { JWTPayload, TokenPair, RegisterDTO, LoginDTO, AuthResponse } from './auth.types';

export class AuthService {
  generateTokens(user: IUser): TokenPair {
    const payload: JWTPayload = {
      userId: user.userId,
      email: user.email,
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: config.jwt.accessTokenExpiresIn as jwt.SignOptions['expiresIn'],
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: config.jwt.refreshTokenExpiresIn as jwt.SignOptions['expiresIn'],
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, accessTokenOptions);
    const refreshToken = jwt.sign(payload, config.jwt.secret, refreshTokenOptions);

    return { accessToken, refreshToken };
  }

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, 'Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, 'Invalid token');
      }
      throw new ApiError(401, 'Token verification failed');
    }
  }

  async register(dto: RegisterDTO): Promise<AuthResponse> {
    const existingUser = await User.findOne({ email: dto.email.toLowerCase() });
    if (existingUser) {
      throw new ApiError(409, 'Email already registered');
    }

    const userId = `user_${crypto.randomUUID().replace(/-/g, '')}`;
    const walletId = `wallet_${crypto.randomUUID().replace(/-/g, '')}`;

    const user = await User.create({
      userId,
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: dto.password,
      phone: dto.phone,
    });

    await Wallet.create({
      walletId,
      userId,
      balance: 0,
      currency: 'INR',
    });

    const tokens = this.generateTokens(user);

    return {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
      },
      tokens,
    };
  }

  async login(dto: LoginDTO): Promise<AuthResponse> {
    const user = await User.findOne({ email: dto.email.toLowerCase() }).select('+password');
    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated');
    }

    const isPasswordValid = await user.comparePassword(dto.password);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid email or password');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = this.generateTokens(user);

    return {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
      },
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyToken(refreshToken);

    const user = await User.findOne({ userId: payload.userId });
    if (!user) {
      throw new ApiError(401, 'User not found');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated');
    }

    return this.generateTokens(user);
  }

  async getUserById(userId: string): Promise<IUser | null> {
    return User.findOne({ userId });
  }
}

export const authService = new AuthService();
