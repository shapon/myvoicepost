/**
 * Privacy Protection Utilities
 * 
 * Comprehensive privacy protection measures to prevent data leaks and
 * ensure user privacy is maintained throughout the application.
 */

/**
 * Data Classification Levels
 */
export enum PrivacyLevel {
  PUBLIC = 'public',           // Can be logged/shared
  INTERNAL = 'internal',       // Internal use only
  CONFIDENTIAL = 'confidential', // User data
  RESTRICTED = 'restricted',   // Sensitive user data
  CRITICAL = 'critical',       // Authentication/payment data
}

/**
 * Sensitive data patterns to detect and redact
 */
const SENSITIVE_PATTERNS = {
  // Authentication
  password: /password/i,
  token: /token|bearer|authorization/i,
  apiKey: /api[_-]?key|secret/i,
  
  // Personal Information
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  phone: /(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}/,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  
  // Financial
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  
  // Location
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  coordinates: /[-+]?\d{1,2}\.\d+,\s*[-+]?\d{1,3}\.\d+/,
};

/**
 * Fields that should never be logged or transmitted unnecessarily
 */
const SENSITIVE_FIELD_NAMES = [
  'password',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'oldPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'privateKey',
  'creditCard',
  'cvv',
  'ssn',
  'pin',
  'otp',
  'securityAnswer',
];

/**
 * Check if a field name is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return SENSITIVE_FIELD_NAMES.some(sensitive => 
    lowerField.includes(sensitive.toLowerCase())
  );
}

/**
 * Redact sensitive information from a string
 */
export function redactSensitiveData(data: string): string {
  let redacted = data;

  // Redact email addresses
  redacted = redacted.replace(SENSITIVE_PATTERNS.email, '[EMAIL_REDACTED]');
  
  // Redact phone numbers
  redacted = redacted.replace(SENSITIVE_PATTERNS.phone, '[PHONE_REDACTED]');
  
  // Redact credit cards
  redacted = redacted.replace(SENSITIVE_PATTERNS.creditCard, '[CARD_REDACTED]');
  
  // Redact IP addresses
  redacted = redacted.replace(SENSITIVE_PATTERNS.ipAddress, '[IP_REDACTED]');
  
  // Redact coordinates
  redacted = redacted.replace(SENSITIVE_PATTERNS.coordinates, '[LOCATION_REDACTED]');

  return redacted;
}

/**
 * Sanitize an object for logging by redacting sensitive fields
 */
export function sanitizeForLogging(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return redactSensitiveData(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item));
  }

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else if (typeof value === 'string') {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Remove sensitive fields from an object entirely
 */
export function stripSensitiveFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => stripSensitiveFields(item));
  }

  const cleaned: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (!isSensitiveField(key)) {
      if (typeof value === 'object' && value !== null) {
        cleaned[key] = stripSensitiveFields(value);
      } else {
        cleaned[key] = value;
      }
    }
  }

  return cleaned;
}

/**
 * Mask sensitive strings (show only last 4 characters)
 */
export function maskString(str: string, visibleChars: number = 4): string {
  if (!str || str.length <= visibleChars) {
    return '***';
  }
  
  const masked = '*'.repeat(str.length - visibleChars);
  const visible = str.slice(-visibleChars);
  
  return masked + visible;
}

/**
 * Mask email address (show only domain)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return '[EMAIL]';
  }
  
  const [_, domain] = email.split('@');
  return `***@${domain}`;
}

/**
 * Mask phone number (show only last 4 digits)
 */
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) {
    return '***';
  }
  return `***-***-${digits.slice(-4)}`;
}

/**
 * Privacy-safe logger that automatically redacts sensitive data
 */
export class PrivacyLogger {
  private static shouldLog(): boolean {
    return __DEV__;
  }

  static log(message: string, data?: any) {
    if (!this.shouldLog()) return;
    
    if (data) {
      const sanitized = sanitizeForLogging(data);
      console.log(`[Privacy-Safe] ${message}`, sanitized);
    } else {
      console.log(`[Privacy-Safe] ${message}`);
    }
  }

  static warn(message: string, data?: any) {
    if (data) {
      const sanitized = sanitizeForLogging(data);
      console.warn(`[Privacy-Safe] ${message}`, sanitized);
    } else {
      console.warn(`[Privacy-Safe] ${message}`);
    }
  }

  static error(message: string, error?: any) {
    // Always log errors, but sanitize them
    if (error) {
      const sanitized = sanitizeForLogging(error);
      console.error(`[Privacy-Safe] ${message}`, sanitized);
    } else {
      console.error(`[Privacy-Safe] ${message}`);
    }
  }
}

/**
 * Data anonymization for analytics
 */
export function anonymizeUser(user: any): any {
  if (!user) return null;

  return {
    id: hashUserId(user.id), // One-way hash
    userType: user.userType || 'standard',
    createdAt: user.createdAt,
    // No email, username, or other PII
  };
}

/**
 * Simple hash function for user IDs (one-way)
 */
function hashUserId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `user_${Math.abs(hash).toString(36)}`;
}

/**
 * Check if data contains PII
 */
export function containsPII(data: any): boolean {
  const str = JSON.stringify(data).toLowerCase();
  
  // Check for email patterns
  if (SENSITIVE_PATTERNS.email.test(str)) return true;
  
  // Check for phone patterns
  if (SENSITIVE_PATTERNS.phone.test(str)) return true;
  
  // Check for credit card patterns
  if (SENSITIVE_PATTERNS.creditCard.test(str)) return true;
  
  // Check for sensitive field names
  for (const field of SENSITIVE_FIELD_NAMES) {
    if (str.includes(field.toLowerCase())) return true;
  }
  
  return false;
}

/**
 * Privacy consent tracking
 */
export interface PrivacyConsent {
  analytics: boolean;
  crashReporting: boolean;
  personalization: boolean;
  marketing: boolean;
  timestamp: string;
}

/**
 * Validate that required privacy consents are obtained
 */
export function hasRequiredConsents(consents: PrivacyConsent): boolean {
  // At minimum, user must consent to basic functionality
  return consents.analytics !== undefined && consents.crashReporting !== undefined;
}

/**
 * Audio privacy protection
 */
export class AudioPrivacy {
  /**
   * Check if audio recording contains sensitive information
   * (This is a placeholder - actual implementation would use audio analysis)
   */
  static async analyzeSensitivity(audioData: string): Promise<{
    containsSensitiveInfo: boolean;
    shouldWarn: boolean;
  }> {
    // In production, this would use audio analysis
    // For now, just return safe defaults
    return {
      containsSensitiveInfo: false,
      shouldWarn: false,
    };
  }

  /**
   * Get user consent before recording
   */
  static shouldRequestConsent(): boolean {
    // Always request consent for recording
    return true;
  }
}

/**
 * Network request privacy validator
 */
export class NetworkPrivacy {
  /**
   * Validate that request doesn't contain PII in URL
   */
  static validateRequest(url: string, data: any): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check URL for PII
    if (containsPII(url)) {
      issues.push('URL contains potential PII');
    }

    // Check data for unencrypted sensitive info
    if (data && containsPII(data)) {
      // This is okay if it's in the body (encrypted via HTTPS)
      // But warn in development
      if (__DEV__) {
        PrivacyLogger.warn('Request contains PII - ensure HTTPS is used');
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Sanitize headers for logging
   */
  static sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    
    // Remove authorization headers
    delete sanitized.Authorization;
    delete sanitized.authorization;
    
    // Remove any other sensitive headers
    delete sanitized['X-API-Key'];
    delete sanitized['x-api-key'];
    
    return sanitized;
  }
}

/**
 * Storage privacy utilities
 */
export class StoragePrivacy {
  /**
   * Keys that should be stored securely (encrypted storage)
   */
  static readonly SECURE_KEYS = [
    'authToken',
    'refreshToken',
    'userCredentials',
    'apiKey',
  ];

  /**
   * Check if a key should use secure storage
   */
  static requiresSecureStorage(key: string): boolean {
    return this.SECURE_KEYS.some(secureKey => 
      key.toLowerCase().includes(secureKey.toLowerCase())
    );
  }

  /**
   * Validate storage key doesn't expose PII
   */
  static validateStorageKey(key: string): boolean {
    // Keys shouldn't contain user identifiable information
    const lowerKey = key.toLowerCase();
    return !lowerKey.includes('email') && 
           !lowerKey.includes('phone') && 
           !lowerKey.includes('name');
  }
}

/**
 * Export control - what data can leave the device
 */
export class ExportPrivacy {
  /**
   * Prepare data for export (ensure privacy)
   */
  static prepareForExport(data: any): any {
    // Strip all sensitive fields
    const cleaned = stripSensitiveFields(data);
    
    // Add privacy notice
    return {
      _privacyNotice: 'This export has been sanitized for privacy',
      _timestamp: new Date().toISOString(),
      data: cleaned,
    };
  }

  /**
   * Check if export is allowed
   */
  static canExport(dataType: string): boolean {
    const restrictedTypes = ['credentials', 'tokens', 'keys'];
    return !restrictedTypes.includes(dataType.toLowerCase());
  }
}

/**
 * Privacy compliance helper
 */
export class PrivacyCompliance {
  /**
   * GDPR - Right to be forgotten
   */
  static async deleteUserData(userId: string): Promise<void> {
    // Clear all local storage
    // Clear all cached data
    // Request server deletion
    PrivacyLogger.log('User data deletion requested', { userId: hashUserId(userId) });
  }

  /**
   * GDPR - Right to data portability
   */
  static async exportUserData(userId: string): Promise<any> {
    // Collect user's data
    // Sanitize for export
    // Return in machine-readable format
    PrivacyLogger.log('User data export requested', { userId: hashUserId(userId) });
  }

  /**
   * CCPA - Do Not Sell
   */
  static async setDoNotSell(userId: string, doNotSell: boolean): Promise<void> {
    PrivacyLogger.log('Do Not Sell preference updated', { 
      userId: hashUserId(userId), 
      doNotSell 
    });
  }
}
