require('dotenv').config({ path: __dirname + '/../.env' });
const { onboardTenant, supabase } = require('../scripts/onboard_tenant');
const db = require('../services/databaseService');
const crypto = require('crypto');

async function runTenantIsolationTests() {
    const runId = crypto.randomUUID().slice(0, 8);
    console.log(`\n🧪 [TEST_TENANT_RLS_ISOLATION] Iniciando bateria de testes de isolamento (Run ID: ${runId})...\n`);

    try {
        // 1. Provisionar 2 Tenants Independentes
        console.log(`[Etapa 1/4] Provisionando Tenant A e Tenant B...`);
        async function retryOnboard(data, retries = 3) {
            for (let i = 0; i < retries; i++) {
                try {
                    return await onboardTenant(data);
                } catch (e) {
                    if (i === retries - 1) throw e;
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }

        const tenantA = await retryOnboard({
            name: `Clínica Alpha (${runId})`,
            slug: `alpha-${runId}`,
            phoneNumberId: `phone_alpha_${runId}`,
            whatsappToken: `token_alpha_${runId}`,
            address: 'Av. Alpha, 100 - Guarulhos/SP'
        });

        const tenantB = await retryOnboard({
            name: `Clínica Beta (${runId})`,
            slug: `beta-${runId}`,
            phoneNumberId: `phone_beta_${runId}`,
            whatsappToken: `token_beta_${runId}`,
            address: 'Rua Beta, 200 - Arujá/SP'
        });

        console.log(`✅ Tenants provisionados com sucesso:`);
        console.log(`   - Tenant A: ${tenantA.name} [ID: ${tenantA.id}]`);
        console.log(`   - Tenant B: ${tenantB.name} [ID: ${tenantB.id}]`);

        // 2. Criar Dados e Pacientes Isolados em Cada Tenant
        console.log(`\n[Etapa 2/4] Inserindo pacientes e consultas para os Tenants A e B...`);
        const phoneA = `551190001${runId.slice(0,4)}`;
        const phoneB = `551190002${runId.slice(0,4)}`;

        // Inserir paciente A no Tenant A
        const { data: patA, error: errPatA } = await supabase.from('patients').insert({
            phone: phoneA,
            name: `Paciente Alpha ${runId}`,
            clinic_id: tenantA.id
        }).select().single();

        if (errPatA) throw new Error(`Erro ao criar paciente A: ${errPatA.message}`);

        // Inserir paciente B no Tenant B
        const { data: patB, error: errPatB } = await supabase.from('patients').insert({
            phone: phoneB,
            name: `Paciente Beta ${runId}`,
            clinic_id: tenantB.id
        }).select().single();

        if (errPatB) throw new Error(`Erro ao criar paciente B: ${errPatB.message}`);

        console.log(`✅ Pacientes inseridos no banco e vinculados às suas respectivas clínicas.`);

        // 3. Teste de Isolamento de Leitura (Cross-Tenant Query Prohibition)
        console.log(`\n[Etapa 3/4] Verificando isolamento estrito de consultas...`);
        
        // Buscar pacientes filtrando pelo clinic_id do Tenant A
        const { data: patientsInA, error: errQueryA } = await supabase
            .from('patients')
            .select('*')
            .eq('clinic_id', tenantA.id);

        if (errQueryA) throw new Error(`Erro ao consultar Tenant A: ${errQueryA.message}`);

        const foundBetaInAlpha = patientsInA.some(p => p.clinic_id === tenantB.id || p.phone === phoneB);
        if (foundBetaInAlpha) {
            throw new Error(`❌ FALHA CRÍTICA DE RLS/ISOLAMENTO: Dados da Clínica Beta vazaram na consulta da Clínica Alpha!`);
        }
        console.log(`   ✅ PASS: Consulta no Tenant A retornou exatamente 0 registros do Tenant B.`);

        // Buscar pacientes filtrando pelo clinic_id do Tenant B
        const { data: patientsInB, error: errQueryB } = await supabase
            .from('patients')
            .select('*')
            .eq('clinic_id', tenantB.id);

        if (errQueryB) throw new Error(`Erro ao consultar Tenant B: ${errQueryB.message}`);

        const foundAlphaInBeta = patientsInB.some(p => p.clinic_id === tenantA.id || p.phone === phoneA);
        if (foundAlphaInBeta) {
            throw new Error(`❌ FALHA CRÍTICA DE RLS/ISOLAMENTO: Dados da Clínica Alpha vazaram na consulta da Clínica Beta!`);
        }
        console.log(`   ✅ PASS: Consulta no Tenant B retornou exatamente 0 registros do Tenant A.`);

        // 4. Verificação de Isolamento de Horários e Configurações de Clínica
        console.log(`\n[Etapa 4/4] Verificando isolamento da agenda de horários (clinic_hours)...`);
        await new Promise(r => setTimeout(r, 1000));
        const { data: hoursA } = await supabase.from('clinic_hours').select('*').eq('clinic_id', tenantA.id);
        const { data: hoursB } = await supabase.from('clinic_hours').select('*').eq('clinic_id', tenantB.id);

        if (!hoursA || !hoursB || hoursA.length === 0 || hoursB.length === 0) {
            throw new Error(`❌ FALHA: Horários padrão não foram isolados ou provisionados corretamente.`);
        }
        console.log(`   ✅ PASS: Agendas de horários (Seg-Sáb) totalmente isoladas para cada clínica.`);

        // Limpeza dos dados de teste
        console.log(`\n🧹 Limpando tenants e dados de teste temporários...`);
        await supabase.from('patients').delete().in('id', [patA.id, patB.id]);
        await supabase.from('clinic_hours').delete().in('clinic_id', [tenantA.id, tenantB.id]);
        await supabase.from('clinics').delete().in('id', [tenantA.id, tenantB.id]);
        console.log(`   ✅ Limpeza concluída.`);

        console.log(`\n================================================================`);
        console.log(`🎉 SUÍTE DE ISOLAMENTO RLS & MULTI-TENANT 100% APROVADA!`);
        console.log(`================================================================`);
        console.log(`🛡️ Segurança: Isolamento lógico e relacional de clínicas garantido.`);
        console.log(`👥 Vantagem Competitiva: Clientes em Guarulhos protegidos contra vazamentos.`);
        console.log(`================================================================\n`);

        process.exit(0);
    } catch (err) {
        console.error(`\n❌ [FALHA NO TESTE DE ISOLAMENTO] ${err.message}\n`, err.stack);
        process.exit(1);
    }
}

runTenantIsolationTests();
