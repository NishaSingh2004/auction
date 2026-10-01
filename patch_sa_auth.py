import io

with io.open('routes/superadmin.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_auth = """    if (cookies) {
        const saCookie = cookies.split(';').find(c => c.trim().startsWith('superadmin_session='));
        // Legacy fallback
        const legacyCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
        
        const sessionCookie = saCookie || legacyCookie;
        if (sessionCookie) {
            username = decodeURIComponent(sessionCookie.split('=')[1]);
        }
    }"""

new_auth = """    if (cookies) {
        const saCookie = cookies.split(';').find(c => c.trim().startsWith('superadmin_session='));
        const adCookie = cookies.split(';').find(c => c.trim().startsWith('admin_session='));
        // Legacy fallback
        const legacyCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
        
        // Prioritize superadmin session, but allow admin session (for admins with settings perm)
        const sessionCookie = saCookie || adCookie || legacyCookie;
        if (sessionCookie) {
            username = decodeURIComponent(sessionCookie.split('=')[1]);
        }
    }"""

if "const adCookie" not in content:
    content = content.replace(old_auth, new_auth)
    with io.open('routes/superadmin.js', 'w', encoding='utf-8') as f:
        f.write(content)
