/* global process */
// Suppress dotenvx tip logs in test output.
// Must be in setupFiles (not setupFilesAfterEnv) so this env var is set
// before any test module is loaded and calls dotenv.config().
process.env.DOTENV_CONFIG_QUIET = 'true';
