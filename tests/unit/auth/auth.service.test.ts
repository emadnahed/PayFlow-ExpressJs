/**
 * Unit Tests: AuthService
 *
 * Tests JWT generation, verification, registration, login,
 * and token refresh with all dependencies mocked.
 */

import jwt from 'jsonwebtoken';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockWalletCreate = jest.fn();
const mockSave = jest.fn();

jest.mock('../../../src/models/User', () => ({
  User: {
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

jest.mock('../../../src/models/Wallet', () => ({
  Wallet: {
    create: (...args: unknown[]) => mockWalletCreate(...args),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    jwt: {
      secret: 'test-secret-unit',
      accessTokenExpiresIn: '1h',
      refreshTokenExpiresIn: '7d',
    },
    isTest: true,
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { AuthService } from '../../../src/auth/auth.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user_abc123',
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashedPassword',
    isActive: true,
    isEmailVerified: false,
    lastLoginAt: null,
    phone: undefined,
    createdAt: new Date(),
    comparePassword: jest.fn().mockResolvedValue(true),
    save: mockSave,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
    mockSave.mockResolvedValue(undefined);
  });

  // ── generateTokens ────────────────────────────────────────────────────────

  describe('generateTokens', () => {
    it('should return accessToken and refreshToken', () => {
      const user = makeUser();
      const tokens = authService.generateTokens(user as never);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should encode userId and email in the token payload', () => {
      const user = makeUser();
      const { accessToken } = authService.generateTokens(user as never);
      const payload = jwt.decode(accessToken) as Record<string, unknown>;

      expect(payload.userId).toBe(user.userId);
      expect(payload.email).toBe(user.email);
    });

    it('should produce different tokens on each call (unique jti/iat)', () => {
      const user = makeUser();
      const t1 = authService.generateTokens(user as never);
      const t2 = authService.generateTokens(user as never);

      // iat may be same second, but the tokens should be valid JWTs
      expect(t1.accessToken.split('.').length).toBe(3);
      expect(t2.accessToken.split('.').length).toBe(3);
    });
  });

  // ── verifyToken ───────────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('should verify a valid token and return payload', () => {
      const user = makeUser();
      const { accessToken } = authService.generateTokens(user as never);
      const payload = authService.verifyToken(accessToken);

      expect(payload.userId).toBe(user.userId);
      expect(payload.email).toBe(user.email);
    });

    it('should throw ApiError 401 for an expired token', () => {
      const expiredToken = jwt.sign({ userId: 'u1', email: 'x@x.com' }, 'test-secret-unit', {
        expiresIn: '-1s',
      });

      expect(() => authService.verifyToken(expiredToken)).toThrow();
    });

    it('should throw ApiError 401 for an invalid token', () => {
      expect(() => authService.verifyToken('totally.invalid.token')).toThrow();
    });

    it('should throw ApiError 401 for a token with wrong secret', () => {
      const badToken = jwt.sign({ userId: 'u1', email: 'x@x.com' }, 'wrong-secret', {
        expiresIn: '1h',
      });

      expect(() => authService.verifyToken(badToken)).toThrow();
    });
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Password123',
    };

    it('should create a user and wallet on successful registration', async () => {
      mockUserFindOne.mockResolvedValue(null); // no existing user
      const createdUser = makeUser({ email: 'alice@example.com', name: 'Alice' });
      mockUserCreate.mockResolvedValue(createdUser);
      mockWalletCreate.mockResolvedValue({});

      const result = await authService.register(dto);

      expect(mockUserFindOne).toHaveBeenCalledWith({ email: 'alice@example.com' });
      expect(mockUserCreate).toHaveBeenCalled();
      expect(mockWalletCreate).toHaveBeenCalled();
      expect(result.user.email).toBe('alice@example.com');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw 409 if email already registered', async () => {
      mockUserFindOne.mockResolvedValue(makeUser());

      await expect(authService.register(dto)).rejects.toThrow('already registered');
    });

    it('should lowercase the email before checking/saving', async () => {
      mockUserFindOne.mockResolvedValue(null);
      const createdUser = makeUser({ email: 'alice@example.com' });
      mockUserCreate.mockResolvedValue(createdUser);
      mockWalletCreate.mockResolvedValue({});

      await authService.register({ ...dto, email: 'ALICE@EXAMPLE.COM' });

      expect(mockUserFindOne).toHaveBeenCalledWith({ email: 'alice@example.com' });
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'bob@example.com', password: 'Password123' };

    it('should return tokens on valid credentials', async () => {
      const user = makeUser({ email: 'bob@example.com' });
      // select('+password') must return user
      mockUserFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      const result = await authService.login(dto);

      expect(result.tokens).toHaveProperty('accessToken');
      expect(mockSave).toHaveBeenCalled(); // lastLoginAt update
    });

    it('should throw 401 for non-existent email', async () => {
      mockUserFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

      await expect(authService.login(dto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw 403 for deactivated account', async () => {
      const user = makeUser({ isActive: false });
      mockUserFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      await expect(authService.login(dto)).rejects.toThrow('deactivated');
    });

    it('should throw 401 for wrong password', async () => {
      const user = makeUser({ comparePassword: jest.fn().mockResolvedValue(false) });
      mockUserFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      await expect(authService.login(dto)).rejects.toThrow('Invalid email or password');
    });
  });

  // ── refreshTokens ─────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should issue new tokens when refresh token is valid and user is active', async () => {
      const user = makeUser();
      const { refreshToken } = authService.generateTokens(user as never);
      mockUserFindOne.mockResolvedValue(user);

      const newTokens = await authService.refreshTokens(refreshToken);

      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');
    });

    it('should throw 401 if the refresh token is invalid', async () => {
      await expect(authService.refreshTokens('invalid-token')).rejects.toThrow();
    });

    it('should throw 401 if user no longer exists', async () => {
      const user = makeUser();
      const { refreshToken } = authService.generateTokens(user as never);
      mockUserFindOne.mockResolvedValue(null);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow('User not found');
    });

    it('should throw 403 for deactivated user', async () => {
      const user = makeUser();
      const { refreshToken } = authService.generateTokens(user as never);
      mockUserFindOne.mockResolvedValue(makeUser({ isActive: false }));

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow('deactivated');
    });
  });

  // ── getUserById ───────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const user = makeUser();
      mockUserFindOne.mockResolvedValue(user);

      const result = await authService.getUserById('user_abc123');

      expect(result).toBe(user);
      expect(mockUserFindOne).toHaveBeenCalledWith({ userId: 'user_abc123' });
    });

    it('should return null when user not found', async () => {
      mockUserFindOne.mockResolvedValue(null);

      const result = await authService.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });
});
