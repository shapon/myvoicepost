import { useColorScheme } from 'react-native';

export interface HelpThemeColors {
  background: string;
  cardSurface: string;
  cardSurfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  brandAccent: string;
  brandAccentDark: string;
  border: string;
  borderSubtle: string;
  success: string;
  error: string;
  warning: string;
  overlay: string;
}

const LIGHT_THEME: HelpThemeColors = {
  background: '#f8f9fc',
  cardSurface: '#ffffff',
  cardSurfaceElevated: '#f1f2f6',
  textPrimary: '#1a1a2e',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  brandAccent: '#6366f1',
  brandAccentDark: '#4f46e5',
  border: '#e5e7eb',
  borderSubtle: '#f0f0f5',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  overlay: 'rgba(0,0,0,0.5)',
};

const DARK_THEME: HelpThemeColors = {
  background: '#111118',
  cardSurface: '#1c1c2a',
  cardSurfaceElevated: '#252538',
  textPrimary: '#f0f0f5',
  textSecondary: '#a1a1b5',
  textMuted: '#6b6b82',
  brandAccent: '#818cf8',
  brandAccentDark: '#6366f1',
  border: '#2a2a40',
  borderSubtle: '#222235',
  success: '#34d399',
  error: '#f87171',
  warning: '#fbbf24',
  overlay: 'rgba(0,0,0,0.85)',
};

export function useHelpTheme(): { colors: HelpThemeColors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? DARK_THEME : LIGHT_THEME,
    isDark,
  };
}

export const SUPPORT_COPY = {
  noConnection: {
    title: 'No connection right now',
    body: "We can't reach the server right now. Take a breath, and let's try again in a moment.",
    action: 'Try Again',
  },
  uploadFailed: {
    title: 'That didn\u2019t go through',
    body: 'Something went wrong with that recording. Want to give it another shot?',
    action: 'Record Again',
  },
  searchNoResults: {
    title: 'Nothing found',
    body: "We couldn't find that, but our team is here if you need a hand.",
    action: 'Contact Support',
  },
  micPermissionDenied: {
    title: 'Microphone access needed',
    body: "We need your microphone to record voice messages. You can enable it in your device's settings.",
    action: 'Open Settings',
  },
  recordingTooShort: {
    title: 'Too short to send',
    body: 'Hold the button a little longer so we can hear you clearly. Try recording for at least 2 seconds.',
    action: 'Try Again',
  },
  genericError: {
    title: 'Something\u2019s not right',
    body: "We hit a bump. Don't worry \u2014 your data is safe. Let's try that again.",
    action: 'Retry',
  },
  sessionExpired: {
    title: 'Session timed out',
    body: "You've been away for a bit. Let's get you signed back in so you can pick up where you left off.",
    action: 'Sign In',
  },
  quotaExceeded: {
    title: 'You\u2019ve reached your limit',
    body: "You've used all your transcription minutes for this period. Upgrade your plan to keep going.",
    action: 'View Plans',
  },
} as const;

export type SupportCopyKey = keyof typeof SUPPORT_COPY;
