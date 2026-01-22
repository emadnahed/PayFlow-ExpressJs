/**
 * Local Environment Configuration
 * Used for development and local testing
 */
export const config = {
  baseUrl: __ENV.API_URL || 'http://localhost:3001',

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

  // Performance thresholds (more lenient for local)
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>10'],
  },

  // Default test options
  defaultOptions: {
    vus: 5,
    duration: '30s',
    iterations: 50,
  },
};

export default config;
