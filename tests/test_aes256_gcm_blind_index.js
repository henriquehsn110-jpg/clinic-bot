/**
 * TESTE DE CONFIRMAÇÃO TÉCNICA — CRIPTOGRAFIA AES-256-GCM E BLIND INDEXING (HMAC-SHA256)
 * Testa se um CPF é cifrado em AES-256-GCM, descriptografado com sucesso,
 * e pesquisável via Blind Indexing (hashForSearch) na tabela patients do Supabase.
 */
require('dotenv').config();
const db = require('../services/databaseService');
const assert = require('assert');

const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
const testPhone = '5511966665555';
const rawCpf = '529.982.247-25';

async function testAes256GcmBlindIndex() {
    console.log('================================================================');
    console.log('🔒 TESTE DE CRIPTOGRAFIA AES-256-GCM & BLIND INDEXING (CPF)');
    console.log('================================================================\n');

    // 1. Testar funções de cifragem unitariamente
    const cleanCpf = rawCpf.replace(/\D/g, '');
    const encryptedCpf = db.encryptData(cleanCpf);
    const cpfHash = db.hashForSearch(cleanCpf);
    const decryptedCpf = db.decryptData(encryptedCpf);

    console.log('🔹 [Passo 1] Teste Unitário de Cifragem AES-256-GCM & HMAC Blind Index:');
    console.log(`   CPF Bruto Limpo:        "${cleanCpf}"`);
    console.log(`   CPF Cifrado (AES-256):  "${encryptedCpf}"`);
    console.log(`   Blind Index (HMAC Hash):"${cpfHash}"`);
    console.log(`   CPF Descriptografado:   "${decryptedCpf}"\n`);

    assert.strictEqual(decryptedCpf, cleanCpf, 'O CPF descriptografado deve ser exatamente igual ao CPF bruto original!');
    assert.notStrictEqual(encryptedCpf, cleanCpf, 'O CPF cifrado não pode conter a string do CPF em texto puro!');
    assert.ok(encryptedCpf.split(':').length === 3, 'O formato cifrado deve ser iv:authTag:encrypted');

    console.log('   ✅ PASS: Cifragem e Descriptografia AES-256-GCM validadas com sucesso!');

    // 2. Testar busca real por Blind Index na tabela 'patients' do Supabase
    console.log('\n🔹 [Passo 2] Teste de Gravação e Busca por Blind Index no Supabase...');

    // Criar paciente de teste
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    
    // Atualizar CPF cifrado + cpf_hash no banco
    const { data: updatedPatient, error: updateErr } = await db.supabase
        .from('patients')
        .update({
            cpf: encryptedCpf,
            cpf_hash: cpfHash
        })
        .eq('id', patient.id)
        .select()
        .single();

    if (updateErr) {
        console.error('❌ Erro ao gravar CPF cifrado:', updateErr.message);
        process.exit(1);
    }

    console.log(`   Paciente gravado no banco ID: ${updatedPatient.id}`);
    console.log(`   Coluna 'cpf' no Supabase:      "${updatedPatient.cpf}"`);
    console.log(`   Coluna 'cpf_hash' no Supabase: "${updatedPatient.cpf_hash}"`);

    // 3. Executar busca pelo Blind Index (db.patients.findByCpf)
    const foundPatient = await db.patients.findByCpf(cleanCpf, clinicId);
    console.log(`\n🔹 [Passo 3] Resultado da busca determinística por Blind Index (findByCpf):`);
    console.log(`   Encontrado ID:             ${foundPatient?.id}`);
    console.log(`   CPF Descriptografado Lido: "${foundPatient?.cpf}"`);

    assert.ok(foundPatient !== null, 'Deveria localizar o paciente pelo Blind Index cpf_hash');
    assert.strictEqual(foundPatient.id, patient.id, 'O ID do paciente localizado deve bater com o gravado');
    assert.strictEqual(foundPatient.cpf, cleanCpf, 'O CPF lido via findByCpf deve vir descriptografado');

    console.log('   ✅ PASS: Busca por Blind Index (HMAC-SHA256) validada com sucesso no Supabase!');

    // 4. Limpeza
    console.log('\n🧹 Limpando paciente de teste do Supabase...');
    await db.supabase.from('patients').delete().eq('id', patient.id);
    console.log('   ✅ Limpeza concluída.');

    console.log('\n================================================================');
    console.log('🎉 CRIPTOGRAFIA AES-256-GCM & BLIND INDEXING 100% VALIDADOS!');
    console.log('================================================================\n');
}

testAes256GcmBlindIndex().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE DE CRIPTOGRAFIA:', err);
    process.exit(1);
});
