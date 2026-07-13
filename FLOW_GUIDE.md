# 🏏 Full-Stack Bidding Flow & Interactive System Guide
## Connecting Frontend, Backend, and Database

This guide explains the step-by-step life cycle of the IPL Live Auction application—detailing how pages are generated, how the frontend and backend are interconnected, and exactly how database queries are triggered by interactive button clicks.

---

## 1. How the Frontend is Generated (Start to Finish)

The user interface of this application is not a static HTML sheet; it is a **dynamically rendered server-side template** that is hydrated with real-time socket updates once loaded.

```
[Server Boots] ➡️ [SQLite Reads Data] ➡️ [Express Renders EJS Templates] ➡️ [Browser Loads HTML & JS] ➡️ [Web Socket Connects]
```

### Step 1: Server Bootup
When you run `npm start` or double-click `run_app.bat`:
1.  `server.js` boots the Express.js server on Port `3000`.
2.  The server executes `data.init()` in `models/data.js` to establish an active connection to the SQLite database file (`auction.db`).
3.  The database loads all tables and stores current rosters and standings into memory caches (`data.teams` and `data.players`).

### Step 2: Request & Server-Side Rendering (EJS)
When an administrator loads `http://localhost:3000/admin/dashboard` in a web browser:
1.  The request hits the Express route router at `routes/admin.js`.
2.  The router retrieves `data.teams` and `data.players` from the database.
3.  The server compiles `views/admin/dashboard.ejs` using EJS. EJS replaces backend template tags (like `<%= player.name %>`) with real database string values, generating static HTML.
4.  The server responds, and the browser receives the raw compiled HTML page.

### Step 3: Hydration and Live Sockets (Websockets)
Once the browser finishes parsing the HTML:
1.  It loads the browser JavaScript engines (`public/js/admin.js` or `public/js/user.js`).
2.  The script initiates a permanent, real-time connection back to the backend:
    ```javascript
    const socket = io();
    ```
3.  The server instantly sends down the active session state (`auctionUpdate` and `dataUpdate` socket events), updating DOM content so the page is dynamically aligned with what is currently happening on the draft floor!

---

## 2. Frontend, Backend, and Database Connection Map

Communication between the user interface and the database flows through two separate tunnels depending on the action:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          COMMUNICATION TUNNELS                          │
├─────────────────────────────────┬───────────────────────────────────────┤
│    1. REAL-TIME BIDDING SOCKET  │       2. TRANSACTIONAL HTTP POST      │
│  (Persistent Websocket Stream)  │   (REST APIs & File Upload Actions)   │
├─────────────────────────────────┼───────────────────────────────────────┤
│  Client clicks bid button       │  Admin clicks Submit Form / Upload    │
│            │                    │                  │                    │
│            ▼                    │                  ▼                    │
│  Socket Emit: 'placeBid'        │  HTTP POST /admin/adjust-budget       │
│            │                    │                  │                    │
│            ▼                    │                  ▼                    │
│  Socket Receiver: index.js      │  Express Router: routes/admin.js      │
│            │                    │                  │                    │
│            ▼                    │                  ▼                    │
│  SQLite Run: UPDATE players     │  SQLite Run: UPDATE teams SET budget  │
│            │                    │                  │                    │
│            ▼                    │                  ▼                    │
│  Socket Broadcast: 'bidUpdate'  │  Socket Broadcast: 'dataUpdate'       │
└─────────────────────────────────┴───────────────────────────────────────┘
```

---

## 3. Interactive Button Map (Admin Dashboard)

Here is exactly how every administrative click navigates from the button layout, through the Javascript triggers, to SQL execution, and back to spectator screens:

### A. "START AUCTION" Button
*   **HTML Element**: `<button id="startBtn" ...>`
*   **Trigger**: Click event in `public/js/admin.js`
*   **Action Flow**:
    1.  Client reads the selected candidate ID from the dropdown list (`#playerSelect`).
    2.  Emits socket event `'startAuction'` with the payload `{ playerId }`.
    3.  Backend receptor (`sockets/index.js`) handles `'startAuction'`:
        *   Retrieves player record.
        *   Loads player details into `data.auctionState.currentPlayer`.
        *   Resets bid status, sets starting price, and starts a `30-second` interval countdown timer.
        *   Broadcasts `auctionUpdate` to all clients.
*   **Result**: Instantly updates all spectator dashboards to display the player profile, picture, base price, and begins counting down the clock with a pulsing ring!

---

### B. "✓ SOLD (S)" Button
*   **HTML Element**: `<button id="endAuctionBtn" ...>`
*   **Trigger**: Click event in `public/js/admin.js`
*   **Action Flow**:
    1.  Client emits socket event `'endAuction'` with the payload `{ selectedTeamName }`.
    2.  Backend receptor (`sockets/index.js`) intercepts the request and stops the clock:
        *   Triggers `handleAuctionEnd()`.
        *   Retrieves the highest bidder team.
        *   Saves final sold coordinates in the database (SQL: `'UPDATE players SET status = "sold", soldTo = ?, soldPrice = ? WHERE id = ?'`).
        *   Subtracts draft price from the team's balance (SQL: `'UPDATE teams SET budget = ? WHERE name = ?'`).
        *   Broadcasts `auctionEnd` and `dataUpdate` events.
        *   Launches a **4-second server timeout** before automatically searching and starting the next candidate in the database.
*   **Result**: Displays the **"SOLD"** visual overlay on all spectator screens, updates the franchise standings point balances, and automatically transitions to the next candidate after 4 seconds!

---

### C. "✕ UNSOLD (U)" Button
*   **HTML Element**: `<button id="unsoldBtn" ...>`
*   **Trigger**: Click event in `public/js/admin.js`
*   **Action Flow**:
    1.  Client emits socket event `'forceUnsold'`.
    2.  Backend receptor (`sockets/index.js`) resets the bid parameter and triggers `handleAuctionEnd()`:
        *   Sets player status to unsold in memory and database (SQL: `'UPDATE players SET status = "unsold" WHERE id = ?'`).
        *   Broadcasts updates to all sockets.
        *   Launches the **4-second timer** to show the **"UNSOLD"** banner overlay.
        *   Retrieves the next available player automatically.
*   **Result**: Bypasses the clock, displays the flashing **"UNSOLD"** screen overlay, and seamlessly starts the next player in line.

---

### D. "+ ADD" & "- DEDUCT" Budget Modifier Buttons
*   **HTML Element**: `<form id="adjustBudgetForm">` with submit triggers.
*   **Trigger**: Form submit event listener in `public/js/admin.js`
*   **Action Flow**:
    1.  Standard `FormData` captures selected franchise name and numerical modifier amount.
    2.  Identifies button intent (`'add'` or `'deduct'`) via a hidden input element (`#budgetActionType`) set by button clicks.
    3.  Dispatches an asynchronous API call: `POST /admin/adjust-budget` payload `{ teamName, amount }`.
    4.  Backend router (`routes/admin.js`) handles transaction:
        *   Validates payload integers.
        *   Recalculates franchise budget balance.
        *   Writes to SQLite (SQL: `'UPDATE teams SET budget = ? WHERE name = ?'`).
        *   Responds back to browser with `{ success: true }`.
    5.  Client JS resets form inputs and emits socket message `'adminDataAdded'`.
    6.  Socket server intercepts `'adminDataAdded'` and broadcasts updated sorted standings to all screens.
*   **Result**: Standings and point totals update instantly across spectator screens without page refreshing!

---

### E. "Re-auction" Button (Unsold Pool)
*   **HTML Element**: `<button onclick="resetPlayer('playerId')" ...>`
*   **Trigger**: Client-side globally scoped `resetPlayer(playerId)` trigger inside `public/js/admin.js`
*   **Action Flow**:
    1.  Client dispatches an asynchronous HTTP POST call: `POST /admin/reset-player` with payload `{ playerId }`.
    2.  Backend router (`routes/admin.js`) handles operation:
        *   Reads database player.
        *   Re-casts budget balances safely using mathematical `parseInt` (preventing string concatenation bug).
        *   Refunds team purse points if candidate had been previously sold.
        *   Resets player status variables (SQL: `'UPDATE players SET status = "available", soldTo = NULL, soldPrice = NULL WHERE id = ?'`).
        *   Clears active dashboard panel cache if the reset player is currently displayed.
        *   Responds back to browser with `{ success: true }`.
    3.  Client emits socket `'adminDataAdded'` on successful call, triggering an automated system re-broadcast to all screens.
*   **Result**: Re-auctioned player vanishes from the Unsold list, appears back inside the dropdown list alphabetically, and active dashboards cleanly reset to "Waiting" state!

---

## 4. Complete Lifecycle of a Bid (Step-by-Step)

To understand exactly how everything fits together, here is the chronological life cycle of a single point bid:

```
[Spectator Clicks Bid] ➡️ [Socket Sends Event] ➡️ [Server Checks Budget] ➡️ [DB Updates] ➡️ [All Screens Sync]
```

1.  **Placement**: A user logged in as a Franchise Team clicks the **+100 pts** quick-bid button.
2.  **Websocket Emission**: The browser JS (`public/js/user.js`) reads their team username and calculates the proposed bid amount (`currentBid + 100`). It emits `'placeBid'` event to the server.
3.  **Server-Side Security Check**: The socket handler (`sockets/index.js`) processes the proposed bid and runs safety checks:
    *   *Check 1*: Is the auction state currently `'active'`?
    *   *Check 2*: Is the bid amount strictly higher than the current highest bid?
    *   *Check 3*: Does the bidding team have enough points left in their remaining budget?
4.  **Database Commit**: Once validated:
    *   `data.auctionState.currentBid` is updated to the new value.
    *   `data.auctionState.highestBidder` is updated to the bidder's name.
    *   `data.auctionState.timer` is reset back to `30` seconds (to allow counter-bids!).
5.  **Broadcast and Synchronize**:
    *   The server broadcasts a `'bidUpdate'` socket packet to all connected dashboards.
    *   All clients receive the packet: the current bid counter flashes green, the timer resets to `30`, and the leading bidder's name updates instantly.

---
**🏆 Technical Flow Document Created. Designed for Perfect Architectural Clarity.**
