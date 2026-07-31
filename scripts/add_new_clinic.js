require('dotenv').config();
const db = require('../services/databaseService');
const crypto = require('crypto');

/**
 * SCRIPT UTILITÁRIO: Onboarding de Nova Clínica Cliente no ClinicaBot SaaS Pro
 * 
 * Uso via linha de comando:
 * node scripts/add_new_clinic.js "Clínica Sorriso Real" "sorriso-real" "admin@sorrisoreal.com.br" "5511999998888" "Lara"
 */

async function addNewClinic() {
    const args = process.argv.slice(2);
    const name = args[0] || 'Nova Clínica Odontológica';
    const slug = args[1] || `clinica-${crypto.randomBytes(3).toString('hex')}`;
    const email = args[2] || `admin@${slug}.com.br`;
    const phone = args[3] || '5511999999999';
    const personaName = args[4] || 'Ana';

    console.log('🚀 [ONBOARDING] Cadastrando nova clínica cliente no Supabase...');
    console.log(`  • Nome da Clínica: ${name}`);
    console.log(`  • Slug Identificador: ${slug}`);
    console.log(`  • E-mail do Admin: ${email}`);
    console.log(`  • Telefone WhatsApp: ${phone}`);
    console.log(`  • Nome da IA (Persona): ${personaName}`);

    if (!db.supabase) {
        console.error('❌ ERRO: Conexão com Supabase não inicializada.');
        process.exit(1);
    }

    const defaultSettings = {
        name,
        personaName,
        address: 'Endereço da Clínica a ser preenchido no Dashboard',
        phone,
        evalPrice: '150',
        insurances: 'Bradesco Saúde, Amil Dental, SulAmérica',
        paymentMethods: 'PIX com 5% de desconto, Cartão em 12x',
        emergency: 'Em caso de dor forte, ligar para a recepção.',
        workHours: 'Segunda a Sexta-feira, das 08:00 às 18:00',
        minCancellationHours: '4',
        procedures: 'Consulta Geral, Limpeza, Tratamento de Canal, Implantes, Clareamento Dental',
        updatedAt: new Date().toISOString()
    };

    const { data: existing } = await db.supabase
        .from('clinics')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

    if (existing) {
        console.log(`ℹ️ Clínica com slug "${slug}" já existe (ID: ${existing.id}). Atualizando dados...`);
        const { error } = await db.supabase
            .from('clinics')
            .update({
                name,
                work_hours: JSON.stringify(defaultSettings)
            })
            .eq('id', existing.id);

        if (error) {
            console.error('❌ Erro ao atualizar clínica:', error.message);
            process.exit(1);
        }
        console.log('✅ Clínica atualizada com sucesso!');
    } else {
        const { data: newClinic, error } = await db.supabase
            .from('clinics')
            .insert({
                name,
                slug,
                work_hours: JSON.stringify(defaultSettings)
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar clínica no Supabase:', error.message);
            process.exit(1);
        }

        console.log(`🎉 Nova clínica criada com sucesso! UUID: ${newClinic.id}`);
    }

    console.log('\n================================================================');
    console.log('📋 INSTRUÇÕES PARA ENTREGA AO CLIENTE:');
    console.log(`1. URL do Dashboard: https://clinic-bot-zksc.onrender.com/dashboard/`);
    console.log(`2. E-mail de Acesso: ${email}`);
    console.log(`3. Senha Provisória: 123456`);
    console.log('================================================================\n');

    process.exit(0);
}

addNewClinic().catch(err => {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
});
