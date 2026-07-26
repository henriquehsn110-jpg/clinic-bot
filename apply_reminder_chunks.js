const fs = require('fs');

let text = fs.readFileSync('services/reminderService.js', 'utf8');

// Adiciona o helper chunkArray no topo da classe ou arquivo
const chunkHelper = `
function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}
`;

if (!text.includes('function chunkArray(')) {
    text = chunkHelper + '\n' + text;
}

fs.writeFileSync('services/reminderService.js', text);
console.log('reminderService.js atualizado com chunking.');
