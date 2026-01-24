/**
 * Docker Local Environment Configuration
 * Used for testing against Docker containers running locally
 */
export const config = {
  // Docker test container exposes on localhost:3001
  // (docker-compose.test.yml maps 3001:3000)
  baseUrl: __ENV.API_URL || 'http://localhost:3001',

  // Load test bypass token (matches LOAD_TEST_SECRET on server)
  // Docker test container uses test settings which default to 'test-load-secret'
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

  // Performance thresholds (lenient for local Docker)
  // Docker adds overhead, so we use relaxed thresholds
  thresholds: {
    // HTTP metrics (relaxed for Docker overhead)
    http_req_duration: ['p(95)<3000', 'p(99)<6000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>5'],
    // Custom metrics (relaxed for local Docker environment)
    errors: ['rate<0.05'],
    auth_latency: ['p(95)<3000'],
    wallet_latency: ['p(95)<2500'],
    transaction_latency: ['p(95)<2000'],
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
