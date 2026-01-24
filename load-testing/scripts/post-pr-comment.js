/**
 * Post Load Test Results to PR
 *
 * This script is used by GitHub Actions to post a summary comment
 * on pull requests after load tests complete.
 *
 * Usage:
 *   node scripts/post-pr-comment.js <test_type> <results_path>
 *
 * Environment variables required:
 *   - GITHUB_TOKEN: GitHub token for API access
 *   - GITHUB_REPOSITORY: Repository in format owner/repo
 *   - PR_NUMBER: Pull request number
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse k6 JSON results file
 * @param {string} filePath - Path to the results JSON file
 * @returns {object|null} - Parsed results or null if failed
 */
function parseK6Results(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');

    // k6 JSON output is newline-delimited JSON
    const metrics = {
      http_reqs: 0,
      http_req_duration_avg: 0,
      http_req_duration_p95: 0,
      http_req_failed: 0,
      checks_passed: 0,
      checks_failed: 0,
    };

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type === 'Point' && data.metric) {
          switch (data.metric) {
            case 'http_reqs':
              metrics.http_reqs++;
              break;
            case 'http_req_duration':
              // Accumulate for averaging
              break;
            case 'http_req_failed':
              if (data.data.value === 1) metrics.http_req_failed++;
              break;
            case 'checks':
              if (data.data.value === 1) {
                metrics.checks_passed++;
              } else {
                metrics.checks_failed++;
              }
              break;
          }
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    }

    return metrics;
  } catch (error) {
    console.error(`Error parsing results: ${error.message}`);
    return null;
  }
}

/**
 * Generate markdown summary for test results
 * @param {string} testType - Type of test (smoke, load, stress, soak)
 * @param {object|null} metrics - Parsed metrics or null
 * @returns {string} - Markdown formatted summary
 */
function generateSummary(testType, metrics) {
  const icons = {
    smoke: '🔥',
    load: '📊',
    stress: '💪',
    soak: '🏊',
  };

  const icon = icons[testType] || '🧪';
  let summary = `## ${icon} ${testType.charAt(0).toUpperCase() + testType.slice(1)} Test Results\n\n`;

  if (!metrics) {
    summary += '✅ Tests completed. Check artifacts for detailed results.\n';
    return summary;
  }

  const totalChecks = metrics.checks_passed + metrics.checks_failed;
  const passRate = totalChecks > 0 ? ((metrics.checks_passed / totalChecks) * 100).toFixed(1) : 0;
  const errorRate = metrics.http_reqs > 0 ? ((metrics.http_req_failed / metrics.http_reqs) * 100).toFixed(2) : 0;

  // Determine overall status
  const passed = parseFloat(errorRate) < 5 && parseFloat(passRate) > 80;
  const statusIcon = passed ? '✅' : '⚠️';
  const statusText = passed ? 'Passed' : 'Needs Attention';

  summary += `### Status: ${statusIcon} ${statusText}\n\n`;

  summary += '| Metric | Value |\n';
  summary += '|--------|-------|\n';
  summary += `| Total Requests | ${metrics.http_reqs} |\n`;
  summary += `| Failed Requests | ${metrics.http_req_failed} |\n`;
  summary += `| Error Rate | ${errorRate}% |\n`;
  summary += `| Checks Passed | ${metrics.checks_passed}/${totalChecks} (${passRate}%) |\n`;

  summary += '\n> 📦 Download the artifacts for detailed JSON results and metrics.\n';

  return summary;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'smoke';
  const resultsPath = args[1] || 'results/';

  console.log(`Generating PR comment for ${testType} tests...`);
  console.log(`Results path: ${resultsPath}`);

  // Try to find and parse results
  let metrics = null;
  if (fs.existsSync(resultsPath)) {
    const files = fs.readdirSync(resultsPath).filter((f) => f.endsWith('.json'));
    if (files.length > 0) {
      const latestFile = path.join(resultsPath, files[files.length - 1]);
      metrics = parseK6Results(latestFile);
    }
  }

  // Generate summary
  const summary = generateSummary(testType, metrics);

  // Output for GitHub Actions
  console.log('\n--- Generated Summary ---');
  console.log(summary);

  // Write to file for GitHub Actions to use
  const outputFile = process.env.GITHUB_OUTPUT || '/dev/stdout';
  if (process.env.GITHUB_OUTPUT) {
    // Escape newlines for GitHub Actions output
    const escapedSummary = summary.replace(/\n/g, '%0A').replace(/\r/g, '%0D');
    fs.appendFileSync(outputFile, `summary=${escapedSummary}\n`);
  }

  // Also write raw summary to a file
  fs.writeFileSync('pr-comment-body.md', summary);
  console.log('\nSummary written to pr-comment-body.md');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
