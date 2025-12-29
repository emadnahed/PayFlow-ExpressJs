import { validationResult } from 'express-validator';
import { Request, Response } from 'express';
import { registerValidation, loginValidation, refreshTokenValidation } from '../../../src/auth/auth.validation';

// Helper to run validation and get errors
const runValidation = async (validations: any[], body: Record<string, any>) => {
  const req = {
    body,
  } as Request;
  const res = {} as Response;
  const next = jest.fn();

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

describe('Auth Validation', () => {
  describe('registerValidation', () => {
    describe('name field', () => {
      it('should pass with valid name', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors).toHaveLength(0);
      });

      it('should fail when name is missing', async () => {
        const result = await runValidation(registerValidation, {
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Name is required');
      });

      it('should fail when name is empty string', async () => {
        const result = await runValidation(registerValidation, {
          name: '',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when name is only whitespace', async () => {
        const result = await runValidation(registerValidation, {
          name: '   ',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when name is less than 2 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'J',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Name must be between 2 and 100 characters');
      });

      it('should pass with name exactly 2 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'Jo',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors).toHaveLength(0);
      });

      it('should pass with name exactly 100 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'A'.repeat(100),
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors).toHaveLength(0);
      });

      it('should fail when name exceeds 100 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'A'.repeat(101),
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Name must be between 2 and 100 characters');
      });

      it('should trim whitespace from name', async () => {
        const result = await runValidation(registerValidation, {
          name: '  John Doe  ',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'name');
        expect(errors).toHaveLength(0);
      });
    });

    describe('email field', () => {
      it('should pass with valid email', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors).toHaveLength(0);
      });

      it('should fail when email is missing', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Email is required');
      });

      it('should fail when email is empty string', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: '',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with invalid email format - no @', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'johnexample.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Invalid email format');
      });

      it('should fail with invalid email format - no domain', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with invalid email format - no TLD', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with invalid email format - spaces', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john doe@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should pass with email containing subdomain', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@mail.example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors).toHaveLength(0);
      });

      it('should pass with email containing plus sign', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john+test@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors).toHaveLength(0);
      });

      it('should pass with email containing dots in local part', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john.doe@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'email');
        expect(errors).toHaveLength(0);
      });
    });

    describe('password field', () => {
      it('should pass with valid password', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors).toHaveLength(0);
      });

      it('should fail when password is missing', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Password is required');
      });

      it('should fail when password is empty string', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: '',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when password is less than 8 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Pass1',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e: any) => e.msg === 'Password must be at least 8 characters')).toBe(true);
      });

      it('should pass with password exactly 8 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Passwo1d',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors).toHaveLength(0);
      });

      it('should fail when password has no uppercase letter', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e: any) => e.msg.includes('uppercase'))).toBe(true);
      });

      it('should fail when password has no lowercase letter', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'PASSWORD123',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e: any) => e.msg.includes('lowercase'))).toBe(true);
      });

      it('should fail when password has no number', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Passworddd',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e: any) => e.msg.includes('number'))).toBe(true);
      });

      it('should pass with password containing special characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123!@#',
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors).toHaveLength(0);
      });

      it('should pass with very long password', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123' + 'a'.repeat(100),
        });
        const errors = result.array().filter((e: any) => e.path === 'password');
        expect(errors).toHaveLength(0);
      });
    });

    describe('phone field (optional)', () => {
      it('should pass when phone is not provided', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid phone number - 10 digits', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '9876543210',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid phone number - with country code', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '+919876543210',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid phone number - with dashes', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '+91-987-654-3210',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid phone number - with spaces', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '+91 987 654 3210',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors).toHaveLength(0);
      });

      it('should fail with phone number less than 10 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '123456789',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Invalid phone number format');
      });

      it('should fail with phone number more than 15 characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '1234567890123456',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with phone containing letters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '98765abc10',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with phone containing invalid special characters', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '(987)654-3210',
        });
        const errors = result.array().filter((e: any) => e.path === 'phone');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('complete registration validation', () => {
      it('should pass with all valid fields', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          phone: '+919876543210',
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should pass with valid required fields only', async () => {
        const result = await runValidation(registerValidation, {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should fail with all fields missing', async () => {
        const result = await runValidation(registerValidation, {});
        expect(result.isEmpty()).toBe(false);
        const errors = result.array();
        expect(errors.some((e: any) => e.path === 'name')).toBe(true);
        expect(errors.some((e: any) => e.path === 'email')).toBe(true);
        expect(errors.some((e: any) => e.path === 'password')).toBe(true);
      });

      it('should collect multiple validation errors', async () => {
        const result = await runValidation(registerValidation, {
          name: 'J',
          email: 'invalid-email',
          password: 'weak',
        });
        expect(result.isEmpty()).toBe(false);
        const errors = result.array();
        expect(errors.length).toBeGreaterThan(1);
      });
    });
  });

  describe('loginValidation', () => {
    it('should pass with valid credentials', async () => {
      const result = await runValidation(loginValidation, {
        email: 'john@example.com',
        password: 'anypassword',
      });
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail when email is missing', async () => {
      const result = await runValidation(loginValidation, {
        password: 'anypassword',
      });
      const errors = result.array().filter((e: any) => e.path === 'email');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when password is missing', async () => {
      const result = await runValidation(loginValidation, {
        email: 'john@example.com',
      });
      const errors = result.array().filter((e: any) => e.path === 'password');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid email format', async () => {
      const result = await runValidation(loginValidation, {
        email: 'invalid',
        password: 'anypassword',
      });
      const errors = result.array().filter((e: any) => e.path === 'email');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('refreshTokenValidation', () => {
    it('should pass with valid refresh token', async () => {
      const result = await runValidation(refreshTokenValidation, {
        refreshToken: 'some-valid-token',
      });
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail when refresh token is missing', async () => {
      const result = await runValidation(refreshTokenValidation, {});
      const errors = result.array().filter((e: any) => e.path === 'refreshToken');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].msg).toBe('Refresh token is required');
    });

    it('should fail when refresh token is empty string', async () => {
      const result = await runValidation(refreshTokenValidation, {
        refreshToken: '',
      });
      const errors = result.array().filter((e: any) => e.path === 'refreshToken');
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
