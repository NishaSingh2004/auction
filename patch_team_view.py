import io

with io.open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

team_grid_html = """
        <!-- TEAM GRID VIEW -->
        <div id="teamGridView" style="display: none; flex: 1; background: #0b0d12; overflow-y: auto; padding: 2rem;" class="sleek-scroll">
            <div style="max-width: 1400px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem;">
                    <div>
                        <h2 style="font-size: 1.5rem; font-weight: 900; margin: 0; color: #fff; letter-spacing: 1px; text-transform: uppercase;">FRANCHISES</h2>
                        <div style="color: rgba(255,255,255,0.5); font-size: 0.85rem; font-weight: 600; margin-top: 0.5rem;"><%= data.teams.length %> TEAMS REGISTERED IN THIS AUCTION</div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                    <% data.teams.forEach(team => { %>
                        <div style="background: #11131a; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 10px 30px rgba(0,0,0,0.2);" onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(251,191,36,0.3)';" onmouseout="this.style.background='#11131a'; this.style.borderColor='rgba(255,255,255,0.05)';" onclick="openTeamDetailsModal('<%= team.name %>')">
                            <div style="display: flex; align-items: center; gap: 1.25rem; margin-bottom: 1.25rem;">
                                <% if(team.logo) { %>
                                    <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0.5rem;">
                                        <img src="<%= team.logo %>" style="width: 100%; height: 100%; object-fit: contain;">
                                    </div>
                                <% } else { %>
                                    <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 900; color: rgba(255,255,255,0.3);">
                                        <%= (team.shortName || team.name).substring(0,2).toUpperCase() %>
                                    </div>
                                <% } %>
                                <div>
                                    <div style="color: #fff; font-weight: 900; font-size: 1.15rem; text-transform: uppercase; line-height: 1.2;"><%= team.name %></div>
                                    <div style="color: #4ade80; font-weight: 800; font-size: 0.85rem; margin-top: 0.3rem;"><%= formatCurrencyLocal(team.budget) %> BUDGET</div>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem;">
                                <div style="text-align: left;">
                                    <div style="color: rgba(255,255,255,0.4); font-size: 0.65rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">SHORTCUT</div>
                                    <div style="color: #fff; font-size: 0.9rem; font-weight: 700; margin-top: 0.2rem;"><kbd style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.4rem; border-radius: 4px; font-family: monospace;"><%= team.shortcutKey || '-' %></kbd></div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: rgba(255,255,255,0.4); font-size: 0.65rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">SHORTNAME</div>
                                    <div style="color: #fff; font-size: 0.9rem; font-weight: 700; margin-top: 0.2rem;"><%= team.shortName || '-' %></div>
                                </div>
                            </div>
                        </div>
                    <% }) %>
                </div>
            </div>
        </div>
"""

# Insert right before <script> function switchAdminTab
if 'id="teamGridView"' not in content:
    content = content.replace('function switchAdminTab', team_grid_html + '\n        function switchAdminTab')

# Update the switchAdminTab logic
old_switch = """        function switchAdminTab(tabName) {
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
        }"""

new_switch = """        function switchAdminTab(tabName) {
            const liveGrid = document.getElementById('mainLiveGrid');
            const playerList = document.getElementById('playerListView');
            const teamGridView = document.getElementById('teamGridView');
            
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
            if(teamGridView) teamGridView.style.display = 'none';
            
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
                if(teamGridView) teamGridView.style.display = 'block';
                if(tabTeams) {
                    tabTeams.style.color = '#fff';
                    tabTeams.style.borderBottom = '2px solid #fff';
                }
            }
        }"""

content = content.replace(old_switch, new_switch)

with io.open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
