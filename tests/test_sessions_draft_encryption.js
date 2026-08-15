/**
 * test_sessions_draft_encryption.js
 * 
 * Validação de Cifragem AES-256-GCM em sessions.draft (BACKLOG-LGPD-02):
 * 1. Grava draft contendo cpf e dependentCpf.
 * 2. Faz SELECT DIRETO no Supabase para provar que a coluna JSONB draft contém
 *    o CPF no formato iv:authTag:ciphertext (criptografado, nunca em claro).
 * 3. Faz getDraft e valida que retorna o CPF legível em memória para o controlador.
 * 4. Limpa o draft e valida reset para null.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });
if (!process.env.SUPABASE_URL) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const db = require('../services/databaseService');

async function testDraftEncryption() {
    console.log('================================================================');
    console.log('🔒 [TEST_DRAFT_ENCRYPTION] Teste de Cifragem AES-256-GCM em sessions.draft');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const testPhone = '5511999998877';
    const rawCpf = '529.982.247-25';
    const rawDepCpf = '123.456.789-00';

    // 1. Limpeza inicial
    await db.sessions.delete(testPhone, clinicId).catch(() => {});
    await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

    // 2. Gravar draft com dados sensíveis
    console.log('[Etapa 1] Gravando draft com CPF do titular e do dependente...');
    await db.sessions.setDraft(testPhone, {
        type: 'Limpeza',
        name: 'Carlos Eduardo',
        cpf: rawCpf,
        is_family_booking: true,
        dependentName: 'Raquel Pereira',
        dependentCpf: rawDepCpf
    }, clinicId);
    console.log('  ✅ setDraft executado com sucesso.\n');

    // 3. Consulta bruta no Supabase (Raw Database Query)
    console.log('[Etapa 2] Verificando dados brutos gravados diretamente no Supabase (SELECT draft)...');
    const { data: rawRow, error: rawErr } = await db.supabase
        .from('sessions')
        .select('draft')
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId)
        .single();

    assert.ifError(rawErr);
    console.log('  📊 DUMP BRUTO DO BANCO (rawRow.draft):', JSON.stringify(rawRow.draft, null, 2));

    // Validações de Criptografia no Banco
    assert.ok(rawRow.draft, 'Draft deve existir no banco');
    assert.notStrictEqual(rawRow.draft.cpf, rawCpf, 'CPF NÃO pode estar em texto claro no banco');
    assert.notStrictEqual(rawRow.draft.dependentCpf, rawDepCpf, 'dependentCpf NÃO pode estar em texto claro no banco');

    assert.strictEqual(rawRow.draft.cpf.split(':').length, 3, 'CPF no banco deve estar no formato iv:authTag:ciphertext (AES-256-GCM)');
    assert.strictEqual(rawRow.draft.dependentCpf.split(':').length, 3, 'dependentCpf no banco deve estar no formato iv:authTag:ciphertext (AES-256-GCM)');
    console.log('  ✅ PASS: 100% dos CPFs no JSONB do banco estão criptografados em AES-256-GCM!\n');

    // 4. Leitura transparente via getDraft
    console.log('[Etapa 3] Lendo draft via getDraft() (descriptografia transparente em memória)...');
    const decryptedDraft = await db.sessions.getDraft(testPhone, clinicId);
    console.log('  📊 DRAFT DESCRIPTOGRAFADO:', JSON.stringify(decryptedDraft, null, 2));

    assert.strictEqual(decryptedDraft.cpf, rawCpf, 'getDraft deve descriptografar cpf corretamente');
    assert.strictEqual(decryptedDraft.dependentCpf, rawDepCpf, 'getDraft deve descriptografar dependentCpf corretamente');
    assert.strictEqual(decryptedDraft.type, 'Limpeza');
    assert.strictEqual(decryptedDraft.dependentName, 'Raquel Pereira');
    console.log('  ✅ PASS: getDraft() descriptografou perfeitamente os dados em memória para a FSM!\n');

    // 5. Reset do draft
    console.log('[Etapa 4] Resetando draft com setDraft(phone, null, clinicId)...');
    await db.sessions.setDraft(testPhone, null, clinicId);
    const { data: rawReset } = await db.supabase
        .from('sessions')
        .select('draft')
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId)
        .single();
    assert.strictEqual(rawReset.draft, null, 'Draft deve ser null após reset');
    console.log('  ✅ PASS: Reset de draft funcionou perfeitamente no Supabase.\n');

    // Cleanup final
    await db.sessions.delete(testPhone, clinicId).catch(() => {});

    console.log('================================================================');
    console.log('🎉 AUDITORIA DE CIFRAGEM SESSIONS.DRAFT APROVADA COM SUCESSO!');
    console.log('================================================================\n');
}

testDraftEncryption().catch(err => {
    console.error('❌ ERRO NO TESTE DE CIFRAGEM DE DRAFT:', err);
    process.exit(1);
});
