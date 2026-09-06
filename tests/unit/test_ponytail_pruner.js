const assert = require('assert');
const path = require('path');
const ponytailPruner = require('../../services/ponytailPruner');

console.log('🧪 Iniciando Testes Unitários do Ponytail Context Pruner...\n');

// 1. Teste: Histórico curto não deve sofrer poda
const shortHistory = [
    { role: 'user', parts: [{ text: 'Olá' }] },
    { role: 'model', parts: [{ text: 'Olá! Como posso ajudar?' }] },
    { role: 'user', parts: [{ text: 'Quero agendar uma consulta' }] },
    { role: 'model', parts: [{ text: 'Qual procedimento gostaria?' }] }
];

const resShort = ponytailPruner.pruneHistory(shortHistory, { type: 'Consulta' }, 6);
assert.strictEqual(resShort.wasPruned, false, 'Histórico com 4 turnos não deveria ser podado');
assert.strictEqual(resShort.prunedHistory.length, 4, 'Tamanho do histórico curto deve se manter');
console.log('✅ Teste 1: Histórico curto preservado integralmente.');

// 2. Teste: Histórico longo com 12 turnos deve ser comprimido
const longHistory = [
    { role: 'user', parts: [{ text: 'Bom dia!' }] },
    { role: 'model', parts: [{ text: 'Olá! Sou a Ana, assistente virtual da Clínica Modelo.' }] },
    { role: 'user', parts: [{ text: 'Vocês atendem sábado?' }] },
    { role: 'model', parts: [{ text: 'Nosso atendimento é de segunda a sexta, das 08h às 19h.' }] },
    { role: 'user', parts: [{ text: 'Ah entendi, aceitam Unimed?' }] },
    { role: 'model', parts: [{ text: 'Atendemos Unimed, Bradesco e particular.' }] },
    { role: 'user', parts: [{ text: 'Qual o valor da limpeza particular?' }] },
    { role: 'model', parts: [{ text: 'A limpeza fica em R$ 200,00.' }] },
    { role: 'user', parts: [{ text: 'Quero marcar então' }] },
    { role: 'model', parts: [{ text: 'Ótimo! Escolha qual procedimento: [Limpeza]' }] },
    { role: 'user', parts: [{ text: 'Limpeza' }] },
    { role: 'model', parts: [{ text: 'Selecione o profissional: [Dra. Juliana Mendes]' }] }
];

const mockDraft = {
    type: 'Limpeza',
    date: '2026-09-10',
    time: '14:00',
    doctor_name: 'Dra. Juliana Mendes'
};

const resLong = ponytailPruner.pruneHistory(longHistory, mockDraft, 4);
assert.strictEqual(resLong.wasPruned, true, 'Histórico longo deve ser podado');
// Resumo (2 turnos: user + model) + 4 recentes = 6 turnos
assert.strictEqual(resLong.prunedHistory.length, 6, 'Histórico podado deve conter 6 turnos');
assert.strictEqual(resLong.prunedHistory[0].role, 'user', 'Primeiro turno deve ser role user para Gemini');
assert.strictEqual(resLong.prunedHistory[1].role, 'model', 'Segundo turno deve ser role model');
assert(resLong.tokensSavedEstimate > 0, 'Estimativa de tokens economizados deve ser maior que 0');
assert(resLong.compressionRatio < 1.0, 'Razão de compressão deve ser menor que 1.0');

console.log(`✅ Teste 2: Histórico longo podado com sucesso!`);
console.log(`   - Redução de tamanho: de 12 para ${resLong.prunedHistory.length} turnos.`);
console.log(`   - Tokens economizados estimados: ~${resLong.tokensSavedEstimate} tokens.`);
console.log(`   - Resumo sintetizado: "${resLong.prunedHistory[0].parts[0].text}"`);

// 3. Teste: Validação do contrato de alternância do Gemini
for (let i = 0; i < resLong.prunedHistory.length - 1; i++) {
    const current = resLong.prunedHistory[i].role;
    const next = resLong.prunedHistory[i + 1].role;
    assert.notStrictEqual(current, next, `Turnos consecutivos em [${i}] e [${i+1}] não podem ter a mesma role (${current})`);
}
console.log('✅ Teste 3: Protocolo estrito de alternância user/model do Gemini 100% satisfeito.');

console.log('\n🎉 Todos os testes unitários do Ponytail Context Pruner foram APROVADOS!\n');
