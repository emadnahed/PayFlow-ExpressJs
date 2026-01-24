/**
 * Staging Environment Configuration
 * Used for pre-production testing
 */
export const config = {
  baseUrl: __ENV.API_URL || 'https://staging-api.payflow.example.com',

  // Load test bypass token (must match LOAD_TEST_SECRET on staging server)
  // Set via: k6 run -e LOAD_TEST_TOKEN=your-secret ...
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

  // Performance thresholds (standard for staging)
  thresholds: {
    // HTTP metrics
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>50'],
    // Custom metrics (standard thresholds)
    errors: ['rate<0.01'],
    auth_latency: ['p(95)<500'],
    wallet_latency: ['p(95)<800'],
    transaction_latency: ['p(95)<1000'],
  },

  // Default test options
  defaultOptions: {
    vus: 50,
    duration: '5m',
    iterations: 500,
  },
};

export default config;
