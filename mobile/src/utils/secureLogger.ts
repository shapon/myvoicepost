import Constants from 'expo-constants';

const IS_DEV = __DEV__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_PATTERNS = [
  /token/i,
  /bearer/i,
  /authorization/i,
  /password/i,
  /secret/i,
  /credential/i,
  /api[_-]?key/i,
  /jwt/i,
];

function containsSensitiveData(args: any[]): boolean {
  for (const arg of args) {
    if (typeof arg === 'string') {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(arg)) return true;
      }
    }
  }
  return false;
}

function redactSensitiveValues(args: any[]): any[] {
  return args.map((arg) => {
    if (typeof arg === 'string' && arg.length > 40) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(arg)) {
          return arg.substring(0, 20) + '***REDACTED***';
        }
      }
    }
    if (typeof arg === 'object' && arg !== null) {
      const redacted: Record<string, any> = {};
      for (const [key, value] of Object.entries(arg)) {
        const isSensitiveKey = SENSITIVE_PATTERNS.some((p) => p.test(key));
        redacted[key] = isSensitiveKey ? '***REDACTED***' : value;
      }
      return redacted;
    }
    return arg;
  });
}

function shouldLog(level: LogLevel): boolean {
  if (IS_DEV) return true;
  return level === 'warn' || level === 'error';
}

function log(level: LogLevel, ...args: any[]) {
  if (!shouldLog(level)) return;

  const sanitizedArgs = IS_DEV ? args : redactSensitiveValues(args);

  switch (level) {
    case 'debug':
      console.log(...sanitizedArgs);
      break;
    case 'info':
      console.log(...sanitizedArgs);
      break;
    case 'warn':
      console.warn(...sanitizedArgs);
      break;
    case 'error':
      console.error(...sanitizedArgs);
      break;
  }
}

export const secureLog = {
  debug: (...args: any[]) => log('debug', ...args),
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),

  sensitive: (...args: any[]) => {
    if (IS_DEV) {
      console.log('[SENSITIVE-DEV]', ...args);
    }
  },
};
