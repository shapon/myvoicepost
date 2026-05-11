/**
 * Input Validation Utilities
 * 
 * Comprehensive validation functions for user inputs.
 */

/**
 * Validation result type
 */
export type ValidationResult = string | null;

/**
 * Email validation
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return 'Email is required';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return 'Please enter a valid email address';
  }

  if (email.length > 254) {
    return 'Email address is too long';
  }

  return null;
}

/**
 * Password validation
 */
export interface PasswordRequirements {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecialChar?: boolean;
}

export function validatePassword(
  password: string,
  requirements: PasswordRequirements = {}
): ValidationResult {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecialChar = false,
  } = requirements;

  if (!password || password.length === 0) {
    return 'Password is required';
  }

  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters`;
  }

  if (password.length > 128) {
    return 'Password is too long';
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  if (requireNumber && !/\d/.test(password)) {
    return 'Password must contain at least one number';
  }

  if (requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character';
  }

  return null;
}

/**
 * Confirm password validation
 */
export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (!confirmPassword) {
    return 'Please confirm your password';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }

  return null;
}

/**
 * Username validation
 */
export interface UsernameRequirements {
  minLength?: number;
  maxLength?: number;
  allowSpecialChars?: boolean;
}

export function validateUsername(
  username: string,
  requirements: UsernameRequirements = {}
): ValidationResult {
  const {
    minLength = 3,
    maxLength = 30,
    allowSpecialChars = false,
  } = requirements;

  if (!username || username.trim().length === 0) {
    return 'Username is required';
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length < minLength) {
    return `Username must be at least ${minLength} characters`;
  }

  if (trimmedUsername.length > maxLength) {
    return `Username must be no more than ${maxLength} characters`;
  }

  // Check for valid characters
  const usernameRegex = allowSpecialChars
    ? /^[a-zA-Z0-9_.-]+$/
    : /^[a-zA-Z0-9_]+$/;

  if (!usernameRegex.test(trimmedUsername)) {
    if (allowSpecialChars) {
      return 'Username can only contain letters, numbers, underscores, dots, and hyphens';
    } else {
      return 'Username can only contain letters, numbers, and underscores';
    }
  }

  // Username should not start or end with special characters
  if (/^[^a-zA-Z0-9]|[^a-zA-Z0-9]$/.test(trimmedUsername)) {
    return 'Username must start and end with a letter or number';
  }

  return null;
}

/**
 * Required field validation
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Minimum length validation
 */
export function validateMinLength(
  value: string,
  minLength: number,
  fieldName: string
): ValidationResult {
  if (value.trim().length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`;
  }
  return null;
}

/**
 * Maximum length validation
 */
export function validateMaxLength(
  value: string,
  maxLength: number,
  fieldName: string
): ValidationResult {
  if (value.length > maxLength) {
    return `${fieldName} must be no more than ${maxLength} characters`;
  }
  return null;
}

/**
 * URL validation
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return 'URL is required';
  }

  try {
    new URL(url);
    return null;
  } catch {
    return 'Please enter a valid URL';
  }
}

/**
 * Phone number validation (basic)
 */
export function validatePhoneNumber(phone: string): ValidationResult {
  if (!phone || phone.trim().length === 0) {
    return 'Phone number is required';
  }

  // Remove common formatting characters
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  // Check if it's all digits and has reasonable length
  if (!/^\d{10,15}$/.test(cleanPhone)) {
    return 'Please enter a valid phone number (10-15 digits)';
  }

  return null;
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, ''); // Remove HTML tags
}

/**
 * Form validator - validates multiple fields at once
 */
export interface ValidationRules {
  [fieldName: string]: (value: string) => ValidationResult;
}

export interface ValidationErrors {
  [fieldName: string]: string;
}

export function validateForm(
  values: Record<string, string>,
  rules: ValidationRules
): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const [fieldName, validator] of Object.entries(rules)) {
    const value = values[fieldName] || '';
    const error = validator(value);
    if (error) {
      errors[fieldName] = error;
    }
  }

  return errors;
}

/**
 * Check if validation errors object has any errors
 */
export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Common validation presets
 */
export const validators = {
  email: validateEmail,
  password: validatePassword,
  passwordConfirmation: validatePasswordConfirmation,
  username: validateUsername,
  required: validateRequired,
  minLength: validateMinLength,
  maxLength: validateMaxLength,
  url: validateUrl,
  phoneNumber: validatePhoneNumber,
};

/**
 * Example usage:
 * 
 * const errors = validateForm(
 *   { email: userEmail, password: userPassword },
 *   {
 *     email: validators.email,
 *     password: validators.password,
 *   }
 * );
 * 
 * if (hasErrors(errors)) {
 *   setFormErrors(errors);
 *   return;
 * }
 */
