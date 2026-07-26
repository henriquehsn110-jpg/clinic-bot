const fs = require('fs');

let text = fs.readFileSync('services/databaseService.js', 'utf8');

// Adiciona is('deleted_at', null) em todos os selects de patients, appointments, sessions
const tables = ['patients', 'appointments', 'sessions'];
for (const table of tables) {
    const regex = new RegExp(`from\\('${table}'\\)\\s*\\.select\\(([^)]*)\\)`, 'g');
    text = text.replace(regex, `from('${table}').select($1).is('deleted_at', null)`);
}

// Injetar auditLog function no topo, logo antes de "const patients = {"
const auditLogFunc = `
/**
 * Registra uma operação sensível no banco de dados para conformidade com a LGPD (P2)
 */
async function auditLog(action, entityType, entityId, clinicId, changes) {
    try {
        await supabase.from('audit_logs').insert({
            action,
            entity_type: entityType,
            entity_id: entityId,
            clinic_id: clinicId,
            changes
        });
    } catch (err) {
        logger.error('AUDIT_LOG_FAILED', \`Falha ao gravar auditoria (\${action} \${entityType}): \${err.message}\`);
    }
}
`;
if (!text.includes('async function auditLog(')) {
    text = text.replace('const patients = {', auditLogFunc + '\nconst patients = {');
}

// Soft delete no patients.delete
const deleteRegex = /async delete\s*\(\s*phone\s*,\s*clinicId\s*\)\s*\{[\s\S]*?from\('patients'\)\s*\.delete\(\)[\s\S]*?\}\s*\}\s*,/;
if (deleteRegex.test(text)) {
    const newDelete = `async delete(phone, clinicId) {
        return withRetry(async () => {
            const { data: patient, error: findErr } = await supabase
                .from('patients')
                .select('id')
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null)
                .maybeSingle();

            if (!patient) return; // Nada a deletar

            const { error } = await supabase
                .from('patients')
                .update({ deleted_at: new Date().toISOString() })
                .eq('phone', phone)
                .eq('clinic_id', clinicId);

            if (error) throw new Error(\`patients.delete: \${error.message}\`);

            await auditLog('DELETE', 'PATIENT', patient.id, clinicId, { phone });
        });
    },`;
    text = text.replace(deleteRegex, newDelete);
}

// Injetar auditoria no updateCpf
const updateCpfRegex = /async updateCpf\s*\(\s*phone\s*,\s*cpf\s*,\s*clinicId\s*\)\s*\{[\s\S]*?\.single\(\);\s*if\s*\(error\)\s*throw\s*new\s*Error\(\`patients\.updateCpf:\s*\$\{error\.message\}\`\);\s*return\s*data;\s*\}/;
if (updateCpfRegex.test(text)) {
    const newUpdateCpf = `async updateCpf(phone, cpf, clinicId) {
        return withRetry(async () => {
            const encryptedCpf = encryptData(cpf);
            const cpfHash = hashForSearch(cpf);
            
            const { data, error } = await supabase
                .from('patients')
                .update({ cpf: encryptedCpf, cpf_hash: cpfHash })
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .select()
                .single();

            if (error) throw new Error(\`patients.updateCpf: \${error.message}\`);

            await auditLog('UPDATE', 'PATIENT', data.id, clinicId, {
                field: 'cpf',
                note: 'CPF mascarado atualizado'
            });

            return data;
        });
    }`;
    text = text.replace(updateCpfRegex, newUpdateCpf);
}

fs.writeFileSync('services/databaseService.js', text);
console.log('databaseService.js atualizado com Soft-Delete e Auditoria LGPD.');
