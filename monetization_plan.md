# TalkSync Monetization Action Plan

## Overview
This document outlines a roadmap for transitioning TalkSync from a free, open-source tool to a monetized SaaS/Desktop application using a "Bring Your Own Key" (BYOK) Freemium or Lifetime License model.

## Recommended Tech Stack (Free-Tier Friendly)
- **Frontend/Desktop Shell:** Tauri (React + Rust) - *Existing*
- **Database & Authentication:** Firebase (Firestore & Firebase Auth)
- **Payments:** Razorpay (Lowest fee gateway for the Indian/Domestic market)
- **Backend Logic:** Firebase Cloud Functions

---

## Monetization Model Options
1.  **Usage-Based Freemium:** Users get 1-2 free interviews. After the limit, they must subscribe for ₹999/mo (using Razorpay Subscriptions) to continue using the software (while still providing their own API keys).
2.  **Lifetime License (Recommended):** A single 1-time purchase of ₹2499 for a lifetime license key via Razorpay Payment Links. This is the simplest to implement for desktop apps and highly appealing to users.
3.  **Pro Tier (Fully Managed):** Charge ₹1499/mo, but *you* provide the OpenAI and Deepgram API keys via a secure backend proxy. (Requires higher operational overhead). 

---

## 🛠️ Implementation Plan: Step-by-Step

### Phase 1: Infrastructure Setup (Firebase & Razorpay)
**Goal:** Establish the foundation for users and payments.

- [ ] **Task 1: Firebase Setup**
  - Create a free project on [Firebase](https://firebase.google.com).
  - Enable Authentication (Email/Password or Google Sign-In).
  - Create a Firestore Database `users` collection with documents containing: `email`, `subscription_tier` (default "free"), `license_key` (nullable/generated).
- [ ] **Task 2: Razorpay Setup**
  - Create a merchant account on [Razorpay](https://razorpay.com).
  - Generate API Keys (Test Mode initially).
  - Depending on the model, set up a Payment Link (for Lifetime License) or Subscription Plans.
- [ ] **Task 3: Payment Verification & Licensing System**
  - Create a Firebase Cloud Function to handle Razorpay Webhooks (e.g., `payment.captured` or `subscription.charged`).
  - Configure the function to verify the Payment Signature (to prevent spoofing).
  - **Custom Licensing:** Since Razorpay is purely a payment gateway (unlike Lemon Squeezy), the Cloud Function must generate a unique "License Key" string upon successful payment.
  - Safely store the new `license_key` and update `subscription_tier` in the user's Firestore document.
  - Configure the function to email the new license key to the user via SendGrid/Postmark, or simply display it on a success webpage.

### Phase 2: App Integration (Tauri Frontend)
**Goal:** Lock features behind a paywall and manage user sessions.

- [ ] **Task 4: Authentication UI**
  - Use the `firebase` npm SDK to manage authentication state.
  - Build a simple Login / Sign-up screen inside TalkSync.
  - Ensure the app cannot progress to the "New Session" screen without a valid authenticated user session.
- [ ] **Task 5: License Key UI**
  - Add a "Upgrade to Pro" section in the `Settings` panel.
  - Include a button linking to your Razorpay Payment Link/Checkout page.
  - Add an input field for users to paste their generated "License Key".
- [ ] **Task 6: License Verification Logic**
  - When a user enters a license key in the app, query Firestore via Firebase Client SDK (or a secure Cloud Function) to verify if the key is valid and linked to their account.
  - Store the validated state locally (e.g., `isPro: true`) securely.

### Phase 3: Enforcing the Paywall
**Goal:** Restrict usage for non-paying users.

- [ ] **Task 7: Usage Tracking (If Freemium)**
  - Track the number of completed sessions in the user's Firestore document.
  - Before starting a new live session, check if `session_count >= MAX_FREE_SESSIONS` AND `subscription_tier == "free"`.
  - Block access and show an upgrade modal if limits are exceeded.
- [ ] **Task 8: Feature Toggles**
  - Conditionally render features based on the `isPro` state (e.g., "Advanced Interview Techniques" or "Practice Mode" are only available to Pro users).

### Phase 4: Launch & Operations
**Goal:** Ensure a smooth transition for existing and new users.

- [ ] **Task 9: Beta Testing**
  - Create test purchases using Razorpay's Test Credentials.
  - Verify the end-to-end flow: Checkout -> Webhook -> Signature Verification -> Key Generation -> DB Update -> App Unlocks.
- [ ] **Task 10: Documentation & Support**
  - Update `README.md` to explain the pricing model.
  - Set up a support email or Discord for users struggling with license keys or payments.
