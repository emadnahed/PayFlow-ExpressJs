/* global process */
// This file runs in setupFiles — BEFORE setupFilesAfterEnv (setup.ts) is loaded.
// That means it runs before any module imports in setup.ts are evaluated.
//
// CRITICAL: src/config/environments.ts captures REDIS_PORT / MONGODB_URI as
// constants at module load time. setup.ts imports eventBus → config →
// environments.ts, so by the time setup.ts's executable code runs, those
// constants are already frozen. Setting them HERE ensures the config module
// sees the correct values on first evaluation.
//
// CI overrides: TEST_REDIS_PORT=6379, TEST_MONGODB_URI=mongodb://localhost:27017/...
// Local Docker:  no TEST_* vars set, falls back to docker-compose.test.yml ports
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27018/payflow_test';
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || '6380';
