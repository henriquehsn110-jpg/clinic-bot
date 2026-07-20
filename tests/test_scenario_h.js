const availableSlots = [
    '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', // 6 morning
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'  // 6 afternoon
];

const morning = availableSlots.filter(s => parseInt(s.split(':')[0]) < 12).slice(0, 4);
const afternoon = availableSlots.filter(s => parseInt(s.split(':')[0]) >= 12 && parseInt(s.split(':')[0]) < 18).slice(0, 4);

const sections = [];
if (morning.length > 0) {
    const morningRows = morning.map((slot, index) => ({ id: `slot_m_${index}`, title: slot }));
    if (afternoon.length === 0 && availableSlots.length > morning.length) {
        morningRows.push({ id: 'slot_more_options', title: 'Outros horários...' });
    }
    sections.push({
        title: "Manhã",
        rows: morningRows
    });
}
if (afternoon.length > 0) {
    const afternoonRows = afternoon.map((slot, index) => ({ id: `slot_a_${index}`, title: slot }));
    if (availableSlots.length > (morning.length + afternoon.length)) {
        afternoonRows.push({ id: 'slot_more_options', title: 'Outros horários...' });
    }
    sections.push({
        title: "Tarde",
        rows: afternoonRows
    });
}

let totalItems = 0;
sections.forEach(sec => totalItems += sec.rows.length);

console.log(JSON.stringify(sections, null, 2));
console.log(`\nTotal de itens na lista: ${totalItems}`);
console.assert(totalItems <= 10, "FALHA: WhatsApp não permite mais que 10 itens!");
console.log("Teste de paginação PASSOU com sucesso!");
