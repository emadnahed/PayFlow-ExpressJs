/**
 * Unit Tests: AuthController
 *
 * Tests request handling, response formatting, and error delegation
 * with authService fully mocked.
 */

import { Request, Response, NextFunction } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockRefreshTokens = jest.fn();

jest.mock('../../../src/auth/auth.service', () => ({
  authService: {
    register: (...a: unknown[]) => mockRegister(...a),
    login: (...a: unknown[]) => mockLogin(...a),
    refreshTokens: (...a: unknown[]) => mockRefreshTokens(...a),
  },
}));

// validationResult returns empty by default (no errors)
const mockValidationResult = jest.fn().mockReturnValue({ isEmpty: () => true, array: () => [] });
jest.mock('express-validator', () => ({
  validationResult: (req: unknown) => mockValidationResult(req),
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { AuthController } from '../../../src/auth/auth.controller';
import { ValidationError } from 'express-validator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMocks(bodyOverrides: Record<string, unknown> = {}) {
  const req = {
    body: { name: 'A', email: 'a@b.com', password: 'Pass123', ...bodyOverrides },
    user: undefined,
  } as unknown as Request;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const next = jest.fn() as NextFunction;

  return { req, res, next };
}

const fakeAuthResponse = {
  user: { userId: 'u1', name: 'A', email: 'a@b.com', isEmailVerified: false },
  tokens: { accessToken: 'at', refreshToken: 'rt' },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
    controller = new AuthController();
  });

  // ── handleValidationErrors ────────────────────────────────────────────────

  describe('handleValidationErrors (via register)', () => {
    it('should throw 400 with grouped errors when validation fails', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { path: 'email', msg: 'Invalid email format' } as unknown as ValidationError,
          { path: 'email', msg: 'Email is required' } as unknown as ValidationError,
          { path: 'password', msg: 'Password too short' } as unknown as ValidationError,
        ],
      });

      const { req, res, next } = buildMocks();
      await controller.register(req as never, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'Validation failed' })
      );
    });

    it('should group multiple errors for the same field', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { path: 'email', msg: 'Email required' } as unknown as ValidationError,
          { path: 'email', msg: 'Invalid format' } as unknown as ValidationError,
        ],
      });

      const { req, res, next } = buildMocks();
      await controller.register(req as never, res, next);

      const err = (next as jest.Mock).mock.calls[0][0];
      expect(err.validationErrors?.email).toEqual(['Email required', 'Invalid format']);
    });
  });

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should call authService.register and respond 201 on success', async () => {
      mockRegister.mockResolvedValue(fakeAuthResponse);
      const { req, res, next } = buildMocks();

      await controller.register(req as never, res, next);

      expect(mockRegister).toHaveBeenCalledWith({
        name: 'A',
        email: 'a@b.com',
        password: 'Pass123',
        phone: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeAuthResponse });
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass errors to next', async () => {
      const err = new Error('email taken');
      mockRegister.mockRejectedValue(err);
      const { req, res, next } = buildMocks();

      await controller.register(req as never, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should call authService.login and respond 200 on success', async () => {
      mockLogin.mockResolvedValue(fakeAuthResponse);
      const { req, res, next } = buildMocks();

      await controller.login(req as never, res, next);

      expect(mockLogin).toHaveBeenCalledWith({ email: 'a@b.com', password: 'Pass123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeAuthResponse });
    });

    it('should pass errors to next', async () => {
      const err = new Error('bad creds');
      mockLogin.mockRejectedValue(err);
      const { req, res, next } = buildMocks();

      await controller.login(req as never, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ── refresh ──────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should call authService.refreshTokens and respond 200', async () => {
      const newTokens = { accessToken: 'new-at', refreshToken: 'new-rt' };
      mockRefreshTokens.mockResolvedValue(newTokens);
      const { req, res, next } = buildMocks({ refreshToken: 'old-rt' });

      await controller.refresh(req as never, res, next);

      expect(mockRefreshTokens).toHaveBeenCalledWith('old-rt');
      expect(res.status).toHaveBeenCalledWith(200);
      expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
        success: true,
        data: { tokens: newTokens },
      });
    });

    it('should pass errors to next', async () => {
      const err = new Error('expired');
      mockRefreshTokens.mockRejectedValue(err);
      const { req, res, next } = buildMocks({ refreshToken: 'bad' });

      await controller.refresh(req as never, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ── me ───────────────────────────────────────────────────────────────────

  describe('me', () => {
    const fakeUser = {
      userId: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+91-1234567890',
      isEmailVerified: true,
      isActive: true,
      createdAt: new Date('2024-01-01'),
      lastLoginAt: new Date('2024-06-01'),
    };

    it('should respond 200 with user data when authenticated', async () => {
      const { req, res, next } = buildMocks();
      (req as never as { user: typeof fakeUser }).user = fakeUser;

      await controller.me(req as never, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.user.userId).toBe('u1');
      expect(body.data.user).not.toHaveProperty('password');
    });

    it('should throw 401 when req.user is missing', async () => {
      const { req, res, next } = buildMocks();
      // no user set

      await controller.me(req as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authenticated' }));
    });
  });
});
