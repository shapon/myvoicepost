# Build script for MyVoicePost Android App
# This script builds the release APK for real devices

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MyVoicePost - Android Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to android directory
Set-Location -Path "$PSScriptRoot\android"

Write-Host "[1/3] Stopping existing Gradle daemons..." -ForegroundColor Yellow
.\gradlew --stop
Write-Host "✓ Gradle daemons stopped" -ForegroundColor Green
Write-Host ""

Write-Host "[2/3] Building release APKs for all architectures..." -ForegroundColor Yellow
Write-Host "      This may take 5-10 minutes for the first build..." -ForegroundColor Gray
.\gradlew assembleRelease

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Build successful!" -ForegroundColor Green
    Write-Host ""

    Write-Host "[3/3] Build outputs:" -ForegroundColor Yellow
    $apkPath = "app\build\outputs\apk\release"

    if (Test-Path $apkPath) {
        $apks = Get-ChildItem $apkPath -Filter "*.apk"

        if ($apks.Count -gt 0) {
            Write-Host ""
            Write-Host "APK files generated:" -ForegroundColor Cyan
            Write-Host "----------------------------------------" -ForegroundColor Gray

            foreach ($apk in $apks) {
                $sizeMB = [math]::Round($apk.Length / 1MB, 2)

                if ($apk.Name -like "*arm64-v8a*") {
                    Write-Host "  ⭐ $($apk.Name)" -ForegroundColor Green
                    Write-Host "     Size: $sizeMB MB" -ForegroundColor Gray
                    Write-Host "     Use this for modern phones (64-bit ARM)" -ForegroundColor Gray
                } elseif ($apk.Name -like "*universal*") {
                    Write-Host "  ⭐ $($apk.Name)" -ForegroundColor Green
                    Write-Host "     Size: $sizeMB MB" -ForegroundColor Gray
                    Write-Host "     Works on ALL devices" -ForegroundColor Gray
                } else {
                    Write-Host "  • $($apk.Name)" -ForegroundColor White
                    Write-Host "     Size: $sizeMB MB" -ForegroundColor Gray
                }
            }

            Write-Host ""
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host "Installation Instructions:" -ForegroundColor Cyan
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "For most modern phones (recommended):" -ForegroundColor Yellow
            Write-Host "  adb install $apkPath\app-arm64-v8a-release.apk" -ForegroundColor White
            Write-Host ""
            Write-Host "Or use universal APK (works on any device):" -ForegroundColor Yellow
            Write-Host "  adb install $apkPath\app-universal-release.apk" -ForegroundColor White
            Write-Host ""
            Write-Host "If you get 'INSTALL_FAILED_UPDATE_INCOMPATIBLE', uninstall first:" -ForegroundColor Yellow
            Write-Host "  adb uninstall com.myvoicepost.app" -ForegroundColor White
            Write-Host ""

            # Check if device is connected
            $devices = & adb devices 2>$null | Select-String "device$"
            if ($devices) {
                Write-Host "========================================" -ForegroundColor Cyan
                Write-Host "Connected Device Detected!" -ForegroundColor Green
                Write-Host "========================================" -ForegroundColor Cyan
                Write-Host ""

                $install = Read-Host "Install on connected device now? (Y/N)"
                if ($install -eq "Y" -or $install -eq "y") {
                    Write-Host ""
                    Write-Host "Checking device architecture..." -ForegroundColor Yellow
                    $abi = & adb shell getprop ro.product.cpu.abi
                    Write-Host "Device ABI: $abi" -ForegroundColor Cyan

                    # Determine which APK to install
                    $apkToInstall = "$apkPath\app-universal-release.apk"
                    if ($abi -like "*arm64-v8a*") {
                        $apkToInstall = "$apkPath\app-arm64-v8a-release.apk"
                        Write-Host "Using optimized ARM64 APK" -ForegroundColor Green
                    } elseif ($abi -like "*armeabi-v7a*") {
                        $apkToInstall = "$apkPath\app-armeabi-v7a-release.apk"
                        Write-Host "Using optimized ARMv7 APK" -ForegroundColor Green
                    } else {
                        Write-Host "Using universal APK" -ForegroundColor Green
                    }

                    Write-Host ""
                    Write-Host "Installing APK..." -ForegroundColor Yellow
                    & adb install -r $apkToInstall

                    if ($LASTEXITCODE -eq 0) {
                        Write-Host ""
                        Write-Host "✓ Installation successful!" -ForegroundColor Green
                        Write-Host ""
                        Write-Host "Launch the app on your device to test." -ForegroundColor Cyan
                        Write-Host ""

                        $launch = Read-Host "Launch app now? (Y/N)"
                        if ($launch -eq "Y" -or $launch -eq "y") {
                            & adb shell am start -n com.myvoicepost.app/.MainActivity
                            Write-Host ""
                            Write-Host "Monitor logs:" -ForegroundColor Yellow
                            Write-Host "  adb logcat | Select-String 'myvoicepost|ReactNative'" -ForegroundColor White
                        }
                    } else {
                        Write-Host ""
                        Write-Host "✗ Installation failed!" -ForegroundColor Red
                        Write-Host "Try uninstalling first: adb uninstall com.myvoicepost.app" -ForegroundColor Yellow
                    }
                }
            }

        } else {
            Write-Host "⚠ No APK files found!" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠ APK output directory not found!" -ForegroundColor Red
    }

} else {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    Write-Host "Check the error messages above for details." -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build completed successfully! 🎉" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
