const fs = require('fs');

const md = fs.readFileSync('C:/Users/letic/.gemini/antigravity/brain/4f2a0635-2a08-46a0-80af-b4f1e837292a/CODE_COMPLEMENT_FOR_CLAUDE.md', 'utf8');

const marker = '## services/databaseService.js\n```js\n';
const startIndex = md.indexOf(marker);
if (startIndex !== -1) {
    const codeStart = startIndex + marker.length;
    const endIndex = md.indexOf('\n```', codeStart);
    const code = md.substring(codeStart, endIndex);
    fs.writeFileSync('services/databaseService.js', code);
    console.log('databaseService.js restaurado perfeitamente!');
} else {
    console.log('Marker não encontrado');
}
