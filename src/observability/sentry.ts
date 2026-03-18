import * as Sentry from '@sentry/node';

import { isTest } from '../config/environments';

let initialized = false;

export const initSentry = (): void => {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn || isTest) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.COMMIT_SHA || 'unknown',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  });

  initialized = true;
};

export const captureSentryException = (err: Error, context?: { correlationId?: string }): void => {
  if (!initialized) { return; }

  Sentry.withScope((scope) => {
    if (context?.correlationId) {
      scope.setTag('correlationId', context.correlationId);
    }
    Sentry.captureException(err);
  });
};

export const setSentryUser = (userId: string): void => {
  if (!initialized) { return; }

  Sentry.getCurrentScope().setUser({ id: userId });
};
