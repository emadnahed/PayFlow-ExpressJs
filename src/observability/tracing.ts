import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, SpanStatusCode, Span, Tracer } from '@opentelemetry/api';
import { config } from '../config';
import { logger } from './logger';

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * Should be called before any other imports/code that needs tracing
 */
export const initTracing = (): void => {
  // Skip tracing in test environment
  if (config.isTest) {
    logger.debug('Tracing disabled in test environment');
    return;
  }

  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  try {
    sdk = new NodeSDK({
      serviceName: 'payflow',
      traceExporter: new OTLPTraceExporter({
        url: otlpEndpoint,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-mongodb': { enabled: true },
          '@opentelemetry/instrumentation-ioredis': { enabled: true },
          '@opentelemetry/instrumentation-http': { enabled: true },
          // Disable file system instrumentation to reduce noise
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    logger.info({ endpoint: otlpEndpoint }, 'OpenTelemetry tracing initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize OpenTelemetry tracing');
  }
};

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export const shutdownTracing = async (): Promise<void> => {
  if (sdk) {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry tracing shut down');
    } catch (error) {
      logger.error({ error }, 'Error shutting down OpenTelemetry');
    }
  }
};

/**
 * Get a tracer for a specific service/component
 */
export const getTracer = (name: string): Tracer => {
  return trace.getTracer(name);
};

/**
 * Create a custom span for saga operations
 */
export const createSagaSpan = async <T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> => {
  const tracer = getTracer('payflow-saga');

  return tracer.startActiveSpan(name, async (span) => {
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
};

/**
 * Create a custom span for transaction processing
 */
export const traceTransaction = async <T>(
  transactionId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  return createSagaSpan(
    `transaction.${operation}`,
    {
      'transaction.id': transactionId,
      'transaction.operation': operation,
    },
    async () => fn()
  );
};

/**
 * Create a custom span for webhook delivery
 */
export const traceWebhook = async <T>(
  webhookId: string,
  url: string,
  fn: () => Promise<T>
): Promise<T> => {
  return createSagaSpan(
    'webhook.deliver',
    {
      'webhook.id': webhookId,
      'webhook.url': url,
    },
    async () => fn()
  );
};
