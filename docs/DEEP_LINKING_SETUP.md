# Deep Linking Setup for MyVoicePost Mobile App

This document explains how to configure deep linking for password reset functionality in the MyVoicePost mobile app.

## Overview

When a user clicks the password reset link in their email, the link format is:
```
https://www.myvoicepost.com/api/v1/auth/reset-password?token=XYZ
```

This URL:
1. Opens the mobile app directly if installed (via Universal Links/App Links)
2. Falls back to a web page that attempts to open the app
3. Provides a web fallback option if the app is not installed

---

## 1. Android Configuration (App Links)

### Step 1: Create `assetlinks.json` for Domain Verification

Create the file and host it at:
```
https://www.myvoicepost.com/.well-known/assetlinks.json
```

**Content:**
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.myvoicepost.app",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```

> **Get SHA256 fingerprint:**
> ```bash
> keytool -list -v -keystore your-keystore.jks -alias your-alias
> ```

### Step 2: Android Manifest Configuration

**For React Native** (`android/app/src/main/AndroidManifest.xml`):
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application ...>
        <activity
            android:name=".MainActivity"
            android:launchMode="singleTask"
            android:exported="true">
            
            <!-- Deep Link: Custom Scheme -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="myvoicepost" />
            </intent-filter>
            
            <!-- App Link: HTTPS Universal Link -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="www.myvoicepost.com"
                    android:pathPrefix="/api/v1/auth/reset-password" />
            </intent-filter>
            
            <!-- Also handle myvoicepost.com without www -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="myvoicepost.com"
                    android:pathPrefix="/api/v1/auth/reset-password" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

**For Flutter** (`android/app/src/main/AndroidManifest.xml`):
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application ...>
        <activity
            android:name=".MainActivity"
            android:launchMode="singleTask"
            android:exported="true">
            
            <!-- Same intent-filters as React Native above -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="myvoicepost" />
            </intent-filter>
            
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="www.myvoicepost.com"
                    android:pathPrefix="/api/v1/auth/reset-password" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

---

## 2. iOS Configuration (Universal Links)

### Step 1: Create `apple-app-site-association` File

Host this file at:
```
https://www.myvoicepost.com/.well-known/apple-app-site-association
```

**Content (no file extension, must be valid JSON):**
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.myvoicepost.app",
        "paths": [
          "/api/v1/auth/reset-password*",
          "/reset-password*"
        ]
      }
    ]
  }
}
```

> Replace `TEAM_ID` with your Apple Developer Team ID.

### Step 2: Xcode Configuration

**For React Native** (`ios/MyVoicePost/MyVoicePost.entitlements`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:www.myvoicepost.com</string>
        <string>applinks:myvoicepost.com</string>
    </array>
</dict>
</plist>
```

**Also add URL Scheme in `Info.plist`:**
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myvoicepost</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.myvoicepost.app</string>
    </dict>
</array>
```

---

## 3. React Native Implementation

### Install Dependencies
```bash
npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

### App Entry Point (`App.tsx`)

```tsx
import React, { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import your screens
import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';

export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  ResetPassword: { token?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = React.createRef<NavigationContainerRef<RootStackParamList>>();

// Parse deep link URL and extract token
function parseDeepLink(url: string): { screen: string; params: any } | null {
  try {
    // Handle both custom scheme and https URLs
    // myvoicepost://reset-password?token=XYZ
    // https://www.myvoicepost.com/api/v1/auth/reset-password?token=XYZ
    
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('token');
    
    // Check for reset-password path
    if (url.includes('reset-password') && token) {
      return {
        screen: 'ResetPassword',
        params: { token },
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing deep link:', error);
    return null;
  }
}

// Navigate to screen from deep link
function handleDeepLink(url: string) {
  const result = parseDeepLink(url);
  if (result && navigationRef.current) {
    console.log('Navigating to:', result.screen, 'with params:', result.params);
    navigationRef.current.navigate(result.screen as any, result.params);
  }
}

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Home');
  const [initialParams, setInitialParams] = useState<any>(undefined);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check if app was opened from a deep link
    async function getInitialURL() {
      const url = await Linking.getInitialURL();
      if (url) {
        console.log('App opened with URL:', url);
        const result = parseDeepLink(url);
        if (result) {
          setInitialRoute(result.screen as keyof RootStackParamList);
          setInitialParams(result.params);
        }
      }
      setIsReady(true);
    }

    getInitialURL();

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('Deep link received:', url);
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!isReady) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen 
          name="ResetPassword" 
          component={ResetPasswordScreen}
          initialParams={initialParams}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### Reset Password Screen (`screens/ResetPasswordScreen.tsx`)

```tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

const API_BASE_URL = 'https://www.myvoicepost.com';

export default function ResetPasswordScreen({ route, navigation }: Props) {
  // Extract token from route params (populated from deep link)
  const tokenFromDeepLink = route.params?.token || '';

  // Form state - token is auto-populated from deep link
  const [token, setToken] = useState(tokenFromDeepLink);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Update token if route params change
  useEffect(() => {
    if (route.params?.token) {
      setToken(route.params.token);
      console.log('Token auto-populated from deep link:', route.params.token.substring(0, 8) + '...');
    }
  }, [route.params?.token]);

  const handleResetPassword = async () => {
    // Validation
    if (!token.trim()) {
      setError('Reset token is required');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/p/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        Alert.alert(
          'Success',
          'Your password has been reset successfully. You can now login with your new password.',
          [
            {
              text: 'Go to Login',
              onPress: () => navigation.replace('Login'),
            },
          ]
        );
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      console.error('Reset password error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>
        {tokenFromDeepLink 
          ? 'Enter your new password below.'
          : 'Enter your reset code and new password.'}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Token field - hidden or read-only if from deep link */}
      {!tokenFromDeepLink && (
        <TextInput
          style={styles.input}
          placeholder="Reset Code"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="New Password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleResetPassword}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Reset Password</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.linkText}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  error: {
    color: '#e74c3c',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#667eea',
    fontSize: 16,
  },
});
```

---

## 4. Flutter Implementation

### Update `pubspec.yaml`
```yaml
dependencies:
  flutter:
    sdk: flutter
  uni_links: ^0.5.1
  go_router: ^12.0.0  # or use your preferred navigation package
```

### App Entry Point (`lib/main.dart`)

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uni_links/uni_links.dart';
import 'package:flutter/services.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/reset_password_screen.dart';

void main() {
  runApp(const MyVoicePostApp());
}

class MyVoicePostApp extends StatefulWidget {
  const MyVoicePostApp({super.key});

  @override
  State<MyVoicePostApp> createState() => _MyVoicePostAppState();
}

class _MyVoicePostAppState extends State<MyVoicePostApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  StreamSubscription? _linkSubscription;
  String? _initialToken;
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    _initDeepLinks();
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initDeepLinks() async {
    // Handle app opened from terminated state via deep link
    try {
      final initialLink = await getInitialLink();
      if (initialLink != null) {
        debugPrint('App opened with link: $initialLink');
        _initialToken = _extractTokenFromUrl(initialLink);
      }
    } on PlatformException {
      debugPrint('Failed to get initial link');
    }

    setState(() {
      _isInitialized = true;
    });

    // Handle deep links while app is running
    _linkSubscription = linkStream.listen((String? link) {
      if (link != null) {
        debugPrint('Deep link received: $link');
        _handleDeepLink(link);
      }
    }, onError: (err) {
      debugPrint('Deep link error: $err');
    });
  }

  String? _extractTokenFromUrl(String url) {
    try {
      final uri = Uri.parse(url);
      return uri.queryParameters['token'];
    } catch (e) {
      debugPrint('Error parsing URL: $e');
      return null;
    }
  }

  void _handleDeepLink(String url) {
    final token = _extractTokenFromUrl(url);
    if (token != null && url.contains('reset-password')) {
      _navigatorKey.currentState?.pushNamed(
        '/reset-password',
        arguments: {'token': token},
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isInitialized) {
      return const MaterialApp(
        home: Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    return MaterialApp(
      title: 'MyVoicePost',
      navigatorKey: _navigatorKey,
      theme: ThemeData(
        primarySwatch: Colors.deepPurple,
        useMaterial3: true,
      ),
      initialRoute: _initialToken != null ? '/reset-password' : '/',
      onGenerateRoute: (settings) {
        switch (settings.name) {
          case '/':
            return MaterialPageRoute(builder: (_) => const HomeScreen());
          case '/login':
            return MaterialPageRoute(builder: (_) => const LoginScreen());
          case '/reset-password':
            // Get token from arguments or initial token
            final args = settings.arguments as Map<String, dynamic>?;
            final token = args?['token'] ?? _initialToken;
            return MaterialPageRoute(
              builder: (_) => ResetPasswordScreen(token: token),
            );
          default:
            return MaterialPageRoute(builder: (_) => const HomeScreen());
        }
      },
    );
  }
}
```

### Reset Password Screen (`lib/screens/reset_password_screen.dart`)

```dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class ResetPasswordScreen extends StatefulWidget {
  final String? token;

  const ResetPasswordScreen({super.key, this.token});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _tokenController;
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  
  bool _isLoading = false;
  String? _error;

  static const String apiBaseUrl = 'https://www.myvoicepost.com';

  @override
  void initState() {
    super.initState();
    // Auto-populate token from deep link
    _tokenController = TextEditingController(text: widget.token ?? '');
    
    if (widget.token != null) {
      debugPrint('Token auto-populated from deep link: ${widget.token!.substring(0, 8)}...');
    }
  }

  @override
  void dispose() {
    _tokenController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleResetPassword() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/v1/p/reset-password'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'token': _tokenController.text,
          'newPassword': _newPasswordController.text,
          'confirmPassword': _confirmPasswordController.text,
        }),
      );

      final data = jsonDecode(response.body);

      if (data['success'] == true) {
        if (!mounted) return;
        
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
            title: const Text('Success'),
            content: const Text(
              'Your password has been reset successfully. You can now login with your new password.',
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).pushReplacementNamed('/login');
                },
                child: const Text('Go to Login'),
              ),
            ],
          ),
        );
      } else {
        setState(() {
          _error = data['error'] ?? 'Failed to reset password';
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Network error. Please try again.';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasTokenFromDeepLink = widget.token != null && widget.token!.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reset Password'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Reset Password',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                Text(
                  hasTokenFromDeepLink
                      ? 'Enter your new password below.'
                      : 'Enter your reset code and new password.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Colors.grey[600],
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 30),
                
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red[50],
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _error!,
                      style: TextStyle(color: Colors.red[700]),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                // Token field - hidden if from deep link
                if (!hasTokenFromDeepLink) ...[
                  TextFormField(
                    controller: _tokenController,
                    decoration: const InputDecoration(
                      labelText: 'Reset Code',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Reset code is required';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                ],

                TextFormField(
                  controller: _newPasswordController,
                  decoration: const InputDecoration(
                    labelText: 'New Password',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                  validator: (value) {
                    if (value == null || value.length < 6) {
                      return 'Password must be at least 6 characters';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                TextFormField(
                  controller: _confirmPasswordController,
                  decoration: const InputDecoration(
                    labelText: 'Confirm New Password',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                  validator: (value) {
                    if (value != _newPasswordController.text) {
                      return 'Passwords do not match';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),

                ElevatedButton(
                  onPressed: _isLoading ? null : _handleResetPassword,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'Reset Password',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
                const SizedBox(height: 16),

                TextButton(
                  onPressed: () => Navigator.of(context).pushReplacementNamed('/login'),
                  child: const Text('Back to Login'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

---

## 5. Server Configuration

### Required Environment Variables

Add these to your `.env` file:

```env
# Deep Link Configuration
DEEP_LINK_BASE_URL=https://www.myvoicepost.com
APP_SCHEME=myvoicepost
WEB_APP_URL=https://myvoicepost.com

# SMTP Configuration (for sending password reset emails)
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
EMAIL_FROM=noreply@myvoicepost.com
```

### Hosting `.well-known` Files

For Vercel deployment, create these files:

**`public/.well-known/assetlinks.json`** (Android):
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.myvoicepost.app",
      "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
    }
  }
]
```

**`public/.well-known/apple-app-site-association`** (iOS):
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.myvoicepost.app",
        "paths": ["/api/v1/auth/reset-password*", "/reset-password*"]
      }
    ]
  }
}
```

### Vercel Configuration (`vercel.json`)

Add routes to serve `.well-known` files with correct content-type:

```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [
        { "key": "Content-Type", "value": "application/json" }
      ]
    },
    {
      "source": "/.well-known/assetlinks.json",
      "headers": [
        { "key": "Content-Type", "value": "application/json" }
      ]
    }
  ]
}
```

---

## 6. Testing Deep Links

### Test on Android
```bash
# Test custom scheme
adb shell am start -a android.intent.action.VIEW -d "myvoicepost://reset-password?token=test-token-123"

# Test HTTPS App Link
adb shell am start -a android.intent.action.VIEW -d "https://www.myvoicepost.com/api/v1/auth/reset-password?token=test-token-123"
```

### Test on iOS
```bash
# Test custom scheme via Safari
# Open Safari and navigate to: myvoicepost://reset-password?token=test-token-123

# Test Universal Link via Notes app
# Copy https://www.myvoicepost.com/api/v1/auth/reset-password?token=test-token-123
# Paste in Notes app and tap the link
```

### Test via API
```bash
# Request password reset
curl -X POST https://www.myvoicepost.com/api/v1/p/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# The response (in non-production) will include:
# {
#   "success": true,
#   "message": "...",
#   "universalLink": "https://www.myvoicepost.com/api/v1/auth/reset-password?token=...",
#   "customSchemeLink": "myvoicepost://reset-password?token=..."
# }
```

---

## Summary

1. **Email Link Format**: `https://www.myvoicepost.com/api/v1/auth/reset-password?token=XYZ`
2. **Deep Link Handling**: The server endpoint serves a smart redirect page that attempts to open the mobile app
3. **Token Auto-Population**: The ResetPassword screen automatically populates the token from deep link params
4. **Fallback**: If the app is not installed, users can continue on the web or install the app

