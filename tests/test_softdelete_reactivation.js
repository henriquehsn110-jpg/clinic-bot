/**
 * Teste empírico: findOrCreate reativa paciente soft-deleted
 * 
 * Cenário: 
 * 1. Cria paciente
 * 2. Soft-deleta (simula LGPD / exclusão manual)
 * 3. Paciente manda mensagem de novo → findOrCreate deve reativar
 * 4. Verifica que paciente voltou a aparecer em queries com filtro deleted_at IS NULL
 */
require('dotenv').config();
const db = require('../services/databaseService');

async function main() {
    const testPhone = '5511999REACTIVATE';
    
    // 0. Busca uma clínica válida
    const { data: clinics } = await db.supabase.from('clinics').select('id, slug').limit(1);
    if (!clinics || !clinics.length) { console.error('Sem clínicas'); process.exit(1); }
    const clinicId = clinics[0].id;
    console.log(`Clínica: ${clinics[0].slug} (${clinicId})\n`);

    // Limpeza prévia
    await db.supabase.from('appointments').delete().eq('patient_id', 
        (await db.supabase.from('patients').select('id').eq('phone', testPhone).eq('clinic_id', clinicId).maybeSingle()).data?.id || '00000000-0000-0000-0000-000000000000'
    );
    await db.supabase.from('patients').delete().eq('phone', testPhone).eq('clinic_id', clinicId);

    // 1. Cria paciente via findOrCreate
    console.log('=== ETAPA 1: Criar paciente ===');
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    console.log(`  ✅ Paciente criado: id=${patient.id}, deleted_at=${patient.deleted_at}`);

    // 2. Soft-delete (simula exclusão LGPD)
    console.log('\n=== ETAPA 2: Soft-delete (simula LGPD) ===');
    await db.supabase.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', patient.id);
    
    // Verifica que está invisível no findByPhone (que filtra deleted_at)
    const invisible = await db.patients.findByPhone(testPhone, clinicId);
    console.log(`  findByPhone após soft-delete: ${invisible ? 'ENCONTROU (BUG!)' : 'null (correto — invisível)'}`);
    if (invisible) { console.error('  ❌ FAIL: findByPhone deveria retornar null para soft-deleted'); process.exit(1); }
    console.log('  ✅ Paciente corretamente invisível no dashboard');

    // 3. Paciente manda mensagem de novo → findOrCreate deve reativar
    console.log('\n=== ETAPA 3: Paciente retorna — findOrCreate deve reativar ===');
    const reactivated = await db.patients.findOrCreate(testPhone, clinicId);
    console.log(`  findOrCreate retornou: id=${reactivated.id}, deleted_at=${reactivated.deleted_at}`);
    
    if (reactivated.deleted_at !== null) {
        console.error('  ❌ FAIL: deleted_at deveria ser null após reativação');
        process.exit(1);
    }
    console.log('  ✅ deleted_at = null (reativado com sucesso)');

    // 4. Verifica que agora está visível no findByPhone novamente
    console.log('\n=== ETAPA 4: Verificar visibilidade pós-reativação ===');
    const visible = await db.patients.findByPhone(testPhone, clinicId);
    console.log(`  findByPhone pós-reativação: ${visible ? `id=${visible.id}` : 'null (BUG!)'}`);
    
    if (!visible) {
        console.error('  ❌ FAIL: paciente deveria ser visível após reativação');
        process.exit(1);
    }
    
    // Confirma no banco diretamente
    const { data: dbRow } = await db.supabase.from('patients').select('id, deleted_at').eq('id', patient.id).single();
    console.log(`  Banco direto: deleted_at = ${dbRow.deleted_at}`);
    if (dbRow.deleted_at !== null) {
        console.error('  ❌ FAIL: deleted_at no banco deveria ser null');
        process.exit(1);
    }
    console.log('  ✅ Paciente visível no dashboard novamente');

    // 5. Limpeza
    console.log('\n=== LIMPEZA ===');
    await db.supabase.from('patients').delete().eq('id', patient.id);
    console.log('  🧹 Dados de teste removidos');

    console.log('\n================================================================');
    console.log('🎉 TESTE DE REATIVAÇÃO SOFT-DELETE 100% APROVADO');
    console.log('   Paciente soft-deleted que retorna é reativado automaticamente');
    console.log('   e volta a aparecer no dashboard sem dados órfãos.');
    console.log('================================================================');
    process.exit(0);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
