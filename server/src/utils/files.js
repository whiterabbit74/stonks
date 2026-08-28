/**
 * Utility helpers for file operations
 */
const fs = require('fs-extra');

async function appendSafe(filePath, line) {
    try {
        await fs.ensureFile(filePath);
        await fs.appendFile(filePath, line);
    } catch (e) {
        if (e && e.code === 'EACCES') {
            if (!appendSafe._eaccesWarned) {
                console.warn(`No write permission for ${filePath}`);
                appendSafe._eaccesWarned = true;
            }
            return;
        }
        console.warn(`Append failed for ${filePath}: ${e.message}`);
    }
}

function ensureRegularFileSync(filePath, defaultContent) {
    try {
        const st = fs.pathExistsSync(filePath) ? fs.statSync(filePath) : null;
        if (st && st.isDirectory()) {
            const backup = `${filePath}.bak-${Date.now()}`;
            try { fs.renameSync(filePath, backup); } catch { }
        }
        if (!fs.pathExistsSync(filePath) || (st && st.isDirectory())) {
            fs.ensureFileSync(filePath);
            fs.writeJsonSync(filePath, defaultContent, { spaces: 2 });
        }
    } catch { }
}

module.exports = {
    appendSafe,
    ensureRegularFileSync,
};
