import io

with io.open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the mistakenly injected HTML block which is right after `<script>`
# The issue is:
# <script>
#         <!-- TEAM GRID VIEW -->
# (all the HTML)
#         </div>
#         function switchAdminTab

# We need to move `<script>` to be AFTER the HTML block.
bad_pattern = "<script>\n        \n        <!-- TEAM GRID VIEW -->"

if bad_pattern in content:
    # First, rip out the <script> part from the top
    content = content.replace(bad_pattern, "        <!-- TEAM GRID VIEW -->")
    # Now put <script> right before `function switchAdminTab`
    content = content.replace("        function switchAdminTab(tabName) {", "<script>\n        function switchAdminTab(tabName) {")
elif "<script>\n        <!-- TEAM GRID VIEW -->" in content:
    content = content.replace("<script>\n        <!-- TEAM GRID VIEW -->", "        <!-- TEAM GRID VIEW -->")
    content = content.replace("        function switchAdminTab(tabName) {", "<script>\n        function switchAdminTab(tabName) {")
elif "<script>\n\n        <!-- TEAM GRID VIEW -->" in content:
    content = content.replace("<script>\n\n        <!-- TEAM GRID VIEW -->", "        <!-- TEAM GRID VIEW -->")
    content = content.replace("        function switchAdminTab(tabName) {", "<script>\n        function switchAdminTab(tabName) {")

with io.open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
