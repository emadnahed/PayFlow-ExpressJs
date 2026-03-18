/**
 * Unit Tests: validateRequest Middleware
 *
 * Tests validation error grouping (by field) and pass-through behaviour.
 */

import { Request, Response, NextFunction } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockValidationResult = jest.fn();

jest.mock('express-validator', () => ({
  validationResult: (req: Request) => mockValidationResult(req),
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { validateRequest } from '../../../src/middlewares/validateRequest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReq(): Request {
  return {} as Request;
}

function buildRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeValidationResult(errors: Array<{ path: string; msg: string }>) {
  return {
    isEmpty: () => errors.length === 0,
    array: () => errors,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validateRequest middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('should call next() when there are no validation errors', () => {
    mockValidationResult.mockReturnValue(makeValidationResult([]));

    validateRequest(buildReq(), buildRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should throw ApiError(400) when there are validation errors', () => {
    mockValidationResult.mockReturnValue(
      makeValidationResult([{ path: 'email', msg: 'Invalid email' }])
    );

    let caught: unknown;
    try {
      validateRequest(buildReq(), buildRes(), next);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { statusCode: number }).statusCode).toBe(400);
    expect((caught as Error).message).toBe('Validation failed');
  });

  it('should not call next() when there are validation errors', () => {
    mockValidationResult.mockReturnValue(
      makeValidationResult([{ path: 'amount', msg: 'Amount must be positive' }])
    );

    try {
      validateRequest(buildReq(), buildRes(), next);
    } catch {
      // expected
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('should group multiple errors for the same field into an array', () => {
    mockValidationResult.mockReturnValue(
      makeValidationResult([
        { path: 'email', msg: 'Email is required' },
        { path: 'email', msg: 'Invalid email format' },
      ])
    );

    let caught: unknown;
    try {
      validateRequest(buildReq(), buildRes(), next);
    } catch (err) {
      caught = err;
    }

    const ve = (caught as { validationErrors: Record<string, string[]> }).validationErrors;
    expect(ve.email).toEqual(['Email is required', 'Invalid email format']);
  });

  it('should group errors by separate field names', () => {
    mockValidationResult.mockReturnValue(
      makeValidationResult([
        { path: 'email', msg: 'Invalid email' },
        { path: 'password', msg: 'Password too short' },
        { path: 'password', msg: 'Password must contain a number' },
      ])
    );

    let caught: unknown;
    try {
      validateRequest(buildReq(), buildRes(), next);
    } catch (err) {
      caught = err;
    }

    const ve = (caught as { validationErrors: Record<string, string[]> }).validationErrors;
    expect(ve.email).toEqual(['Invalid email']);
    expect(ve.password).toEqual(['Password too short', 'Password must contain a number']);
  });
});
