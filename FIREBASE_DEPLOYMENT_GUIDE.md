# 🚀 Complete Guide: Deploy Auction Web Application to Firebase

This guide outlines the exact, step-by-step process to deploy your **Live Auction Web Application** (Node.js, Express, WebSockets, EJS, and PostgreSQL) to **Firebase** with 100% full functionality (live real-time bidding, timer synchronization, admin controls, database persistence, and spectator stage).

---

## 🏗️ Architecture Overview

| Component | Technology | Cloud Solution |
| :--- | :--- | :--- |
| **Frontend CDN & Custom Domain** | Firebase Hosting | Firebase Hosting (`https://<project-id>.web.app`) |
| **Backend & WebSockets (Socket.IO)** | Node.js + Express + Socket.IO | Google Cloud Run (Container with WebSockets enabled) |
| **Database** | PostgreSQL | **Neon.tech** or **Supabase** (Free Cloud PostgreSQL) |
| **Cache & State** | In-Memory / Redis | Resilient In-Memory State (with optional Cloud Redis) |

> [!NOTE]
> Standard Firebase Cloud Functions terminate immediately after HTTP responses and do not maintain open WebSocket sockets. 
> **Firebase Hosting + Cloud Run** is Google's official, production-recommended architecture that gives you a fast Firebase `.web.app` domain with full persistent WebSocket support.

---

## 📋 Step 1: Create Your Free Cloud PostgreSQL Database (2 Minutes)

Since Firebase is NoSQL-only (Firestore), your relational database runs on a free cloud PostgreSQL provider:

1. Go to **[Neon.tech](https://neon.tech)** (or **[Supabase.com](https://supabase.com)**) and sign up for free.
2. Click **Create Project** (choose a region near your users, e.g. `ap-south-1` (Mumbai) or `us-east-1`).
3. Copy your connection string from the Neon dashboard. It looks like:
   ```text
   postgresql://username:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Migrate all 147 players, 2 teams, tournament settings & users**:
   Open a terminal in your workspace and run:
   ```powershell
   node restore_cloud_db.js "YOUR_NEON_DATABASE_URL"
   ```
   *This automatically imports all tables and data from `auction_database_backup.sql`.*

---

## 📋 Step 2: Install Firebase CLI & Login

1. Ensure the Firebase CLI is installed:
   ```powershell
   npm install -g firebase-tools
   ```
2. Log in with your Google account:
   ```powershell
   firebase login
   ```
3. Link your existing Firebase project:
   ```powershell
   firebase use --add
   ```
   *(Select your existing project from the list and give it the alias `default`)*

---

## 📋 Step 3: Deploy via Firebase Hosting + Cloud Run

### Option A: Using Google Cloud SDK (Fastest Container Deployment)

1. **Install Google Cloud SDK** (if not installed, download from [cloud.google.com/sdk](https://cloud.google.com/sdk)) or run from Google Cloud Shell.
2. Initialize with your Firebase Project ID:
   ```powershell
   gcloud config set project YOUR_FIREBASE_PROJECT_ID
   ```
3. Enable Cloud Run and Cloud Build:
   ```powershell
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com
   ```
4. Build and submit your container image:
   ```powershell
   gcloud builds submit --tag gcr.io/YOUR_FIREBASE_PROJECT_ID/auction-app
   ```
5. Deploy to Cloud Run (with WebSocket support and 3600s timeout):
   ```powershell
   gcloud run deploy auction-app `
     --image gcr.io/YOUR_FIREBASE_PROJECT_ID/auction-app `
     --platform managed `
     --region us-central1 `
     --allow-unauthenticated `
     --timeout=3600 `
     --set-env-vars DATABASE_URL="YOUR_NEON_DATABASE_URL",NODE_ENV="production"
   ```
6. Deploy Firebase Hosting (routes your `.web.app` domain to Cloud Run):
   ```powershell
   firebase deploy --only hosting
   ```

---

### Option B: Using Firebase App Hosting (Zero-Config GitHub CI/CD)

If your code is hosted on GitHub:
1. Push this repository to GitHub:
   ```powershell
   git add .
   git commit -m "Configure Firebase deployment"
   git push origin main
   ```
2. Open the **[Firebase Console](https://console.firebase.google.com)** $\to$ Select your project.
3. In the left navigation, click **Build** $\to$ **App Hosting**.
4. Click **Get Started** $\to$ Select your GitHub account and repository.
5. In **Environment Variables**, add:
   - Key: `DATABASE_URL`
   - Value: `YOUR_NEON_DATABASE_URL`
   - Key: `NODE_ENV`
   - Value: `production`
6. Click **Finish and Deploy**. Firebase will automatically build your Docker container, deploy to Cloud Run, and assign your live Firebase URL!

---

## 🌐 Verifying Your Live Deployment

Once deployed, all features will be available live at your Firebase domain (e.g., `https://YOUR_PROJECT_ID.web.app`):

- **Admin Bidding Console**: `https://YOUR_PROJECT_ID.web.app/admin/dashboard`
- **Spectator Live Portal (Tabs)**: `https://YOUR_PROJECT_ID.web.app/live`
- **Distraction-Free Live Stage**: `https://YOUR_PROJECT_ID.web.app/live-auction`
- **YouTube / OBS Live Overlay**: `https://YOUR_PROJECT_ID.web.app/overlay`

---

## 🛠️ Helpful Commands

- **Migrate DB to Cloud**: `node restore_cloud_db.js "<DATABASE_URL>"`
- **Test Cloud DB Locally**: Set `$env:DATABASE_URL="<DATABASE_URL>"` and run `npm start`.
- **View Live Logs**: `gcloud run services logs tail auction-app --region us-central1`
