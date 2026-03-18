/**
 * Unit Tests: Auth Middleware
 *
 * Tests authMiddleware and optionalAuthMiddleware with all
 * external dependencies (authService) mocked.
 */

import { Response, NextFunction } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockVerifyToken = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('../../../src/auth/auth.service', () => ({
  authService: {
    verifyToken: (...a: unknown[]) => mockVerifyToken(...a),
    getUserById: (...a: unknown[]) => mockGetUserById(...a),
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { authMiddleware, optionalAuthMiddleware } from '../../../src/auth/auth.middleware';
import { AuthRequest } from '../../../src/auth/auth.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReq(authorization?: string): AuthRequest {
  return { headers: { authorization } } as unknown as AuthRequest;
}

const mockRes = {} as Response;
const next = jest.fn() as NextFunction;

const activeUser = {
  userId: 'u1',
  email: 'a@b.com',
  isActive: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call next(error) when no Authorization header is present', async () => {
    const req = buildReq(undefined);
    await authMiddleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('authorization') })
    );
  });

  it('should call next(error) when header format is not "Bearer <token>"', async () => {
    const req = buildReq('Basic abc123');
    await authMiddleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('should call next(error) when token is empty after "Bearer "', async () => {
    const req = buildReq('Bearer ');
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
    mockGetUserById.mockResolvedValue(activeUser);

    await authMiddleware(req, mockRes, next);

    // Either throws "No token provided" or behaves as invalid token
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should call next(error) when verifyToken throws', async () => {
    const req = buildReq('Bearer bad-token');
    mockVerifyToken.mockImplementation(() => { throw new Error('Invalid token'); });

    await authMiddleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should call next(error) when user is not found', async () => {
    const req = buildReq('Bearer valid-token');
    mockVerifyToken.mockReturnValue({ userId: 'missing', email: 'x@x.com' });
    mockGetUserById.mockResolvedValue(null);

    await authMiddleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'User not found' }));
  });

  it('should call next(error) when user account is deactivated', async () => {
    const req = buildReq('Bearer valid-token');
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
    mockGetUserById.mockResolvedValue({ ...activeUser, isActive: false });

    await authMiddleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('deactivated') }));
  });

  it('should attach user to req and call next() with no args on success', async () => {
    const req = buildReq('Bearer valid-token');
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
    mockGetUserById.mockResolvedValue(activeUser);

    await authMiddleware(req, mockRes, next);

    expect(req.user).toBe(activeUser);
    expect(next).toHaveBeenCalledWith(); // no error
  });
});

describe('optionalAuthMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call next() without setting user when no header', async () => {
    const req = buildReq(undefined);
    await optionalAuthMiddleware(req, mockRes, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() without setting user when header format is wrong', async () => {
    const req = buildReq('Basic something');
    await optionalAuthMiddleware(req, mockRes, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() without user when verifyToken throws', async () => {
    const req = buildReq('Bearer bad-token');
    mockVerifyToken.mockImplementation(() => { throw new Error('bad token'); });

    await optionalAuthMiddleware(req, mockRes, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should attach user and call next() when token is valid and user is active', async () => {
    const req = buildReq('Bearer valid-token');
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
    mockGetUserById.mockResolvedValue(activeUser);

    await optionalAuthMiddleware(req, mockRes, next);

    expect(req.user).toBe(activeUser);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() without user when user is inactive', async () => {
    const req = buildReq('Bearer valid-token');
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
    mockGetUserById.mockResolvedValue({ ...activeUser, isActive: false });

    await optionalAuthMiddleware(req, mockRes, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
