/**
 * Staging Environment Configuration
 * Used for pre-production testing
 */
export const config = {
  baseUrl: __ENV.API_URL || 'https://staging-api.payflow.example.com',

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

  // Performance thresholds (standard)
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>50'],
  },

  // Default test options
  defaultOptions: {
    vus: 50,
    duration: '5m',
    iterations: 500,
  },
};

export default config;
