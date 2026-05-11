/**
 * Input Sanitization and Security Validation
 *
 * This module provides comprehensive input validation and sanitization
 * to prevent XSS, SQL injection, and other security vulnerabilities.
 *
 * USAGE:
 * Call sanitizeApiInput() before any API call to validate and clean user input.
 */

export interface SanitizationResult {
  isValid: boolean;
  sanitizedValue: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Detect potentially malicious patterns in user input
 */
export class SecurityValidator {
  // HTML/Script injection patterns
  private static readonly HTML_TAGS_REGEX = /<[^>]*>/gi;
  private static readonly SCRIPT_TAGS_REGEX = /<script[^>]*>.*?<\/script>/gis;
  private static readonly STYLE_TAGS_REGEX = /<style[^>]*>.*?<\/style>/gis;
  private static readonly IFRAME_TAGS_REGEX = /<iframe[^>]*>.*?<\/iframe>/gis;

  // SQL injection patterns
  private static readonly SQL_KEYWORDS_REGEX = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|OR|AND)\b)/gi;
  private static readonly SQL_COMMENT_REGEX = /(--|#|\/\*|\*\/)/g;

  // JavaScript execution patterns
  private static readonly JS_PROTOCOL_REGEX = /javascript:/gi;
  private static readonly ONERROR_REGEX = /onerror\s*=/gi;
  private static readonly ONCLICK_REGEX = /on(click|load|error|mouseover|mouseout|focus|blur|change|submit)\s*=/gi;

  // URL/Link patterns
  private static readonly URL_REGEX = /(https?:\/\/|ftp:\/\/|www\.)[^\s]+/gi;

  // Special characters that might be used maliciously
  private static readonly DANGEROUS_CHARS_REGEX = /[<>\"'`;\{\}\[\]\\]/g;

  // Excessive whitespace or control characters
  private static readonly CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F-\x9F]/g;

  /**
   * Check for HTML tags
   */
  static hasHtmlTags(input: string): boolean {
    return this.HTML_TAGS_REGEX.test(input);
  }

  /**
   * Check for script tags
   */
  static hasScriptTags(input: string): boolean {
    return this.SCRIPT_TAGS_REGEX.test(input);
  }

  /**
   * Check for SQL injection attempts
   */
  static hasSqlInjection(input: string): boolean {
    // Check for SQL keywords combined with quotes or special chars
    const hasSqlKeywords = this.SQL_KEYWORDS_REGEX.test(input);
    const hasSqlComments = this.SQL_COMMENT_REGEX.test(input);

    // Only flag as potential SQL injection if we have both keywords and suspicious patterns
    return hasSqlKeywords && (hasSqlComments || input.includes("'") || input.includes('"'));
  }

  /**
   * Check for JavaScript execution attempts
   */
  static hasJavaScriptExecution(input: string): boolean {
    return (
      this.JS_PROTOCOL_REGEX.test(input) ||
      this.ONERROR_REGEX.test(input) ||
      this.ONCLICK_REGEX.test(input)
    );
  }

  /**
   * Check for embedded URLs/links
   */
  static hasUrls(input: string, allowUrls: boolean = false): boolean {
    if (allowUrls) return false;
    return this.URL_REGEX.test(input);
  }

  /**
   * Check for excessive dangerous characters
   */
  static hasDangerousCharacters(input: string): boolean {
    const matches = input.match(this.DANGEROUS_CHARS_REGEX);
    // Allow some special chars but flag if too many
    return matches ? matches.length > 3 : false;
  }

  /**
   * Remove HTML tags from input
   */
  static stripHtmlTags(input: string): string {
    return input.replace(this.HTML_TAGS_REGEX, '');
  }

  /**
   * Remove script tags from input
   */
  static stripScriptTags(input: string): string {
    return input
      .replace(this.SCRIPT_TAGS_REGEX, '')
      .replace(this.STYLE_TAGS_REGEX, '')
      .replace(this.IFRAME_TAGS_REGEX, '');
  }

  /**
   * Remove control characters
   */
  static stripControlCharacters(input: string): string {
    return input.replace(this.CONTROL_CHARS_REGEX, '');
  }

  /**
   * Encode HTML special characters
   */
  static encodeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
}

/**
 * Sanitization options for different input types
 */
export interface SanitizationOptions {
  // Field type
  fieldType?: 'email' | 'username' | 'password' | 'text' | 'url' | 'number' | 'phone';

  // Maximum length
  maxLength?: number;

  // Allow URLs in the input
  allowUrls?: boolean;

  // Allow some HTML (for rich text fields)
  allowHtml?: boolean;

  // Trim whitespace
  trim?: boolean;

  // Convert to lowercase
  toLowerCase?: boolean;

  // Required field
  required?: boolean;

  // Custom field name for error messages
  fieldName?: string;
}

/**
 * Main sanitization function
 * This should be called before any API request to validate and clean user input
 */
export function sanitizeApiInput(
  input: string | null | undefined,
  options: SanitizationOptions = {}
): SanitizationResult {
  const {
    fieldType = 'text',
    maxLength = 10000,
    allowUrls = false,
    allowHtml = false,
    trim = true,
    toLowerCase = false,
    required = true,
    fieldName = 'Input',
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitizedValue: string | null = null;

  // 1. Check if input exists
  if (input === null || input === undefined || input === '') {
    if (required) {
      errors.push(`${fieldName} is required`);
      return { isValid: false, sanitizedValue: null, errors, warnings };
    }
    return { isValid: true, sanitizedValue: '', errors, warnings };
  }

  // Convert to string and initial processing
  let cleanedValue = String(input);

  // 2. Trim whitespace if needed
  if (trim) {
    cleanedValue = cleanedValue.trim();
  }

  // 3. Check for empty after trim
  if (required && cleanedValue.length === 0) {
    errors.push(`${fieldName} cannot be empty`);
    return { isValid: false, sanitizedValue: null, errors, warnings };
  }

  // 4. Check maximum length
  if (cleanedValue.length > maxLength) {
    errors.push(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    return { isValid: false, sanitizedValue: null, errors, warnings };
  }

  // 5. Security checks
  const securityChecks = {
    hasScriptTags: SecurityValidator.hasScriptTags(cleanedValue),
    hasJsExecution: SecurityValidator.hasJavaScriptExecution(cleanedValue),
    hasSqlInjection: SecurityValidator.hasSqlInjection(cleanedValue),
    hasHtmlTags: !allowHtml && SecurityValidator.hasHtmlTags(cleanedValue),
    hasUrls: SecurityValidator.hasUrls(cleanedValue, allowUrls),
    hasDangerousChars: SecurityValidator.hasDangerousCharacters(cleanedValue),
  };

  // Block script tags (always dangerous)
  if (securityChecks.hasScriptTags) {
    errors.push(`${fieldName} contains potentially malicious script tags`);
  }

  // Block JavaScript execution attempts
  if (securityChecks.hasJsExecution) {
    errors.push(`${fieldName} contains potentially malicious JavaScript code`);
  }

  // Block SQL injection attempts
  if (securityChecks.hasSqlInjection) {
    errors.push(`${fieldName} contains potentially malicious SQL patterns`);
  }

  // Block or warn about HTML tags
  if (securityChecks.hasHtmlTags) {
    if (!allowHtml) {
      errors.push(`${fieldName} contains HTML tags which are not allowed`);
    } else {
      warnings.push(`${fieldName} contains HTML tags`);
    }
  }

  // Warn about URLs
  if (securityChecks.hasUrls && !allowUrls) {
    warnings.push(`${fieldName} contains URLs which may not be allowed`);
  }

  // Warn about dangerous characters
  if (securityChecks.hasDangerousChars) {
    warnings.push(`${fieldName} contains multiple special characters`);
  }

  // If we found errors, return immediately
  if (errors.length > 0) {
    return { isValid: false, sanitizedValue: null, errors, warnings };
  }

  // 6. Field-specific sanitization
  switch (fieldType) {
    case 'email':
      cleanedValue = cleanedValue.toLowerCase().trim();
      // Email-specific validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanedValue)) {
        errors.push('Invalid email format');
        return { isValid: false, sanitizedValue: null, errors, warnings };
      }
      break;

    case 'username':
      cleanedValue = cleanedValue.trim();
      // Username should only contain alphanumeric and underscores
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanedValue)) {
        errors.push('Username contains invalid characters');
        return { isValid: false, sanitizedValue: null, errors, warnings };
      }
      break;

    case 'password':
      // Don't trim passwords, don't convert case
      cleanedValue = String(input);
      // Check minimum length
      if (cleanedValue.length < 8) {
        errors.push('Password must be at least 8 characters');
        return { isValid: false, sanitizedValue: null, errors, warnings };
      }
      break;

    case 'url':
      cleanedValue = cleanedValue.trim();
      try {
        new URL(cleanedValue);
      } catch {
        errors.push('Invalid URL format');
        return { isValid: false, sanitizedValue: null, errors, warnings };
      }
      break;

    case 'number':
      cleanedValue = cleanedValue.trim();
      if (!/^\d+(\.\d+)?$/.test(cleanedValue)) {
        errors.push('Invalid number format');
        return { isValid: false, sanitizedValue: null, errors, warnings };
      }
      break;

    case 'phone':
      // Remove common phone formatting
      cleanedValue = cleanedValue.replace(/[\s\-\(\)]/g, '');
      if (!/^\d{10,15}$/.test(cleanedValue)) {
        errors.push('Invalid phone number format');
        return { isValid: false, sanitizedValue: null, errors, warnings };
      }
      break;

    case 'text':
    default:
      // General text sanitization
      // Remove script tags
      cleanedValue = SecurityValidator.stripScriptTags(cleanedValue);

      // Remove control characters
      cleanedValue = SecurityValidator.stripControlCharacters(cleanedValue);

      // If HTML is not allowed, strip HTML tags
      if (!allowHtml) {
        cleanedValue = SecurityValidator.stripHtmlTags(cleanedValue);
      }
      break;
  }

  // 7. Apply optional transformations
  if (toLowerCase && fieldType !== 'password') {
    cleanedValue = cleanedValue.toLowerCase();
  }

  // Final trim
  if (trim) {
    cleanedValue = cleanedValue.trim();
  }

  sanitizedValue = cleanedValue;

  return {
    isValid: errors.length === 0,
    sanitizedValue,
    errors,
    warnings,
  };
}

/**
 * Sanitize an object of inputs (for form data)
 */
export interface SanitizeObjectOptions {
  [key: string]: SanitizationOptions;
}

export interface SanitizeObjectResult {
  isValid: boolean;
  sanitizedData: Record<string, string>;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
}

export function sanitizeApiInputObject(
  data: Record<string, any>,
  options: SanitizeObjectOptions
): SanitizeObjectResult {
  const sanitizedData: Record<string, string> = {};
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  let isValid = true;

  for (const [key, value] of Object.entries(data)) {
    const fieldOptions = options[key] || { fieldName: key };
    const result = sanitizeApiInput(value, {
      ...fieldOptions,
      fieldName: fieldOptions.fieldName || key,
    });

    if (result.isValid && result.sanitizedValue !== null) {
      sanitizedData[key] = result.sanitizedValue;
    } else {
      isValid = false;
    }

    if (result.errors.length > 0) {
      errors[key] = result.errors;
    }

    if (result.warnings.length > 0) {
      warnings[key] = result.warnings;
    }
  }

  return {
    isValid,
    sanitizedData,
    errors,
    warnings,
  };
}

/**
 * Quick sanitization presets for common API calls
 */
export const sanitizationPresets = {
  // Login credentials
  loginCredentials: (email: string, password: string) => {
    const emailResult = sanitizeApiInput(email, {
      fieldType: 'email',
      fieldName: 'Email',
      required: true,
      maxLength: 254,
    });

    const passwordResult = sanitizeApiInput(password, {
      fieldType: 'password',
      fieldName: 'Password',
      required: true,
      maxLength: 128,
    });

    return {
      isValid: emailResult.isValid && passwordResult.isValid,
      email: emailResult.sanitizedValue,
      password: passwordResult.sanitizedValue,
      errors: {
        email: emailResult.errors,
        password: passwordResult.errors,
      },
    };
  },

  // Registration data
  registrationData: (username: string, email: string, password: string) => {
    return sanitizeApiInputObject(
      { username, email, password },
      {
        username: {
          fieldType: 'username',
          fieldName: 'Username',
          required: true,
          maxLength: 30,
          trim: true,
        },
        email: {
          fieldType: 'email',
          fieldName: 'Email',
          required: true,
          maxLength: 254,
        },
        password: {
          fieldType: 'password',
          fieldName: 'Password',
          required: true,
          maxLength: 128,
        },
      }
    );
  },

  // Generic text content (e.g., comments, descriptions)
  textContent: (text: string, maxLength: number = 5000) => {
    return sanitizeApiInput(text, {
      fieldType: 'text',
      fieldName: 'Text',
      required: true,
      maxLength,
      allowUrls: false,
      allowHtml: false,
      trim: true,
    });
  },

  // Subscription/Payment data
  subscriptionData: (email: string, priceId: string) => {
    return sanitizeApiInputObject(
      { email, priceId },
      {
        email: {
          fieldType: 'email',
          fieldName: 'Email',
          required: true,
          maxLength: 254,
        },
        priceId: {
          fieldType: 'text',
          fieldName: 'Price ID',
          required: true,
          maxLength: 100,
          trim: true,
        },
      }
    );
  },
};

/**
 * Log security issues for monitoring
 */
export function logSecurityIssue(
  field: string,
  issue: string,
  input: string,
  context?: string
): void {
  console.warn('[SECURITY]', {
    field,
    issue,
    inputLength: input.length,
    inputPreview: input.substring(0, 50) + '...',
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Example usage:
 *
 * // For login
 * const loginResult = sanitizationPresets.loginCredentials(email, password);
 * if (!loginResult.isValid) {
 *   Alert.alert('Invalid Input', loginResult.errors.email[0] || loginResult.errors.password[0]);
 *   return;
 * }
 *
 * // For custom validation
 * const result = sanitizeApiInput(userInput, {
 *   fieldType: 'text',
 *   fieldName: 'Comment',
 *   maxLength: 500,
 *   allowUrls: false,
 * });
 *
 * if (!result.isValid) {
 *   Alert.alert('Invalid Input', result.errors.join('\n'));
 *   return;
 * }
 *
 * // Use result.sanitizedValue for API call
 * await api.post('/comment', { text: result.sanitizedValue });
 */
