/**
 * Configuration loader
 * Loads environment-specific configuration based on ENV variable
 *
 * Available environments:
 * - local: Local development (non-Docker)
 * - docker-local: Docker containers on local machine
 * - vps: Docker containers on VPS/remote server
 * - staging: Staging environment
 * - production: Production environment
 */
import { config as localConfig } from './environments/local.js';
import { config as dockerLocalConfig } from './environments/docker-local.js';
import { config as vpsConfig } from './environments/vps.js';
import { config as stagingConfig } from './environments/staging.js';
import { config as productionConfig } from './environments/production.js';

const configs = {
  local: localConfig,
  'docker-local': dockerLocalConfig,
  'docker': dockerLocalConfig, // Alias
  vps: vpsConfig,
  staging: stagingConfig,
  production: productionConfig,
};

const env = __ENV.ENV || 'local';
export const config = configs[env] || localConfig;

export function getConfig() {
  return config;
}

export function getBaseUrl() {
  return config.baseUrl;
}

export function getThresholds() {
  return config.thresholds;
}

export function getDefaultOptions() {
  return config.defaultOptions;
}

export default config;
