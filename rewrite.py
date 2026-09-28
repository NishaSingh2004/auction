import sys

new_layout = """
    <div class="app-container" style="display: flex; flex-direction: column; height: 100vh; width: 100vw; max-width: 100%; overflow: hidden; background: #07090c; font-family: 'Plus Jakarta Sans', sans-serif;">
        
        <!-- HIDDEN REQUIRED DOM ELEMENTS FOR ADMIN.JS -->
        <div style="display: none;">
            <span id="totalTeams"><%= data.teams.length %></span>
            <span id="totalPlayers"><%= data.players.length %></span>
            <select id="categoryFilterSelect"><option value="all">All</option></select>
            <select id="playerSelect">
                <% data.players.forEach(p => { %>
                    <option value="<%= p.id %>" data-base="<%= p.basePrice %>" data-category="<%= p.category_id %>"><%= p.name %></option>
                <% }) %>
            </select>
            <button id="startBtn">START</button>
            <input type="text" id="quickUnsoldInput">
            <div id="quickUnsoldPreview"></div>
            <div id="livePlayerCaptainBadge"></div>
            <div id="livePlayerFormNo"></div>
            <div id="liveCategoryDisplay"></div>
            <div id="liveBasePriceDisplay"></div>
            <div id="livePlayerAge"></div>
            <div id="bioBasePrice"></div>
            <div id="bioAge"></div>
            <div id="bioFather"></div>
            <div id="bioTag"></div>
            <div id="bioCustom"></div>
            <div id="bioSpec1"></div>
            <div id="bioSpec2"></div>
            <div id="bioSpec3"></div>
            <div id="bioSize"></div>
            <div id="bioDetail"></div>
            <button id="manualBidUpBtn">▲</button>
            <button id="manualBidDownBtn">▼</button>
            <div id="liveTimer">30</div>
            <button id="timerResetBtn"></button>
            <button id="timerPauseBtn"></button>
            <button id="resetTimerBtn"></button>
            <img id="livePlayerPhoto" src="/uploads/default-player.svg">
        </div>

        <!-- NEW TOPBAR -->
        <header style="height: 60px; background: #0f1115; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.5rem; transform: rotate(-45deg);">🏏</span>
                <h1 style="font-size: 1.25rem; font-weight: 900; margin: 0; color: #fff; letter-spacing: 1px;">ELITE OVERSEER</h1>
            </div>
            
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
                <div style="background: rgba(220,38,38,0.15); border: 1px solid rgba(220,38,38,0.3); color: #ef4444; font-size: 0.6rem; font-weight: 800; padding: 0.2rem 0.6rem; border-radius: 20px; display: flex; align-items: center; gap: 0.4rem;">
                    <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></div>
                    <span id="auctionStatusBadge"><%= data.auctionState.status.toUpperCase() %></span>
                </div>
                <div style="font-size: 0.65rem; color: rgba(255,255,255,0.5); font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                    <%= data.auctionState.activeCategoryName || 'NO CATEGORY' %> • LOT <%= data.players.length %>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 1.5rem; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7);">
                <div style="color: #fbbf24; border-bottom: 2px solid #fbbf24; padding-bottom: 0.2rem; cursor: pointer;">DASHBOARD</div>
                <div style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">PLAYER VIEW</div>
                <div style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">TEAM VIEW</div>
                <div style="cursor: pointer; transition: color 0.2s;" onclick="document.getElementById('dataModal').style.display='flex'" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">SETTINGS</div>
                <div style="font-size: 1.1rem; cursor: pointer;">🔔</div>
            </div>
        </header>

        <!-- MAIN GRID -->
        <div style="flex: 1; display: flex; overflow: hidden;">
            <!-- LEFT SIDEBAR -->
            <div style="width: 280px; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; background: #0b0d12;">
                <div style="display: flex; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="flex: 1; text-align: center; padding: 1rem; font-size: 0.75rem; font-weight: 800; color: #fbbf24; border-bottom: 2px solid #fbbf24;">LIVE</div>
                    <div style="flex: 1; text-align: center; padding: 1rem; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.4);">UPCOMING</div>
                </div>
                <div id="leftPlayerQueue" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;" class="sleek-scroll">
                    <% 
                       const livePlayers = data.players.filter(p => p.status === 'available').slice(0, 15);
                       livePlayers.forEach(p => { 
                    %>
                    <div style="background: #161821; border-radius: 8px; padding: 0.8rem; display: flex; align-items: center; gap: 0.75rem; border: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="loadSpecificPlayer('<%= p.id %>')">
                        <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.1); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.8);">
                            <%= p.name.substring(0,2).toUpperCase() %>
                        </div>
                        <div style="display: flex; flex-direction: column; flex: 1;">
                            <span style="color: #fff; font-size: 0.85rem; font-weight: 800;"><%= p.name %></span>
                            <span style="color: rgba(255,255,255,0.5); font-size: 0.65rem;"><%= p.role %> • Base: <%= formatCurrencyLocal(p.basePrice) %></span>
                        </div>
                    </div>
                    <% }) %>
                </div>
            </div>
            
            <!-- CENTER: Spotlight & Bidding -->
            <div style="flex: 1; display: flex; flex-direction: column; padding: 1.5rem; gap: 1.5rem; overflow-y: auto; position: relative;">
                
                <!-- Player Spotlight -->
                <div style="position: relative; height: 340px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: #1a1c23;">
                    <img id="livePlayerPhotoBg" src="/uploads/default-player.svg" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; filter: blur(3px);">
                    <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.95) 100%);"></div>
                    
                    <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; padding-bottom: 2rem;">
                        <h2 id="livePlayerName" style="font-size: 4.5rem; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 900; color: #fff; margin: 0; text-transform: uppercase; letter-spacing: -2px; text-shadow: 0 4px 20px rgba(0,0,0,0.8);">WAITING...</h2>
                        <div id="livePlayerRole" style="background: rgba(255,255,255,0.1); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.2); padding: 0.4rem 1.2rem; border-radius: 20px; font-size: 0.8rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1px; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                            ⚾ ROLE
                        </div>
                    </div>
                    
                    <!-- Current Bid Box -->
                    <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); background: linear-gradient(180deg, #2a2500 0%, #1a1800 100%); border: 1px solid rgba(251, 191, 36, 0.4); border-bottom: none; padding: 1.5rem 3rem 1rem; border-radius: 16px 16px 0 0; box-shadow: 0 -10px 40px rgba(251, 191, 36, 0.15); text-align: center; min-width: 380px; z-index: 20;">
                        <div style="color: #fbbf24; font-size: 0.75rem; font-weight: 800; letter-spacing: 2px; margin-bottom: 0.2rem;">CURRENT BID</div>
                        <div id="liveBidAmount" style="color: #fff; font-size: 3.5rem; font-weight: 900; line-height: 1; margin-bottom: 0.5rem;"><%= formatCurrencyLocal(data.auctionState.currentBid || 0) %></div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.85rem; color: rgba(255,255,255,0.5); font-weight: 700;">
                            With: <span id="liveHighestBidder" style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.8rem; border-radius: 4px; color: #fff; font-weight: 800; text-transform: uppercase;"><%= data.auctionState.highestBidder ? data.auctionState.highestBidder : 'NO BIDS YET' %></span>
                        </div>
                    </div>
                </div>
                
                <!-- Bidding Controls Panel -->
                <div style="display: flex; gap: 1.5rem;">
                    <!-- Left: Manual Entry & Quick Team Select -->
                    <div style="flex: 1.5; background: #11131a; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 800; letter-spacing: 1px; display: flex; align-items: center; gap: 0.5rem;">
                                <span style="color: #fbbf24;">⌨</span> MANUAL BID ENTRY
                            </div>
                            <div style="background: #1a1c23; border: 1px solid rgba(255,255,255,0.1); padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.75rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                                👥 <select id="quickTeamSelect" style="background: transparent; border: none; color: #fff; font-weight: 800; outline: none; min-width: 150px;">
                                    <option value="">SELECT TEAM</option>
                                    <% data.teams.forEach(team => { %>
                                        <option value="<%= team.name %>"><%= team.shortName || team.name %></option>
                                    <% }) %>
                                </select>
                            </div>
                        </div>
                        
                        <div style="background: #090a0f; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; align-items: center;">
                            <div style="display: flex; gap: 1rem; align-items: center; width: 100%;">
                                <div style="flex: 1; position: relative;">
                                    <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #fbbf24; font-size: 1.5rem; font-weight: 800;">₹</span>
                                    <input type="number" id="manualBidAmount" style="width: 100%; background: #11131a; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; color: #fff; font-size: 2.5rem; font-weight: 900; padding: 0.75rem 1rem 0.75rem 3rem; text-align: left; outline: none;">
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                    <button class="btn btn-secondary" style="border: 1px solid rgba(255,255,255,0.2); background: transparent; color: #fbbf24; padding: 0.5rem 1rem; font-weight: 800; font-size: 1rem; border-radius: 6px;">C</button>
                                    <button class="btn btn-secondary" style="border: 1px solid rgba(255,255,255,0.2); background: transparent; color: rgba(255,255,255,0.6); padding: 0.5rem 1rem; font-weight: 800; font-size: 1rem; border-radius: 6px;">L</button>
                                </div>
                            </div>
                            <div style="color: #ef4444; font-size: 0.75rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.4rem;">
                                <span style="font-size: 1rem;">⚠</span> Must be greater than current bid (<span id="minBidWarning"><%= formatCurrencyLocal(data.auctionState.currentBid || 0) %></span>)
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right: Quick Increments -->
                    <% 
                        const bidInc = data.auctionDetails && data.auctionDetails.bidIncreaseBy ? parseFloat(data.auctionDetails.bidIncreaseBy) : 500; 
                    %>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
                        <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">Quick Increments</div>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; flex: 1;">
                            <button id="quickBidBtnSingle" class="btn quick-bid-btn" data-increment="<%= bidInc %>" style="background: #23252b; border: 1px solid rgba(255,255,255,0.05); color: #fff; font-weight: 800; font-size: 1.1rem; padding: 0.75rem; border-radius: 8px; transition: all 0.2s;">+<%= formatCurrencyLocal(bidInc) %></button>
                            <button id="quickBidBtnDouble" class="btn quick-bid-btn" data-increment="<%= bidInc * 2 %>" style="background: #23252b; border: 1px solid rgba(255,255,255,0.05); color: #fff; font-weight: 800; font-size: 1.1rem; padding: 0.75rem; border-radius: 8px; transition: all 0.2s;">+<%= formatCurrencyLocal(bidInc * 2) %></button>
                            <button id="quickBidBtnJump" class="btn quick-bid-btn" data-increment="<%= bidInc * 10 %>" style="background: #23252b; border: 1px solid rgba(255,255,255,0.05); color: #fff; font-weight: 800; font-size: 1.1rem; padding: 0.75rem; border-radius: 8px; transition: all 0.2s;">+<%= formatCurrencyLocal(bidInc * 10) %></button>
                        </div>
                        <button id="manualBidBtn" class="btn" style="background: #fbbf24; color: #000; font-size: 1.5rem; padding: 1rem; border-radius: 8px; font-weight: 900; box-shadow: 0 4px 15px rgba(251,191,36,0.3); border: none; cursor: pointer; transition: transform 0.1s;">🔨 BID</button>
                    </div>
                </div>
            </div>
            
            <!-- RIGHT SIDEBAR -->
            <div style="width: 340px; border-left: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; background: #0b0d12;">
                
                <div style="padding: 1.5rem 1rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 800; text-transform: uppercase; margin-bottom: 1.2rem; letter-spacing: 0.5px;">ACTIVE BIDDERS PURSE</div>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <% data.teams.slice(0, 2).forEach((team, idx) => { %>
                        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 800;">
                                <span style="color: rgba(255,255,255,0.8); text-transform: uppercase;"><%= team.shortName || team.name %></span>
                                <span style="color: <%= idx === 0 ? '#fbbf24' : 'rgba(255,255,255,0.6)' %>;"><%= formatCurrencyLocal(team.budget) %></span>
                            </div>
                            <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px;"><div style="width: <%= 50 + (idx*20) %>%; height: 100%; background: <%= idx === 0 ? '#fbbf24' : 'rgba(255,255,255,0.4)' %>; border-radius: 2px;"></div></div>
                        </div>
                        <% }) %>
                    </div>
                </div>
                
                <!-- Team List -->
                <div style="padding: 1.5rem 1rem; flex: 1; overflow-y: auto;" class="sleek-scroll">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem;">
                        <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">TEAM LIST</div>
                        <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 700;"><%= data.teams.length %> FRANCHISES</div>
                    </div>
                    <div id="teamList" style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <% data.teams.forEach((team) => { %>
                        <div style="background: #161821; border-radius: 8px; padding: 0.8rem; display: flex; align-items: center; justify-content: space-between; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <% if(team.logo) { %>
                                    <img src="<%= team.logo %>" style="width: 28px; height: 28px; object-fit: contain;">
                                <% } else { %>
                                    <div style="width: 28px; height: 28px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                                <% } %>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: #fff; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;"><%= team.shortName || team.name %></span>
                                    <span style="color: #fbbf24; font-size: 0.8rem; font-weight: 900;"><%= formatCurrencyLocal(team.budget) %></span>
                                </div>
                            </div>
                            <div style="border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.6); font-size: 0.6rem; font-weight: 800; padding: 0.2rem 0.5rem; border-radius: 4px;">
                                ELIGIBLE
                            </div>
                        </div>
                        <% }) %>
                    </div>
                </div>
            </div>
        </div>

        <!-- FOOTER TOOLBAR -->
        <footer style="height: 60px; background: #23252b; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; flex-shrink: 0; position: relative; z-index: 50;">
            <div style="display: flex; align-items: center; gap: 0.5rem; color: rgba(255,255,255,0.6); font-size: 0.75rem; font-weight: 600;">
                <span style="font-size: 0.9rem; border: 1px solid rgba(255,255,255,0.4); border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: rgba(255,255,255,0.4);">i</span>
                Base Price: <span style="color: #fff; font-weight: 800;"><%= formatCurrencyLocal(data.auctionDetails ? data.auctionDetails.baseBid || 0 : 0) %></span> | Increment: <span style="color: #fff; font-weight: 800;"><%= formatCurrencyLocal(bidInc) %></span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 1rem;">
                <button id="unsoldBtn" class="btn" style="background: #ef4444; color: #fff; padding: 0.6rem 3rem; font-size: 1rem; font-weight: 900; border-radius: 6px; border: none; letter-spacing: 1px; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3); cursor: pointer;"><span style="font-size: 1.2rem;">✖</span> UNSOLD</button>
                <button id="endAuctionBtn" class="btn" style="background: #22c55e; color: #fff; padding: 0.6rem 3rem; font-size: 1rem; font-weight: 900; border-radius: 6px; border: none; letter-spacing: 1px; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 10px rgba(34, 197, 94, 0.3); cursor: pointer;"><span style="font-size: 1.2rem;">🔨</span> SOLD</button>
            </div>
            
            <button class="btn" style="background: transparent; color: #fff; padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 800; border: none; display: flex; align-items: center; gap: 1rem; cursor: pointer;" onclick="triggerNextPlayer()">
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <span>NEXT</span>
                    <span>PLAYER</span>
                </div>
                <span style="font-size: 1.25rem;">⏭</span>
            </button>
        </footer>
    </div>
    
    <script>
    function triggerNextPlayer() {
        const select = document.getElementById('playerSelect');
        const startBtn = document.getElementById('startBtn');
        if (select && select.options.length > 0) {
            for(let i=0; i<select.options.length; i++){
                if(select.options[i].value !== '') {
                    select.selectedIndex = i;
                    startBtn.click();
                    break;
                }
            }
        }
    }
    
    function loadSpecificPlayer(id) {
        const select = document.getElementById('playerSelect');
        const startBtn = document.getElementById('startBtn');
        if (select && startBtn) {
            select.value = id;
            startBtn.click();
        }
    }
    
    const origObserver = new MutationObserver((mutations) => {
        const livePhoto = document.getElementById('livePlayerPhoto');
        const liveBg = document.getElementById('livePlayerPhotoBg');
        if (livePhoto && liveBg && livePhoto.src !== liveBg.src) {
            liveBg.src = livePhoto.src;
        }
    });
    window.addEventListener('load', () => {
        const livePhoto = document.getElementById('livePlayerPhoto');
        if(livePhoto) origObserver.observe(livePhoto, { attributes: true, attributeFilter: ['src'] });
    });
    </script>
"""

with open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    for i, line in enumerate(lines):
        if 18 <= i <= 334:
            if i == 18:
                f.write(new_layout + '\\n')
        else:
            f.write(line)
