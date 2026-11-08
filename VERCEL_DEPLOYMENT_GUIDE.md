# 🚀 Vercel Deployment Guide for AuctionSaaS

Your repository is fully prepared for Vercel Serverless and all changes are pushed to GitHub:
👉 **GitHub Repository**: [https://github.com/NishaSingh2004/auction](https://github.com/NishaSingh2004/auction)

---

## ⚡ Method 1: Deploy with 1-Click via GitHub (Recommended)

Because your code is already synced with GitHub, Vercel will build and deploy it remotely in seconds without any local Windows environment errors.

### Step 1: Open Vercel Project Importer
1. Go to **[https://vercel.com/new](https://vercel.com/new)**.
2. Sign in with your GitHub account (**NishaSingh2004**).
3. Under **Import Git Repository**, find **`auction`** and click **Import**.

### Step 2: Configure Environment Variables
In the **Environment Variables** section on Vercel, add:
- `DATABASE_URL`: Your cloud PostgreSQL connection string (see Database Setup below)
- `NODE_ENV`: `production`

### Step 3: Deploy
1. Leave the **Build and Output Settings** as default (Vercel automatically detects `vercel.json` and `api/index.js`).
2. Click **Deploy**.
3. In under 60 seconds, your site will be live at:
   `https://auction-<your-username>.vercel.app`

---

## 🗄️ Database Setup (Connecting Your 147 Players & Teams)

Vercel is a serverless application platform and does not host PostgreSQL databases. To have all your players and teams appear on Vercel:

1. Create a free PostgreSQL database on **[Neon.tech](https://neon.tech)**, **[Supabase.com](https://supabase.com)**, or **[Railway.app](https://railway.app)**.
2. Copy your connection URL (looks like `postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require`).
3. Run the automated data restorer in your project terminal:
   ```powershell
   node restore_cloud_db.js "postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require"
   ```
4. Paste that same URL into Vercel under **Settings** $\to$ **Environment Variables** $\to$ `DATABASE_URL`.

---

## 💻 Method 2: Deploy from Command Line (Vercel CLI)

If you prefer deploying directly from your PowerShell terminal:

1. Log in to Vercel:
   ```powershell
   npx vercel login
   ```
   *(This opens a browser window for a 1-click authorization)*

2. Deploy directly to Production:
   ```powershell
   npx vercel --prod
   ```
   Follow the prompts (press Enter to accept defaults). Vercel will upload your code and return your live URL.

---

## ⚙️ Architecture & Configurations Included

- **`api/index.js`**: Serverless function bridge connecting Vercel requests to Express.
- **`vercel.json`**:
  - Rewrites all paths `/(.*)` to `/api/index`.
  - Configures `includeFiles` for `views/**` and `public/**` to ensure all EJS templates, images, and styles are packaged.
- **`app.js`**: Includes `vercelInitPromise` middleware to guarantee database initialization completes before serverless requests are served.
- **`public/uploads/`**: All player photos, team logos, and tournament sponsor banners are committed and served statically via Vercel CDN.
