import io

with io.open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

if '/superadmin' not in content:
    content = content.replace(
        "const adminRouter = require('./routes/admin');",
        "const adminRouter = require('./routes/admin');\nconst superadminRouter = require('./routes/superadmin');"
    )
    content = content.replace(
        "app.use('/admin', adminRouter);",
        "app.use('/admin', adminRouter);\napp.use('/superadmin', superadminRouter);"
    )

with io.open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
