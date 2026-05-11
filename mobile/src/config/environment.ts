/**
 * Environment Configuration for MyVoicePost Mobile App
 * 
 * PRODUCTION URL: https://www.myvoicepost.com
 * 
 * API Endpoints:
 *   - Public (no auth):     /api/v1/p/  (transcribe, polish, translate)
 *   - Authenticated:        /api/v1/a/  (auth, saved-texts, etc.)
 */

// TypeScript types
type EnvironmentName = 'development' | 'staging' | 'production';

interface EnvironmentConfig {
  baseUrl: string;
  publicApiUrl: string;
  authApiUrl: string;
  env: EnvironmentName;
}

// Production base URL
const PRODUCTION_URL = 'https://www.myvoicepost.com';

// For local development (uncomment as needed)
// const LOCALHOST_IP = '10.0.2.2'; // Android Emulator
// const LOCALHOST_IP = 'localhost'; // iOS Simulator  
// const LOCALHOST_IP = '192.168.1.100'; // Physical Device

const config: Record<EnvironmentName, EnvironmentConfig> = {
  development: {
    baseUrl: 'http://10.0.2.2:5000',
    publicApiUrl: 'http://10.0.2.2:5000/api/v1/p',
    authApiUrl: 'http://10.0.2.2:5000/api/v1/a',
    env: 'development',
  },
  staging: {
    baseUrl: 'https://staging.myvoicepost.com',
    publicApiUrl: 'https://staging.myvoicepost.com/api/v1/p',
    authApiUrl: 'https://staging.myvoicepost.com/api/v1/a',
    env: 'staging',
  },
  production: {
    baseUrl: PRODUCTION_URL,
    publicApiUrl: `${PRODUCTION_URL}/api/v1/p`,
    authApiUrl: `${PRODUCTION_URL}/api/v1/a`,
    env: 'production',
  },
};

// Current environment - PRODUCTION
const ENV: EnvironmentName = 'production';

// Create environment object
const environmentConfig: EnvironmentConfig = config[ENV];

// Log for debugging
console.log('[Environment] Using:', ENV, environmentConfig.baseUrl);

// Export as named export (for: import { environment } from ...)
export const environment = environmentConfig;

// Export as default (for: import environment from ...)
export default environmentConfig;

// Also export the type for use in other files
export type { EnvironmentConfig, EnvironmentName };
