require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const extractCleanName = conversationController.extractCleanName;

console.log(`================================================================`);
console.log(`🧪 TESTE DE EXTRAÇÃO E SANITIZAÇÃO DE NOME (MARIANA)`);
console.log(`================================================================\n`);

const testCases = [
    { input: "Mariana", expected: "Mariana" },
    { input: "Mariana Silva", expected: "Mariana Silva" },
    { input: "Meu nome é Mariana Souza", expected: "Mariana Souza" },
    { input: "Sou a Mariana de Oliveira", expected: "Mariana de Oliveira" },
    { input: "me chamo mariana mello", expected: "Mariana Mello" },
    { input: "Boa noite", expected: null },
    { input: "Oi", expected: null },
    { input: "Confirmar", expected: null },
    { input: "Selecionei a data: 2026-08-01", expected: null }
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
    const result = extractCleanName(tc.input);
    if (result === tc.expected) {
        passed++;
        console.log(`  ✅ PASS: "${tc.input}" => ${result === null ? 'null' : `"${result}"`}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: "${tc.input}" => "${result}" (esperado: "${tc.expected}")`);
    }
}

console.log(`\n================================================================`);
console.log(`📊 RESULTADO DOS TESTES DE NOME: ${passed}/${testCases.length} APROVADOS`);
console.log(`================================================================\n`);

if (failed > 0) process.exit(1);
