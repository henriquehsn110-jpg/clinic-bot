const fs = require('fs');

let text = fs.readFileSync('services/reminderService.js', 'utf8');

const regexToReplace = /if\s*\(this\.processedReminders\.has\(reminderKey\)\)\s*\{[\s\S]*?continue;\s*\}/;

const replacement = `// 1. Check in-memory
                    if (this.processedReminders.has(reminderKey)) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado hoje (memória)' });
                        continue;
                    }

                    // 2. Check DB (Durabilidade P5)
                    const { data: alreadySent } = await db.supabase
                        .from('reminder_logs')
                        .select('id')
                        .eq('appointment_id', appt.id)
                        .eq('clinic_id', clinic.id)
                        .gte('sent_at', \`\${todayStr}T00:00:00Z\`)
                        .lte('sent_at', \`\${todayStr}T23:59:59Z\`)
                        .maybeSingle();

                    if (alreadySent) {
                        this.processedReminders.add(reminderKey); // Sync in-memory cache
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado hoje (banco)' });
                        continue;
                    }`;

text = text.replace(regexToReplace, replacement);

const successRegex = /this\.processedReminders\.add\(reminderKey\);\s*stats\.sent\+\+;/;

const successReplacement = `this.processedReminders.add(reminderKey);
                        stats.sent++;
                        
                        // Grava no banco de dados para garantir que não haverá reenvio mesmo com restart
                        try {
                            const { error: logErr } = await db.supabase.from('reminder_logs').insert({
                                appointment_id: appt.id,
                                clinic_id: clinic.id,
                                sent_at: new Date().toISOString()
                            });
                            if (logErr) {
                                logger.error('REMINDER_LOG_FAILED', logErr.message);
                            }
                        } catch (e) {
                            logger.error('REMINDER_LOG_FAILED', e.message);
                        }`;

text = text.replace(successRegex, successReplacement);

fs.writeFileSync('services/reminderService.js', text);
console.log('reminderService.js atualizado com Durabilidade P5.');
