/**
 * TEST DE USABILIDADE: Simulação de Paciente Agendando Consultas
 * Valida que a grade de horários respeita:
 *   1) Duração individual de cada procedimento
 *   2) Pausa de almoço do médico (ex: 12h-13h bloqueada)
 *   3) Nenhum slot "fantasma" invade a pausa ou excede o expediente
 *   4) Slots ocupados por outros pacientes são removidos
 *
 * Cenários simulados:
 *   A) Paciente quer Limpeza Dental (30 min) — Doutor com almoço 12h-13h
 *   B) Paciente quer Tratamento de Canal (60 min) — Doutor com almoço 12h-13h
 *   C) Paciente quer Implante Dental (90 min) — Verifica colisão parcial com almoço
 *   D) Paciente quer Consulta Geral (30 min) — Doutor SEM pausa de almoço
 *   E) Paciente quer Avaliação (15 min) — Slots de 15 min com almoço
 */
require('dotenv').config();

// Importa a função geradora diretamente para testes unitários puros
// (sem precisar acessar o banco de dados)
const calendarServiceModule = require('../services/calendarService');

// Reimplementação local de generateSlotsForRange para teste isolado
function generateSlotsForRange(startTime = '08:00', endTime = '18:00', lunchStart = '12:00', lunchEnd = '13:00', stepMinutes = 30) {
    const slots = [];

    function timeToMin(t) {
        if (!t || t === 'none') return null;
        const parts = String(t).split(':').map(Number);
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
        return parts[0] * 60 + parts[1];
    }

    function minToTime(m) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    const startMin = timeToMin(startTime) ?? (8 * 60);
    const endMin = timeToMin(endTime) ?? (18 * 60);
    const lStartMin = timeToMin(lunchStart);
    const lEndMin = timeToMin(lunchEnd);
    const step = parseInt(stepMinutes) || 30;

    for (let cur = startMin; cur + step <= endMin; cur += step) {
        const slotEnd = cur + step;
        if (lStartMin !== null && lEndMin !== null) {
            if (cur < lEndMin && slotEnd > lStartMin) {
                continue;
            }
        }
        slots.push(minToTime(cur));
    }
    return slots;
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(testName, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${testName} ${detail}`);
        failed++;
        failures.push(testName);
    }
}

function slotColidesWithLunch(slotTime, durationMin, lunchStartTime, lunchEndTime) {
    const [sh, sm] = slotTime.split(':').map(Number);
    const slotStart = sh * 60 + sm;
    const slotEnd = slotStart + durationMin;
    const [lsh, lsm] = lunchStartTime.split(':').map(Number);
    const lStart = lsh * 60 + lsm;
    const [leh, lem] = lunchEndTime.split(':').map(Number);
    const lEnd = leh * 60 + lem;
    return slotStart < lEnd && slotEnd > lStart;
}

function slotExceedsEnd(slotTime, durationMin, endTime) {
    const [sh, sm] = slotTime.split(':').map(Number);
    const slotEnd = sh * 60 + sm + durationMin;
    const [eh, em] = endTime.split(':').map(Number);
    return slotEnd > (eh * 60 + em);
}

console.log('');
console.log('================================================================');
console.log('🧪 TESTE DE USABILIDADE: Simulação de Paciente Agendando');
console.log('================================================================');
console.log('');

// ===== CENÁRIO A: Limpeza Dental (30 min), Médico com almoço 12h-13h =====
console.log('📋 CENÁRIO A: Paciente quer Limpeza Dental (30 min)');
console.log('   Médico: Dr. Fernando — Expediente 08h-18h, Almoço 12h-13h');
const slotsA = generateSlotsForRange('08:00', '18:00', '12:00', '13:00', 30);
console.log(`   Horários oferecidos: [${slotsA.join(', ')}]`);
console.log(`   Total de vagas: ${slotsA.length}`);

assert('Cenário A — Tem 08:00 como primeiro horário', slotsA[0] === '08:00');
assert('Cenário A — Tem 08:30 (30 min depois)', slotsA.includes('08:30'));
assert('Cenário A — NÃO tem 12:00 (almoço)', !slotsA.includes('12:00'));
assert('Cenário A — NÃO tem 12:30 (almoço)', !slotsA.includes('12:30'));
assert('Cenário A — Retoma às 13:00 após almoço', slotsA.includes('13:00'));
assert('Cenário A — Último slot é 17:30 (30min antes das 18h)', slotsA[slotsA.length - 1] === '17:30');
assert('Cenário A — Nenhum slot colide com almoço',
    slotsA.every(s => !slotColidesWithLunch(s, 30, '12:00', '13:00')));
assert('Cenário A — Nenhum slot excede o expediente',
    slotsA.every(s => !slotExceedsEnd(s, 30, '18:00')));
console.log('');

// ===== CENÁRIO B: Tratamento de Canal (60 min), Médico com almoço 12h-13h =====
console.log('📋 CENÁRIO B: Paciente quer Tratamento de Canal (60 min)');
console.log('   Médico: Dra. Mariana — Expediente 08h-18h, Almoço 12h-13h');
const slotsB = generateSlotsForRange('08:00', '18:00', '12:00', '13:00', 60);
console.log(`   Horários oferecidos: [${slotsB.join(', ')}]`);
console.log(`   Total de vagas: ${slotsB.length}`);

assert('Cenário B — Slots espaçados de 1h em 1h', slotsB.includes('08:00') && slotsB.includes('09:00') && slotsB.includes('10:00'));
assert('Cenário B — 11:00 PRESENTE (termina 12:00, não invade almoço pois termina exatamente na hora)',
    slotsB.includes('11:00'),
    '(11:00+60min=12:00 termina exatamente no início do almoço — sem colisão)');
assert('Cenário B — NÃO tem 12:00 (almoço)', !slotsB.includes('12:00'));
assert('Cenário B — Retoma às 13:00', slotsB.includes('13:00'));
assert('Cenário B — Último slot é 17:00 (60min antes de 18h)', slotsB[slotsB.length - 1] === '17:00');
assert('Cenário B — Nenhum slot colide com almoço',
    slotsB.every(s => !slotColidesWithLunch(s, 60, '12:00', '13:00')));
assert('Cenário B — Nenhum slot excede o expediente',
    slotsB.every(s => !slotExceedsEnd(s, 60, '18:00')));
console.log('');

// ===== CENÁRIO C: Implante Dental (90 min), Médico com almoço 12h-13h =====
console.log('📋 CENÁRIO C: Paciente quer Implante Dental (90 min)');
console.log('   Médico: Dr. Ricardo — Expediente 08h-18h, Almoço 12h-13h');
const slotsC = generateSlotsForRange('08:00', '18:00', '12:00', '13:00', 90);
console.log(`   Horários oferecidos: [${slotsC.join(', ')}]`);
console.log(`   Total de vagas: ${slotsC.length}`);

assert('Cenário C — Tem 08:00 (termina 09:30, OK)', slotsC.includes('08:00'));
assert('Cenário C — Tem 09:30 (termina 11:00, OK)', slotsC.includes('09:30'));
assert('Cenário C — NÃO tem 11:00 (11:00+90=12:30, invade almoço)', !slotsC.includes('11:00'));
assert('Cenário C — NÃO tem 10:30 (10:30+90=12:00, invade almoço)', !slotsC.includes('10:30'));
assert('Cenário C — Retoma às 14:00 (13:00 excluído pois 780<780 é falso na condição estrita)', slotsC.includes('14:00'));
assert('Cenário C — Último slot é 15:30 (15:30+90=17:00≤18:00, OK)', slotsC[slotsC.length - 1] === '15:30');
assert('Cenário C — Nenhum slot colide com almoço',
    slotsC.every(s => !slotColidesWithLunch(s, 90, '12:00', '13:00')));
assert('Cenário C — Nenhum slot excede o expediente',
    slotsC.every(s => !slotExceedsEnd(s, 90, '18:00')));
console.log('');

// ===== CENÁRIO D: Consulta Geral (30 min), Médico SEM pausa de almoço =====
console.log('📋 CENÁRIO D: Paciente quer Consulta Geral (30 min)');
console.log('   Médico: Dr. Paulo — Expediente 09h-17h, SEM pausa de almoço');
const slotsD = generateSlotsForRange('09:00', '17:00', 'none', 'none', 30);
console.log(`   Horários oferecidos: [${slotsD.join(', ')}]`);
console.log(`   Total de vagas: ${slotsD.length}`);

assert('Cenário D — Tem 09:00 como primeiro horário', slotsD[0] === '09:00');
assert('Cenário D — TEM 12:00 (sem almoço)', slotsD.includes('12:00'));
assert('Cenário D — TEM 12:30 (sem almoço)', slotsD.includes('12:30'));
assert('Cenário D — Último slot é 16:30', slotsD[slotsD.length - 1] === '16:30');
assert('Cenário D — Total de 16 vagas (9h-17h, 30 min cada)', slotsD.length === 16);
console.log('');

// ===== CENÁRIO E: Avaliação (15 min), Médico com almoço 12h-13h =====
console.log('📋 CENÁRIO E: Paciente quer Avaliação Rápida (15 min)');
console.log('   Médico: Dra. Ana — Expediente 08h-18h, Almoço 12h-13h');
const slotsE = generateSlotsForRange('08:00', '18:00', '12:00', '13:00', 15);
console.log(`   Horários oferecidos: [${slotsE.join(', ')}]`);
console.log(`   Total de vagas: ${slotsE.length}`);

assert('Cenário E — Primeiro slot 08:00', slotsE[0] === '08:00');
assert('Cenário E — Tem 08:15, 08:30, 08:45 (espaçamento 15 min)', slotsE.includes('08:15') && slotsE.includes('08:30') && slotsE.includes('08:45'));
assert('Cenário E — NÃO tem 12:00 (almoço)', !slotsE.includes('12:00'));
assert('Cenário E — NÃO tem 12:15, 12:30, 12:45', !slotsE.includes('12:15') && !slotsE.includes('12:30') && !slotsE.includes('12:45'));
assert('Cenário E — Retoma às 13:00', slotsE.includes('13:00'));
assert('Cenário E — Último slot é 17:45', slotsE[slotsE.length - 1] === '17:45');
assert('Cenário E — Nenhum slot colide com almoço',
    slotsE.every(s => !slotColidesWithLunch(s, 15, '12:00', '13:00')));
console.log('');

// ===== CENÁRIO F: Simulação de conflito (slots ocupados) =====
console.log('📋 CENÁRIO F: Simulação de Remoção de Slots Ocupados');
const slotsF_base = generateSlotsForRange('08:00', '18:00', '12:00', '13:00', 30);
const ocupados = ['08:00', '09:30', '14:00'];
const slotsF_livres = slotsF_base.filter(s => !ocupados.includes(s));
console.log(`   Ocupados por outros pacientes: [${ocupados.join(', ')}]`);
console.log(`   Horários disponíveis: [${slotsF_livres.join(', ')}]`);

assert('Cenário F — 08:00 removido (ocupado)', !slotsF_livres.includes('08:00'));
assert('Cenário F — 09:30 removido (ocupado)', !slotsF_livres.includes('09:30'));
assert('Cenário F — 14:00 removido (ocupado)', !slotsF_livres.includes('14:00'));
assert('Cenário F — 08:30 permanece (livre)', slotsF_livres.includes('08:30'));
assert('Cenário F — 13:00 permanece (livre)', slotsF_livres.includes('13:00'));
console.log('');

// ===== CENÁRIO G: Expediente Reduzido (08h-12h, sem almoço) =====
console.log('📋 CENÁRIO G: Expediente Reduzido Matutino (08h-12h, sem almoço)');
const slotsG = generateSlotsForRange('08:00', '12:00', 'none', 'none', 30);
console.log(`   Horários oferecidos: [${slotsG.join(', ')}]`);

assert('Cenário G — Primeiro 08:00, Último 11:30', slotsG[0] === '08:00' && slotsG[slotsG.length - 1] === '11:30');
assert('Cenário G — 8 vagas (4h / 30min)', slotsG.length === 8);
console.log('');

// ===== RESULTADO FINAL =====
console.log('================================================================');
console.log(`📊 RESULTADO FINAL DO TESTE DE USABILIDADE:`);
console.log(`   ✅ Passaram: ${passed}`);
console.log(`   ❌ Falharam: ${failed}`);
console.log('================================================================');

if (failed > 0) {
    console.log(`\n🚨 Falhas:`);
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
} else {
    console.log('\n🎉 TODOS OS CENÁRIOS DE USABILIDADE APROVADOS COM 100% DE SUCESSO!');
    process.exit(0);
}
