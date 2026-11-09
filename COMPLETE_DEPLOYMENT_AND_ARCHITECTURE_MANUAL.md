# 🏆 Live Auction Platform – Full Deployment & Architecture Manual

> **Comprehensive Technical Guide: Architecture, Multi-Tenant Isolation, Database Failover, Real-time WebSockets, and Cloud Deployment**  
> *Last Updated: November 2026*

---

## 📑 Table of Contents
1. [System Overview](#1-system-overview)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
3. [Multi-Tenant Isolation Architecture](#3-multi-tenant-isolation-architecture)
4. [Dual-Database Resilience Engine](#4-dual-database-resilience-engine)
5. [Real-time WebSockets & Bidding Lifecycle](#5-real-time-websockets--bidding-lifecycle)
6. [Cloud Deployment (Railway & Docker)](#6-cloud-deployment-railway--docker)
7. [Authentication, Cookies & Security](#7-authentication-cookies--security)
8. [Public & Spectator Routes](#8-public--spectator-routes)
9. [Troubleshooting & Runbook](#9-troubleshooting--runbook)
10. [Configuration Reference](#10-configuration-reference)

---

## 1. System Overview

The **Live Auction Web Application** is a production-grade, real-time sports league auction platform designed for cricket, football, and multi-sport franchises. It provides:

* **Real-time Bidding Engine**: Sub-second bid updates via Socket.IO WebSockets with live countdown timers, bid history, undo mechanisms, and purse tracking.
* **Multi-Tenant Administration**: Superadmin control center (`/superadmin`) capable of provisioning independent tournament organizers (`/admin/dashboard`). Each admin receives an isolated, blank workspace.
* **Dual-Database Adapter**: PostgreSQL primary with an automatic, zero-downtime fallback to embedded SQLite (`auction.db`).
* **Broadcast & Live Spectator Views**: Dedicated responsive stage screens (`/live-auction`), OBS / YouTube transparent graphics overlay (`/overlay`), and interactive spectator portal (`/live`).
* **High-Speed Media & Spreadsheet Ingestion**: Bulk Excel player import with Google Drive photo thumbnail caching.

---

## 2. End-to-End System Architecture

```
                                  ┌─────────────────────────────┐
                                  │      Cloudflare / Proxy     │
                                  │   (Railway Edge Ingress)    │
                                  └──────────────┬──────────────┘
                                                 │
                                                 ▼
                       ┌───────────────────────────────────────────────────┐
                       │           Node.js Express 4 Backend Server        │
                       │           Dual Listeners: Port 3000 & 8080        │
                       └─────────┬───────────────────────────────┬─────────┘
                                 │                               │
        ┌────────────────────────┼────────────────────────┐      │
        ▼                        ▼                        ▼      ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐ ┌──────────────┐
│  Superadmin  │         │  Tenant A    │         │  Tenant B    │ │ Real-time    │
│  Control     │         │  (Anurag)    │         │  (Mansha)    │ │ Socket.IO    │
│  /superadmin │         │  /admin/*    │         │  /admin/*    │ │ Broadcast    │
└──────────────┘         └──────────────┘         └──────────────┘ └──────────────┘
        │                        │                        │               │
        └────────────────────────┼────────────────────────┘               ▼
                                 │                                ┌──────────────┐
                                 ▼                                │ Live Clients │
                 ┌───────────────────────────────┐                │ - Spectators │
                 │      dbAdapter (data.js)      │                │ - OBS Stream │
                 │  - 2000ms connection timeout  │                │ - Franchise  │
                 │  - Auto SQLite fallback       │                └──────────────┘
                 └───────────────┬───────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌──────────────────┐            ┌──────────────────┐
       │ PostgreSQL Cloud │            │  SQLite Embedded │
       │ (Active Cloud)   │            │  (auction.db)    │
       └──────────────────┘            └──────────────────┘
```

### Component Breakdown
| Component | Technology | File / Location | Responsibility |
| :--- | :--- | :--- | :--- |
| **HTTP Web Server** | Express 4, Node 20 | `app.js` | Request routing, cookie parsing, dual-port listener binding. |
| **Real-time Sockets** | Socket.IO 4 | `sockets/index.js` | Real-time bid broadcasts, synchronized timers, hammer down sound triggers. |
| **Persistence Engine** | SQLite3 / `pg.Pool` | `models/data.js` | Resilient hybrid database adapter with automatic fallback. |
| **Multi-Tenant Router**| Express Router | `routes/admin.js`, `routes/superadmin.js` | Workspace isolation, permission checks, tenant context scoping. |
| **View Layer** | EJS Templates | `views/` | Dynamic HTML templates for admin console, live stage, and overlays. |
| **Deployment Engine** | Docker, Railway CLI | `Dockerfile`, `.railwayignore` | Containerization, bundle optimization, and cloud hosting. |

---

## 3. Multi-Tenant Isolation Architecture

The system supports multiple league organizers operating simultaneously without data contamination.

### Tenant Workspace Isolation Mechanism

1. **User Identity & Scoping**:
   * Every user record in `users` has a unique `active_auction_id` column:
     ```sql
     CREATE TABLE IF NOT EXISTS users (
         username TEXT PRIMARY KEY,
         password TEXT,
         role TEXT,
         permissions TEXT,
         active_auction_id TEXT
     );
     ```
2. **Tenant Creation Flow (`/superadmin/create-admin`)**:
   * Superadmin enters a new admin username (e.g. `Mansha`) and password.
   * `data.createBlankAuctionForAdmin(username, password)` runs:
     1. Creates a unique auction ID: `auction_mansha_<timestamp>`.
     2. Inserts an empty `auction_details` record: `MANSHA PREMIER LEAGUE 2026`.
     3. Inserts a clean default `All` category for that auction.
     4. Sets `teams = 0` and `players = 0`.
     5. Saves the user with `role = 'admin'`, full permissions, and `active_auction_id = newAuctionId`.

3. **Login & Session Binding**:
   * When the tenant logs in via `/login`, the server:
     * Validates credentials case-insensitively (`LOWER(TRIM(username))`).
     * Calls `data.ensureAuctionForUser(user.username)` to guarantee their workspace exists.
     * Clears conflicting session cookies and establishes `admin_session=<username>`.
     * Switches memory state to the tenant's auction via `data.selectAuction(auctionId)`.

4. **Default System Organizer (`anurag` / `admin`)**:
   * Retains the default master tournament `active_auction` with all pre-existing teams (66) and players (1563).
   * Subordinate organizers never modify or view `active_auction`.

---

## 4. Dual-Database Resilience Engine

To prevent catastrophic 502 errors and downtime when remote cloud databases encounter connectivity issues, the platform features a **Hybrid Resilient Database Adapter** in `models/data.js`.

### How Failover Operates

```
                               Incoming Database Query
                                         │
                                         ▼
                             Is PostgreSQL Connected?
                                  /            \
                             YES /              \ NO
                                ▼                ▼
                  Execute via pgPool.query()   Execute via getSqliteDb()
                  (2000ms query timeout)       (Reads/Writes auction.db)
                                │                        │
                                ▼                        │
                         Query Success?                  │
                           /        \                    │
                      YES /          \ NO (Timeout/Err)  │
                         ▼            ▼                  │
                   Return Rows    Fall back to SQLite ───┘
                                  Return Rows seamlessly
```

### PostgreSQL Connection Safety Configuration
```javascript
const poolConfig = {
    connectionTimeoutMillis: 2000, // Abort hanging connections after 2 seconds
    idleTimeoutMillis: 5000,
    query_timeout: 2500,           // Maximum query duration
    statement_timeout: 3000
};
```
If PostgreSQL is unreachable or authentication fails, the application automatically logs a warning and routes queries to embedded `auction.db`. The end user experiences **0ms downtime** and **zero 502 Bad Gateway responses**.

---

## 5. Real-time WebSockets & Bidding Lifecycle

Real-time bidding synchronization is handled by Socket.IO (`sockets/index.js`):

### Auction State Machine
```
   [ Waiting ] ────(Select Player)────► [ Active Bidding ]
        ▲                                      │
        │                                      │ (Bid Placed)
        │                                      ▼
        │                              [ Timer Reset (30s) ]
        │                                      │
        │                                      │ (Timer Hits 0)
        │                                      ▼
   [ Complete ] ◄───(Sold / Unsold)───── [ Hammer Down ]
```

### Key Socket Events
| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `dataUpdate` | Server $\to$ Clients | `{ teams, players, categories, auctionDetails }` | Emitted whenever teams, players, or settings are modified. |
| `auctionUpdate`| Server $\to$ Clients | `auctionState` object | Broadcasts current player, current bid, highest bidder team, timer tick. |
| `bid` | Admin $\to$ Server | `{ teamId, amount }` | Registers a new highest bid, validates team purse, and resets countdown timer. |
| `sold` | Admin $\to$ Server | `{ playerId, teamId, amount }` | Finalizes sale, deducts team purse, marks player `sold`, plays hammer sound. |
| `unsold` | Admin $\to$ Server | `{ playerId }` | Marks player `unsold`, increments round. |
| `pauseTimer` | Admin $\to$ Server | `{ isPaused }` | Freezes countdown timer during disputes or commercial breaks. |

---

## 6. Cloud Deployment (Railway & Docker)

The application is deployed on **Railway.app** using Docker.

### 1. Dual-Port Binding Configuration
Railway's HTTP edge proxy may route to container port `3000` or `8080`. In `app.js`, dual listeners are maintained:
```javascript
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Live auction server running on port ${PORT}`);
});

// Secondary port listener to guarantee zero routing mismatches
const altPort = (PORT === 3000) ? 8080 : 3000;
const altServer = http.createServer(app);
altServer.listen(altPort, '0.0.0.0');
```

### 2. Dockerfile Optimization
Using `node:20-slim` Debian glibc image ensures pre-compiled native modules (`sqlite3`) execute without Alpine compilation timeouts:
```dockerfile
FROM node:20-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
EXPOSE 8080
CMD [ "node", "app.js" ]
```

### 3. Preventing Cloudflare 413 Payload Too Large
Local `public/uploads` (media) and `.git` folders can exceed 1.4 GB. Railway's deployment upload limit via Cloudflare is 100 MB.  
The bundle size was reduced from **1,401 MB to 2.4 MB (99.8% reduction)** using `.railwayignore`:
```gitignore
public/uploads/*
!public/uploads/.gitkeep
node_modules
.git
.gemini
```

### 4. Deploying via Railway CLI
To deploy changes from your terminal:
```bash
# 1. Commit changes to Git
git add .
git commit -m "Update application"
git push origin main

# 2. Deploy directly to Railway
npx @railway/cli up --service auction
```

---

## 7. Authentication, Cookies & Security

### Cookie Structure
| Cookie Name | Scope | Role | Description |
| :--- | :--- | :--- | :--- |
| `superadmin_session` | `Path=/; HttpOnly` | Superadmin | Authorizes access to `/superadmin` control center. |
| `admin_session` | `Path=/; HttpOnly` | Tenant Admin | Authorizes access to `/admin/*` tournament workspace. |

### Case-Insensitive Credential Matching
Logins are normalized:
```javascript
const cleanUser = (username || '').trim().toLowerCase();
const result = await data.db.query(
    "SELECT * FROM users WHERE LOWER(TRIM(username)) = $1 AND TRIM(password) = $2",
    [cleanUser, cleanPass]
);
```

### Clean Cookie Invalidation
Logging in as one role invalidates conflicting cookies to prevent permission collisions:
```javascript
res.setHeader('Set-Cookie', [
    `admin_session=${encodeURIComponent(user.username)}; Path=/; HttpOnly`,
    `superadmin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
]);
```

---

## 8. Public & Spectator Routes

All public routes support multi-tenant query parameters (`?auctionId=...`):

| Route | Purpose | Tenant Support | Description |
| :--- | :--- | :--- | :--- |
| `/` | **Login Portal** | All | Clean sign-in screen for Superadmin, Master Admin, and Tenant Admins. |
| `/live-auction` | **Live Stage Screen** | `?auctionId=<id>` | Responsive live screen displaying active player, live bidding, and hammer state. |
| `/overlay` | **OBS / YouTube Overlay**| `?auctionId=<id>` | 1920x1080 transparent graphic overlay for livestream broadcasts. |
| `/live` | **Spectator Hub** | `?auctionId=<id>` | 3-in-1 spectator portal (live bidding + team squads + available player pool). |
| `/admin/dashboard`| **Organizer Console** | Session-Scoped | Primary admin panel for running auction lots, timers, and team purse management. |
| `/superadmin` | **Superadmin Center**| Superadmin Only | Account management, role assignment, and global sponsor uploads. |

---

## 9. Troubleshooting & Runbook

### Issue: "Application failed to respond" (502 Bad Gateway)
* **Cause**: Container was listening only on port `8080` while Railway router targeted `3000`, or PostgreSQL client hung without a connection timeout.
* **Resolution**: Both port `3000` and `8080` are now bound simultaneously, and `pg.Pool` has strict 2000ms timeouts with automatic SQLite fallback.

### Issue: "File too large (413 Payload Too Large)" on Deployment
* **Cause**: Bundling 1.4 GB of files inside `public/uploads/` caused Cloudflare to reject the upload payload.
* **Resolution**: Verified `.railwayignore` and `.dockerignore` exclude `public/uploads/*`, keeping bundle size under 3 MB.

### Issue: Subordinate Admin Logs in and Gets Error / Empty Screen
* **Cause**: Admin account was missing `active_auction_id` or permissions in `users` table.
* **Resolution**: Handled automatically by `data.ensureAuctionForUser()`. Logging in auto-provisions their blank workspace and guarantees full admin permissions.

---

## 10. Configuration Reference

### Environment Variables
| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | `3000` | Primary port Railway binds to the container. |
| `DATABASE_URL` | Optional | SQLite Fallback | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`). |
| `REDIS_URL` | Optional | In-Memory Map | Redis connection string for distributed timer/auction state. |
| `NODE_ENV` | Optional | `production` | Node environment flag. |

---

*Manual maintained by Engineering & Operations. For support, review repository commit logs or run `./scratch/test_multitenant_matrix.js`.*
