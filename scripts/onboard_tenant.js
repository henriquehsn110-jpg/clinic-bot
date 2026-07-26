#!/usr/bin/env node
/**
 * onboard_tenant.js — Provisionamento automatizado de novas clínicas no Supabase
 * 
 * Uso CLI:  node scripts/onboard_tenant.js --name "Clínica X" --slug "clinica-x" --phone-id "123" --token "EAAY..."
 * Uso API:  const { onboardTenant, supabase } = require('./scripts/onboard_tenant');
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const { createClient } = require('@supabase/supabase-js');

function cleanEnvVar(val) {
    if (val == null) return '';
    let str = String(val).trim();
    let prev;
    do { prev = str; str = str.trim().replace(/^["']+|["']+$|^[`]+|[`]+$/g, '').trim(); } while (str !== prev);
    return str;
}

const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL);
const supabaseKey = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Provisiona uma nova clínica no banco Multi-Tenant.
 * @param {Object} opts - { name, slug, phoneNumberId?, whatsappToken?, address? }
 * @returns {Object} O registro da clínica criada
 */
async function onboardTenant(opts) {
    const { name, slug, phoneNumberId, whatsappToken, address } = opts;
    if (!name || !slug) throw new Error('name e slug são obrigatórios');

    // Verificar slug duplicado
    const { data: existing } = await supabase.from('clinics').select('id').eq('slug', slug).maybeSingle();
    if (existing) throw new Error(`Slug "${slug}" já existe (clinic_id: ${existing.id})`);

    // Inserir clínica
    const { data: clinic, error } = await supabase
        .from('clinics')
        .insert({
            name,
            slug,
            phone_number_id: phoneNumberId || null,
            whatsapp_token:  whatsappToken || null,
            address:         address || null,
            eval_price:      150
        })
        .select()
        .single();

    if (error) throw new Error(`Erro ao inserir clínica: ${error.message}`);

    // Provisionar horários padrão (Seg=1 a Sex=5, com slots das 08:00 às 17:30)
    const defaultSlots = [];
    for (let h = 8; h < 18; h++) {
        defaultSlots.push(`${String(h).padStart(2,'0')}:00`);
        if (h < 17) defaultSlots.push(`${String(h).padStart(2,'0')}:30`);
    }

    const defaultHours = [];
    for (let day = 1; day <= 5; day++) { // Seg=1 a Sex=5
        defaultHours.push({
            clinic_id: clinic.id,
            day_of_week: day,
            available_slots: JSON.stringify(defaultSlots)
        });
    }
    // Sábado com horário reduzido
    defaultHours.push({
        clinic_id: clinic.id,
        day_of_week: 6,
        available_slots: JSON.stringify(defaultSlots.slice(0, 8)) // 08:00-11:30
    });

    const { error: hoursError } = await supabase.from('clinic_hours').insert(defaultHours);
    if (hoursError) {
        console.log(`⚠️  Tabela clinic_hours: ${hoursError.message} (ignorando provisionamento de horários)`);
    }

    return clinic;
}

// ── Modo CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
    const args = process.argv.slice(2);
    function getArg(name) {
        const idx = args.indexOf(`--${name}`);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
    }

    const name     = getArg('name');
    const slug     = getArg('slug');
    const phoneId  = getArg('phone-id');
    const token    = getArg('token');
    const address  = getArg('address');

    if (!name || !slug) {
        console.error('❌ Uso: node scripts/onboard_tenant.js --name "Nome" --slug "slug" [--phone-id "ID"] [--token "TOKEN"] [--address "Endereço"]');
        process.exit(1);
    }

    console.log(`\n🏥 Provisionando nova clínica: "${name}" (slug: ${slug})\n`);

    onboardTenant({ name, slug, phoneNumberId: phoneId, whatsappToken: token, address })
        .then(clinic => {
            console.log(`✅ Clínica criada com sucesso!`);
            console.log(`   ID:   ${clinic.id}`);
            console.log(`   Slug: ${clinic.slug}`);
            console.log(`\n📋 Próximos passos:`);
            console.log(`   1. Configure WhatsApp Token no painel Meta`);
            console.log(`   2. Aponte webhook para: https://seu-dominio.com/api/webhook`);
            console.log(`   3. Acesse dashboard: /login?clinic=${slug}\n`);
        })
        .catch(err => {
            console.error('❌ Erro:', err.message);
            process.exit(1);
        });
}

module.exports = { onboardTenant, supabase };
