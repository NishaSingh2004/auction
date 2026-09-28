import io

with io.open('routes/superadmin.js', 'r', encoding='utf-8') as f:
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
    }
    next();
};
router.use(authMiddleware);
"""

if 'authMiddleware =' not in content:
    content = content.replace(
        "// Superadmin middleware",
        middleware_str + "\n// Superadmin middleware"
    )

with io.open('routes/superadmin.js', 'w', encoding='utf-8') as f:
    f.write(content)
