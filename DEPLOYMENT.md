# AfriBay — Web Deployment & Google Play Store Packaging Guide

This guide walks you through deploying AfriBay as a **fast, responsive Progressive Web App (PWA)** and packaging it as an **Android App Bundle (`.aab`) for the Google Play Store**.

---

## 1. Architecture Overview

AfriBay is structured to run as:
1. **Responsive Web App / PWA**:
   * Works on any screen size (mobile, tablet, desktop).
   * Supports mobile status bars & notches (`viewport-fit=cover`, `env(safe-area-inset-*)`).
   * Offline support & instant loading via Service Worker ([`sw.js`](./sw.js)).
   * App icons & installation prompt via Web App Manifest ([`manifest.json`](./manifest.json)).
2. **Google Play Store Ready**:
   * Packaged via **Trusted Web Activity (TWA)**, Google's official, recommended approach for PWAs.
   * Runs natively in full-screen without a browser URL bar when verified with [`.well-known/assetlinks.json`](./.well-known/assetlinks.json).
   * When you update your web code, your Play Store app updates **instantly** without having to re-submit new builds for every frontend change!

---

## 2. Deploying the Responsive Web App

You can deploy AfriBay to any static or serverless web host in 2 minutes:

### Option A: Vercel (Recommended)
1. Install the Vercel CLI (or connect your GitHub repository in the [Vercel Dashboard](https://vercel.com)):
   ```bash
   npm install -g vercel
   vercel
   ```
2. AfriBay includes a pre-configured [`vercel.json`](./vercel.json) that automatically routes the frontend and serves static assets.
3. For production:
   ```bash
   vercel --prod
   ```

### Option B: Netlify
1. Connect your repository on [Netlify](https://www.netlify.com) or use the Netlify CLI:
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod --dir=.
   ```
2. The included [`netlify.toml`](./netlify.toml) configures headers, cache rules, and single-page routing.

### Option C: Firebase Hosting
1. If using Firebase Hosting:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   firebase deploy --only hosting
   ```
2. The included [`firebase.json`](./firebase.json) handles rewrites to `index.html`.

---

## 3. Packaging for the Google Play Store

Once your web app is deployed (e.g. `https://afribay.com` or `https://your-app.vercel.app`), package it for Google Play using one of two methods:

---

### Method 1: PWABuilder (Fastest, No Android Studio Needed)

1. Open [**PWABuilder.com**](https://www.pwabuilder.com) in your browser.
2. Enter your live production URL (e.g. `https://afribay.com`) and click **Start**.
3. PWABuilder analyzes your PWA (Manifest, Service Worker, and Icons). AfriBay is already pre-configured to score 100%.
4. Click **Package For Stores** ➔ Select **Google Play**.
5. Configure your app settings:
   * **Package ID**: `com.afribay.app`
   * **App name**: `AfriBay`
   * **Version**: `1.0.0`
6. Click **Generate** to download your signed **`app-release-signed.aab`** file.
7. Upload this `.aab` directly to the **Google Play Console**!

---

### Method 2: Bubblewrap CLI (Google's Official Command-Line Tool)

Google created **Bubblewrap** to generate Play Store packages directly from the terminal.

1. Install Bubblewrap CLI:
   ```bash
   npm install -g @bubblewrap/cli
   ```
2. Initialize your project with your live domain:
   ```bash
   bubblewrap init --manifest=https://your-domain.com/manifest.json
   ```
3. Build the Android App Bundle:
   ```bash
   bubblewrap build
   ```
4. Bubblewrap generates `app-release-signed.aab` in your root directory.

---

### Method 3: Capacitor (Native Android Studio Wrapper)

If you require deep native Android SDK plugins or custom Java/Kotlin code:

1. Install Capacitor:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```
2. Initialize and add Android:
   ```bash
   npx cap init AfriBay com.afribay.app --web-dir .
   npx cap add android
   ```
3. Open in Android Studio:
   ```bash
   npx cap open android
   ```
4. In Android Studio, go to **Build ➔ Generate Signed Bundle / APK ➔ Android App Bundle**.

---

## 4. Removing the URL Bar (Digital Asset Links)

To make your Google Play app run in full immersive native mode (without an address bar at the top):

1. In the **Google Play Console**, go to **Release ➔ Setup ➔ App Integrity**.
2. Copy the **SHA-256 certificate fingerprint** under "App signing key certificate".
3. Open [`.well-known/assetlinks.json`](./.well-known/assetlinks.json) and replace the placeholder:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.afribay.app",
         "sha256_cert_fingerprints": [
           "PASTE_YOUR_COPIED_SHA256_FINGERPRINT_HERE"
         ]
       }
     }
   ]
   ```
4. Deploy the updated file to your live site so it is accessible at `https://your-domain.com/.well-known/assetlinks.json`.
5. Android verifies this automatically, providing a full-screen, native experience.

---

## 5. Google Play Console Submission Checklist

When publishing to Google Play:
* [ ] **Target Audience**: Age 18+ (Commerce & Marketplace).
* [ ] **App Category**: Shopping.
* [ ] **Privacy Policy URL**: Link to your live privacy terms.
* [ ] **App Icon**: 512x512 PNG provided in [`icons/icon-512.png`](./icons/icon-512.png).
* [ ] **Feature Graphic**: 1024x500 banner for Play Store listing.
* [ ] **Screenshots**: At least 4 screenshots (Home feed, Product Details, Escrow Checkout, Seller Dashboard).
* [ ] **Android App Bundle**: Upload `app-release-signed.aab`.
