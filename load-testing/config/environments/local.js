/**
 * Local Environment Configuration
 * Used for development and local testing
 */
export const config = {
  // ts-node server runs on port 3000 in local mode
  baseUrl: __ENV.API_URL || 'http://localhost:3000',

  // Load test bypass token (matches LOAD_TEST_SECRET on server)
  // In test mode, server defaults to 'test-load-secret'
  loadTestToken: __ENV.LOAD_TEST_TOKEN || 'test-load-secret',

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

  // Performance thresholds (lenient for local development)
  thresholds: {
    // HTTP metrics
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>10'],
    // Custom metrics (relaxed for local environment)
    errors: ['rate<0.05'],
    auth_latency: ['p(95)<2000'],
    wallet_latency: ['p(95)<1500'],
    transaction_latency: ['p(95)<1500'],
  },

  // Default test options
  defaultOptions: {
    vus: 5,
    duration: '30s',
    iterations: 50,
  },
};

export default config;
