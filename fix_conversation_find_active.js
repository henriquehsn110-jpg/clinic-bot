const fs = require('fs');

let text = fs.readFileSync('controllers/conversationController.js', 'utf8');

const target = "const existing = await db.appointments.findActiveAppointment(patient.id, draft.date, draft.time);";
const replacement = "const existing = await db.appointments.findActiveAppointment(patient.id, draft.date, draft.time, clinicId);";

if (text.includes(target)) {
    text = text.replace(target, replacement);
    fs.writeFileSync('controllers/conversationController.js', text);
    console.log('findActiveAppointment corrigido com clinicId!');
} else {
    console.log('Target não encontrado');
}
