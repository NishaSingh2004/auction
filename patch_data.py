import io

with io.open('models/data.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add permissions column
if 'ADD COLUMN IF NOT EXISTS permissions' not in content:
    content = content.replace(
        'CREATE TABLE IF NOT EXISTS users (',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;\n                CREATE TABLE IF NOT EXISTS users ('
    )

# Seed superadmin
seed_str = """
            // Seed Superadmin
            const saCheck = await this.db.query("SELECT * FROM users WHERE username = 'superadmin'");
            if (saCheck.rows.length === 0) {
                await this.db.query("INSERT INTO users (username, password, role) VALUES ('superadmin', 'superadmin', 'superadmin')");
            }
"""
if "'superadmin'" not in content:
    content = content.replace('// Seed Admin', seed_str + '            // Seed Admin')

with io.open('models/data.js', 'w', encoding='utf-8') as f:
    f.write(content)
