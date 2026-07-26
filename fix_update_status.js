const fs = require('fs');

let text = fs.readFileSync('services/databaseService.js', 'utf8');

// 1. Atualizar appointments.updateStatus para aceitar clinicId e registrar auditLog
const oldUpdateStatus = /async updateStatus\s*\(\s*appointmentId\s*,\s*status\s*\)\s*\{[\s\S]*?from\('appointments'\)[\s\S]*?\.single\(\);\s*if\s*\(error\)[\s\S]*?return\s*data;\s*\}\);?\s*\}/;

const newUpdateStatus = `async updateStatus(appointmentId, status, clinicId = null) {
        return withRetry(async () => {
            let query = supabase.from('appointments').update({ status }).eq('id', appointmentId);
            if (clinicId) query = query.eq('clinic_id', clinicId);

            const { data, error } = await query.select().single();

            if (error) throw new Error(\`appointments.updateStatus: \${error.message}\`);

            if (clinicId || data?.clinic_id) {
                await auditLog('UPDATE', 'APPOINTMENT', appointmentId, clinicId || data.clinic_id, { status });
            }

            return data;
        });
    }`;

if (oldUpdateStatus.test(text)) {
    text = text.replace(oldUpdateStatus, newUpdateStatus);
    console.log('appointments.updateStatus atualizado com clinicId e auditLog.');
} else {
    console.log('RegEx do updateStatus não casou.');
}

fs.writeFileSync('services/databaseService.js', text);
