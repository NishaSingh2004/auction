import sys

with open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

modal_html = """
        <!-- SOLD CONFIRMATION MODAL -->
        <div id="soldConfirmationModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; backdrop-filter: blur(8px); justify-content: center; align-items: center; padding: 1rem;">
            <div style="width: 580px; max-width: 100%; background: #1a1a1a; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                
                <!-- Header -->
                <div style="background: #1c4528; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; gap: 0.5rem; color: #4ade80; font-weight: 800; letter-spacing: 1px; font-size: 1.1rem;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        TRANSACTION PENDING
                    </div>
                    <div style="color: rgba(255,255,255,0.8); font-family: monospace; font-size: 0.95rem; font-weight: 600;">
                        ID: <span id="scmTxId">#----</span>
                    </div>
                </div>

                <!-- Body -->
                <div style="display: flex; padding: 1.5rem; gap: 1.5rem; background: #121212;">
                    
                    <!-- Left: Player -->
                    <div style="flex: 1; background: #222; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1rem;">
                        <div style="width: 110px; height: 110px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.1); overflow: hidden; margin-bottom: 1.25rem; background: #111;">
                            <img id="scmPlayerPhoto" src="/uploads/default-player.svg" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <h3 id="scmPlayerName" style="color: #fff; font-size: 1.4rem; font-weight: 900; text-transform: uppercase; margin: 0 0 0.75rem 0; text-align: center; letter-spacing: 0.5px; line-height: 1.1;">PLAYER NAME</h3>
                        <div id="scmPlayerRole" style="background: rgba(255,255,255,0.08); padding: 0.35rem 1rem; border-radius: 20px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 0.4rem;">
                            🏏 ROLE
                        </div>
                    </div>

                    <!-- Right: Finances -->
                    <div style="flex: 1.2; display: flex; flex-direction: column; gap: 1.25rem;">
                        <div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 0.2rem;">FINAL BID</div>
                            <div id="scmFinalBid" style="font-size: 2.8rem; font-weight: 900; color: #4ade80; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">₹0</div>
                        </div>

                        <div style="background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 1.25rem;">
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 0.4rem;">WINNING TEAM</div>
                            <div id="scmWinningTeam" style="color: #fff; font-size: 1.15rem; font-weight: 900; text-transform: uppercase; margin-bottom: 1.25rem; line-height: 1.3;">TEAM NAME</div>
                            
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem;">
                                <div>
                                    <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 0.2rem;">REMAINING PURSE</div>
                                    <div id="scmRemainingPurse" style="color: #94a3b8; font-size: 1rem; font-weight: 700;">₹0</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 0.2rem;">SQUAD STATUS</div>
                                    <div id="scmSquadStatus" style="color: #94a3b8; font-size: 1rem; font-weight: 700;">0 / 0</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="background: #2a2a2a; padding: 1.25rem 1.5rem; display: flex; justify-content: flex-end; gap: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
                    <button onclick="document.getElementById('soldConfirmationModal').style.display='none'" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 0.6rem 1.5rem; border-radius: 6px; font-weight: 800; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">✕ CANCEL</button>
                    <button id="scmConfirmBtn" style="background: #22c55e; border: none; color: #000; padding: 0.6rem 2rem; border-radius: 6px; font-weight: 900; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem;" onmouseover="this.style.background='#16a34a'" onmouseout="this.style.background='#22c55e'">🔨 CONFIRM SOLD</button>
                </div>
            </div>
        </div>
"""

content = content.replace('<!-- TEAM DETAILS MODAL OVERLAY -->', modal_html + '\n        <!-- TEAM DETAILS MODAL OVERLAY -->')

with open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
