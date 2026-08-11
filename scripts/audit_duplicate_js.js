const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

const duplicates = [
    { root: 'aiService.js', sub: 'services/aiService.js' },
    { root: 'calendarService.js', sub: 'services/calendarService.js' },
    { root: 'conversationController.js', sub: 'controllers/conversationController.js' },
    { root: 'whatsappService.js', sub: 'services/whatsappService.js' }
];

console.log('================================================================');
console.log('🔍 AUDITORIA DE ARQUIVOS JS DUPLICADOS (RAIZ VS SUBPASTAS)');
console.log('================================================================\n');

function findRequires(filename) {
    const baseName = path.basename(filename, '.js');
    const matchedFiles = [];

    function searchDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file === 'node_modules' || file === '.git') continue;
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                searchDir(fullPath);
            } else if (file.endsWith('.js')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes(`require('./${baseName}')`) ||
                    content.includes(`require('../${baseName}')`) ||
                    content.includes(`require('./services/${baseName}')`) ||
                    content.includes(`require('../services/${baseName}')`) ||
                    content.includes(`require('./controllers/${baseName}')`) ||
                    content.includes(`require('../controllers/${baseName}')`) ||
                    content.includes(baseName)) {
                    
                    // Checar se importa da raiz (ex: './aiService') ou da subpasta (ex: './services/aiService' ou './controllers/conversationController')
                    const importsRoot = content.includes(`require('./${baseName}')`) || content.includes(`require('../${baseName}')`);
                    const importsSub = content.includes(`require('./services/${baseName}')`) ||
                                       content.includes(`require('../services/${baseName}')`) ||
                                       content.includes(`require('./controllers/${baseName}')`) ||
                                       content.includes(`require('../controllers/${baseName}')`);
                    
                    matchedFiles.push({
                        file: path.relative(rootDir, fullPath),
                        importsRoot,
                        importsSub,
                        contentSnippet: content.split('\n').filter(line => line.includes(baseName)).map(l => l.trim()).join(' | ')
                    });
                }
            }
        }
    }

    searchDir(rootDir);
    return matchedFiles;
}

duplicates.forEach(item => {
    const rootPath = path.join(rootDir, item.root);
    const subPath = path.join(rootDir, item.sub);

    const rootExists = fs.existsSync(rootPath);
    const subExists = fs.existsSync(subPath);

    console.log(`📌 PAIR: [Raiz: ${item.root}] VS [Subpasta: ${item.sub}]`);
    console.log(`   - Raiz Existe? ${rootExists ? 'SIM (' + fs.statSync(rootPath).size + ' bytes)' : 'NÃO'}`);
    console.log(`   - Subpasta Existe? ${subExists ? 'SIM (' + fs.statSync(subPath).size + ' bytes)' : 'NÃO'}`);

    if (rootExists && subExists) {
        const rootContent = fs.readFileSync(rootPath, 'utf8');
        const subContent = fs.readFileSync(subPath, 'utf8');
        const isIdentical = rootContent === subContent;
        console.log(`   - Conteúdo idêntico? ${isIdentical ? 'SIM (100% IDÊNTICO)' : 'NÃO (VERSÕES DIFERENTES)'}`);
    }

    const usage = findRequires(item.root);
    console.log(`   - Invocações / Imports no Código:`);
    usage.forEach(u => {
        console.log(`     • ${u.file}: ${u.importsRoot ? '[IMPORTOU DA RAIZ]' : ''} ${u.importsSub ? '[IMPORTOU DA SUBPASTA]' : ''} -> Snippet: ${u.contentSnippet.substring(0, 120)}`);
    });
    console.log('----------------------------------------------------------------\n');
});
