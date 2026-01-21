#!/usr/bin/env node

/**
 * PayFlow Load Test Report Generator
 *
 * Generates HTML reports from k6 JSON output files.
 *
 * Usage:
 *   node scripts/generate-report.js <json-file>
 *   node scripts/generate-report.js results/test_results.json
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node generate-report.js <json-file>');
  console.error('Example: node generate-report.js results/test_results.json');
  process.exit(1);
}

const inputFile = args[0];
const outputDir = args[1] || 'reports';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Parse k6 JSON output (line-delimited JSON)
 */
function parseK6JsonOutput(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');

  const metrics = {
    http_req_duration: [],
    http_req_failed: [],
    http_reqs: [],
    vus: [],
    iterations: [],
    data_received: 0,
    data_sent: 0,
    checks: { passed: 0, failed: 0 },
    custom: {},
  };

  const timestamps = [];
  const points = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      if (entry.type === 'Point') {
        const point = entry.data;
        timestamps.push(new Date(entry.data.time));

        if (point.metric === 'http_req_duration') {
          metrics.http_req_duration.push(point.value);
        } else if (point.metric === 'http_req_failed') {
          metrics.http_req_failed.push(point.value);
        } else if (point.metric === 'http_reqs') {
          metrics.http_reqs.push(point.value);
        } else if (point.metric === 'vus') {
          metrics.vus.push(point.value);
        } else if (point.metric === 'iterations') {
          metrics.iterations.push(point.value);
        } else if (point.metric === 'data_received') {
          metrics.data_received += point.value;
        } else if (point.metric === 'data_sent') {
          metrics.data_sent += point.value;
        } else if (point.metric === 'checks') {
          if (point.tags && point.tags.check) {
            if (point.value === 1) {
              metrics.checks.passed++;
            } else {
              metrics.checks.failed++;
            }
          }
        } else {
          // Custom metrics
          if (!metrics.custom[point.metric]) {
            metrics.custom[point.metric] = [];
          }
          metrics.custom[point.metric].push(point.value);
        }

        points.push(point);
      } else if (entry.type === 'Metric') {
        // Store metric metadata
      }
    } catch (e) {
      // Skip invalid lines
    }
  }

  return { metrics, timestamps, points };
}

/**
 * Calculate statistics for an array of values
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;

  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / count;

  const percentile = (p) => {
    const index = Math.ceil((p / 100) * count) - 1;
    return sorted[Math.max(0, Math.min(index, count - 1))];
  };

  return {
    min: sorted[0],
    max: sorted[count - 1],
    avg: avg,
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    count: count,
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Generate HTML report
 */
function generateHtmlReport(data, outputPath) {
  const { metrics, timestamps } = data;
  const durationStats = calculateStats(metrics.http_req_duration);
  const totalRequests = metrics.http_reqs.length;
  const failedRequests = metrics.http_req_failed.filter((v) => v === 1).length;
  const errorRate = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(2) : 0;

  const testDuration =
    timestamps.length > 1
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
      : 0;

  const rps = testDuration > 0 ? (totalRequests / testDuration).toFixed(2) : 0;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PayFlow Load Test Report</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .header h1 {
            font-size: 2rem;
            margin-bottom: 10px;
        }
        .header .meta {
            opacity: 0.9;
            font-size: 0.9rem;
        }
        .card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin-bottom: 20px;
        }
        .card h2 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.2rem;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 10px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .metric-box {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }
        .metric-box .value {
            font-size: 1.8rem;
            font-weight: bold;
            color: #667eea;
        }
        .metric-box .label {
            font-size: 0.85rem;
            color: #666;
            margin-top: 5px;
        }
        .metric-box.success .value { color: #28a745; }
        .metric-box.warning .value { color: #ffc107; }
        .metric-box.danger .value { color: #dc3545; }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #555;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        .status-pass { background: #d4edda; color: #155724; }
        .status-fail { background: #f8d7da; color: #721c24; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>PayFlow Load Test Report</h1>
            <div class="meta">
                Generated: ${new Date().toISOString()}<br>
                Test Duration: ${testDuration.toFixed(2)} seconds
            </div>
        </div>

        <div class="card">
            <h2>Overview</h2>
            <div class="metrics-grid">
                <div class="metric-box">
                    <div class="value">${totalRequests.toLocaleString()}</div>
                    <div class="label">Total Requests</div>
                </div>
                <div class="metric-box ${errorRate < 1 ? 'success' : errorRate < 5 ? 'warning' : 'danger'}">
                    <div class="value">${errorRate}%</div>
                    <div class="label">Error Rate</div>
                </div>
                <div class="metric-box">
                    <div class="value">${rps}</div>
                    <div class="label">Requests/sec</div>
                </div>
                <div class="metric-box">
                    <div class="value">${formatDuration(durationStats.avg)}</div>
                    <div class="label">Avg Response Time</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Response Time Distribution</h2>
            <div class="metrics-grid">
                <div class="metric-box">
                    <div class="value">${formatDuration(durationStats.min)}</div>
                    <div class="label">Min</div>
                </div>
                <div class="metric-box">
                    <div class="value">${formatDuration(durationStats.p50)}</div>
                    <div class="label">Median (p50)</div>
                </div>
                <div class="metric-box ${durationStats.p90 < 1000 ? 'success' : 'warning'}">
                    <div class="value">${formatDuration(durationStats.p90)}</div>
                    <div class="label">p90</div>
                </div>
                <div class="metric-box ${durationStats.p95 < 1000 ? 'success' : durationStats.p95 < 2000 ? 'warning' : 'danger'}">
                    <div class="value">${formatDuration(durationStats.p95)}</div>
                    <div class="label">p95</div>
                </div>
                <div class="metric-box ${durationStats.p99 < 2000 ? 'success' : 'danger'}">
                    <div class="value">${formatDuration(durationStats.p99)}</div>
                    <div class="label">p99</div>
                </div>
                <div class="metric-box">
                    <div class="value">${formatDuration(durationStats.max)}</div>
                    <div class="label">Max</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Data Transfer</h2>
            <div class="metrics-grid">
                <div class="metric-box">
                    <div class="value">${formatBytes(metrics.data_received)}</div>
                    <div class="label">Data Received</div>
                </div>
                <div class="metric-box">
                    <div class="value">${formatBytes(metrics.data_sent)}</div>
                    <div class="label">Data Sent</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Checks</h2>
            <div class="metrics-grid">
                <div class="metric-box success">
                    <div class="value">${metrics.checks.passed}</div>
                    <div class="label">Passed</div>
                </div>
                <div class="metric-box ${metrics.checks.failed === 0 ? 'success' : 'danger'}">
                    <div class="value">${metrics.checks.failed}</div>
                    <div class="label">Failed</div>
                </div>
            </div>
        </div>

        ${
          Object.keys(metrics.custom).length > 0
            ? `
        <div class="card">
            <h2>Custom Metrics</h2>
            <table>
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Count</th>
                        <th>Avg</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>p95</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(metrics.custom)
                      .map(([name, values]) => {
                        const stats = calculateStats(values);
                        return `
                        <tr>
                            <td>${name}</td>
                            <td>${stats.count}</td>
                            <td>${stats.avg.toFixed(2)}</td>
                            <td>${stats.min.toFixed(2)}</td>
                            <td>${stats.max.toFixed(2)}</td>
                            <td>${stats.p95.toFixed(2)}</td>
                        </tr>
                        `;
                      })
                      .join('')}
                </tbody>
            </table>
        </div>
        `
            : ''
        }

        <div class="footer">
            <p>Generated by PayFlow Load Testing Suite</p>
            <p>Powered by k6</p>
        </div>
    </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  console.log(`Report generated: ${outputPath}`);
}

/**
 * Generate JSON summary report
 */
function generateJsonSummary(data, outputPath) {
  const { metrics, timestamps } = data;
  const durationStats = calculateStats(metrics.http_req_duration);
  const totalRequests = metrics.http_reqs.length;
  const failedRequests = metrics.http_req_failed.filter((v) => v === 1).length;

  const testDuration =
    timestamps.length > 1
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
      : 0;

  const summary = {
    generated_at: new Date().toISOString(),
    test_duration_seconds: testDuration,
    total_requests: totalRequests,
    failed_requests: failedRequests,
    error_rate: totalRequests > 0 ? failedRequests / totalRequests : 0,
    requests_per_second: testDuration > 0 ? totalRequests / testDuration : 0,
    response_time: {
      min: durationStats.min,
      max: durationStats.max,
      avg: durationStats.avg,
      p50: durationStats.p50,
      p90: durationStats.p90,
      p95: durationStats.p95,
      p99: durationStats.p99,
    },
    data_transfer: {
      received_bytes: metrics.data_received,
      sent_bytes: metrics.data_sent,
    },
    checks: {
      passed: metrics.checks.passed,
      failed: metrics.checks.failed,
    },
    custom_metrics: {},
  };

  // Add custom metrics
  for (const [name, values] of Object.entries(metrics.custom)) {
    summary.custom_metrics[name] = calculateStats(values);
  }

  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`JSON summary generated: ${outputPath}`);
}

// Main execution
try {
  console.log(`Processing: ${inputFile}`);

  const data = parseK6JsonOutput(inputFile);

  const baseName = path.basename(inputFile, '.json');
  const htmlPath = path.join(outputDir, `${baseName}_report.html`);
  const jsonPath = path.join(outputDir, `${baseName}_summary.json`);

  generateHtmlReport(data, htmlPath);
  generateJsonSummary(data, jsonPath);

  console.log('\nReport generation complete!');
} catch (error) {
  console.error('Error generating report:', error.message);
  process.exit(1);
}
