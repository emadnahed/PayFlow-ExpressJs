/**
 * VPS Environment Configuration
 * Used for testing against Docker containers running on a VPS/remote server
 */
export const config = {
  // VPS URL - Override with API_URL env variable
  // Example: k6 run -e API_URL=https://api.yourdomain.com tests/smoke/smoke.test.js
  baseUrl: __ENV.API_URL || 'https://api.payflow.example.com',

  // Load test bypass token (must match LOAD_TEST_SECRET on VPS server)
  // Set via: k6 run -e LOAD_TEST_TOKEN=your-secret ...
  // If not set, requests will be subject to normal rate limits
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

  // Performance thresholds (standard for VPS)
  // Account for network latency
  thresholds: {
    // HTTP metrics
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.02'],
    http_reqs: ['rate>30'],
    // Custom metrics (slightly relaxed for network latency)
    errors: ['rate<0.02'],
    auth_latency: ['p(95)<1000'],
    wallet_latency: ['p(95)<1200'],
    transaction_latency: ['p(95)<1500'],
  },

  // Default test options
  defaultOptions: {
    vus: 30,
    duration: '3m',
    iterations: 300,
  },

  // Environment identifier
  name: 'vps',
  description: 'Docker containers running on VPS/remote server',
};

export default config;
