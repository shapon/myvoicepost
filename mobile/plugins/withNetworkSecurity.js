const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');
const { mkdirSync, writeFileSync, existsSync } = require('fs');
const { resolve, dirname } = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Production domain with certificate pinning -->
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">myvoicepost.com</domain>
    <domain includeSubdomains="true">www.myvoicepost.com</domain>

    <pin-set expiration="2027-01-01">
      <!-- Leaf cert SPKI hash (current www.myvoicepost.com) -->
      <!-- Regenerate if cert rotates: openssl s_client -connect www.myvoicepost.com:443 -servername www.myvoicepost.com | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64 -->
      <pin digest="SHA-256">PTGC2S83lgQOnaHDRunoAgh+KlJJkAjoSEWXAPbAJgY=</pin>
      <!-- Intermediate CA SPKI hash (backup pin) -->
      <pin digest="SHA-256">kZwN96eHtZftBWrOZUsd6cA4es80n3NzSk/XtYz2EqQ=</pin>
    </pin-set>

    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </domain-config>

  <!-- Block all cleartext (HTTP) traffic by default -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>`;

function withNetworkSecurity(expoConfig) {
  return withAndroidManifest(expoConfig, async (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults
    );

    mainApplication.$['android:networkSecurityConfig'] =
      '@xml/network_security_config';

    const resXmlDir = resolve(
      config.modRequest.platformProjectRoot,
      'app/src/main/res/xml'
    );

    if (!existsSync(resXmlDir)) {
      mkdirSync(resXmlDir, { recursive: true });
    }

    writeFileSync(
      resolve(resXmlDir, 'network_security_config.xml'),
      NETWORK_SECURITY_CONFIG
    );

    return config;
  });
}

module.exports = withNetworkSecurity;
