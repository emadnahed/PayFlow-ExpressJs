/**
 * Unit Tests: Sentry observability module
 *
 * Tests initSentry, captureSentryException, and setSentryUser
 * with @sentry/node fully mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSentryInit = jest.fn();
const mockWithScope = jest.fn();
const mockCaptureException = jest.fn();
const mockSetTag = jest.fn();
const mockSetUser = jest.fn();
const mockGetCurrentScope = jest.fn().mockReturnValue({ setUser: mockSetUser });

jest.mock('@sentry/node', () => ({
  init: (...a: unknown[]) => mockSentryInit(...a),
  withScope: (cb: (scope: { setTag: jest.Mock }) => void) => {
    mockWithScope(cb);
    cb({ setTag: mockSetTag });
  },
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  getCurrentScope: () => mockGetCurrentScope(),
}));

// isTest must be false so initSentry can actually initialize
jest.mock('../../../src/config/environments', () => ({
  isTest: false,
}));

// ── Import ────────────────────────────────────────────────────────────────────

// We need to reset the module state between tests (the `initialized` boolean is module-level)
// Jest module isolation handles this if we reset via jest.isolateModules

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sentry observability (unit)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    // Reset the module between tests to reset `initialized` flag
    jest.resetModules();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  // ── initSentry ─────────────────────────────────────────────────────────────

  describe('initSentry', () => {
    it('should be a no-op when SENTRY_DSN is not set', async () => {
      delete process.env.SENTRY_DSN;
      // Re-mock to ensure isTest=false still applies
      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: mockSentryInit,
        withScope: jest.fn(),
        captureException: jest.fn(),
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry } = await import('../../../src/observability/sentry');
      initSentry();

      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it('should call Sentry.init when DSN is provided and not in test env', async () => {
      process.env.SENTRY_DSN = 'https://fake@sentry.io/123';
      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: mockSentryInit,
        withScope: jest.fn(),
        captureException: jest.fn(),
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry } = await import('../../../src/observability/sentry');
      initSentry();

      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: 'https://fake@sentry.io/123' })
      );
    });

    it('should be a no-op when isTest=true even with DSN present', async () => {
      process.env.SENTRY_DSN = 'https://fake@sentry.io/123';
      jest.doMock('../../../src/config/environments', () => ({ isTest: true }));
      jest.doMock('@sentry/node', () => ({
        init: mockSentryInit,
        withScope: jest.fn(),
        captureException: jest.fn(),
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry } = await import('../../../src/observability/sentry');
      initSentry();

      expect(mockSentryInit).not.toHaveBeenCalled();
    });
  });

  // ── captureSentryException ────────────────────────────────────────────────

  describe('captureSentryException', () => {
    it('should be a no-op when Sentry is not initialized', async () => {
      delete process.env.SENTRY_DSN;
      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: mockSentryInit,
        withScope: (cb: (scope: { setTag: jest.Mock }) => void) => {
          cb({ setTag: mockSetTag });
        },
        captureException: mockCaptureException,
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry, captureSentryException } = await import('../../../src/observability/sentry');
      initSentry(); // won't initialize (no DSN)
      captureSentryException(new Error('test'));

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should call captureException with correlationId tag when initialized', async () => {
      process.env.SENTRY_DSN = 'https://fake@sentry.io/123';

      const localMockWithScope = jest.fn((cb: (scope: { setTag: jest.Mock }) => void) => {
        cb({ setTag: mockSetTag });
      });
      const localMockCaptureException = jest.fn();
      const localMockInit = jest.fn();

      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: localMockInit,
        withScope: localMockWithScope,
        captureException: localMockCaptureException,
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry, captureSentryException } = await import('../../../src/observability/sentry');
      initSentry();

      const err = new Error('Something broke');
      captureSentryException(err, { correlationId: 'corr_abc' });

      expect(localMockWithScope).toHaveBeenCalled();
      expect(mockSetTag).toHaveBeenCalledWith('correlationId', 'corr_abc');
      expect(localMockCaptureException).toHaveBeenCalledWith(err);
    });

    it('should call captureException without tag when no correlationId', async () => {
      process.env.SENTRY_DSN = 'https://fake@sentry.io/123';

      const localMockWithScope = jest.fn((cb: (scope: { setTag: jest.Mock }) => void) => {
        cb({ setTag: mockSetTag });
      });
      const localMockCaptureException = jest.fn();

      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: jest.fn(),
        withScope: localMockWithScope,
        captureException: localMockCaptureException,
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry, captureSentryException } = await import('../../../src/observability/sentry');
      initSentry();

      captureSentryException(new Error('no context'));

      expect(mockSetTag).not.toHaveBeenCalled();
      expect(localMockCaptureException).toHaveBeenCalled();
    });
  });

  // ── setSentryUser ─────────────────────────────────────────────────────────

  describe('setSentryUser', () => {
    it('should be a no-op when not initialized', async () => {
      delete process.env.SENTRY_DSN;
      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: jest.fn(),
        withScope: jest.fn(),
        captureException: jest.fn(),
        getCurrentScope: mockGetCurrentScope,
      }));

      const { initSentry, setSentryUser } = await import('../../../src/observability/sentry');
      initSentry();
      setSentryUser('u1');

      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it('should call setUser when initialized', async () => {
      process.env.SENTRY_DSN = 'https://fake@sentry.io/123';

      const localMockSetUser = jest.fn();
      const localMockGetCurrentScope = jest.fn().mockReturnValue({ setUser: localMockSetUser });

      jest.doMock('../../../src/config/environments', () => ({ isTest: false }));
      jest.doMock('@sentry/node', () => ({
        init: jest.fn(),
        withScope: jest.fn(),
        captureException: jest.fn(),
        getCurrentScope: localMockGetCurrentScope,
      }));

      const { initSentry, setSentryUser } = await import('../../../src/observability/sentry');
      initSentry();
      setSentryUser('u1');

      expect(localMockSetUser).toHaveBeenCalledWith({ id: 'u1' });
    });
  });
});
