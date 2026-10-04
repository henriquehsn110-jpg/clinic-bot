const { execSync } = require('child_process');
const fs = require('fs');
let report = [];
try { execSync('node -c server.js'); report.push('✅ [Item 1] server.js'); } catch(e){ report.push('❌ [Item 1]'); }
try { execSync('node -c services/aiService.js'); report.push('✅ [Item 2] aiService.js'); } catch(e){ report.push('❌ [Item 2]'); }
const aiService = fs.readFileSync('services/aiService.js', 'utf8');
if (aiService.match(/priorityFlag/)) report.push('✅ [Item 4/14] flags');
else report.push('❌ [Item 4/14] flags');
const dbService = fs.readFileSync('services/databaseService.js', 'utf8');
if (dbService.includes('process.exit(1)')) report.push('✅ [Item 10] exit(1)');
else report.push('❌ [Item 10] exit(1)');
if (dbService.includes('CPF_ENCRYPTION_KEY') && dbService.includes('findByPhone')) report.push('✅ [Item 11] CPF_ENCRYPTION_KEY');
else report.push('❌ [Item 11] CPF_ENCRYPTION_KEY');
if (fs.existsSync('.dockerignore')) report.push('✅ [Item 13] .dockerignore');
else report.push('❌ [Item 13] .dockerignore');

try { execSync('node -c controllers/adminController.js'); report.push('✅ [Item 15] adminController.js syntax'); }
catch(e){ report.push('❌ [Item 15] adminController.js syntax'); }

const adminController = fs.readFileSync('controllers/adminController.js', 'utf8');
const forbiddenAdminPatterns = [
  "require('child_process')",
  'pm2 restart',
  'git checkout',
  'Admin@123456',
  'dev_admin_secret_key_change_in_production_32bytes'
];
const adminViolations = forbiddenAdminPatterns.filter(pattern => adminController.includes(pattern));
if (adminViolations.length === 0) report.push('✅ [Item 16] admin shell/default-secret hardening');
else report.push('❌ [Item 16] admin shell/default-secret hardening: ' + adminViolations.join(', '));

console.log(report.join('\n'));
