/**
 * API Client for CLI
 * Handles HTTP communication with the backend API
 */

const http = require('http');

// Determine API base URL from environment or default
const API_BASE = process.env.AGENT_FLEET_API || 'http://localhost:3000';
const API_HOST = new URL(API_BASE).hostname;
const API_PORT = new URL(API_BASE).port || (API_BASE.startsWith('https') ? 443 : 3000);

/**
 * Make HTTP GET request
 */
async function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Connection error: ${error.message}. Is the server running at ${API_BASE}?`));
    });

    req.end();
  });
}

/**
 * Make HTTP POST request
 */
async function post(path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Connection error: ${error.message}. Is the server running at ${API_BASE}?`));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = {
  get,
  post,
  API_BASE
};
