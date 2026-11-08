# 🚂 Live Auction Web Application – Railway Deployment Guide

This guide explains how to deploy your **Live Auction Web Application** to **Railway.app** with 100% full functionality: real-time Socket.IO WebSockets, live countdown timers, admin bidding controls, spectator screens, and PostgreSQL database persistence.

---

## 🌟 Why Railway is the Best Choice for this App

| Requirement | Railway Support | Why it Matters |
| :--- | :--- | :--- |
| **Persistent WebSockets (`socket.io`)** | ✅ **Full Support** | Unlike Vercel, connections stay open permanently without dropping. |
| **Real-time Countdown Timers** | ✅ **Full Support** | Background `setInterval` ticks uninterrupted every second. |
| **PostgreSQL Database** | ✅ **Built-in (1-Click)** | Instantly provisions a real PostgreSQL server with zero config. |
| **Automatic Connection** | ✅ **Auto-Injected** | Railway automatically passes `DATABASE_URL` to the app. |
| **Instant HTTPS Domain** | ✅ **Included** | Provides a free live public URL (e.g. `https://auction-app.up.railway.app`). |

---

## 🚀 Method 1: 1-Click Deployment via Railway Dashboard (Easiest)

### Step 1: Push your code to GitHub
If you haven't already pushed your code to GitHub:
```powershell
git add .
git commit -m "Configure Railway deployment"
git push origin main
```

### Step 2: Create Railway Project
1. Go to **[railway.app](https://railway.app)** and log in with your GitHub account.
2. Click **+ New Project** $\to$ **Deploy from GitHub repo**.
3. Select this repository.

### Step 3: Add PostgreSQL Database
1. On your Railway project canvas, click **+ New** (or press `Ctrl + K`).
2. Select **Database** $\to$ **Add PostgreSQL**.
3. Railway will provision a dedicated PostgreSQL database and automatically link the `DATABASE_URL` variable to your application!

### Step 4: Generate Public Live Domain
1. Click on your application service on the Railway canvas.
2. Go to the **Settings** tab.
3. Scroll down to **Networking** and click **Generate Domain**.
4. You will get a live link like:
   ```text
   https://auction-app-production.up.railway.app
   ```

### Step 5: Migrate all 147 Players & Tournament Data
1. In your Railway dashboard, click on the **Postgres** card $\to$ **Variables** tab.
2. Copy the value of **`DATABASE_URL`** (or `DATABASE_PUBLIC_URL`).
3. Open your local terminal in this project folder and run:
   ```powershell
   node restore_cloud_db.js "COPIED_DATABASE_URL"
   ```
4. All tables, teams, 147 players, and auction settings will be imported into your cloud database in seconds!

---

## 💻 Method 2: CLI Deployment (Using the Automated Script)

We have created an automated deployment script for Windows:

1. Double-click or run [`deploy-railway.bat`](file:///c:/Users/Nisha%20Singh/auction/deploy-railway.bat) in PowerShell:
   ```powershell
   .\deploy-railway.bat
   ```
2. The script will:
   - Prompt you to log in to Railway (opens browser once).
   - Initialize the Railway project.
   - Automatically add a PostgreSQL database plugin.
   - Build and upload the container with WebSockets enabled.
   - Generate your public HTTPS domain.
3. Once deployed, run:
   ```powershell
   node restore_cloud_db.js "YOUR_RAILWAY_DATABASE_URL"
   ```

---

## 🌐 Live URLs After Deployment

Once deployed, all pages will be live at your Railway domain:

- **Admin Bidding Console**: `https://<YOUR_APP>.up.railway.app/admin/dashboard`
- **Spectator Live Hub (Tabs)**: `https://<YOUR_APP>.up.railway.app/live`
- **Distraction-Free Live Stage**: `https://<YOUR_APP>.up.railway.app/live-auction`
- **OBS / YouTube Live Stream Overlay**: `https://<YOUR_APP>.up.railway.app/overlay`
