/**
 * Tracing Module Unit Tests
 *
 * Tests OpenTelemetry tracing initialization and custom span creation.
 */

// Mock span
const mockSpan = {
  setAttribute: jest.fn(),
  setStatus: jest.fn(),
  end: jest.fn(),
};

// Mock tracer
const mockTracer = {
  startActiveSpan: jest.fn((name: string, fn: (span: typeof mockSpan) => Promise<unknown>) => {
    return fn(mockSpan);
  }),
};

// Mock trace
const mockTrace = {
  getTracer: jest.fn().mockReturnValue(mockTracer),
};

jest.mock('@opentelemetry/api', () => ({
  trace: mockTrace,
  SpanStatusCode: {
    OK: 0,
    ERROR: 2,
  },
}));

// Mock SDK
const mockSDKInstance = {
  start: jest.fn(),
  shutdown: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => mockSDKInstance),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
}));

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/observability/logger', () => ({
  logger: mockLogger,
}));

// We'll dynamically control config.isTest
let mockIsTest = true;

jest.mock('../../../src/config', () => ({
  config: {
    get isTest() {
      return mockIsTest;
    },
  },
}));

describe('Tracing Module', () => {
  // Import after mocks
  let initTracing: typeof import('../../../src/observability/tracing').initTracing;
  let shutdownTracing: typeof import('../../../src/observability/tracing').shutdownTracing;
  let getTracer: typeof import('../../../src/observability/tracing').getTracer;
  let createSagaSpan: typeof import('../../../src/observability/tracing').createSagaSpan;
  let traceTransaction: typeof import('../../../src/observability/tracing').traceTransaction;
  let traceWebhook: typeof import('../../../src/observability/tracing').traceWebhook;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockIsTest = true;

    // Reset module to pick up new mock config
    jest.resetModules();

    const module = await import('../../../src/observability/tracing');
    initTracing = module.initTracing;
    shutdownTracing = module.shutdownTracing;
    getTracer = module.getTracer;
    createSagaSpan = module.createSagaSpan;
    traceTransaction = module.traceTransaction;
    traceWebhook = module.traceWebhook;
  });

  describe('initTracing', () => {
    it('should skip tracing in test environment', () => {
      mockIsTest = true;

      initTracing();

      expect(mockLogger.debug).toHaveBeenCalledWith('Tracing disabled in test environment');
      expect(mockSDKInstance.start).not.toHaveBeenCalled();
    });

    it('should initialize tracing in non-test environment', async () => {
      mockIsTest = false;
      jest.resetModules();

      const module = await import('../../../src/observability/tracing');
      module.initTracing();

      expect(mockSDKInstance.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: expect.any(String) }),
        'OpenTelemetry tracing initialized'
      );
    });

    it('should use default OTLP endpoint when not configured', async () => {
      mockIsTest = false;
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      jest.resetModules();

      const module = await import('../../../src/observability/tracing');
      module.initTracing();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://localhost:4318/v1/traces' }),
        expect.any(String)
      );
    });

    it('should use configured OTLP endpoint', async () => {
      mockIsTest = false;
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://custom:4318/v1/traces';
      jest.resetModules();

      const module = await import('../../../src/observability/tracing');
      module.initTracing();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://custom:4318/v1/traces' }),
        expect.any(String)
      );

      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    });

    it('should handle initialization errors', async () => {
      mockIsTest = false;
      mockSDKInstance.start.mockImplementationOnce(() => {
        throw new Error('Failed to initialize');
      });
      jest.resetModules();

      const module = await import('../../../src/observability/tracing');
      module.initTracing();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to initialize OpenTelemetry tracing'
      );
    });
  });

  describe('shutdownTracing', () => {
    it('should handle shutdown when SDK not initialized (test mode)', async () => {
      mockIsTest = true;
      initTracing(); // Skipped in test mode

      await shutdownTracing();

      // Should not call SDK shutdown since it wasn't initialized
      expect(mockSDKInstance.shutdown).not.toHaveBeenCalled();
    });

    it('should shutdown SDK when initialized', async () => {
      mockIsTest = false;
      jest.resetModules();

      const module = await import('../../../src/observability/tracing');
      module.initTracing();
      jest.clearAllMocks();

      await module.shutdownTracing();

      expect(mockSDKInstance.shutdown).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('OpenTelemetry tracing shut down');
    });

    it('should handle shutdown errors', async () => {
      mockIsTest = false;
      jest.resetModules();

      const module = await import('../../../src/observability/tracing');
      module.initTracing();
      jest.clearAllMocks();

      mockSDKInstance.shutdown.mockRejectedValueOnce(new Error('Shutdown failed'));

      await module.shutdownTracing();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error shutting down OpenTelemetry'
      );
    });
  });

  describe('getTracer', () => {
    it('should return a tracer for the given name', () => {
      const tracer = getTracer('my-service');

      expect(mockTrace.getTracer).toHaveBeenCalledWith('my-service');
      expect(tracer).toBeDefined();
    });

    it('should return tracers for different names', () => {
      getTracer('service-a');
      getTracer('service-b');

      expect(mockTrace.getTracer).toHaveBeenCalledWith('service-a');
      expect(mockTrace.getTracer).toHaveBeenCalledWith('service-b');
    });
  });

  describe('createSagaSpan', () => {
    beforeEach(() => {
      mockSpan.setAttribute.mockClear();
      mockSpan.setStatus.mockClear();
      mockSpan.end.mockClear();
    });

    it('should create span with attributes and execute function', async () => {
      const result = await createSagaSpan(
        'test-operation',
        { key1: 'value1', key2: 123, key3: true },
        async () => 'success'
      );

      expect(result).toBe('success');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key1', 'value1');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key2', 123);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key3', true);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 }); // SpanStatusCode.OK
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle function errors and set error status', async () => {
      const testError = new Error('Test error');

      await expect(
        createSagaSpan(
          'failing-operation',
          { operation: 'test' },
          async () => {
            throw testError;
          }
        )
      ).rejects.toThrow('Test error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Test error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      await expect(
        createSagaSpan(
          'failing-operation',
          {},
          async () => {
            throw 'string error';
          }
        )
      ).rejects.toBe('string error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Unknown error',
      });
    });

    it('should always end span even on error', async () => {
      try {
        await createSagaSpan(
          'test',
          {},
          async () => {
            throw new Error('Test');
          }
        );
      } catch {
        // Expected
      }

      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('traceTransaction', () => {
    beforeEach(() => {
      mockSpan.setAttribute.mockClear();
      mockSpan.setStatus.mockClear();
      mockSpan.end.mockClear();
    });

    it('should trace transaction with correct attributes', async () => {
      const result = await traceTransaction('txn_123', 'initiate', async () => 'done');

      expect(result).toBe('done');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'transaction.initiate',
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('transaction.id', 'txn_123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('transaction.operation', 'initiate');
    });

    it('should trace different transaction operations', async () => {
      const operations = ['initiate', 'debit', 'credit', 'complete', 'refund'];

      for (const op of operations) {
        jest.clearAllMocks();
        await traceTransaction('txn_456', op, async () => op);

        expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
          `transaction.${op}`,
          expect.any(Function)
        );
      }
    });

    it('should propagate errors from traced function', async () => {
      await expect(
        traceTransaction('txn_789', 'fail', async () => {
          throw new Error('Transaction failed');
        })
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('traceWebhook', () => {
    beforeEach(() => {
      mockSpan.setAttribute.mockClear();
      mockSpan.setStatus.mockClear();
      mockSpan.end.mockClear();
    });

    it('should trace webhook delivery with correct attributes', async () => {
      const result = await traceWebhook(
        'wh_123',
        'https://example.com/webhook',
        async () => ({ status: 200 })
      );

      expect(result).toEqual({ status: 200 });
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'webhook.deliver',
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('webhook.id', 'wh_123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('webhook.url', 'https://example.com/webhook');
    });

    it('should handle webhook delivery failures', async () => {
      await expect(
        traceWebhook('wh_456', 'https://failing.com', async () => {
          throw new Error('Connection refused');
        })
      ).rejects.toThrow('Connection refused');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Connection refused',
      });
    });
  });

  describe('span attributes', () => {
    beforeEach(() => {
      mockSpan.setAttribute.mockClear();
    });

    it('should support string attributes', async () => {
      await createSagaSpan('test', { stringAttr: 'value' }, async () => {});
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('stringAttr', 'value');
    });

    it('should support number attributes', async () => {
      await createSagaSpan('test', { numberAttr: 42 }, async () => {});
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('numberAttr', 42);
    });

    it('should support boolean attributes', async () => {
      await createSagaSpan('test', { boolAttr: true }, async () => {});
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('boolAttr', true);
    });

    it('should support multiple attributes', async () => {
      await createSagaSpan(
        'test',
        {
          attr1: 'string',
          attr2: 123,
          attr3: false,
        },
        async () => {}
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledTimes(3);
    });
  });
});
