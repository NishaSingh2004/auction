import io

with io.open('routes/admin.js', 'r', encoding='utf-8') as f:
    content = f.read()

middleware_str = """
const authMiddleware = async (req, res, next) => {
    const cookies = req.headers.cookie;
    let username = null;
    if (cookies) {
        const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
        if (sessionCookie) {
            username = decodeURIComponent(sessionCookie.split('=')[1]);
        }
    }
    if (username) {
        const result = await data.db.query("SELECT * FROM users WHERE username = $1", [username]);
        req.user = result.rows[0];
        if (req.user && req.user.permissions) {
            try { req.user.permissions = JSON.parse(req.user.permissions); } catch(e) { req.user.permissions = []; }
        }
    }
    
    if (!req.user) {
        return res.redirect('/');
    }
    next();
};
router.use(authMiddleware);
"""

if 'authMiddleware =' not in content:
    content = content.replace(
        "const broadcastUpdates = () => {",
        middleware_str + "\nconst broadcastUpdates = () => {"
    )
    # also pass user to res.render
    content = content.replace("res.render('admin/dashboard', { data });", "res.render('admin/dashboard', { data, user: req.user });")

with io.open('routes/admin.js', 'w', encoding='utf-8') as f:
    f.write(content)
