import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../../src/auth/auth.service';
import { User } from '../../../src/models/User';
import { Wallet } from '../../../src/models/Wallet';
import { config } from '../../../src/config';

describe('AuthService Integration Tests', () => {
  let authService: AuthService;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
    authService = new AuthService();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
  });

  describe('register', () => {
    it('should create user with hashed password', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      const user = await User.findOne({ email: 'test@example.com' }).select('+password');
      expect(user).not.toBeNull();
      expect(user!.password).not.toBe('Password123');
      expect(user!.password.length).toBeGreaterThan(50); // bcrypt hash length
    });

    it('should create wallet with zero balance', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      const wallet = await Wallet.findOne({ userId: result.user.userId });
      expect(wallet).not.toBeNull();
      expect(wallet!.balance).toBe(0);
      expect(wallet!.currency).toBe('INR');
    });

    it('should generate valid JWT tokens', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Verify access token
      const accessPayload = jwt.verify(result.tokens.accessToken, config.jwt.secret) as any;
      expect(accessPayload.userId).toBe(result.user.userId);
      expect(accessPayload.email).toBe(result.user.email);

      // Verify refresh token
      const refreshPayload = jwt.verify(result.tokens.refreshToken, config.jwt.secret) as any;
      expect(refreshPayload.userId).toBe(result.user.userId);
    });

    it('should normalize email to lowercase', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'TEST@EXAMPLE.COM',
        password: 'Password123',
      });

      expect(result.user.email).toBe('test@example.com');
    });

    it('should set isEmailVerified to false by default', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.user.isEmailVerified).toBe(false);
    });

    it('should throw error for duplicate email', async () => {
      await authService.register({
        name: 'First User',
        email: 'test@example.com',
        password: 'Password123',
      });

      await expect(
        authService.register({
          name: 'Second User',
          email: 'test@example.com',
          password: 'Password456',
        })
      ).rejects.toThrow('Email already registered');
    });

    it('should throw error for duplicate email case-insensitive', async () => {
      await authService.register({
        name: 'First User',
        email: 'test@example.com',
        password: 'Password123',
      });

      await expect(
        authService.register({
          name: 'Second User',
          email: 'TEST@EXAMPLE.COM',
          password: 'Password456',
        })
      ).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    const testUser = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
    };

    beforeEach(async () => {
      await authService.register(testUser);
    });

    it('should return tokens for valid credentials', async () => {
      const result = await authService.login({
        email: testUser.email,
        password: testUser.password,
      });

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user.email).toBe(testUser.email);
    });

    it('should update lastLoginAt timestamp', async () => {
      const beforeLogin = new Date();

      await authService.login({
        email: testUser.email,
        password: testUser.password,
      });

      const user = await User.findOne({ email: testUser.email });
      expect(user!.lastLoginAt).toBeDefined();
      expect(user!.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });

    it('should throw error for wrong password', async () => {
      await expect(
        authService.login({
          email: testUser.email,
          password: 'WrongPassword123',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'Password123',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for deactivated user', async () => {
      await User.updateOne({ email: testUser.email }, { isActive: false });

      await expect(
        authService.login({
          email: testUser.email,
          password: testUser.password,
        })
      ).rejects.toThrow('Account is deactivated');
    });

    it('should handle case-insensitive email login', async () => {
      const result = await authService.login({
        email: testUser.email.toUpperCase(),
        password: testUser.password,
      });

      expect(result.user.email).toBe(testUser.email);
    });
  });

  describe('generateTokens', () => {
    it('should generate tokens with correct expiry', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      const accessPayload = jwt.decode(result.tokens.accessToken) as any;
      const refreshPayload = jwt.decode(result.tokens.refreshToken) as any;

      // Access token should expire in ~1 hour (test/dev default)
      const accessExpiry = accessPayload.exp - accessPayload.iat;
      expect(accessExpiry).toBe(60 * 60); // 1 hour in seconds (test mode default)

      // Refresh token should expire in ~7 days
      const refreshExpiry = refreshPayload.exp - refreshPayload.iat;
      expect(refreshExpiry).toBe(7 * 24 * 60 * 60); // 7 days in seconds
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      const payload = authService.verifyToken(result.tokens.accessToken);
      expect(payload.userId).toBe(result.user.userId);
      expect(payload.email).toBe(result.user.email);
    });

    it('should throw error for invalid token', () => {
      expect(() => authService.verifyToken('invalid-token')).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      // Create a token that's already expired
      const expiredToken = jwt.sign(
        { userId: 'test', email: 'test@example.com' },
        config.jwt.secret,
        { expiresIn: '-1s' }
      );

      expect(() => authService.verifyToken(expiredToken)).toThrow('Token expired');
    });

    it('should throw error for token with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        { userId: 'test', email: 'test@example.com' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      expect(() => authService.verifyToken(wrongSecretToken)).toThrow('Invalid token');
    });
  });

  describe('refreshTokens', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });
      refreshToken = result.tokens.refreshToken;
      userId = result.user.userId;
    });

    it('should return new token pair', async () => {
      const tokens = await authService.refreshTokens(refreshToken);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.accessToken).not.toBe(refreshToken);
    });

    it('should return tokens for same user', async () => {
      const tokens = await authService.refreshTokens(refreshToken);

      const payload = jwt.decode(tokens.accessToken) as any;
      expect(payload.userId).toBe(userId);
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(authService.refreshTokens('invalid-token')).rejects.toThrow('Invalid token');
    });

    it('should throw error for expired refresh token', async () => {
      const expiredToken = jwt.sign({ userId, email: 'test@example.com' }, config.jwt.secret, {
        expiresIn: '-1s',
      });

      await expect(authService.refreshTokens(expiredToken)).rejects.toThrow('Token expired');
    });

    it('should throw error if user no longer exists', async () => {
      await User.deleteMany({});

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow('User not found');
    });

    it('should throw error if user is deactivated', async () => {
      await User.updateOne({ userId }, { isActive: false });

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(
        'Account is deactivated'
      );
    });
  });

  describe('getUserById', () => {
    it('should return user by userId', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      const user = await authService.getUserById(result.user.userId);
      expect(user).not.toBeNull();
      expect(user!.email).toBe('test@example.com');
    });

    it('should return null for non-existent userId', async () => {
      const user = await authService.getUserById('non-existent-id');
      expect(user).toBeNull();
    });

    it('should not include password in returned user', async () => {
      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123',
      });

      const user = await authService.getUserById(result.user.userId);
      expect((user as any).password).toBeUndefined();
    });
  });
});
