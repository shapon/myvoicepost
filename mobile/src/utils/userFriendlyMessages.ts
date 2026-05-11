/**
 * User-Friendly Error Messages
 * Converts technical errors into clear, actionable messages for users
 */

export interface UserFriendlyMessage {
  title: string;
  message: string;
  icon?: 'success' | 'error' | 'warning' | 'info';
}

/**
 * Get user-friendly message for network errors
 */
export function getNetworkErrorMessage(): UserFriendlyMessage {
  return {
    title: 'No Internet Connection',
    message: "Your recording is saved and will be processed when you're back online.",
    icon: 'warning',
  };
}

/**
 * Get user-friendly message for save errors
 */
export function getSaveErrorMessage(): UserFriendlyMessage {
  return {
    title: 'Unable to Save',
    message: "Unable to save right now. We'll keep trying automatically.",
    icon: 'warning',
  };
}

/**
 * Get user-friendly message for recovery available
 */
export function getRecoveryAvailableMessage(): UserFriendlyMessage {
  return {
    title: 'Unsaved Work Found',
    message: 'Good news! We recovered your last recording.',
    icon: 'success',
  };
}

/**
 * Get user-friendly message for processing failure
 */
export function getProcessingErrorMessage(): UserFriendlyMessage {
  return {
    title: 'Processing Failed',
    message: 'Something went wrong. Your recording is safe — please try again.',
    icon: 'error',
  };
}

/**
 * Get user-friendly message for audio saved offline
 */
export function getAudioSavedOfflineMessage(): UserFriendlyMessage {
  return {
    title: 'Saved Offline',
    message: 'Your recording has been saved. It will be processed automatically when you reconnect to the internet.',
    icon: 'info',
  };
}

/**
 * Get user-friendly message for auto-save success
 */
export function getAutoSaveSuccessMessage(): UserFriendlyMessage {
  return {
    title: 'Auto-Saved',
    message: 'Your work has been automatically saved.',
    icon: 'success',
  };
}

/**
 * Get user-friendly message for sync in progress
 */
export function getSyncInProgressMessage(): UserFriendlyMessage {
  return {
    title: 'Syncing...',
    message: 'Processing your saved recordings. Please wait...',
    icon: 'info',
  };
}

/**
 * Get user-friendly message for sync complete
 */
export function getSyncCompleteMessage(count: number): UserFriendlyMessage {
  return {
    title: 'Sync Complete',
    message: `Successfully processed ${count} recording${count !== 1 ? 's' : ''}.`,
    icon: 'success',
  };
}

/**
 * Get user-friendly message for storage full
 */
export function getStorageFullMessage(): UserFriendlyMessage {
  return {
    title: 'Storage Full',
    message: 'Your device storage is full. Please free up some space to continue recording.',
    icon: 'error',
  };
}

/**
 * Get user-friendly message for microphone permission
 */
export function getMicrophonePermissionMessage(): UserFriendlyMessage {
  return {
    title: 'Microphone Access Required',
    message: 'Please grant microphone permission in your device settings to record audio.',
    icon: 'warning',
  };
}

/**
 * Get user-friendly message for API errors
 */
export function getApiErrorMessage(error: any): UserFriendlyMessage {
  // Network errors
  if (error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('connection') ||
      error.code === 'NETWORK_ERROR') {
    return getNetworkErrorMessage();
  }

  // Timeout errors
  if (error.message?.toLowerCase().includes('timeout') ||
      error.code === 'ECONNABORTED') {
    return {
      title: 'Request Timeout',
      message: 'The request took too long. Your recording is saved. Please try again.',
      icon: 'warning',
    };
  }

  // Server errors (5xx)
  if (error.statusCode >= 500) {
    return {
      title: 'Server Issue',
      message: 'Our servers are having issues. Your recording is safe. Please try again in a few minutes.',
      icon: 'error',
    };
  }

  // Authentication errors (401)
  if (error.statusCode === 401) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      icon: 'warning',
    };
  }

  // Not found errors (404)
  if (error.statusCode === 404) {
    return {
      title: 'Service Unavailable',
      message: 'This feature is temporarily unavailable. Please try again later.',
      icon: 'error',
    };
  }

  // Rate limit errors (429)
  if (error.statusCode === 429) {
    return {
      title: 'Too Many Requests',
      message: 'Please wait a moment before trying again.',
      icon: 'warning',
    };
  }

  // Default error
  return getProcessingErrorMessage();
}

/**
 * Format error for user display (no technical details)
 */
export function formatUserError(error: any): string {
  const friendlyMessage = getApiErrorMessage(error);
  return friendlyMessage.message;
}

/**
 * Get appropriate message based on context
 */
export function getContextualMessage(
  context: 'save' | 'network' | 'processing' | 'recovery' | 'sync',
  details?: any
): UserFriendlyMessage {
  switch (context) {
    case 'save':
      return getSaveErrorMessage();
    case 'network':
      return getNetworkErrorMessage();
    case 'processing':
      return getProcessingErrorMessage();
    case 'recovery':
      return getRecoveryAvailableMessage();
    case 'sync':
      return details?.count
        ? getSyncCompleteMessage(details.count)
        : getSyncInProgressMessage();
    default:
      return getProcessingErrorMessage();
  }
}
