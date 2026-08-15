/**
 * test_sessions_draft_encryption.js
 * 
 * Validação Completa de Cifragem AES-256-GCM em sessions.draft (BACKLOG-LGPD-02):
 * 1. [Ramo A - Insert Novo]: Grava draft em sessão nova e valida no Supabase direto (iv:authTag:ciphertext).
 * 2. [Ramo B - Update Existente]: Atualiza draft em sessão existente e valida no Supabase direto (iv:authTag:ciphertext).
 * 3. [Ramo C - Reset Null]: Executa setDraft(null) e valida draft: null no Supabase.
 * 4. [Descriptografia]: Valida que getDraft() retorna os valores originais em memória para a FSM.
 * 5. [Resiliência a Legados]: Insere registro direto no Supabase em texto plano (sem cifragem)
 *    e comprova que getDraft() lê os dados sem lançar exceção e sem corrupção.
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
    console.log('🔒 [TEST_DRAFT_ENCRYPTION] Auditoria Completa de Cifragem sessions.draft');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const testPhone = '5511999998877';
    const rawCpf = '529.982.247-25';
    const rawDepCpf = '123.456.789-00';

    // ── 1. Limpeza inicial ──
    await db.sessions.delete(testPhone, clinicId).catch(() => {});

    // ── 2. Ramo A: Inserção de Nova Sessão via setDraft ──
    console.log('[Etapa 1 / Ramo A] Gravando draft em sessão NOVA (sem registro prévio no banco)...');
    await db.sessions.setDraft(testPhone, {
        type: 'Limpeza',
        name: 'Carlos Eduardo',
        cpf: rawCpf,
        is_family_booking: true,
        dependentName: 'Raquel Pereira',
        dependentCpf: rawDepCpf
    }, clinicId);

    const { data: rawInsertRow } = await db.supabase
        .from('sessions')
        .select('draft')
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId)
        .single();

    console.log('  📊 DUMP BANCO APÓS INSERT (rawInsertRow.draft):', JSON.stringify(rawInsertRow.draft, null, 2));
    assert.strictEqual(rawInsertRow.draft.cpf.split(':').length, 3, 'Ramo A: CPF deve ser gravado cifrado (iv:authTag:ciphertext)');
    assert.strictEqual(rawInsertRow.draft.dependentCpf.split(':').length, 3, 'Ramo A: dependentCpf deve ser gravado cifrado');
    console.log('  ✅ PASS: Ramo A (Insert Novo) gravou 100% cifrado em AES-256-GCM.\n');

    // ── 3. Ramo B: Atualização de Sessão Existente via setDraft ──
    console.log('[Etapa 2 / Ramo B] Atualizando draft em sessão EXISTENTE...');
    const updatedDepCpf = '987.654.321-99';
    await db.sessions.setDraft(testPhone, {
        type: 'Clareamento',
        name: 'Carlos Eduardo Silva',
        cpf: rawCpf,
        is_family_booking: true,
        dependentName: 'Raquel Pereira Silva',
        dependentCpf: updatedDepCpf
    }, clinicId);

    const { data: rawUpdateRow } = await db.supabase
        .from('sessions')
        .select('draft')
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId)
        .single();

    console.log('  📊 DUMP BANCO APÓS UPDATE (rawUpdateRow.draft):', JSON.stringify(rawUpdateRow.draft, null, 2));
    assert.strictEqual(rawUpdateRow.draft.cpf.split(':').length, 3, 'Ramo B: CPF deve continuar cifrado no update');
    assert.strictEqual(rawUpdateRow.draft.dependentCpf.split(':').length, 3, 'Ramo B: dependentCpf atualizado deve estar cifrado');
    assert.notStrictEqual(rawUpdateRow.draft.dependentCpf, updatedDepCpf, 'Ramo B: dependentCpf NÃO pode estar em texto claro');
    console.log('  ✅ PASS: Ramo B (Update Existente) gravou 100% cifrado em AES-256-GCM.\n');

    // ── 4. Validação de Leitura Transparente via getDraft ──
    console.log('[Etapa 3 / Leitura] Lendo draft via getDraft() (descriptografia transparente em memória)...');
    const decryptedDraft = await db.sessions.getDraft(testPhone, clinicId);
    console.log('  📊 DRAFT DESCRIPTOGRAFADO (getDraft):', JSON.stringify(decryptedDraft, null, 2));
    assert.strictEqual(decryptedDraft.cpf, rawCpf, 'getDraft deve retornar CPF em claro para a FSM');
    assert.strictEqual(decryptedDraft.dependentCpf, updatedDepCpf, 'getDraft deve retornar dependentCpf em claro para a FSM');
    assert.strictEqual(decryptedDraft.type, 'Clareamento');
    console.log('  ✅ PASS: getDraft() descriptografou perfeitamente os dados em memória para a FSM.\n');

    // ── 5. Ramo C: Reset Atômico do Draft via setDraft(null) ──
    console.log('[Etapa 4 / Ramo C] Resetando draft com setDraft(phone, null, clinicId)...');
    await db.sessions.setDraft(testPhone, null, clinicId);
    const { data: rawResetRow } = await db.supabase
        .from('sessions')
        .select('draft')
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId)
        .single();

    console.log('  📊 DUMP BANCO APÓS RESET (rawResetRow.draft):', rawResetRow.draft);
    assert.strictEqual(rawResetRow.draft, null, 'Ramo C: draft deve ser null após reset');
    const emptyDraft = await db.sessions.getDraft(testPhone, clinicId);
    assert.deepStrictEqual(emptyDraft, {}, 'getDraft após reset deve retornar objeto vazio {}');
    console.log('  ✅ PASS: Ramo C (Reset Null) persistiu null no banco e getDraft retornou {}.\n');

    // ── 6. Resiliência a Legados (Backward Compatibility) ──
    console.log('[Etapa 5 / Resiliência a Legados] Inserindo registro legado com CPF em TEXTO PLANO direto no Supabase (bypass de setDraft)...');
    const legacyPlainCpf = '111.444.777-35';
    const legacyPlainDepCpf = '222.555.888-46';
    
    // Inserção direta sem criptografia (simulando registro antigo pré-migração)
    await db.supabase
        .from('sessions')
        .update({
            draft: {
                type: 'Ortodontia',
                cpf: legacyPlainCpf,
                is_family_booking: true,
                dependentCpf: legacyPlainDepCpf
            }
        })
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId);

    // Consulta de verificação do dado legado gravado em claro
    const { data: rawLegacyRow } = await db.supabase
        .from('sessions')
        .select('draft')
        .eq('phone', testPhone)
        .eq('clinic_id', clinicId)
        .single();

    console.log('  📊 DUMP BANCO REGISTRO LEGADO (rawLegacyRow.draft):', JSON.stringify(rawLegacyRow.draft, null, 2));
    assert.strictEqual(rawLegacyRow.draft.cpf, legacyPlainCpf, 'Banco contém CPF legado em texto claro');
    assert.strictEqual(rawLegacyRow.draft.dependentCpf, legacyPlainDepCpf, 'Banco contém dependentCpf legado em texto claro');

    // Leitura via getDraft() — deve aplicar fallback e não lançar exceção
    console.log('  🔄 Invocando getDraft() sobre o registro legado...');
    const legacyReadResult = await db.sessions.getDraft(testPhone, clinicId);
    console.log('  📊 RESULTADO GETDRAFT SOBRE REGISTRO LEGADO:', JSON.stringify(legacyReadResult, null, 2));

    assert.strictEqual(legacyReadResult.cpf, legacyPlainCpf, 'Fallback de legado deve preservar CPF em texto claro');
    assert.strictEqual(legacyReadResult.dependentCpf, legacyPlainDepCpf, 'Fallback de legado deve preservar dependentCpf em texto claro');
    assert.strictEqual(legacyReadResult.type, 'Ortodontia');
    console.log('  ✅ PASS: getDraft() leu o registro legado com fallback seguro sem lançar exceção e sem corromper dados!\n');

    // ── 7. Limpeza final ──
    await db.sessions.delete(testPhone, clinicId).catch(() => {});

    console.log('================================================================');
    console.log('🎉 AUDITORIA COMPLETA DE CIFRAGEM & LEGADOS 100% APROVADA!');
    console.log('================================================================\n');
}

testDraftEncryption().catch(err => {
    console.error('❌ ERRO NO TESTE DE CIFRAGEM DE DRAFT:', err);
    process.exit(1);
});
