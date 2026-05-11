# Implementation Guide

This guide will walk you through implementing the recommended improvements to your MyVoicePost mobile app.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Critical Fixes (Week 1)](#phase-1-critical-fixes)
3. [Phase 2: High Priority (Week 2)](#phase-2-high-priority)
4. [Phase 3: Medium Priority (Week 3)](#phase-3-medium-priority)
5. [Testing Your Changes](#testing-your-changes)

---

## Prerequisites

Before starting, ensure you have:
- Node.js 18+ installed
- Expo CLI installed globally
- Git for version control
- A development device/emulator set up

### Backup Your Code

```bash
# Create a new branch for the improvements
git checkout -b feature/code-improvements
git add .
git commit -m "Backup before improvements"
```

---

## Phase 1: Critical Fixes (Week 1)

### Step 1: Install New Dependencies

```bash
cd myvoicepost_mobile
npm install --save-dev \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-react-native \
  prettier \
  @testing-library/react-native \
  @testing-library/jest-native \
  jest

npm install
```

### Step 2: Add Configuration Files

Copy these files to your project root:

1. `.eslintrc.js` - Code linting rules
2. `.prettierrc.js` - Code formatting rules
3. `.prettierignore` - Files to ignore for formatting

Create `.prettierignore`:
```
node_modules/
.expo/
.expo-shared/
dist/
build/
coverage/
*.log
```

### Step 3: Implement Environment Configuration

**File: `src/config/environment.ts`**

This file has been created for you. Copy it to your project:
```bash
mkdir -p src/config
cp src/config/environment.ts myvoicepost_mobile/src/config/
```

**Update `src/lib/api.ts`:**

Replace:
```typescript
const API_BASE_URL = 'https://www.myvoicepost.com/api';
```

With:
```typescript
import ENV from '../config/environment';
const API_BASE_URL = ENV.apiUrl;
```

### Step 4: Implement Token Manager

**File: `src/lib/tokenManager.ts`**

Copy the improved token manager:
```bash
cp src/lib/tokenManager.ts myvoicepost_mobile/src/lib/
```

**Update `src/lib/api.ts`:**

Replace the token management section with:
```typescript
import { tokenManager } from './tokenManager';
export { setAuthToken, getAuthToken, clearAuthToken } from './tokenManager';
```

Update the request interceptor:
```typescript
api.interceptors.request.use(async (config) => {
  const token = await tokenManager.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Step 5: Implement Error Handling

**File: `src/utils/errorHandler.ts`**

Copy the error handler:
```bash
mkdir -p src/utils
cp src/utils/errorHandler.ts myvoicepost_mobile/src/utils/
```

**Update Components:**

In `src/screens/PolishScreen.tsx`, replace:
```typescript
} catch (error: any) {
  Alert.alert('Error', error.response?.data?.error || 'Failed to process');
}
```

With:
```typescript
import { handleApiError, getUserFriendlyMessage } from '../utils/errorHandler';

} catch (error) {
  const apiError = handleApiError(error);
  Alert.alert('Error', getUserFriendlyMessage(apiError));
}
```

Repeat for all screen files that make API calls.

### Step 6: Initialize Token Manager in App

**Update `app/_layout.tsx`:**

```typescript
import { useEffect, useState } from 'react';
import { tokenManager } from '../src/lib/tokenManager';
import * as SplashScreen from 'expo-splash-screen';

// Prevent auto-hide splash screen
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize token manager
        await tokenManager.initialize();
      } catch (e) {
        console.warn('Initialization error:', e);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    // ... existing JSX
  );
}
```

### Step 7: Test Critical Fixes

```bash
# Run linter
npm run lint

# Run type checker
npm run type-check

# Test the app
npm start
```

**Test checklist:**
- [ ] App starts without errors
- [ ] Login works
- [ ] Token persists after app restart
- [ ] Error messages are user-friendly

---

## Phase 2: High Priority (Week 2)

### Step 1: Add Input Validation

**File: `src/utils/validators.ts`**

```bash
cp src/utils/validators.ts myvoicepost_mobile/src/utils/
```

**Update `app/login.tsx`:**

```typescript
import { useState } from 'react';
import { validators, hasErrors, validateForm } from '../src/utils/validators';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleLogin = async () => {
    // Validate inputs
    const validationErrors = validateForm(
      { email, password },
      {
        email: validators.email,
        password: validators.password,
      }
    );

    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    // Proceed with login...
  };

  return (
    // ... JSX with error display
    {errors.email && <Text style={styles.error}>{errors.email}</Text>}
    {errors.password && <Text style={styles.error}>{errors.password}</Text>}
  );
}
```

Repeat for `app/register.tsx`.

### Step 2: Add Custom Hooks

**File: `src/hooks/index.ts`**

```bash
cp src/hooks/index.ts myvoicepost_mobile/src/hooks/
```

**Update `src/screens/PolishScreen.tsx`:**

```typescript
import { usePolish } from '../hooks';

export function PolishScreen() {
  const { polish, isProcessing, result, error, clear } = usePolish();
  
  const handleRecordingComplete = async (base64Audio: string) => {
    try {
      await polish(base64Audio, {
        language,
        outputFormat: tone,
        outputType,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to process recording');
    }
  };

  return (
    // Use result from hook
    {result && (
      <ResultDisplay
        originalText={result.originalText}
        processedText={result.polishedText}
      />
    )}
  );
}
```

### Step 3: Optimize Performance

**Update constants in components:**

In `src/screens/PolishScreen.tsx`:

```typescript
import { useMemo } from 'react';

export function PolishScreen() {
  // Memoize static options
  const languageOptions = useMemo(
    () => LANGUAGES.map((lang) => ({
      value: lang.code,
      label: `${lang.flag} ${lang.name}`,
    })),
    []
  );

  // Or better yet, move to constants file
}
```

**Better approach - update `src/lib/constants.ts`:**

```typescript
export const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({
  value: lang.code,
  label: `${lang.flag} ${lang.name}`,
}));

export const OUTPUT_TYPE_OPTIONS = OUTPUT_TYPES.map((type) => ({
  value: type.value,
  label: type.label,
  icon: type.icon,
}));

// Use directly in components
```

### Step 4: Update TypeScript Configuration

**Update `tsconfig.json`:**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/components/*": ["src/components/*"],
      "@/screens/*": ["src/screens/*"],
      "@/contexts/*": ["src/contexts/*"],
      "@/hooks/*": ["src/hooks/*"],
      "@/lib/*": ["src/lib/*"],
      "@/utils/*": ["src/utils/*"],
      "@/config/*": ["src/config/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

### Step 5: Fix TypeScript Errors

Run type checker and fix any new errors:
```bash
npm run type-check
```

Common fixes:
1. Add null checks for optional values
2. Add type annotations where inferred types are too broad
3. Remove unused variables

---

## Phase 3: Medium Priority (Week 3)

### Step 1: Add Accessibility

**Update `src/components/ui/Button.tsx`:**

```typescript
interface ButtonProps {
  // ... existing props
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Button({ accessibilityLabel, accessibilityHint, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || props.title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: props.disabled || props.loading }}
      // ... rest of props
    />
  );
}
```

### Step 2: Set Up Testing

**Create `__tests__/utils/validators.test.ts`:**

```typescript
import { validateEmail, validatePassword, validateUsername } from '../../src/utils/validators';

describe('validators', () => {
  describe('validateEmail', () => {
    it('should accept valid email', () => {
      expect(validateEmail('test@example.com')).toBeNull();
    });

    it('should reject invalid email', () => {
      expect(validateEmail('invalid')).toBeTruthy();
    });

    it('should reject empty email', () => {
      expect(validateEmail('')).toBeTruthy();
    });
  });

  // Add more tests...
});
```

Run tests:
```bash
npm test
```

### Step 3: Add Pre-commit Hooks (Optional)

Install husky:
```bash
npm install --save-dev husky lint-staged
npx husky install
```

**Create `.husky/pre-commit`:**
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

**Add to `package.json`:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

---

## Testing Your Changes

### Manual Testing Checklist

#### Authentication
- [ ] Can log in with valid credentials
- [ ] Login errors are user-friendly
- [ ] Token persists after app restart
- [ ] Can register new account
- [ ] Registration validation works
- [ ] Can log out successfully

#### Voice Recording
- [ ] Can record audio
- [ ] Recording stops at max duration
- [ ] Can stop recording manually
- [ ] Permission request works

#### Polish Feature
- [ ] Can polish recording
- [ ] Results display correctly
- [ ] Can save results
- [ ] Can clear results
- [ ] Settings are applied

#### Translate Feature
- [ ] Can translate recording
- [ ] Language selection works
- [ ] Results display correctly
- [ ] Can save translations

#### Saved Items
- [ ] Can view saved items
- [ ] Can delete saved items
- [ ] Items refresh correctly
- [ ] Empty state displays

### Automated Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run linter
npm run lint

# Run type checker
npm run type-check

# Run all validations
npm run validate
```

---

## Troubleshooting

### Issue: TypeScript errors after updates

**Solution:** Clear TypeScript cache and rebuild
```bash
rm -rf .expo
rm -rf node_modules
npm install
npm run type-check
```

### Issue: Token not persisting

**Solution:** Check token manager initialization
```bash
# Add logging
console.log('Token manager initialized:', await tokenManager.hasToken());
```

### Issue: Linter errors

**Solution:** Auto-fix where possible
```bash
npm run lint:fix
```

---

## Next Steps

After implementing these improvements:

1. **Review Code Quality Metrics**
   - Run `npm run test:coverage`
   - Aim for >80% code coverage

2. **Performance Testing**
   - Test on low-end devices
   - Profile with React DevTools
   - Check bundle size

3. **Security Audit**
   - Review API key storage
   - Check token handling
   - Test error scenarios

4. **Documentation**
   - Update README.md
   - Add API documentation
   - Create contribution guidelines

5. **Deployment**
   - Set up CI/CD pipeline
   - Configure staging environment
   - Plan production release

---

## Support

If you encounter issues during implementation:

1. Check the error logs in detail
2. Review the specific file mentioned in errors
3. Compare with the example implementations
4. Test each phase independently before moving forward

Remember: Make incremental changes and test frequently!
