const fs = require('fs');

let text = fs.readFileSync('controllers/conversationController.js', 'utf8');

// 1. Injetar busca do clinicToken no início do handleIncomingMessage
const topTarget = "if (!clinicId) throw new Error('clinicId obrigatorio');";
const topReplacement = `if (!clinicId) throw new Error('clinicId obrigatorio');

        let clinicToken = null;
        try {
            const { data: cData } = await db.supabase.from('clinics').select('whatsapp_token, token').eq('id', clinicId).maybeSingle();
            clinicToken = cData?.whatsapp_token || cData?.token || null;
        } catch {}`;

if (!text.includes('let clinicToken = null;')) {
    text = text.replace(topTarget, topReplacement);
}

// 2. Substituir todas as chamadas do whatsappService para passar clinicToken como 4º argumento
text = text.replace(/whatsappService\.sendTextMessage\(([^)]*?phoneId\s*)\)/g, 'whatsappService.sendTextMessage($1, clinicToken)');
text = text.replace(/whatsappService\.sendButtonMessage\(([^)]*?phoneId\s*)\)/g, 'whatsappService.sendButtonMessage($1, clinicToken)');
text = text.replace(/whatsappService\.sendListMessage\(([^)]*?phoneId\s*)\)/g, 'whatsappService.sendListMessage($1, clinicToken)');

fs.writeFileSync('controllers/conversationController.js', text);
console.log('conversationController.js atualizado com propagação do clinicToken!');
