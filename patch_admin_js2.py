import io

with io.open('public/js/admin.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

out = []
in_block = False
for line in lines:
    if 'if (endAuctionBtn) {' in line and not in_block:
        in_block = True
        out.append(line)
        out.append("    endAuctionBtn.addEventListener('click', (e) => {\n")
        out.append("        if (window.openSoldConfirmationModal) window.openSoldConfirmationModal(e);\n")
        out.append("    });\n")
        out.append("}\n")
        continue
    
    if in_block:
        if 'if(unsoldBtn) {' in line or 'if (unsoldBtn) {' in line:
            in_block = False
            out.append(line)
        continue
        
    out.append(line)

with io.open('public/js/admin.js', 'w', encoding='utf-8') as f:
    f.writelines(out)
