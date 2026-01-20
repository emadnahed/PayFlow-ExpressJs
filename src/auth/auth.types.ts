import { Request } from 'express';

import { IUser } from '../models/User';

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthRequest extends Request {
  user?: IUser;
}

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    userId: string;
    name: string;
    email: string;
    isEmailVerified: boolean;
  };
  tokens: TokenPair;
}
