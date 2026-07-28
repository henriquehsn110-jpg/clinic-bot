const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Script de Guardião de Regressão Noturna / Pós-Edição (Antigravity 2.0 Hook)
const rootDir = path.resolve(__dirname, '../../');
const backendDir = path.join(rootDir, 'clinic-bot-backend');

// 1. Bloqueia chamadas de .catch(() => []) que mascaram erros de DB ou clinicId
function checkSilentCatches() {
    const targetDirs = [
        path.join(backendDir, 'controllers'),
        path.join(backendDir, 'services')
    ];

    for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            const fullPath = path.join(dir, file);
            const content = fs.readFileSync(fullPath, 'utf8');

            if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/.test(content)) {
                return `Regressão detectada em ${file}: Uso de '.catch(() => [])' silencioso que mascara falha no banco de dados ou clinicId. Trate o erro ou registre em log.`;
            }
        }
    }
    return null;
}

// 2. Bloqueia uso indevido de toISOString().split('T')[0] para cálculos de data local
function checkToIsoString() {
    const fileToCheck = path.join(backendDir, 'controllers/conversationController.js');
    if (fs.existsSync(fileToCheck)) {
        const content = fs.readFileSync(fileToCheck, 'utf8');
        // Permite ISO apenas se for ISO padrão estático em testes ou fallback de ISO
        if (/new\s+Date\(\)\.toISOString\(\)\.split\(['"]T['"]\)/.test(content)) {
            return `Regressão detectada em conversationController.js: Uso indevido de 'new Date().toISOString().split("T")[0]'. Use obrigatoriamente fuso BRT com 'new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })'.`;
        }
    }
    return null;
}

// 3. Bloqueia chamadas de findOrCreate, updateName e updateCpf sem clinicId
function checkMissingClinicId() {
    const targetDirs = [
        path.join(backendDir, 'controllers'),
        path.join(backendDir, 'services')
    ];

    for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            const fullPath = path.join(dir, file);
            const content = fs.readFileSync(fullPath, 'utf8');

            // Verifica chamadas a db.patients sem o argumento clinicId
            const badMatch = content.match(/\b(findOrCreate|updateName|updateCpf|findByCpf)\s*\(\s*[^,\)]+\s*,\s*[^,\)]+\s*\)/);
            if (badMatch && !content.includes('clinicId') && !content.includes('targetClinicId')) {
                return `Regressão detectada em ${file}: Chamada a '${badMatch[1]}' com apenas 2 argumentos (clinicId ausente). Passe o clinicId como 3º argumento obrigatório.`;
            }
        }
    }
    return null;
}

// 4. Verificação da Trava Absoluta Anti-Alucinação de Componentes Visuais
function checkComponentExclusivityLock() {
    const fileToCheck = path.join(backendDir, 'controllers/conversationController.js');
    if (fs.existsSync(fileToCheck)) {
        const content = fs.readFileSync(fileToCheck, 'utf8');
        if (!content.includes('TRAVA ABSOLUTA ANTI-ALUCINAÇÃO DE COMPONENTES VISUAIS') || !content.includes('isAskingCpf')) {
            return `Regressão detectada em conversationController.js: Trava Absoluta Anti-Alucinação de Componentes Visuais removida! Mantenha a trava de exclusividade entre showCalendar e requireCpf/isAskingCpf.`;
        }
    }
    return null;
}

// Execução das Verificações
const silentCatchErr = checkSilentCatches();
if (silentCatchErr) {
    console.log(JSON.stringify({ decision: "deny", reason: silentCatchErr }));
    process.exit(0);
}

const isoErr = checkToIsoString();
if (isoErr) {
    console.log(JSON.stringify({ decision: "deny", reason: isoErr }));
    process.exit(0);
}

const clinicIdErr = checkMissingClinicId();
if (clinicIdErr) {
    console.log(JSON.stringify({ decision: "deny", reason: clinicIdErr }));
    process.exit(0);
}

const lockErr = checkComponentExclusivityLock();
if (lockErr) {
    console.log(JSON.stringify({ decision: "deny", reason: lockErr }));
    process.exit(0);
}

// Se passou por todas as verificações com sucesso
console.log(JSON.stringify({}));
process.exit(0);
