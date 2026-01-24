/**
 * Production Environment Configuration
 * Used for production testing (with caution!)
 */
export const config = {
  baseUrl: __ENV.API_URL || 'https://api.payflow.example.com',

  // Load test bypass token (must match LOAD_TEST_SECRET on production server)
  // WARNING: Use with caution in production! Set via: k6 run -e LOAD_TEST_TOKEN=your-secret ...
  loadTestToken: __ENV.LOAD_TEST_TOKEN || '',

  // Test user credentials
  testUser: {
    email: __ENV.TEST_USER_EMAIL || 'loadtest@example.com',
    password: __ENV.TEST_USER_PASSWORD || 'LoadTest123!',
  },

  // Secondary test user for transfer tests
  testUser2: {
    email: __ENV.TEST_USER_2_EMAIL || 'loadtest2@example.com',
    password: __ENV.TEST_USER_2_PASSWORD || 'LoadTest123!',
  },

  // Performance thresholds (strict for production)
  thresholds: {
    // HTTP metrics (strict)
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.001'],
    http_reqs: ['rate>100'],
    // Custom metrics (strict thresholds)
    errors: ['rate<0.001'],
    auth_latency: ['p(95)<300'],
    wallet_latency: ['p(95)<400'],
    transaction_latency: ['p(95)<500'],
  },

  // Default test options (conservative for production)
  defaultOptions: {
    vus: 10,
    duration: '2m',
    iterations: 100,
  },
};

export default config;
