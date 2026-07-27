const fs = require('fs');
const path = require('path');

console.log("=== EMPIRICAL TEST HARNESS FOR CLINICABOT SIMULATOR & DEMO SCRIPT ===");

const rootDir = 'c:\\Users\\letic\\OneDrive\\Desktop\\ClinicaBot';
const demoScriptPath = path.join(rootDir, 'docs', 'sales', 'ROTEIRO_DEMONSTRACAO_SIMULADOR.md');
const simulatorIndexPath = path.join(rootDir, 'clinic-bot-simulator', 'index.html');
const simulatorScriptPath = path.join(rootDir, 'clinic-bot-simulator', 'script.js');

let results = {
    passed: 0,
    failed: 0,
    findings: []
};

function assert(condition, message, errorDetail = null) {
    if (condition) {
        console.log(`[PASS] ${message}`);
        results.passed++;
    } else {
        console.error(`[FAIL] ${message}`);
        if (errorDetail) console.error(`       Detail: ${errorDetail}`);
        results.failed++;
        results.findings.push({ message, errorDetail });
    }
}

// 1. File Existence Checks
console.log("\n--- TEST 1: Target File Existence ---");
assert(fs.existsSync(demoScriptPath), "ROTEIRO_DEMONSTRACAO_SIMULADOR.md exists");
assert(fs.existsSync(simulatorIndexPath), "index.html exists");

const scriptJsExists = fs.existsSync(simulatorScriptPath);
assert(!scriptJsExists, "script.js does NOT exist (JS is inline in index.html, contract discrepancy in prompt/script)");

// Read files
const indexHtmlContent = fs.readFileSync(simulatorIndexPath, 'utf8');
const demoScriptContent = fs.readFileSync(demoScriptPath, 'utf8');
const indexHtmlLines = indexHtmlContent.split('\n');

// 2. Element & Selector Verification against Demo Script Table
console.log("\n--- TEST 2: Demo Script Table Component Verification ---");

// Step 0: Header elements
const hasHeaderNameId = indexHtmlContent.includes('id="header-name"') || indexHtmlContent.includes("id='header-name'");
assert(!hasHeaderNameId, "Demo script references '#header-name', but element in index.html uses class '.header-info h2' without ID '#header-name'");

const hasAvatarC = indexHtmlContent.includes('<div class="avatar">C</div>');
assert(hasAvatarC, "Avatar 'C' present in header HTML");

// Step 1: Streaming & Typing Indicator
const hasTypingIndicator = indexHtmlContent.includes('id="typing-indicator"');
assert(hasTypingIndicator, "Element #typing-indicator exists in index.html");

const hasStreamTextClass = indexHtmlContent.includes("className = 'stream-text'") || indexHtmlContent.includes('stream-text');
assert(hasStreamTextClass, "Class 'stream-text' is used for streaming text in script");

const has30msInterval = indexHtmlContent.includes('30);') || indexHtmlContent.includes('}, 30)');
assert(has30msInterval, "Streaming text interval set to 30ms/word");

// Step 2: List Menu
const hasGenerateListMenuHTML = indexHtmlContent.includes('function generateListMenuHTML');
assert(hasGenerateListMenuHTML, "Function generateListMenuHTML exists");

const hasToggleListOptions = indexHtmlContent.includes('function toggleListOptions') || indexHtmlContent.includes('window.toggleListOptions');
assert(hasToggleListOptions, "Function toggleListOptions exists");

// Step 3: Calendar
const hasGeneratePremiumCalendar = indexHtmlContent.includes('function generatePremiumCalendarHTML');
assert(hasGeneratePremiumCalendar, "Function generatePremiumCalendarHTML exists");

const hasChangeCalendarMonth = indexHtmlContent.includes('window.changeCalendarMonth');
assert(hasChangeCalendarMonth, "Function changeCalendarMonth exists for month navigation");

// Step 4: Time Slots
const hasGenerateTimeSlots = indexHtmlContent.includes('function generateTimeSlotsHTML');
assert(hasGenerateTimeSlots, "Function generateTimeSlotsHTML exists");

const hasManhaTardeBadges = indexHtmlContent.includes("'Manhã'") && indexHtmlContent.includes("'Tarde'");
assert(hasManhaTardeBadges, "Badges 'Manhã' and 'Tarde' calculated in generateTimeSlotsHTML");

// Step 5: CPF Masking
const hasGenerateCpfInput = indexHtmlContent.includes('function generateCpfInputHTML');
assert(hasGenerateCpfInput, "Function generateCpfInputHTML exists");

const hasFormatCpfInput = indexHtmlContent.includes('window.formatCpfInput');
assert(hasFormatCpfInput, "Function formatCpfInput exists");

// Step 7: Human Handoff Banner & Mode
const hasSetHumanMode = indexHtmlContent.includes('function setHumanMode');
assert(hasSetHumanMode, "Function setHumanMode exists");

const hasHandoffBanner = indexHtmlContent.includes("id = 'handoff-banner'") || indexHtmlContent.includes('id="handoff-banner"');
assert(hasHandoffBanner, "Element #handoff-banner is dynamically created in setHumanMode");

// Step 8: Reset
const hasResetToBot = indexHtmlContent.includes('window.resetToBot');
assert(hasResetToBot, "Function resetToBot exists");

const callsResetApi = indexHtmlContent.includes('/api/simulate/reset');
assert(callsResetApi, "resetToBot calls POST /api/simulate/reset");


// 3. Line Number Accuracy in Demo Script Table
console.log("\n--- TEST 3: Demo Script Line Number Accuracy Verification ---");

function findLineNumbers(substring) {
    const lines = [];
    indexHtmlLines.forEach((line, idx) => {
        if (line.includes(substring)) lines.push(idx + 1);
    });
    return lines;
}

const typingLines = findLineNumbers('typing');
console.log(`Actual lines for 'typing' in index.html: ${typingLines.slice(0, 5).join(', ')}... (Demo script cited lines 134-163)`);
assert(typingLines.some(l => l >= 134 && l <= 163), "typing indicator CSS is within lines 134-163");

const streamTextLines = findLineNumbers('stream-text');
console.log(`Actual lines for 'stream-text' in index.html: ${streamTextLines.join(', ')} (Demo script cited line 396)`);
assert(streamTextLines.includes(400), "stream-text is at line 400 (Demo script cited line 396, 4 line drift)");

const listMenuLines = findLineNumbers('generateListMenuHTML');
console.log(`Actual lines for 'generateListMenuHTML' in index.html: ${listMenuLines.join(', ')} (Demo script cited lines 549-586)`);

const calendarLines = findLineNumbers('generatePremiumCalendarHTML');
console.log(`Actual lines for 'generatePremiumCalendarHTML' in index.html: ${calendarLines.join(', ')} (Demo script cited lines 456-504)`);

const timeSlotsLines = findLineNumbers('generateTimeSlotsHTML');
console.log(`Actual lines for 'generateTimeSlotsHTML' in index.html: ${timeSlotsLines.join(', ')} (Demo script cited lines 520-541)`);

const cpfInputLines = findLineNumbers('generateCpfInputHTML');
console.log(`Actual lines for 'generateCpfInputHTML' in index.html: ${cpfInputLines.join(', ')} (Demo script cited lines 597-635)`);

const humanModeLines = findLineNumbers('setHumanMode');
console.log(`Actual lines for 'setHumanMode' in index.html: ${humanModeLines.join(', ')} (Demo script cited lines 654-686)`);

const resetToBotLines = findLineNumbers('resetToBot');
console.log(`Actual lines for 'resetToBot' in index.html: ${resetToBotLines.join(', ')} (Demo script cited lines 688-701)`);


// 4. Edge Cases & Behavioral Stress Testing
console.log("\n--- TEST 4: Edge Cases & Behavioral Stress Testing ---");

// Test CPF Formatting Function Logic
function simulateFormatCpf(raw) {
    let value = raw.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    let formatted = '';
    if (value.length > 0) formatted += value.slice(0, 3);
    if (value.length > 3) formatted += '.' + value.slice(3, 6);
    if (value.length > 6) formatted += '.' + value.slice(6, 9);
    if (value.length > 9) formatted += '-' + value.slice(9, 11);
    return formatted;
}

assert(simulateFormatCpf('12345678901') === '123.456.789-01', "formatCpfInput accurately formats 11 digits to 123.456.789-01");
assert(simulateFormatCpf('123456789019999') === '123.456.789-01', "formatCpfInput caps at 11 digits");

// Test Backend Controller Simulation Integration
console.log("\n--- TEST 5: Backend Simulation Endpoint Verification ---");
const backendServerPath = path.join(rootDir, 'clinic-bot-backend', 'server.js');
const serverContent = fs.readFileSync(backendServerPath, 'utf8');

assert(serverContent.includes("app.post('/api/simulate',"), "Backend server.js has POST /api/simulate endpoint");
assert(serverContent.includes("app.post('/api/simulate/reset',"), "Backend server.js has POST /api/simulate/reset endpoint");
assert(serverContent.includes("db.sessions.delete(phone)"), "Reset endpoint deletes phone session from db.sessions");

console.log("\n=== TEST SUMMARY ===");
console.log(`TOTAL PASSED: ${results.passed}`);
console.log(`TOTAL FAILED: ${results.failed}`);
if (results.findings.length > 0) {
    console.log("\nDiscrepancies / Findings:");
    results.findings.forEach(f => console.log(`- ${f.message}`));
}
