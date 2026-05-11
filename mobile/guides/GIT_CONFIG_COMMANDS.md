# Git Commands - Configuration Lock & Test

## Current Status Check
```powershell
git status
git branch
```

## Lock Current Configuration (Android 14/15)

### 1. Stage All Files
```powershell
git add .
```

### 2. Commit Stable Configuration
```powershell
git commit -m "Lock stable Android config: Target 34 (Android 14), Compile 35 (Android 15)"
```

### 3. Push to Remote (if applicable)
```powershell
git push origin main
# Or your current branch name:
# git push origin <your-branch-name>
```

### 4. Create Tag for Stable Version
```powershell
git tag -a v1.0.0-android-stable -m "Stable Android 14/15 configuration"
git push origin v1.0.0-android-stable
```

## Create Android 16 Test Branch

### 1. Create and Switch to Test Branch
```powershell
git checkout -b test/android-16
```

### 2. Make Android 16 Changes
See: ANDROID_16_TEST_CONFIG.md

### 3. Commit Test Configuration
```powershell
git add android/build.gradle
git commit -m "Test: Update to Android 16 (API 36) for compatibility testing"
```

### 4. Build and Test
```powershell
cd android
.\gradlew clean assembleRelease
```

## Return to Stable Configuration

### Option A: Discard Test Branch (Recommended after testing)
```powershell
git checkout main
git branch -D test/android-16
```

### Option B: Keep Test Branch for Reference
```powershell
git checkout main
# test/android-16 branch remains available
```

### Option C: Merge Test Results (if successful)
```powershell
# Review changes first
git checkout main
git merge test/android-16
git push origin main
```

## View Configuration History
```powershell
git log --oneline --graph --all
git show HEAD
```

## Compare Configurations
```powershell
# Compare current with stable
git diff main test/android-16 android/build.gradle

# Compare specific files
git diff main:android/build.gradle test/android-16:android/build.gradle
```

## Emergency Rollback
```powershell
# If something goes wrong, rollback to last stable commit
git reset --hard HEAD
# Or to specific tag
git reset --hard v1.0.0-android-stable
```

## View Current Configuration
```powershell
# Show current branch
git branch --show-current

# Show last commit
git log -1

# Show modified files
git status
```

## Best Practices

1. **Always commit stable config** before making experimental changes
2. **Use branches** for testing new configurations
3. **Tag stable releases** for easy reference
4. **Document changes** in commit messages
5. **Test thoroughly** before merging experimental changes

## Quick Command Sequence

**To lock current config and prepare for testing:**
```powershell
# 1. Lock current
git add .
git commit -m "Lock stable Android 14/15 config"
git tag v1.0.0-stable
git push origin main --tags

# 2. Create test branch
git checkout -b test/android-16

# 3. After testing, return to stable
git checkout main
git branch -D test/android-16
```
