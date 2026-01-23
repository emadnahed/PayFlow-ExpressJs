/**
 * Docker Local Environment Configuration
 * Used for testing against Docker containers running locally
 */
export const config = {
  // Docker test container exposes on localhost:3001
  // (docker-compose.test.yml maps 3001:3000)
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

  // Performance thresholds (lenient for local Docker)
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>10'],
  },

  // Default test options (conservative for local resources)
  defaultOptions: {
    vus: 10,
    duration: '1m',
    iterations: 100,
  },

  // Environment identifier
  name: 'docker-local',
  description: 'Docker containers running on local machine',
};

export default config;
