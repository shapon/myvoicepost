/**
 * SSL Pinning & Certificate Verification Utilities
 * 
 * For React Native / Expo managed workflow:
 * 
 * Android: Network security config plugin handles native-level pinning
 *          (see plugins/withNetworkSecurity.js)
 * 
 * iOS: App Transport Security (ATS) enforces HTTPS by default.
 *      For full certificate pinning on iOS, use TrustKit via
 *      expo-build-properties or a custom native module.
 * 
 * This module provides an application-level verification layer
 * that works alongside the native pinning mechanisms.
 */

import { secureLog } from './secureLogger';

const ALLOWED_HOSTS = [
  'www.myvoicepost.com',
  'myvoicepost.com',
];

export function isAllowedHost(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      secureLog.warn('[SSL] Blocked non-HTTPS request to:', parsed.hostname);
      return false;
    }

    const isAllowed = ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );

    if (!isAllowed) {
      secureLog.warn('[SSL] Request to unknown host blocked:', parsed.hostname);
    }

    return isAllowed;
  } catch {
    secureLog.error('[SSL] Invalid URL format');
    return false;
  }
}

export function enforceHttps(url: string): string {
  if (url.startsWith('http://')) {
    secureLog.warn('[SSL] Upgrading HTTP to HTTPS for:', url);
    return url.replace('http://', 'https://');
  }
  return url;
}

/**
 * Instructions for generating certificate pins:
 * 
 * 1. Get the current certificate pin:
 *    openssl s_client -connect www.myvoicepost.com:443 -servername www.myvoicepost.com </dev/null 2>/dev/null \
 *      | openssl x509 -pubkey -noout \
 *      | openssl pkey -pubin -outform der \
 *      | openssl dgst -sha256 -binary \
 *      | openssl enc -base64
 * 
 * 2. Get the intermediate CA pin (backup):
 *    openssl s_client -connect www.myvoicepost.com:443 -servername www.myvoicepost.com -showcerts </dev/null 2>/dev/null \
 *      | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' \
 *      | awk 'BEGIN{c=0} /-----BEGIN/{c++} c==2{print}' \
 *      | openssl x509 -pubkey -noout \
 *      | openssl pkey -pubin -outform der \
 *      | openssl dgst -sha256 -binary \
 *      | openssl enc -base64
 * 
 * 3. Update the pins in:
 *    - plugins/withNetworkSecurity.js (Android native pinning)
 *    - Verify connectivity after every cert rotation
 * 
 * 4. Always include at least one backup pin (intermediate CA)
 *    to prevent lockout during certificate rotation.
 * 
 * 5. Set an expiration date that gives you time to rotate pins
 *    before the certificate expires.
 */
