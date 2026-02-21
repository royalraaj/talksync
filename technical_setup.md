# TalkSync — Technical Documentation

This document covers everything required to set up, build, deploy, and troubleshoot the TalkSync architecture. It is designed for developers taking over the project or re-deploying it from scratch.

---

## 🏗️ Architecture Overview

TalkSync is composed of three main layers:
1. **Frontend**: A Tauri + React (Vite/TypeScript) desktop application.
2. **Backend**: A Node.js Express server hosted on Render (handles payments & license generation).
3. **Database & Auth**: Google Firebase (Firestore + Authentication).

---

## 🔑 Required API Keys & Secrets

You will need accounts on the following platforms. Gather these keys before starting the setup:

### Minimum Requirements:
- **Firebase config object** (`apiKey`, `authDomain`, `projectId` etc. for the frontend)
- **Firebase Service Account Key** (A JSON file for the Node.js backend to bypass security rules)
- **Razorpay Key ID & Key Secret** (For processing payments)
- **Razorpay Webhook Secret** (A custom string you make up for security)

### Optional LLM/Audio Keys (Users supply these in the app settings, but good for dev testing):
- Deepgram API Key (Speech-to-Text)
- OpenAI / Groq / Anthropic / Gemini API Keys

---

## 💻 1. Local Development Setup (Frontend)

The frontend is a desktop app built with Tauri. It requires Rust and Node.js.

### Prerequisites (Windows)
1. Install **Node.js** (v18 or higher recommended).
2. Install **Rust** via `rustup` (https://rustup.rs).
3. Install **Visual Studio Build Tools 2022** (Select the "Desktop development with C++" workload).

### Installation
1. Clone the repository.
2. Navigate to the project root: `cd interview-helper`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server (auto-reloads on save):
   ```bash
   npm run tauri dev
   ```

### Building for Production
To create the `.exe` installer:
```bash
npm run tauri build
```
The installer will be generated in `src-tauri/target/release/bundle/nsis/`.

---

## ⚡ 2. Backend Setup (Node.js on Render)

The backend handles Razorpay order creation and Firestore license key generation. It is completely decoupled from the frontend to securely hide our Razorpay Secret and Firebase Admin privileges.

### Local Development
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` folder:
   ```env
   PORT=3000
   RAZORPAY_KEY_ID="rzp_test_YourKeyHere"
   RAZORPAY_KEY_SECRET="YourRazorpaySecret"
   RAZORPAY_WEBHOOK_SECRET="YourMadeUpWebhookSecret"
   FIREBASE_SERVICE_ACCOUNT_KEY="{"type": "service_account", "project_id": "...", ...}"
   ```
   *Note: Place the entire JSON string on one line.*
4. Start the server:
   ```bash
   node server.js
   ```

### Deploying to Render (Free Tier)
1. Create a "Web Service" on [Render.com](https://render.com).
2. Connect your GitHub repository.
3. Set the Root Directory to `backend`.
4. Set the Build Command to `npm install`.
5. Set the Start Command to `node server.js`.
6. Add the 4 environment variables from your `.env` file into Render's Environment Variables section.
7. Click Deploy!

### The Render Keep-Alive Ping (Crucial)
Render's free tier spins down your server after 15 minutes of inactivity. When a user clicks "Upgrade to Pro", they will wait **50 seconds** if the server is asleep. 

To fix this:
1. Create a free account on [UptimeRobot](https://uptimerobot.com).
2. Add a new "HTTP(S)" monitor.
3. Set the URL to your Render health endpoint (e.g., `https://talksync-api.onrender.com/health`).
4. Set the interval to **10 minutes** (do not set it to 5 minutes, as Render limits free tier usage hours).
This keeps the server awake 24/7.

---

## 💳 3. Razorpay Webhook Configuration

When a payment is successful, Razorpay talks directly to our Render backend to unlock the user's account. If this breaks, users will pay money but won't get the PRO badge.

1. Go to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Navigate to Settings -> Webhooks.
3. Click "Add New Webhook".
4. Set the URL to your Render backend: `https://talksync-api.onrender.com/api/webhook`.
5. Set the Secret to whatever you wrote for `RAZORPAY_WEBHOOK_SECRET`.
6. Check the `payment.captured` and `order.paid` events.
7. Save.

---

## 🗄️ 4. Managing Discount Coupons

Coupons are completely dynamic. You do not need to change code to add a sale.

1. Open your **Firebase Console**.
2. Go to **Firestore Database**.
3. Open the `coupons` collection.
4. To create a new code, click **Add Document**.
   - **Document ID**: The coupon code (e.g., `SUMMERSALE` - must be uppercase).
   - Add field: `active` (boolean) = `true`
   - Add field: `discountType` (string) = `percentage`
   - Add field: `discountValue` (number) = `50` (for 50% off)

To disable a coupon, just change its `active` field to `false`.

If the coupon gives 100% off, the frontend will completely bypass Razorpay and instantly assign a Pro license.

---

## 🚑 Troubleshooting Common Issues

### 1. `FIREBASE_SERVICE_ACCOUNT_KEY` Parsing Errors on Render
**Symptom:** Render deployment fails with `Failed to parse Service Account Key: Bad control character in string literal`.
**Fix:** Render sometimes breaks JSON strings containing `\n` newline characters. 
In your `backend/server.js`, we have a specific try/catch block that uses `replace(/\\n/g, '\n')`. Ensure you copy your exact raw Firebase JSON string into Render as one massive block on a single line.

### 2. Users Paid but didn't get PRO!
**Symptom:** Payment leaves the user's bank, but the UI never updates to PRO.
**Fix:** 
1. The Razorpay Webhook failed. Check your Render server logs. 
2. If Render logs show `Invalid signature`, your `RAZORPAY_WEBHOOK_SECRET` in `.env` doesn't match the one in the Razorpay dashboard.
3. If Render logs show `No UID found in payment notes`, the frontend failed to send the Firebase `uid` in the `notes` object when calling `/api/create-order`.
4. **Manual Override:** Give the user a 100% discount code, or manually change their `isPro` status to `true` in Firestore.

### 3. Tauri App white screens on launch
**Symptom:** UI doesn't load.
**Fix:** Run `npm run tauri dev`. If it fails, ensure React is compiling correctly (`npm run build`). Check if an environment variable mapped in `vite-env.d.ts` is missing.

### 4. Google Auth doesn't work inside the Exe
**Symptom:** Clicking "Sign in with Google" does nothing or throws a generic error.
**Fix:** We use `@moonguard/tauri-plugin-deep-link` to bounce the login off the default system browser back into the `.exe`. 
1. Ensure the Google Cloud Console OAuth Credentials have the deep link `talksync://auth` registered as an authorized redirect URI.
2. Ensure Firebase Authentication has Google explicitly enabled.

### 5. `cron-job.org` Output Too Large Errors
**Symptom:** Render ping jobs fail.
**Fix:** We migrated from cron-job.org to UptimeRobot because cron-job.org choked on chunked HTML responses depending on how Render returns errors. Stick to UptimeRobot targeting the `/health` JSON endpoint.
