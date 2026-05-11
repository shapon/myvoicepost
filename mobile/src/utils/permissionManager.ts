/**
 * Permission Manager
 * 
 * Handles all app permissions with clear user explanations,
 * consent tracking, and compliance logging.
 */

import { Alert, Platform, Linking } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERMISSION_STORAGE_KEY = 'permissionConsents';

export enum PermissionType {
  MICROPHONE = 'microphone',
  NOTIFICATIONS = 'notifications',
  STORAGE = 'storage',
}

export enum PermissionStatus {
  NOT_REQUESTED = 'not_requested',
  GRANTED = 'granted',
  DENIED = 'denied',
  DENIED_PERMANENTLY = 'denied_permanently',
}

interface PermissionConsent {
  type: PermissionType;
  status: PermissionStatus;
  timestamp: string;
  explanation_shown: boolean;
  user_decision: 'accepted' | 'declined' | 'pending';
}

interface PermissionExplanation {
  title: string;
  description: string;
  why_needed: string;
  what_we_collect: string;
  what_we_dont_collect: string;
  how_we_protect: string;
}

/**
 * Clear explanations for each permission
 */
const PERMISSION_EXPLANATIONS: Record<PermissionType, PermissionExplanation> = {
  [PermissionType.MICROPHONE]: {
    title: 'Microphone Access',
    description: 'MyVoicePost needs access to your microphone to record audio for transcription and translation.',
    why_needed: 'To convert your speech to text and translate it to other languages.',
    what_we_collect: 'Audio recordings only when you press the record button. Recordings are processed and then deleted.',
    what_we_dont_collect: 'We do NOT record in the background. We do NOT listen without your explicit action. We do NOT store audio after processing.',
    how_we_protect: 'Audio is encrypted during transmission. Processed server-side and immediately deleted. Never shared with third parties.',
  },
  [PermissionType.NOTIFICATIONS]: {
    title: 'Notification Access',
    description: 'Receive notifications about completed translations and important updates.',
    why_needed: 'To notify you when your transcription or translation is ready.',
    what_we_collect: 'Notification preferences only. No notification content is stored.',
    what_we_dont_collect: 'We do NOT track notification interactions. We do NOT send marketing notifications without consent.',
    how_we_protect: 'Notification settings stored locally only. Can be disabled anytime.',
  },
  [PermissionType.STORAGE]: {
    title: 'Storage Access',
    description: 'Save your transcriptions and translations locally on your device.',
    why_needed: 'To save your work so you can access it later.',
    what_we_collect: 'Only content you explicitly save. Everything stored locally on your device.',
    what_we_dont_collect: 'We do NOT access other files. We do NOT upload without permission.',
    how_we_protect: 'All data encrypted. Stored in app-specific folder. Deleted when you uninstall.',
  },
};

/**
 * Permission Manager Class
 */
export class PermissionManager {
  private static consents: Map<PermissionType, PermissionConsent> = new Map();

  /**
   * Initialize permission manager
   */
  static async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(PERMISSION_STORAGE_KEY);
      if (stored) {
        const consents: PermissionConsent[] = JSON.parse(stored);
        consents.forEach(consent => {
          this.consents.set(consent.type, consent);
        });
      }
    } catch (error) {
      console.error('Failed to load permission consents:', error);
    }
  }

  /**
   * Save consents to storage
   */
  private static async saveConsents(): Promise<void> {
    try {
      const consentsArray = Array.from(this.consents.values());
      await AsyncStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify(consentsArray));
    } catch (error) {
      console.error('Failed to save permission consents:', error);
    }
  }

  /**
   * Log consent change for compliance
   */
  private static async logConsentChange(
    type: PermissionType,
    oldStatus: PermissionStatus | null,
    newStatus: PermissionStatus,
    userDecision: 'accepted' | 'declined'
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      permission: type,
      old_status: oldStatus,
      new_status: newStatus,
      user_decision: userDecision,
      platform: Platform.OS,
    };

    // In production, send this to your compliance logging service
    if (__DEV__) {
      console.log('[COMPLIANCE LOG]', logEntry);
    }

    // Store locally for audit trail
    try {
      const logs = await AsyncStorage.getItem('permission_logs');
      const logArray = logs ? JSON.parse(logs) : [];
      logArray.push(logEntry);
      
      // Keep last 100 logs
      if (logArray.length > 100) {
        logArray.shift();
      }
      
      await AsyncStorage.setItem('permission_logs', JSON.stringify(logArray));
    } catch (error) {
      console.error('Failed to log consent change:', error);
    }
  }

  /**
   * Show clear explanation before requesting permission
   */
  private static async showExplanation(type: PermissionType): Promise<boolean> {
    const explanation = PERMISSION_EXPLANATIONS[type];

    return new Promise((resolve) => {
      Alert.alert(
        explanation.title,
        `${explanation.description}\n\n` +
        `WHY WE NEED THIS:\n${explanation.why_needed}\n\n` +
        `WHAT WE COLLECT:\n${explanation.what_we_collect}\n\n` +
        `WHAT WE DON'T COLLECT:\n${explanation.what_we_dont_collect}\n\n` +
        `HOW WE PROTECT YOUR DATA:\n${explanation.how_we_protect}`,
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Continue',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });
  }

  /**
   * Request microphone permission with explanation
   */
  static async requestMicrophonePermission(): Promise<PermissionStatus> {
    const existingConsent = this.consents.get(PermissionType.MICROPHONE);

    // Check if already granted
    const currentStatus = await this.checkMicrophonePermission();
    if (currentStatus === PermissionStatus.GRANTED) {
      return PermissionStatus.GRANTED;
    }

    // Show explanation if not shown before or if previously denied
    const shouldShowExplanation = 
      !existingConsent?.explanation_shown || 
      existingConsent?.status === PermissionStatus.DENIED;

    if (shouldShowExplanation) {
      const userWantsToContinue = await this.showExplanation(PermissionType.MICROPHONE);
      
      if (!userWantsToContinue) {
        // User declined after reading explanation
        const consent: PermissionConsent = {
          type: PermissionType.MICROPHONE,
          status: PermissionStatus.DENIED,
          timestamp: new Date().toISOString(),
          explanation_shown: true,
          user_decision: 'declined',
        };
        
        this.consents.set(PermissionType.MICROPHONE, consent);
        await this.saveConsents();
        await this.logConsentChange(
          PermissionType.MICROPHONE,
          existingConsent?.status || null,
          PermissionStatus.DENIED,
          'declined'
        );
        
        return PermissionStatus.DENIED;
      }
    }

    // Request system permission
    try {
      const { status } = await Audio.requestPermissionsAsync();
      
      const newStatus = status === 'granted' 
        ? PermissionStatus.GRANTED 
        : status === 'denied' 
        ? PermissionStatus.DENIED_PERMANENTLY 
        : PermissionStatus.DENIED;

      const consent: PermissionConsent = {
        type: PermissionType.MICROPHONE,
        status: newStatus,
        timestamp: new Date().toISOString(),
        explanation_shown: true,
        user_decision: newStatus === PermissionStatus.GRANTED ? 'accepted' : 'declined',
      };

      this.consents.set(PermissionType.MICROPHONE, consent);
      await this.saveConsents();
      await this.logConsentChange(
        PermissionType.MICROPHONE,
        existingConsent?.status || null,
        newStatus,
        consent.user_decision
      );

      // If denied permanently, guide user to settings
      if (newStatus === PermissionStatus.DENIED_PERMANENTLY) {
        this.showSettingsPrompt(PermissionType.MICROPHONE);
      }

      return newStatus;
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      return PermissionStatus.DENIED;
    }
  }

  /**
   * Check current microphone permission status
   */
  static async checkMicrophonePermission(): Promise<PermissionStatus> {
    try {
      const { status } = await Audio.getPermissionsAsync();
      
      if (status === 'granted') {
        return PermissionStatus.GRANTED;
      } else if (status === 'denied') {
        return PermissionStatus.DENIED_PERMANENTLY;
      } else {
        return PermissionStatus.NOT_REQUESTED;
      }
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      return PermissionStatus.DENIED;
    }
  }

  /**
   * Show prompt to open settings if permission denied permanently
   */
  private static showSettingsPrompt(type: PermissionType): void {
    const explanation = PERMISSION_EXPLANATIONS[type];
    
    Alert.alert(
      'Permission Required',
      `${explanation.title} is required for this feature. ` +
      `You have previously denied this permission. ` +
      `Would you like to enable it in Settings?`,
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          },
        },
      ]
    );
  }

  /**
   * Get permission status
   */
  static getPermissionStatus(type: PermissionType): PermissionConsent | null {
    return this.consents.get(type) || null;
  }

  /**
   * Get all permission consents (for privacy dashboard)
   */
  static getAllConsents(): PermissionConsent[] {
    return Array.from(this.consents.values());
  }

  /**
   * Revoke permission (user wants to disable)
   */
  static async revokePermission(type: PermissionType): Promise<void> {
    const existingConsent = this.consents.get(type);
    
    const consent: PermissionConsent = {
      type,
      status: PermissionStatus.DENIED,
      timestamp: new Date().toISOString(),
      explanation_shown: true,
      user_decision: 'declined',
    };

    this.consents.set(type, consent);
    await this.saveConsents();
    await this.logConsentChange(
      type,
      existingConsent?.status || null,
      PermissionStatus.DENIED,
      'declined'
    );

    // Show message that user needs to disable in system settings
    Alert.alert(
      'Permission Revoked',
      `To fully disable ${type} access, please go to your device Settings > Apps > MyVoicePost > Permissions and disable ${type}.`
    );
  }

  /**
   * Clear all permission data (for account deletion)
   */
  static async clearAllPermissions(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PERMISSION_STORAGE_KEY);
      await AsyncStorage.removeItem('permission_logs');
      this.consents.clear();
    } catch (error) {
      console.error('Failed to clear permissions:', error);
    }
  }

  /**
   * Export permission logs (for GDPR compliance)
   */
  static async exportPermissionLogs(): Promise<any[]> {
    try {
      const logs = await AsyncStorage.getItem('permission_logs');
      return logs ? JSON.parse(logs) : [];
    } catch (error) {
      console.error('Failed to export permission logs:', error);
      return [];
    }
  }
}
