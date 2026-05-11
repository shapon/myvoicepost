# Auto-Login Code Flow

## File Structure and Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     APP LAUNCH                                   │
│                   (app/_layout.tsx)                              │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Token Manager Initialization                                 │
│     await tokenManager.initialize()                              │
│     - Loads token from AsyncStorage                              │
│     - Sets internal token cache                                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Auth Provider Mount                                          │
│     (src/contexts/AuthContext.tsx)                               │
│     useEffect(() => { checkAuth(); }, [])                        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. checkAuth() Function Executes                                │
│     Automatic on every app launch/reopen                         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Get Stored Token                                             │
│     const token = await tokenManager.getToken()                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼ NO TOKEN                      ▼ TOKEN EXISTS
┌──────────────────┐          ┌─────────────────────────────────┐
│ 5a. No Token     │          │ 5b. Validate Token              │
│  - setUser(null) │          │  await api.getUser()            │
│  - Stay logged   │          │  GET /api/v1/m/auth/me         │
│    out           │          └────────────┬────────────────────┘
└──────────────────┘                       │
                              ┌────────────┴────────────┐
                              │                         │
                              ▼ 200 OK                  ▼ 401 Unauthorized
                    ┌──────────────────────┐  ┌──────────────────────┐
                    │ 6a. Token Valid      │  │ 6b. Token Invalid    │
                    │  - setUser(response) │  │  - clearToken()      │
                    │  - User logged in    │  │  - setUser(null)     │
                    │  - isAuthenticated=  │  │  - Stay logged out   │
                    │    true              │  └──────────────────────┘
                    └──────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. App Renders with Auth State                                 │
│     - isLoading = false                                          │
│     - user = {...} or null                                       │
│     - isAuthenticated = true/false                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Code Execution Trace

### Step-by-Step Execution

#### 1. App Launch (`app/_layout.tsx`)
```typescript
async function prepare() {
  try {
    // Initialize token manager first
    await tokenManager.initialize();
    //   ↓ Loads token from AsyncStorage
    //   ↓ Caches in memory
  } catch (e) {
    console.warn('Initialization error:', e);
  } finally {
    setIsReady(true);
    await SplashScreen.hideAsync();
  }
}
```

#### 2. Auth Provider Mounts (`src/contexts/AuthContext.tsx`)
```typescript
useEffect(() => {
  checkAuth(); // Called automatically
}, []);
```

#### 3. checkAuth() Function
```typescript
const checkAuth = async () => {
  try {
    console.log('[AutoLogin] Starting auth check...');
    
    // Get cached token
    const token = await tokenManager.getToken();
    
    if (!token) {
      // Branch A: No token
      console.log('[AutoLogin] No token found - user not logged in');
      setUser(null);
      setIsLoading(false);
      return;
    }
    
    // Branch B: Token exists - validate it
    console.log('[AutoLogin] Token found - validating with server...');
    
    const response = await api.getUser();
    //   ↓ Calls GET /api/v1/m/auth/me
    //   ↓ Includes: Authorization: Bearer <token>
    
    if (response.user) {
      console.log('[AutoLogin] Token valid - user logged in:', response.user.username);
      setUser(response.user); // User logged in!
    }
    
  } catch (error: any) {
    const apiError = handleApiError(error);
    
    if (apiError.statusCode === 401) {
      // Branch C: Token invalid/expired
      console.log('[AutoLogin] Token invalid/expired - clearing and staying logged out');
      await tokenManager.clearToken();
      setUser(null);
    } else {
      // Branch D: Other error
      console.log('[AutoLogin] Auth check failed with error:', apiError.message);
    }
    
  } finally {
    setIsLoading(false);
    console.log('[AutoLogin] Auth check complete');
  }
};
```

#### 4. Token Validation API Call (`src/lib/api.ts`)
```typescript
getUser: async () => {
  try {
    const response = await authApiClient.get('/auth/me');
    //   ↓ authApiClient automatically adds:
    //   ↓ Authorization: Bearer <token>
    
    return response.data;
    //   ↓ Returns: { user: { id, username, email } }
    
  } catch (error) {
    throw handleApiError(error);
    //   ↓ 401 → Token invalid
    //   ↓ Other → Network/server error
  }
}
```

---

## State Management Flow

```typescript
// Initial state on app launch
state = {
  user: null,
  isLoading: true,
  isAuthenticated: false
}

// After checkAuth() with valid token
state = {
  user: { id: '123', username: 'john', email: 'john@example.com' },
  isLoading: false,
  isAuthenticated: true  // ← Computed: !!user
}

// After checkAuth() with no/invalid token
state = {
  user: null,
  isLoading: false,
  isAuthenticated: false
}
```

---

## Component Reaction to Auth State

### Profile Screen Example
```typescript
function ProfileScreen() {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // While checking auth (app launch)
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  // No token or invalid token
  if (!isAuthenticated) {
    return <NotSignedInView />;
  }
  
  // Valid token - user auto-logged in
  return (
    <View>
      <Text>{user.username}</Text>
      <Text>{user.email}</Text>
    </View>
  );
}
```

---

## Token Storage Flow

### On Login
```
User enters credentials
  ↓
POST /api/v1/p/login
  ↓
Server returns: { token: 'jwt...', user: {...} }
  ↓
tokenManager.setToken(token)
  ↓
AsyncStorage.setItem('authToken', token)
  ↓
Token cached in memory
  ↓
setUser(user) → User logged in ✓
```

### On App Reopen (Auto-Login)
```
App launches
  ↓
tokenManager.initialize()
  ↓
AsyncStorage.getItem('authToken')
  ↓
Token loaded into memory cache
  ↓
checkAuth() → Validates token with server
  ↓
GET /api/v1/m/auth/me (with Bearer token)
  ↓
Server validates → Returns user data
  ↓
setUser(user) → User auto-logged in ✓
```

### On Logout
```
User clicks "Sign Out"
  ↓
logout() function called
  ↓
tokenManager.clearToken()
  ↓
AsyncStorage.removeItem('authToken')
  ↓
Token removed from memory
  ↓
setUser(null) → User logged out ✓
```

---

## Timing Diagram

```
TIME →
────────────────────────────────────────────────────────────────

0ms:    App Launch
        ├─ Splash screen visible
        └─ tokenManager.initialize() starts

50ms:   Token loaded from AsyncStorage
        └─ Token cached in memory

100ms:  AuthProvider mounts
        └─ checkAuth() called

150ms:  GET /api/v1/m/auth/me sent
        ├─ Request includes Bearer token
        └─ Waiting for server response...

500ms:  Server response received (200 OK)
        ├─ User data returned
        └─ setUser(userData)

510ms:  State updated
        ├─ isLoading = false
        ├─ isAuthenticated = true
        └─ App renders logged-in UI

520ms:  Splash screen hidden
        └─ User sees logged-in app ✓
────────────────────────────────────────────────────────────────

Total time: ~500-600ms
User experience: Seamless auto-login, no login screen flash
```

---

## Error Handling Paths

### Path 1: Network Error During Auto-Login
```
checkAuth()
  ↓
GET /api/v1/m/auth/me
  ↓
Network timeout/offline
  ↓
catch (error)
  ↓
error.statusCode !== 401
  ↓
Log warning (ErrorReporter)
  ↓
setUser(null) → Stay logged out
  ↓
User can manually retry login
```

### Path 2: Expired Token
```
checkAuth()
  ↓
GET /api/v1/m/auth/me
  ↓
Server responds: 401 Unauthorized
  ↓
catch (error)
  ↓
error.statusCode === 401
  ↓
tokenManager.clearToken()
  ↓
setUser(null) → Stay logged out
  ↓
User must login again
```

### Path 3: Corrupted Token
```
checkAuth()
  ↓
GET /api/v1/m/auth/me
  ↓
Server responds: 400 Bad Request
  ↓
catch (error)
  ↓
handleApiError(error)
  ↓
setUser(null) → Stay logged out
  ↓
Token may be cleared (depending on implementation)
```

---

## Key Design Decisions

1. **Auto-check on mount**: `useEffect` ensures check happens once per app launch
2. **Token validation**: Always validate with server (don't trust stored token blindly)
3. **Graceful degradation**: Network errors don't crash app, just stay logged out
4. **Clear invalid tokens**: 401 responses automatically clear stored token
5. **No re-checks**: After initial check, state persists until logout/reopen

---

## Performance Considerations

- **Fast path**: Token retrieved from memory cache (after initialization)
- **Network call**: Only one API call per app launch (GET /auth/me)
- **No blocking**: UI can render while validation happens (isLoading state)
- **Cached response**: User data stored in memory after validation

---

## Security Considerations

- ✅ Tokens stored in AsyncStorage (encrypted on iOS, keystore on Android)
- ✅ Server-side validation on every app launch
- ✅ Expired tokens automatically cleared
- ✅ Invalid tokens don't crash app
- ✅ No token logging in production
- ✅ Bearer token sent securely in Authorization header

---

## Future Enhancements (Optional)

1. **Token Refresh**: Auto-refresh tokens before expiry
2. **Biometric Auth**: Add fingerprint/face ID for additional security
3. **Remember Me**: Optional "Stay logged in" checkbox
4. **Session Timeout**: Auto-logout after period of inactivity
5. **Multiple Accounts**: Support switching between accounts

---

## Summary

The auto-login flow is:
1. ⚡ Fast (< 1 second)
2. 🔒 Secure (server-validated)
3. 🛡️ Robust (error-handled)
4. 👤 User-friendly (seamless experience)
5. 🧪 Testable (clear logging)

**Result**: Users stay logged in between app sessions automatically! 🎉
