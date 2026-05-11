/**
 * Error Handling Utilities
 * 
 * Centralized error handling for consistent error management across the app.
 */

import axios, { AxiosError } from 'axios';

/**
 * Standardized API error structure
 */
export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
  originalError?: unknown;
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Parse and normalize errors from various sources
 */
export function handleApiError(error: unknown): ApiError {
  // Handle Axios errors
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    const statusCode = axiosError.response?.status;
    
    // Extract error message with multiple fallback strategies
    let message = 'An unexpected error occurred';

    // Check for network errors first
    if (axiosError.code === 'ECONNABORTED') {
      message = 'Request timed out. Please check your internet connection and try again.';
    } else if (axiosError.code === 'ERR_NETWORK' || axiosError.message === 'Network Error') {
      message = 'Network error. Please check your internet connection and try again.';
    } else if (axiosError.code === 'ECONNREFUSED') {
      message = 'Unable to connect to the server. Please try again later.';
    } else if (axiosError.response?.data) {
      const data = axiosError.response.data;

      // Try different common error message patterns
      message =
        data?.error ||           // { error: "..." }
        data?.message ||         // { message: "..." }
        data?.msg ||             // { msg: "..." }
        data?.detail ||          // { detail: "..." }
        data?.errors?.[0] ||     // { errors: ["..."] }
        (typeof data === 'string' ? data : null) ||  // "error string"
        axiosError.message ||
        message;

      // Handle validation errors object
      if (data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
        const firstError = Object.values(data.errors)[0];
        if (Array.isArray(firstError) && firstError.length > 0) {
          message = firstError[0];
        } else if (typeof firstError === 'string') {
          message = firstError;
        }
      }
    } else {
      message = axiosError.message || message;
    }

    console.log('[ErrorHandler] Processed error:', {
      message,
      statusCode,
      code: axiosError.code,
      originalMessage: axiosError.message,
    });

    return {
      message,
      statusCode,
      errors: axiosError.response?.data?.errors,
      originalError: error,
    };
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return {
      message: error.message,
      originalError: error,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
      originalError: error,
    };
  }

  // Handle unknown errors
  console.log('[ErrorHandler] Unknown error type:', typeof error, error);
  return {
    message: 'An unexpected error occurred',
    originalError: error,
  };
}

/**
 * Get user-friendly error message based on status code
 */
export function getUserFriendlyMessage(error: ApiError | unknown): string {
  // First normalize the error to ApiError format if it isn't already
  const apiError = error && typeof error === 'object' && 'message' in error
    ? error as ApiError
    : handleApiError(error);

  // Check for specific error messages first
  const errorMsg = apiError.message?.toLowerCase() || '';

  // Handle specific password reset errors
  if (errorMsg.includes('verification code') || (errorMsg.includes('code') && errorMsg.includes('invalid'))) {
    return 'Invalid or expired verification code. Please request a new one.';
  }
  if (errorMsg.includes('password') && errorMsg.includes('match')) {
    return 'Passwords do not match. Please try again.';
  }
  if (errorMsg.includes('password') && (errorMsg.includes('weak') || errorMsg.includes('short') || errorMsg.includes('length'))) {
    return 'Password must be at least 8 characters long.';
  }
  if (errorMsg.includes('email') && errorMsg.includes('not found')) {
    return 'Email address not found. Please check and try again.';
  }
  if (errorMsg.includes('email') && (errorMsg.includes('invalid') || errorMsg.includes('required'))) {
    return 'Invalid email address. Please check and try again.';
  }

  // For 400 errors, prefer the actual error message from server as it's usually specific
  if (apiError.statusCode === 400 && apiError.message) {
    // If the error message is already user-friendly (not technical), return it
    if (!apiError.message.includes('Error:') && !apiError.message.includes('Exception') && !apiError.message.includes('NetworkError')) {
      return apiError.message;
    }
    return 'Invalid request. Please check your input and try again.';
  }

  // If the error message is already user-friendly (not technical), return it
  if (apiError.message && !apiError.message.includes('Error:') && !apiError.message.includes('Exception') && !apiError.message.includes('NetworkError')) {
    return apiError.message;
  }

  // Fallback to status code based messages
  if (!apiError.statusCode) {
    return apiError.message || 'An unexpected error occurred. Please try again.';
  }

  switch (apiError.statusCode) {
    case 400:
      return apiError.message || 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Authentication failed. Please sign in again.';
    case 403:
      return 'You don\'t have permission to perform this action.';
    case 404:
      return apiError.message || 'The requested resource was not found.';
    case 409:
      return apiError.message; // Usually contains specific conflict info
    case 422:
      return apiError.message || 'Validation failed. Please check your input.'; // Usually contains validation errors
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error. Please try again later.';
    case 503:
      return 'Service temporarily unavailable. Please try again later.';
    default:
      return apiError.message || 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Determine error severity based on status code
 */
export function getErrorSeverity(error: ApiError): ErrorSeverity {
  if (!error.statusCode) {
    return ErrorSeverity.MEDIUM;
  }

  if (error.statusCode >= 500) {
    return ErrorSeverity.HIGH;
  }

  if (error.statusCode === 401 || error.statusCode === 403) {
    return ErrorSeverity.MEDIUM;
  }

  if (error.statusCode >= 400) {
    return ErrorSeverity.LOW;
  }

  return ErrorSeverity.MEDIUM;
}

/**
 * Error reporter for logging and analytics
 */
export class ErrorReporter {
  private static crashReportQueue: Array<{
    errorMessage: string;
    stackTrace?: string;
    deviceInfo?: string;
    appVersion?: string;
    userId?: string;
  }> = [];
  private static isSending = false;

  static report(error: Error | unknown, context: string, metadata?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const errorInfo = handleApiError(error);
    
    const sanitizedMetadata = metadata ? sanitizeForLogging(metadata) : undefined;
    
    console.error(`[${context}] ${timestamp}`, {
      message: errorInfo.message,
      statusCode: errorInfo.statusCode,
      metadata: sanitizedMetadata,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (errorInfo.statusCode && errorInfo.statusCode >= 500) {
      ErrorReporter.sendCrashReport({
        errorMessage: `[${context}] ${errorInfo.message}`,
        stackTrace: error instanceof Error ? error.stack : undefined,
        userId: metadata?.userId,
      });
    }
  }

  static reportFatal(error: Error | unknown, context: string, metadata?: Record<string, any>) {
    const errorInfo = handleApiError(error);
    console.error(`[FATAL][${context}]`, errorInfo.message, error instanceof Error ? error.stack : '');

    ErrorReporter.sendCrashReport({
      errorMessage: `[FATAL][${context}] ${errorInfo.message}`,
      stackTrace: error instanceof Error ? error.stack : undefined,
      userId: metadata?.userId,
    });
  }

  static warn(message: string, context: string, metadata?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const sanitizedMetadata = metadata ? sanitizeForLogging(metadata) : undefined;
    console.warn(`[${context}] ${timestamp}`, message, sanitizedMetadata);
  }

  static info(message: string, context: string, metadata?: Record<string, any>) {
    if (__DEV__) {
      const sanitizedMetadata = metadata ? sanitizeForLogging(metadata) : undefined;
      console.log(`[${context}]`, message, sanitizedMetadata);
    }
  }

  static async sendCrashReport(report: {
    errorMessage: string;
    stackTrace?: string;
    deviceInfo?: string;
    appVersion?: string;
    userId?: string;
  }) {
    ErrorReporter.crashReportQueue.push(report);
    if (ErrorReporter.isSending) return;
    ErrorReporter.isSending = true;

    try {
      while (ErrorReporter.crashReportQueue.length > 0) {
        const item = ErrorReporter.crashReportQueue.shift();
        if (!item) break;

        try {
          const { Platform } = require('react-native');
          const { environment } = require('../config/environment');
          const deviceInfo = item.deviceInfo || `${Platform.OS} ${Platform.Version}`;

          await fetch(`${environment.baseUrl}/api/v1/a/crash-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              errorMessage: item.errorMessage,
              stackTrace: item.stackTrace,
              deviceInfo,
              appVersion: item.appVersion || '1.0.0',
              userId: item.userId,
            }),
          });
        } catch (sendErr) {
          console.warn('[ErrorReporter] Failed to send crash report:', sendErr);
        }
      }
    } finally {
      ErrorReporter.isSending = false;
    }
  }
}

// Import privacy utilities
import { sanitizeForLogging, stripSensitiveFields } from './privacyProtection';

/**
 * Network error helper
 */
export function isNetworkError(error: ApiError): boolean {
  return (
    error.message.includes('Network') ||
    error.message.includes('network') ||
    error.message.includes('timeout') ||
    !error.statusCode
  );
}

/**
 * Retry configuration for failed requests
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Check if error is retryable
 */
export function isRetryableError(error: ApiError, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  if (!error.statusCode) {
    // Network errors are retryable
    return isNetworkError(error);
  }

  return config.retryableStatuses.includes(error.statusCode);
}

/**
 * Delay helper for retry logic
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
