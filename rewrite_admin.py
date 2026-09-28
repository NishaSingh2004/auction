import sys
import re

with open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the tabs in the navbar
old_nav = """<div style="display: flex; align-items: center; gap: 1.5rem; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7);">
                <div style="color: #fbbf24; border-bottom: 2px solid #fbbf24; padding-bottom: 0.2rem; cursor: pointer;">DASHBOARD</div>
                <div style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">PLAYER VIEW</div>
                <div style="cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">TEAM VIEW</div>"""

new_nav = """<div style="display: flex; align-items: center; gap: 1.5rem; font-size: 0.85rem; font-weight: 800; color: rgba(255,255,255,0.6);">
                <div id="tabLiveBid" onclick="switchAdminTab('live')" style="color: #fff; border-bottom: 2px solid #fff; padding-bottom: 0.3rem; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: color 0.2s;">
                    <span style="font-size: 1.1rem;">🔨</span> Live Bid
                </div>
                <div id="tabPlayerList" onclick="switchAdminTab('players')" style="cursor: pointer; padding-bottom: 0.3rem; display: flex; align-items: center; gap: 0.4rem; transition: color 0.2s;" onmouseover="if(this.style.color !== 'rgb(255, 255, 255)') this.style.color='#fff'" onmouseout="if(this.style.color !== 'rgb(255, 255, 255)') this.style.color='rgba(255,255,255,0.6)'">
                    <span style="font-size: 1.1rem;">📋</span> Player List
                </div>
                <div id="tabTeamView" onclick="switchAdminTab('teams')" style="cursor: pointer; padding-bottom: 0.3rem; display: flex; align-items: center; gap: 0.4rem; transition: color 0.2s;" onmouseover="if(this.style.color !== 'rgb(255, 255, 255)') this.style.color='#fff'" onmouseout="if(this.style.color !== 'rgb(255, 255, 255)') this.style.color='rgba(255,255,255,0.6)'">
                    <span style="font-size: 1.1rem;">👥</span> Team View
                </div>"""

content = content.replace(old_nav, new_nav)

# 2. Add id to MAIN GRID
old_main_grid = """<!-- MAIN GRID -->
        <div style="flex: 1; display: flex; overflow: hidden;">"""
new_main_grid = """<!-- MAIN GRID -->
        <div id="mainLiveGrid" style="flex: 1; display: flex; overflow: hidden;">"""
content = content.replace(old_main_grid, new_main_grid)

# 3. Create the Player List View and JS, insert right before footer
player_list_html = """
        <!-- PLAYER LIST VIEW -->
        <div id="playerListView" style="display: none; flex: 1; background: #0b0d12; overflow-y: auto; padding: 2rem;" class="sleek-scroll">
            <div style="max-width: 1200px; margin: 0 auto; background: #12141a; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
                <!-- Header block similar to image -->
                <div style="height: 60px; background: #1a1d24; border-bottom: 1px solid rgba(255,255,255,0.05);"></div>
                
                <div style="display: flex; flex-direction: column;">
                    <% data.players.forEach((p, idx) => { 
                        const isSold = p.status === 'sold';
                        const isUnsold = p.status === 'unsold';
                        const statusColor = isSold ? '#3b82f6' : (isUnsold ? '#ef4444' : '#22c55e');
                        const statusBg = isSold ? 'rgba(59,130,246,0.1)' : (isUnsold ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)');
                    %>
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 2rem; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'" onclick="loadSpecificPlayer('<%= p.id %>'); switchAdminTab('live');">
                        
                        <!-- Left: ID & Player Name -->
                        <div style="display: flex; align-items: center; gap: 2rem; width: 35%;">
                            <span style="color: #fff; font-size: 0.85rem; font-weight: 700; width: 40px;">#<%= String(p.id).padStart(3, '0') %></span>
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                    <img src="<%= p.photo || '/uploads/default-player.svg' %>" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.5;">
                                </div>
                                <span style="color: #fff; font-size: 0.95rem; font-weight: 800;"><%= p.name %></span>
                            </div>
                        </div>

                        <!-- Middle: Role -->
                        <div style="display: flex; align-items: center; gap: 0.5rem; width: 25%; color: rgba(255,255,255,0.6); font-size: 0.85rem; font-weight: 600;">
                            <span style="color: #fbbf24;">🏏</span> <%= p.role %>
                        </div>

                        <!-- Price -->
                        <div style="width: 20%; color: #fff; font-size: 0.9rem; font-weight: 800;">
                            <%= isSold ? formatCurrencyLocal(p.soldPrice) : formatCurrencyLocal(p.basePrice) %>
                        </div>

                        <!-- Status Pill -->
                        <div style="width: 15%; display: flex; justify-content: flex-end;">
                            <div style="background: <%= statusBg %>; border: 1px solid <%= statusColor %>; color: <%= statusColor %>; font-size: 0.65rem; font-weight: 800; padding: 0.35rem 0.8rem; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px;">
                                <%= p.status %>
                            </div>
                        </div>
                    </div>
                    <% }) %>
                </div>
            </div>
        </div>
        
        <script>
        function switchAdminTab(tabName) {
            const liveGrid = document.getElementById('mainLiveGrid');
            const playerList = document.getElementById('playerListView');
            
            const tabLive = document.getElementById('tabLiveBid');
            const tabPlayers = document.getElementById('tabPlayerList');
            const tabTeams = document.getElementById('tabTeamView');
            
            // Reset styles
            if(tabLive) {
                tabLive.style.color = 'rgba(255,255,255,0.6)';
                tabLive.style.borderBottom = 'none';
            }
            if(tabPlayers) {
                tabPlayers.style.color = 'rgba(255,255,255,0.6)';
                tabPlayers.style.borderBottom = 'none';
            }
            if(tabTeams) {
                tabTeams.style.color = 'rgba(255,255,255,0.6)';
                tabTeams.style.borderBottom = 'none';
            }
            
            if(liveGrid) liveGrid.style.display = 'none';
            if(playerList) playerList.style.display = 'none';
            
            if (tabName === 'live') {
                if(liveGrid) liveGrid.style.display = 'flex';
                if(tabLive) {
                    tabLive.style.color = '#fff';
                    tabLive.style.borderBottom = '2px solid #fff';
                }
            } else if (tabName === 'players') {
                if(playerList) playerList.style.display = 'block';
                if(tabPlayers) {
                    tabPlayers.style.color = '#fff';
                    tabPlayers.style.borderBottom = '2px solid #fff';
                }
            } else if (tabName === 'teams') {
                // Future expansion for standalone team view. For now, go to live and they can use the right sidebar.
                if(liveGrid) liveGrid.style.display = 'flex';
                if(tabTeams) {
                    tabTeams.style.color = '#fff';
                    tabTeams.style.borderBottom = '2px solid #fff';
                }
            }
        }
        </script>
"""

content = content.replace('<!-- FOOTER TOOLBAR -->', player_list_html + '\n        <!-- FOOTER TOOLBAR -->')

with open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Rewrote views/admin/dashboard.ejs successfully")
