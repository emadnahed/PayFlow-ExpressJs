/**
 * Production Environment Configuration
 * Used for production testing (with caution!)
 */
export const config = {
  baseUrl: __ENV.API_URL || 'https://api.payflow.example.com',

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

  // Performance thresholds (strict)
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.001'],
    http_reqs: ['rate>100'],
  },

  // Default test options (conservative for production)
  defaultOptions: {
    vus: 10,
    duration: '2m',
    iterations: 100,
  },
};

export default config;
