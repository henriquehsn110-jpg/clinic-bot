const fs = require('fs');

const md = fs.readFileSync('C:/Users/letic/.gemini/antigravity/brain/4f2a0635-2a08-46a0-80af-b4f1e837292a/CODE_COMPLEMENT_FOR_CLAUDE.md', 'utf8');

const marker = '## controllers/conversationController.js\n```js\n';
const startIndex = md.indexOf(marker);
if (startIndex !== -1) {
    const codeStart = startIndex + marker.length;
    const endIndex = md.indexOf('\n```', codeStart);
    const code = md.substring(codeStart, endIndex);
    fs.writeFileSync('controllers/conversationController.js', code);
    console.log('conversationController.js restaurado perfeitamente!');
} else {
    console.log('Marker não encontrado');
}
