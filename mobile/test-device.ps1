# MyVoicePost - Device Testing & Troubleshooting Script
# Use this script to test and debug the app on real devices

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('install', 'uninstall', 'logs', 'crash', 'restart', 'info')]
    [string]$Action = 'info'
)

function Show-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Get-DeviceInfo {
    Show-Header "Device Information"

    $devices = & adb devices 2>$null | Select-String "device$"
    if (-not $devices) {
        Write-Host "✗ No device connected!" -ForegroundColor Red
        Write-Host "  Connect your device via USB and enable USB debugging" -ForegroundColor Yellow
        return $false
    }

    Write-Host "✓ Device connected" -ForegroundColor Green
    Write-Host ""

    Write-Host "Device Details:" -ForegroundColor Yellow
    $manufacturer = & adb shell getprop ro.product.manufacturer
    $model = & adb shell getprop ro.product.model
    $android = & adb shell getprop ro.build.version.release
    $sdk = & adb shell getprop ro.build.version.sdk
    $abi = & adb shell getprop ro.product.cpu.abi

    Write-Host "  Manufacturer: $manufacturer" -ForegroundColor White
    Write-Host "  Model: $model" -ForegroundColor White
    Write-Host "  Android: $android (API $sdk)" -ForegroundColor White
    Write-Host "  CPU ABI: $abi" -ForegroundColor White
    Write-Host ""

    # Check if app is installed
    $installed = & adb shell pm list packages | Select-String "com.myvoicepost.app"
    if ($installed) {
        Write-Host "✓ App is installed" -ForegroundColor Green
        $version = & adb shell dumpsys package com.myvoicepost.app | Select-String "versionName"
        Write-Host "  $version" -ForegroundColor Gray
    } else {
        Write-Host "✗ App is not installed" -ForegroundColor Yellow
    }

    return $true
}

function Install-App {
    Show-Header "Installing App"

    if (-not (Get-DeviceInfo)) {
        return
    }

    $apkPath = "android\app\build\outputs\apk\release"

    if (-not (Test-Path $apkPath)) {
        Write-Host "✗ APK not found! Build the app first." -ForegroundColor Red
        Write-Host "  Run: .\build-android.ps1" -ForegroundColor Yellow
        return
    }

    # Get device ABI
    $abi = & adb shell getprop ro.product.cpu.abi

    # Determine which APK to install
    $apkToInstall = "$apkPath\app-universal-release.apk"
    if (Test-Path "$apkPath\app-arm64-v8a-release.apk" -and $abi -like "*arm64-v8a*") {
        $apkToInstall = "$apkPath\app-arm64-v8a-release.apk"
        Write-Host "Using ARM64 APK (optimized for your device)" -ForegroundColor Green
    } elseif (Test-Path "$apkPath\app-armeabi-v7a-release.apk" -and $abi -like "*armeabi-v7a*") {
        $apkToInstall = "$apkPath\app-armeabi-v7a-release.apk"
        Write-Host "Using ARMv7 APK (optimized for your device)" -ForegroundColor Green
    } else {
        Write-Host "Using Universal APK" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Installing..." -ForegroundColor Yellow
    & adb install -r $apkToInstall

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Installation successful!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ Installation failed!" -ForegroundColor Red
        Write-Host "  Try uninstalling first: .\test-device.ps1 -Action uninstall" -ForegroundColor Yellow
    }
}

function Uninstall-App {
    Show-Header "Uninstalling App"

    if (-not (Get-DeviceInfo)) {
        return
    }

    Write-Host "Uninstalling..." -ForegroundColor Yellow
    & adb uninstall com.myvoicepost.app

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Uninstall successful!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ Uninstall failed (app may not be installed)" -ForegroundColor Yellow
    }
}

function Show-Logs {
    Show-Header "Live Logs (Press Ctrl+C to stop)"

    if (-not (Get-DeviceInfo)) {
        return
    }

    Write-Host "Filtering logs for MyVoicePost..." -ForegroundColor Yellow
    Write-Host ""

    & adb logcat -c  # Clear old logs
    & adb logcat | Select-String "myvoicepost|ReactNativeJS|ReactNative|MainActivity" -CaseSensitive:$false
}

function Show-CrashLogs {
    Show-Header "Crash Logs"

    if (-not (Get-DeviceInfo)) {
        return
    }

    Write-Host "Searching for crash logs..." -ForegroundColor Yellow
    Write-Host ""

    $crashes = & adb logcat -d | Select-String "FATAL|AndroidRuntime|crash|myvoicepost" -Context 5 -CaseSensitive:$false | Select-Object -Last 50

    if ($crashes) {
        Write-Host "Recent crashes found:" -ForegroundColor Red
        $crashes | ForEach-Object { Write-Host $_ -ForegroundColor White }
    } else {
        Write-Host "✓ No recent crashes detected" -ForegroundColor Green
    }
}

function Restart-App {
    Show-Header "Restarting App"

    if (-not (Get-DeviceInfo)) {
        return
    }

    Write-Host "Stopping app..." -ForegroundColor Yellow
    & adb shell am force-stop com.myvoicepost.app
    Start-Sleep -Seconds 1

    Write-Host "Starting app..." -ForegroundColor Yellow
    & adb shell am start -n com.myvoicepost.app/.MainActivity

    Write-Host ""
    Write-Host "✓ App restarted" -ForegroundColor Green
    Write-Host ""

    $monitor = Read-Host "Monitor logs? (Y/N)"
    if ($monitor -eq "Y" -or $monitor -eq "y") {
        Show-Logs
    }
}

# Main execution
switch ($Action) {
    'install' { Install-App }
    'uninstall' { Uninstall-App }
    'logs' { Show-Logs }
    'crash' { Show-CrashLogs }
    'restart' { Restart-App }
    'info' { Get-DeviceInfo }
}

Write-Host ""
Write-Host "Available commands:" -ForegroundColor Cyan
Write-Host "  .\test-device.ps1 -Action info      # Show device & app info" -ForegroundColor Gray
Write-Host "  .\test-device.ps1 -Action install   # Install app on device" -ForegroundColor Gray
Write-Host "  .\test-device.ps1 -Action uninstall # Uninstall app from device" -ForegroundColor Gray
Write-Host "  .\test-device.ps1 -Action logs      # Show live logs" -ForegroundColor Gray
Write-Host "  .\test-device.ps1 -Action crash     # Show crash logs" -ForegroundColor Gray
Write-Host "  .\test-device.ps1 -Action restart   # Restart the app" -ForegroundColor Gray
Write-Host ""
