const fs = require('fs');

const filesToUpdate = {
  'server.js': './utils/logger',
  'services/databaseService.js': '../utils/logger',
  'services/aiService.js': '../utils/logger',
  'services/reminderService.js': '../utils/logger',
  'controllers/conversationController.js': '../utils/logger',
  'controllers/dashboardController.js': '../utils/logger'
};

const regex = /const\s+logger\s*=\s*\{[\s\S]*?error:\s*\([^)]*\)\s*=>[^\}]*\}\s*;/;

for (const [file, loggerPath] of Object.entries(filesToUpdate)) {
  if (fs.existsSync(file)) {
    let text = fs.readFileSync(file, 'utf8');
    if (regex.test(text)) {
      text = text.replace(regex, `const logger = require('${loggerPath}');`);
      fs.writeFileSync(file, text);
      console.log(`Updated ${file}`);
    } else {
      console.log(`Logger pattern not found in ${file}`);
    }
  }
}
