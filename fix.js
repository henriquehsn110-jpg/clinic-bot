const fs = require('fs');
let text = fs.readFileSync('controllers/conversationController.js', 'utf8');

text = text.replaceAll('await whatsappService.sendButtonMessage(phone, , , phoneId).catch(() => {});', 'await whatsappService.sendButtonMessage(phone, welcomeText, welcomeButtons, phoneId).catch(() => {});');
text = text.replaceAll('await whatsappService.sendTextMessage(phone, , phoneId).catch(() => {});', 'await whatsappService.sendTextMessage(phone, errText, phoneId).catch(() => {});');
text = text.replaceAll('availableSlots = await calendarService.getAvailableSlots(, clinicId);', 'availableSlots = await calendarService.getAvailableSlots(dateStr, clinicId);');
text = text.replaceAll('await whatsappService.sendListMessage(phone, , , , , phoneId);', 'await whatsappService.sendListMessage(phone, responseText, "Ver Opções", sections, "Especialidades", phoneId);');
text = text.replaceAll('await whatsappService.sendTextMessage(phone, , phoneId);', 'await whatsappService.sendTextMessage(phone, responseText, phoneId);');
text = text.replaceAll('await whatsappService.sendButtonMessage(phone, , , phoneId);', 'await whatsappService.sendButtonMessage(phone, responseText, aiResponse.buttons, phoneId);');
text = text.replaceAll('await whatsappService.sendListMessage(phone, , , , , phoneId).catch(() => {});', 'await whatsappService.sendListMessage(phone, responseText, "Ver Opções", sections, "Especialidades", phoneId).catch(() => {});');

fs.writeFileSync('controllers/conversationController.js', text);
console.log('Fixed syntax errors.');
