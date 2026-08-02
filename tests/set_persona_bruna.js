const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
            const key = trimmed.substring(0, idx).trim();
            let val = trimmed.substring(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
                val = val.slice(1, -1);
            if (!process.env[key]) process.env[key] = val;
        }
    }
});

const db = require('../services/databaseService');

(async () => {
    const c = await db.clinics.findBySlug('clinica-modelo');
    if (!c) { console.error('Clinica nao encontrada'); process.exit(1); }
    
    const { data: r } = await db.supabase.from('clinics').select('work_hours').eq('id', c.id).maybeSingle();
    let s = {};
    if (r?.work_hours && r.work_hours.startsWith('{')) s = JSON.parse(r.work_hours);
    
    console.log(`personaName ANTES: "${s.personaName || '(nao definido)'}"`);
    s.personaName = 'Bruna';
    
    const { error } = await db.supabase.from('clinics').update({ work_hours: JSON.stringify(s) }).eq('id', c.id);
    if (error) {
        console.error('Erro ao salvar:', error.message);
        process.exit(1);
    }
    
    // Verify
    const { data: v } = await db.supabase.from('clinics').select('work_hours').eq('id', c.id).maybeSingle();
    const vParsed = JSON.parse(v.work_hours);
    console.log(`personaName DEPOIS: "${vParsed.personaName}"`);
    
    if (vParsed.personaName === 'Bruna') {
        console.log('✅ SUCESSO: personaName definido como "Bruna" no Supabase!');
    } else {
        console.log('❌ FALHA ao definir personaName');
    }
    process.exit(0);
})();
