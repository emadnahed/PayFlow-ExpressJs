import autocannon from 'autocannon';

interface LoadTestConfig {
  url: string;
  connections: number;
  duration: number;
  pipelining: number;
}

interface TestScenario {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.LOAD_TEST_TOKEN || '';

const defaultConfig: LoadTestConfig = {
  url: BASE_URL,
  connections: 10,
  duration: 30,
  pipelining: 1,
};

const scenarios: TestScenario[] = [
  {
    name: 'Health Check',
    endpoint: '/health/live',
    method: 'GET',
  },
  {
    name: 'Get Wallet Balance',
    endpoint: '/wallet/balance',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  },
  {
    name: 'Create Transaction',
    endpoint: '/transactions',
    method: 'POST',
    body: {
      receiverId: 'user_receiver_123',
      amount: 100,
      description: 'Load test transaction',
    },
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  },
];

async function runLoadTest(scenario: TestScenario, config: LoadTestConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running load test: ${scenario.name}`);
  console.log(`Endpoint: ${scenario.method} ${scenario.endpoint}`);
  console.log(`Connections: ${config.connections}, Duration: ${config.duration}s`);
  console.log('='.repeat(60));

  const instance = autocannon({
    url: `${config.url}${scenario.endpoint}`,
    connections: config.connections,
    duration: config.duration,
    pipelining: config.pipelining,
    method: scenario.method,
    headers: {
      ...scenario.headers,
    },
    body: scenario.body ? JSON.stringify(scenario.body) : undefined,
  });

  autocannon.track(instance, { renderProgressBar: true });

  const result = await instance;

  console.log('\nResults:');
  console.log(`  Requests/sec: ${result.requests.average}`);
  console.log(`  Latency (avg): ${result.latency.average}ms`);
  console.log(`  Latency (p99): ${result.latency.p99}ms`);
  console.log(`  Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
  console.log(`  Total requests: ${result.requests.total}`);
  console.log(`  Errors: ${result.errors}`);
  console.log(`  Timeouts: ${result.timeouts}`);
  console.log(`  2xx responses: ${result['2xx']}`);
  console.log(`  Non-2xx responses: ${result.non2xx}`);

  // Validation thresholds
  const thresholds = {
    minRequestsPerSec: 100,
    maxLatencyP99: 500,
    maxErrorRate: 0.01,
  };

  const errorRate = result.errors / result.requests.total;
  const passed =
    result.requests.average >= thresholds.minRequestsPerSec &&
    result.latency.p99 <= thresholds.maxLatencyP99 &&
    errorRate <= thresholds.maxErrorRate;

  if (passed) {
    console.log('\n✅ Load test PASSED');
  } else {
    console.log('\n❌ Load test FAILED');
    if (result.requests.average < thresholds.minRequestsPerSec) {
      console.log(
        `   - Requests/sec below threshold: ${result.requests.average} < ${thresholds.minRequestsPerSec}`
      );
    }
    if (result.latency.p99 > thresholds.maxLatencyP99) {
      console.log(
        `   - P99 latency above threshold: ${result.latency.p99}ms > ${thresholds.maxLatencyP99}ms`
      );
    }
    if (errorRate > thresholds.maxErrorRate) {
      console.log(
        `   - Error rate above threshold: ${(errorRate * 100).toFixed(2)}% > ${thresholds.maxErrorRate * 100}%`
      );
    }
  }

  return;
}

async function runAllTests(): Promise<void> {
  console.log('PayFlow Load Testing Suite');
  console.log('==========================\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? '[PROVIDED]' : '[NOT PROVIDED]'}`);

  // Test 1: Health check (no auth required)
  await runLoadTest(scenarios[0], defaultConfig);

  if (!AUTH_TOKEN) {
    console.log('\n⚠️  Skipping authenticated tests - no LOAD_TEST_TOKEN provided');
    console.log('   Set LOAD_TEST_TOKEN environment variable to run all tests\n');
    return;
  }

  // Test 2: Wallet balance (authenticated)
  await runLoadTest(scenarios[1], defaultConfig);

  // Test 3: Create transaction (authenticated, lower connections due to DB writes)
  await runLoadTest(scenarios[2], {
    ...defaultConfig,
    connections: 5,
    duration: 15,
  });

  console.log('\n' + '='.repeat(60));
  console.log('Load testing complete!');
  console.log('='.repeat(60));
}

// Stress test configuration
async function runStressTest(): Promise<void> {
  console.log('\nRunning STRESS TEST...');
  console.log('This will gradually increase load to find breaking point\n');

  const connections = [10, 25, 50, 100, 200];

  for (const conn of connections) {
    console.log(`\nTesting with ${conn} concurrent connections...`);

    const instance = autocannon({
      url: `${BASE_URL}/health/live`,
      connections: conn,
      duration: 10,
      pipelining: 1,
    });

    const result = await instance;

    console.log(
      `  Req/sec: ${result.requests.average}, P99: ${result.latency.p99}ms, Errors: ${result.errors}`
    );

    // Stop if error rate exceeds 5%
    if (result.errors / result.requests.total > 0.05) {
      console.log(`\n⚠️  Breaking point reached at ${conn} connections`);
      console.log(`   Error rate: ${((result.errors / result.requests.total) * 100).toFixed(2)}%`);
      break;
    }
  }
}

// Main execution
const args = process.argv.slice(2);
const mode = args[0] || 'normal';

if (mode === 'stress') {
  runStressTest().catch(console.error);
} else {
  runAllTests().catch(console.error);
}
