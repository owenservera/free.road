/**
 * CLI Configuration
 * Manages configuration settings for the agent-fleet CLI
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.agent-fleet');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000
  },
  output: {
    format: 'table', // table, json, csv
    color: true
  },
  dashboard: {
    port: 3030,
    autoOpen: false
  }
};

/**
 * Load configuration from file
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.warn(`Warning: Could not load config from ${CONFIG_FILE}: ${error.message}`);
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving config: ${error.message}`);
    return false;
  }
}

/**
 * Get a specific config value
 */
function get(key) {
  const config = loadConfig();
  const keys = key.split('.');
  let value = config;

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Set a specific config value
 */
function set(key, value) {
  const config = loadConfig();
  const keys = key.split('.');
  let obj = config;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in obj) || typeof obj[k] !== 'object') {
      obj[k] = {};
    }
    obj = obj[k];
  }

  obj[keys[keys.length - 1]] = value;
  return saveConfig(config);
}

/**
 * Reset configuration to defaults
 */
function reset() {
  return saveConfig({ ...DEFAULT_CONFIG });
}

/**
 * Get configuration file path
 */
function getConfigPath() {
  return CONFIG_FILE;
}

module.exports = {
  loadConfig,
  saveConfig,
  get,
  set,
  reset,
  getConfigPath,
  DEFAULT_CONFIG,
  CONFIG_DIR,
  CONFIG_FILE
};
