const fs = require('fs');
const path = require('path');

const srcFile = path.resolve(__dirname, '../../simulators/whatsapp-web/index.html');
const targets = [
    path.resolve(__dirname, '../../clinic-bot-simulator/index.html'),
    path.resolve(__dirname, '../public/simulator/index.html')
];

console.log('🔄 [SIMULATORS_SYNC] Sincronizando simuladores do projeto...');

if (!fs.existsSync(srcFile)) {
    console.error('❌ Arquivo fonte não encontrado:', srcFile);
    process.exit(1);
}

targets.forEach(target => {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(srcFile, target);
    console.log(`  ✅ Sincronizado para: ${target}`);
});

console.log('🎉 Sincronização de simuladores concluída com sucesso!');
