import io

with io.open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# Hide Settings button
old_settings = """<div style="cursor: pointer; transition: color 0.2s;" onclick="document.getElementById('dataModal').style.display='flex'" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">SETTINGS</div>"""
new_settings = """<% if (user && user.role === 'superadmin') { %>
                  <div style="cursor: pointer; transition: color 0.2s;" onclick="document.getElementById('dataModal').style.display='flex'" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">SETTINGS</div>
                  <a href="/superadmin" style="text-decoration: none; color: #fbbf24; font-weight: 800; cursor: pointer;">SUPERADMIN</a>
                  <% } %>"""
if 'user.role === \'superadmin\'' not in content:
    content = content.replace(old_settings, new_settings)

# Hide Tabs based on Permissions
# Check if tabLiveBid has permission wrapping
if '<% if (user && (user.role === \'superadmin\' || (user.permissions && user.permissions.includes(\'live\')))) { %>' not in content:
    content = content.replace(
        '<div id="tabLiveBid"',
        '<% if (user && (user.role === \'superadmin\' || (user.permissions && user.permissions.includes(\'live\')))) { %>\n                  <div id="tabLiveBid"'
    )
    content = content.replace(
        '<span style="font-size: 1.1rem;">🔨</span> Live Bid\n                  </div>',
        '<span style="font-size: 1.1rem;">🔨</span> Live Bid\n                  </div>\n                  <% } %>'
    )
    
    content = content.replace(
        '<div id="tabPlayerList"',
        '<% if (user && (user.role === \'superadmin\' || (user.permissions && user.permissions.includes(\'players\')))) { %>\n                  <div id="tabPlayerList"'
    )
    content = content.replace(
        '<span style="font-size: 1.1rem;">📋</span> Player List\n                  </div>',
        '<span style="font-size: 1.1rem;">📋</span> Player List\n                  </div>\n                  <% } %>'
    )

    content = content.replace(
        '<div id="tabTeamView"',
        '<% if (user && (user.role === \'superadmin\' || (user.permissions && user.permissions.includes(\'teams\')))) { %>\n                  <div id="tabTeamView"'
    )
    content = content.replace(
        '<span style="font-size: 1.1rem;">🛡️</span> Team View\n                  </div>',
        '<span style="font-size: 1.1rem;">🛡️</span> Team View\n                  </div>\n                  <% } %>'
    )

with io.open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
