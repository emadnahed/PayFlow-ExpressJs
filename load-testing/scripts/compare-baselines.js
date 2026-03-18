#!/usr/bin/env node

/**
 * PayFlow Performance Baseline Comparison
 *
 * Compares current test results against stored baselines to detect regressions.
 *
 * Usage:
 *   node scripts/compare-baselines.js <current-results.json> [baseline.json]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node compare-baselines.js <current-results.json> [baseline.json]');
  process.exit(1);
}

const currentFile = args[0];
const baselineFile = args[1] || 'baselines/latest.json';

// Regression thresholds (percentage increase allowed)
const THRESHOLDS = {
  response_time_p95: 20, // 20% increase allowed
  response_time_p99: 25,
  error_rate: 50,        // 50% relative increase allowed (e.g., 1% to 1.5%)
  rps: -10,              // 10% decrease allowed (negative means decrease is bad)
};

/**
 * Load JSON file
 */
function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Calculate percentage change
 */
function percentChange(current, baseline) {
  if (baseline === 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / baseline) * 100;
}

/**
 * Check if regression detected
 */
function isRegression(metricName, change) {
  const threshold = THRESHOLDS[metricName];
  if (threshold === undefined) return false;

  if (threshold < 0) {
    // For metrics where decrease is bad (like RPS)
    return change < threshold;
  } else {
    // For metrics where increase is bad (like response time)
    return change > threshold;
  }
}

/**
 * Format change for display
 */
function formatChange(change) {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Compare metrics
 */
function compareMetrics(current, baseline) {
  const results = [];

  // Response time comparisons
  const rtMetrics = ['p50', 'p90', 'p95', 'p99', 'avg'];
  for (const metric of rtMetrics) {
    if (current.response_time && baseline.response_time) {
      const change = percentChange(
        current.response_time[metric],
        baseline.response_time[metric]
      );

      results.push({
        metric: `response_time_${metric}`,
        current: current.response_time[metric],
        baseline: baseline.response_time[metric],
        change,
        regression: isRegression(`response_time_${metric}`, change),
      });
    }
  }

  // Error rate comparison
  if (current.error_rate !== undefined && baseline.error_rate !== undefined) {
    const change = percentChange(current.error_rate, baseline.error_rate);
    results.push({
      metric: 'error_rate',
      current: current.error_rate,
      baseline: baseline.error_rate,
      change,
      regression: isRegression('error_rate', change),
    });
  }

  // RPS comparison
  if (
    current.requests_per_second !== undefined &&
    baseline.requests_per_second !== undefined
  ) {
    const change = percentChange(
      current.requests_per_second,
      baseline.requests_per_second
    );
    results.push({
      metric: 'requests_per_second',
      current: current.requests_per_second,
      baseline: baseline.requests_per_second,
      change,
      regression: isRegression('rps', change),
    });
  }

  return results;
}

/**
 * Print comparison report
 */
function printReport(results) {
  console.log('\n=== Performance Comparison Report ===\n');

  const hasRegression = results.some((r) => r.regression);

  console.log('Metric'.padEnd(25) + 'Current'.padEnd(15) + 'Baseline'.padEnd(15) + 'Change'.padEnd(12) + 'Status');
  console.log('-'.repeat(75));

  for (const result of results) {
    const status = result.regression ? '❌ REGRESSION' : '✅ OK';
    const currentStr =
      typeof result.current === 'number'
        ? result.current.toFixed(2)
        : result.current;
    const baselineStr =
      typeof result.baseline === 'number'
        ? result.baseline.toFixed(2)
        : result.baseline;

    console.log(
      result.metric.padEnd(25) +
        currentStr.toString().padEnd(15) +
        baselineStr.toString().padEnd(15) +
        formatChange(result.change).padEnd(12) +
        status
    );
  }

  console.log('\n' + '-'.repeat(75));

  if (hasRegression) {
    console.log('\n⚠️  PERFORMANCE REGRESSION DETECTED!\n');
    console.log('Regressions found in:');
    results
      .filter((r) => r.regression)
      .forEach((r) => {
        console.log(`  - ${r.metric}: ${formatChange(r.change)}`);
      });
    return 1; // Exit code 1 for regression
  } else {
    console.log('\n✅ No performance regressions detected.\n');
    return 0;
  }
}

/**
 * Save current results as new baseline
 */
function saveBaseline(current, baselinePath) {
  const baselineDir = path.dirname(baselinePath);
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }

  // Save with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historicalPath = path.join(baselineDir, `baseline_${timestamp}.json`);

  fs.writeFileSync(historicalPath, JSON.stringify(current, null, 2));
  fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2));

  console.log(`Baseline saved: ${baselinePath}`);
  console.log(`Historical backup: ${historicalPath}`);
}

// Main execution
try {
  const current = loadJson(currentFile);
  if (!current) {
    console.error(`Could not load current results: ${currentFile}`);
    process.exit(1);
  }

  const baseline = loadJson(baselineFile);

  if (!baseline) {
    console.log(`No baseline found at ${baselineFile}`);
    console.log('Saving current results as new baseline...');
    saveBaseline(current, baselineFile);
    process.exit(0);
  }

  const results = compareMetrics(current, baseline);
  const exitCode = printReport(results);

  // Ask to update baseline if no regression
  if (exitCode === 0 && process.argv.includes('--update-baseline')) {
    saveBaseline(current, baselineFile);
  }

  process.exit(exitCode);
} catch (error) {
  console.error('Error comparing baselines:', error.message);
  process.exit(1);
}
