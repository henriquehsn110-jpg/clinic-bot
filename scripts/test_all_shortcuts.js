require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log(`\n================================================================`);
console.log(`🧪 TESTE DE ACESSO E EXECUÇÃO DE TODOS OS ATALHOS / SCRIPTS (ITEM 2)`);
console.log(`================================================================\n`);

const filesToTest = [
    { name: 'Simulador CLI (simulators/cli-chat-simulator.js)', path: path.resolve(__dirname, '../../simulators/cli-chat-simulator.js') },
    { name: 'Simulador Web (simulators/whatsapp-web/index.html)', path: path.resolve(__dirname, '../../simulators/whatsapp-web/index.html') },
    { name: 'Script Sync (clinic-bot-backend/scripts/sync_simulators.js)', path: path.resolve(__dirname, './sync_simulators.js') },
    { name: 'Auditoria Dashboard E2E (clinic-bot-backend/tests/e2e_dashboard_test.js)', path: path.resolve(__dirname, '../tests/e2e_dashboard_test.js') },
    { name: 'Suíte Overnight QA (clinic-bot-backend/tests/overnight_test_suite.js)', path: path.resolve(__dirname, '../tests/overnight_test_suite.js') },
    { name: 'Integração Chat-Dashboard (clinic-bot-backend/tests/test_chat_dashboard_integration.js)', path: path.resolve(__dirname, '../tests/test_chat_dashboard_integration.js') },
    { name: 'Pre-flight Audit (clinic-bot-backend/scripts/preflight_audit.js)', path: path.resolve(__dirname, './preflight_audit.js') }
];

let passed = 0;
let failed = 0;

for (const file of filesToTest) {
    console.log(`🔹 Testando existência e acesso de: ${file.name}...`);
    if (fs.existsSync(file.path)) {
        const stats = fs.statSync(file.path);
        if (stats.size > 0) {
            passed++;
            console.log(`  ✅ PASS: Arquivo existe, acessível e possui ${stats.size} bytes.\n     Path: ${file.path}`);
        } else {
            failed++;
            console.error(`  ❌ FAIL: Arquivo existe mas está vazio (0 bytes).\n     Path: ${file.path}`);
        }
    } else {
        failed++;
        console.error(`  ❌ FAIL: Arquivo NÃO encontrado.\n     Path: ${file.path}`);
    }
}

console.log(`🔹 Testando execução do script de sincronização (sync:simulators)...`);
try {
    const syncOutput = execSync('node scripts/sync_simulators.js', { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8' });
    if (syncOutput.includes('Sincronização de simuladores concluída com sucesso!')) {
        passed++;
        console.log(`  ✅ PASS: Script sync_simulators.js executado com 100% de sucesso!`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: Saída inesperada no sync_simulators.js`);
    }
} catch (err) {
    failed++;
    console.error(`  ❌ FAIL: Erro ao executar sync_simulators.js:`, err.message);
}

console.log(`\n================================================================`);
console.log(`📊 RESULTADO DA AUDITORIA DE ACESSO AOS ATALHOS / SCRIPTS:`);
console.log(`   ✅ Passaram: ${passed}`);
console.log(`   ❌ Falharam: ${failed}`);
console.log(`================================================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
