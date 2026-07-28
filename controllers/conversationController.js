const aiService        = require('../services/aiService');
const whatsappService   = require('../services/whatsappService');
const db                = require('../services/databaseService');
const calendarService   = require('../services/calendarService');
const logger            = require('../services/logger');

// Reconhece o formato enviado pelo frontend quando o paciente
// clica numa data no widget de calendário
const DATE_SELECTION_REGEX = /Selecionei a data:\s*(\d{4}-\d{2}-\d{2})/i;

const PROCEDURES_RICH = [
    { id: 'proc_0', title: "Consulta geral", description: "Avaliação Geral (Dr. Carlos / Dra. Juliana)", doctor: "Dr. Carlos Eduardo / Dra. Juliana Mendes" },
    { id: 'proc_1', title: "Limpeza", description: "Dra. Juliana Mendes (Odontopediatria & Profilaxia)", doctor: "Dra. Juliana Mendes" },
    { id: 'proc_2', title: "Clareamento Dental", description: "Dra. Juliana Mendes (Estética Dental)", doctor: "Dra. Juliana Mendes" },
    { id: 'proc_3', title: "Implante", description: "Dr. Roberto Alves (Implantes & Próteses)", doctor: "Dr. Roberto Alves" },
    { id: 'proc_4', title: "Aparelho Ortodôntico", description: "Dr. Carlos Eduardo (Ortodontia)", doctor: "Dr. Carlos Eduardo" },
    { id: 'proc_5', title: "Outro", description: "Descreva seu caso para nossa equipe", doctor: "Equipe Clínica Modelo" }
];

const PROCEDURES_LIST = PROCEDURES_RICH.map(p => p.title);

// Função para validação matemática do dígito verificador do CPF
function validateCpfChecksum(cpf) {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;
    
    // Elimina CPFs conhecidos inválidos
    if (/^(\d)\1{10}$/.test(clean)) return false;
    
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(clean.charAt(i)) * (10 - i);
    }
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(clean.charAt(i)) * (11 - i);
    }
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10))) return false;
    
    return true;
}

// Função auxiliar para extrair e normalizar CPF (aceita com ou sem prefixo, formatado ou cru de 11 dígitos)
function extractAndNormalizeCpf(text) {
    // Captura padrão formatado ou sequência bruta de 11 dígitos numéricos com bordas
    const regex = /(?:Selecionei o CPF:\s*)?(\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b)/i;
    const match = text.match(regex);
    if (!match) return null;
    
    const matchedStr = match[1];
    const clean = matchedStr.replace(/\D/g, '');
    
    // Filtro matemático contra colisões (ex: número de celular de 11 dígitos)
    if (!validateCpfChecksum(clean)) return null;
    
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

// Auxiliar para persistir o Handoff Humano no histórico da sessão com a última fala do usuário
async function persistHumanHandoff(phone, patient, history, userText, extraNote = '', clinicId) {
    const marker = `[SISTEMA: conversa transferida para atendente humano]${extraNote ? ' ' + extraNote : ''}`;
    const updatedHistory = [
        ...history,
        { role: 'user', parts: [{ text: userText }] },
        { role: 'model', parts: [{ text: marker }] }
    ].slice(-20);

    try {
        await db.sessions.set(phone, updatedHistory, clinicId);
        if (patient?.id) {
            await db.conversations.log(patient.id, 'assistant', '[Transferido para atendimento humano]');
        }
    } catch (persistErr) {
        logger.error('PERSIST_HANDOFF', `Falha ao persistir handoff humano: ${persistErr.message}`, persistErr.stack);
    }
}

function normalizeInputDate(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();

    // 0. Se o texto já contém "Selecionei a data: YYYY-MM-DD", preserva como está
    const alreadyIso = clean.match(/Selecionei a data:\s*(\d{4}-\d{2}-\d{2})/i);
    if (alreadyIso) {
        return `Selecionei a data: ${alreadyIso[1]}`;
    }

    // 0b. Se o texto é puramente YYYY-MM-DD (sem prefixo), preserva
    const pureIso = clean.match(/^\s*(\d{4})-(\d{2})-(\d{2})\s*$/);
    if (pureIso) {
        return `Selecionei a data: ${pureIso[1]}-${pureIso[2]}-${pureIso[3]}`;
    }

    // 1. Matches DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY ou DD-MM-YY (input humano brasileiro, ex: 06/08/26 ou 06-08-2026)
    const dmyRegex = /(?<!\d)(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})(?!\d)/;
    const dmyMatch = clean.match(dmyRegex);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        let year = parseInt(dmyMatch[3], 10);
        if (dmyMatch[3].length === 2) {
            year += 2000;
        }
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024 && year <= 2035) {
            const formattedDay = day.toString().padStart(2, '0');
            const formattedMonth = month.toString().padStart(2, '0');
            return `Selecionei a data: ${year}-${formattedMonth}-${formattedDay}`;
        }
    }
    
    // 2. Matches DD/MM ou DD-MM (Infere o ano dinamicamente para evitar corrupção em viradas de ano)
    const dmRegex = /(?<!\d)(?:dia\s+)?(\d{1,2})[\/\.-](\d{1,2})(?!\d)/i;
    const dmMatch = clean.match(dmRegex);
    if (dmMatch) {
        const day = parseInt(dmMatch[1], 10);
        const month = parseInt(dmMatch[2], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            const formattedDay = day.toString().padStart(2, '0');
            const formattedMonth = month.toString().padStart(2, '0');
            
            const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const now = new Date(brtString);
            let year = now.getFullYear();
            if (month < (now.getMonth() + 1) && (now.getMonth() + 1 - month) > 1) {
                year++; 
            }
            return `Selecionei a data: ${year}-${formattedMonth}-${formattedDay}`;
        }
    }

    // 3. Matches datas por extenso: "6 de agosto", "dia 06 de setembro de 2026"
    const monthsMap = {
        'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
        'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
        'outubro': 10, 'novembro': 11, 'dezembro': 12
    };
    const extRegex = /\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{2,4}))?\b/i;
    const extMatch = clean.match(extRegex);
    if (extMatch) {
        const day = parseInt(extMatch[1], 10);
        const month = monthsMap[extMatch[2].toLowerCase()];
        let year;
        if (extMatch[3]) {
            year = parseInt(extMatch[3], 10);
            if (extMatch[3].length === 2) year += 2000;
        } else {
            const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const now = new Date(brtString);
            year = now.getFullYear();
            if (month < (now.getMonth() + 1) && (now.getMonth() + 1 - month) > 1) {
                year++;
            }
        }
        if (day >= 1 && day <= 31) {
            return `Selecionei a data: ${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
    }

    // 4. Matches termos relativos: "hoje", "amanhã", "amanha", "depois de amanhã", "depois de amanha"
    const relRegex = /^\s*(hoje|amanhã|amanha|depois\s+de\s+amanhã|depois\s+de\s+amanha)\s*$/i;
    const relMatch = clean.match(relRegex);
    if (relMatch) {
        const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const targetDate = new Date(brtString);
        const term = relMatch[1].toLowerCase();
        if (term.includes('depois')) {
            targetDate.setDate(targetDate.getDate() + 2);
        } else if (term.includes('amanh')) {
            targetDate.setDate(targetDate.getDate() + 1);
        }
        const y = targetDate.getFullYear();
        const m = (targetDate.getMonth() + 1).toString().padStart(2, '0');
        const d = targetDate.getDate().toString().padStart(2, '0');
        return `Selecionei a data: ${y}-${m}-${d}`;
    }

    return null;
}

function normalizeInputTime(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();

    const alreadyTime = clean.match(/Selecionei o horário:\s*(\d{2}:\d{2})/i);
    if (alreadyTime) {
        return `Selecionei o horário: ${alreadyTime[1]}`;
    }

    // 1. Matches HH:MM ou H:MM (ex: 13:00, 9:30, 08:00)
    const colonRegex = /\b(\d{1,2}):(\d{2})\b/;
    const colonMatch = clean.match(colonRegex);
    if (colonMatch) {
        const hour = parseInt(colonMatch[1], 10);
        const min = parseInt(colonMatch[2], 10);
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
            return `Selecionei o horário: ${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        }
    }

    // 2. Matches HHh, HHhMM, Hhs, HH horas (ex: 13h, 14h30, 9h, 8 horas, 15hs, às 13h, as 14h)
    const hRegex = /\b(\d{1,2})\s*[hH](?:oras|hs|s)?(?:\s*(\d{2}))?\b/;
    const hMatch = clean.match(hRegex);
    if (hMatch) {
        const hour = parseInt(hMatch[1], 10);
        const min = parseInt(hMatch[2] || '0', 10);
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
            return `Selecionei o horário: ${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        }
    }

    // 3. Matches termos descritivos: "2 da tarde", "8 da manhã", "10 da manha", "7 da noite"
    const descRegex = /\b(\d{1,2})\s*(?:da|de|à|a|da\s+|de\s+)?\s*(manhã|manha|tarde|noite)\b/i;
    const descMatch = clean.match(descRegex);
    if (descMatch) {
        let hour = parseInt(descMatch[1], 10);
        const period = descMatch[2].toLowerCase();
        if (period.includes('tarde') && hour >= 1 && hour <= 6) {
            hour += 12;
        } else if (period.includes('noite') && hour >= 7 && hour <= 11) {
            hour += 12;
        }
        if (hour >= 0 && hour <= 23) {
            return `Selecionei o horário: ${hour.toString().padStart(2, '0')}:00`;
        }
    }

    return null;
}

function extractCleanName(text) {
    if (!text || typeof text !== 'string') return null;
    let clean = text.trim();

    // Remove marcadores de sistema se houver
    clean = clean.replace(/\[\s*SISTEMA\s*:.*?\]/gi, '').trim();

    // Se contiver palavras reservadas de comandos ou palavras da aplicação, não é nome
    if (/Selecionei|CPF|confirmar|cancelar|remarcar|agendar|opções|opcao/i.test(clean)) return null;

    // Remove prefixos comuns em português
    clean = clean.replace(/^(meu\s+nome\s+é|meu\s+nome\s+e|sou\s+a|sou\s+o|me\s+chamo|chamo-me|pode\s+colocar|nome:\s*)\s*/i, '').trim();

    // Bloqueia saudações e frases curtas genéricas de serem salvas como nome
    const greetingBlocklist = /^(oi|olá|ola|hey|bom dia|boa tarde|boa noite|tudo bem|obrigad[oa]|sim|não|nao|ok|beleza|valeu|tchau|confirmar|cancelar|remarcar|alterar|agendar|menu)$/i;
    if (greetingBlocklist.test(clean)) return null;

    // Um nome deve ter pelo menos 2 caracteres e conter letras
    if (clean.length < 2 || !/[a-zA-ZáàâãéèêíïóôõúüçÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ]/.test(clean)) return null;

    // Capitalização adequada (primeiras letras maiúsculas)
    const words = clean.split(/\s+/).map(w => {
        if (w.length <= 2 && /^(de|da|do|dos|das|e)$/i.test(w)) return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });

    return words.join(' ');
}

class ConversationController {

    async handleIncomingMessage(phone, text, isSimulation = false, clinicId, phoneId) {
        if (!clinicId) {
            const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
            if (defaultClinic) clinicId = defaultClinic.id;
        }
        if (!clinicId) throw new Error('clinicId é obrigatório em handleIncomingMessage');

        let clinicToken = null;
        let clinicListTitle = "Opções de Agendamento";
        try {
            const { data: cData } = await db.supabase.from('clinics').select('whatsapp_token, token, whatsapp_list_title').eq('id', clinicId).maybeSingle();
            clinicToken = cData?.whatsapp_token || cData?.token || null;
            if (cData?.whatsapp_list_title) clinicListTitle = cData.whatsapp_list_title;
        } catch {}
        try {
            const patient = await db.patients.findOrCreate(phone, clinicId);
            await db.conversations.log(patient.id, 'user', text);

            // ── SANITIZAÇÃO DE SEGURANÇA ──────────────────────────────────────────
            // Impede injeção de prompt que tenta forçar comandos do sistema via colchetes
            const sanitizedText = text.replace(/\[\s*SISTEMA\s*:.*?\]/gi, '').trim();

            let history = await db.sessions.get(phone, clinicId);

            // Carrega ou inicializa o rascunho de agendamento estruturado da sessão
            let draft = await db.sessions.getDraft(phone, clinicId) || {};

            // ── VERIFICAÇÃO DE HANDOFF HUMANO PERSISTIDO ─────────────────────────
            // Fica ANTES de qualquer lógica automática (inclusive confirmação de
            // agendamento): enquanto o paciente está com um atendente humano, nenhuma
            // ação automática do bot deve rodar — nem mesmo se ele digitar "confirmar"
            // com um rascunho antigo ainda salvo de antes da transferência.
            const isHumanSupport = history.some(msg => 
                msg.role === 'model' && 
                msg.parts?.[0]?.text?.includes('[SISTEMA: conversa transferida para atendente humano]')
            );

            if (isHumanSupport) {
                if (/\b(voltar|robô|robo|ia|inteligência artificial|reiniciar|menu|cancelar|falar com a ia)\b/i.test(sanitizedText)) {
                    logger.info('HUMAN_HANDOFF_CANCELED', `Paciente [${phone}] solicitou retorno à IA. Histórico e rascunho resetados.`);
                    history = [];
                    draft = {};
                    await db.sessions.set(phone, history, clinicId);
                    await db.sessions.setDraft(phone, null, clinicId);
                } else {
                    const responseText = "Sua mensagem foi encaminhada para a nossa recepção e em breve um atendente irá responder! 😊\n\nSe preferir voltar ao atendimento automático com a Ana, basta clicar no botão abaixo:";
                    if (!isSimulation) {
                        await whatsappService.sendButtonMessage(phone, responseText, ["Falar com a IA (Ana)"], phoneId, clinicToken).catch(() => {});
                    }
                    return {
                        text: responseText,
                        buttons: ["Falar com a IA (Ana)"],
                        showCalendar: false,
                        showTimeSlots: false,
                        showProceduresList: false,
                        requireCpf: false,
                        availableSlots: null,
                        transferToHuman: true
                    };
                }
            }

            // ── P3: CACHE LOCAL DE BOAS-VINDAS & ATALHOS (0 TOKENS GEMINI) ───────
            // 1. Mensagem de Boas-Vindas Inicial (Primeiro contato)
            if (history.length === 0 && !sanitizedText.toLowerCase().includes('confirmar')) {
                const welcomeText = "Olá! Sou a Ana, da Clínica Modelo 😊 Antes de começarmos: seus dados (nome e telefone) são usados apenas para agendamento e contato da clínica. Como posso ajudar você hoje?";
                const welcomeButtons = ["Agendar Consulta", "Remarcar/Cancelar", "Outras Dúvidas"];

                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: welcomeText }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    await whatsappService.sendButtonMessage(phone, welcomeText, welcomeButtons, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: welcomeText,
                    buttons: welcomeButtons,
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    procedures: null,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            // 2. Atalho para botão "Agendar Consulta"
            if (sanitizedText.toLowerCase() === 'agendar consulta' || sanitizedText.toLowerCase() === 'agendar') {
                const procText = "Ótimo! Escolha qual procedimento você gostaria de agendar:";
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: `${procText}\n[SISTEMA: procedimentos exibidos, aguardando escolha]` }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    const sections = [{
                        title: "Tratamentos",
                        rows: PROCEDURES_RICH
                    }];
                    await whatsappService.sendListMessage(phone, procText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: procText,
                    buttons: [],
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: true,
                    requireCpf: false,
                    procedures: PROCEDURES_LIST,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            // 3. Atalho para botão "Agendar p/ Outro" (Agendamento para familiar/dependente)
            if (sanitizedText.toLowerCase() === 'agendar p/ outro' || sanitizedText.toLowerCase() === 'agendar para outro' || sanitizedText.toLowerCase() === 'agendar para outra pessoa') {
                logger.info('FAMILY_BOOKING', `Paciente [${phone}] iniciou agendamento para familiar/dependente.`);
                draft.is_family_booking = true;
                draft.name = null;
                await db.sessions.setDraft(phone, { is_family_booking: true, name: null }, clinicId);

                const familyText = "Com certeza! Para agendar para um familiar ou dependente, por favor me informe o nome completo da pessoa que irá passar em consulta:";
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: `${familyText}\n[SISTEMA: Qual é o seu nome completo?]` }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    await whatsappService.sendTextMessage(phone, familyText, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: familyText,
                    buttons: [],
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    procedures: null,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            // 4. Atalhos para botão "Alterar" e suas variações
            if (sanitizedText.toLowerCase() === 'alterar' || sanitizedText.toLowerCase() === 'alterar agendamento') {
                logger.info('ALTER_BOOKING', `Paciente [${phone}] solicitou alteração do agendamento em andamento.`);
                const alterText = "Sem problemas! O que você gostaria de alterar no seu agendamento?";
                const alterButtons = ["Alterar Data/Horário", "Alterar Especialidade", "Remarcar/Cancelar"];
                
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: alterText }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    await whatsappService.sendButtonMessage(phone, alterText, alterButtons, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: alterText,
                    buttons: alterButtons,
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    procedures: null,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            if (sanitizedText.toLowerCase() === 'alterar data/horário' || sanitizedText.toLowerCase() === 'alterar data' || sanitizedText.toLowerCase() === 'alterar horário') {
                draft.date = null;
                draft.time = null;
                await db.sessions.setDraft(phone, { date: null, time: null }, clinicId);

                const calText = "Claro! Escolha uma nova data para a consulta no calendário abaixo:";
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: `${calText}\n[SISTEMA: calendário exibido, aguardando data, offset=0]` }] });
                await db.sessions.set(phone, history, clinicId);

                return {
                    text: calText,
                    buttons: [],
                    showCalendar: true,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    procedures: null,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            if (sanitizedText.toLowerCase() === 'alterar especialidade' || sanitizedText.toLowerCase() === 'alterar procedimento') {
                draft.type = null;
                draft.date = null;
                draft.time = null;
                await db.sessions.setDraft(phone, { type: null, date: null, time: null }, clinicId);

                const procText = "Perfeito! Escolha qual especialidade ou procedimento você deseja agendar:";
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: `${procText}\n[SISTEMA: procedimentos exibidos, aguardando escolha]` }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    const sections = [{
                        title: "Tratamentos",
                        rows: PROCEDURES_RICH
                    }];
                    await whatsappService.sendListMessage(phone, procText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: procText,
                    buttons: [],
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: true,
                    requireCpf: false,
                    procedures: PROCEDURES_LIST,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            // 5. Atalhos para reagendamento, remarcação e cancelamento
            if (sanitizedText.toLowerCase() === 'reagendar consulta' || sanitizedText.toLowerCase() === 'reagendar' || sanitizedText.toLowerCase() === 'remarcar consulta' || sanitizedText.toLowerCase() === 'remarcar' || sanitizedText.toLowerCase() === 'agendar nova consulta') {
                logger.info('RESCHEDULE_BOOKING', `Paciente [${phone}] iniciou reagendamento de consulta.`);
                draft.date = null;
                draft.time = null;
                await db.sessions.setDraft(phone, { date: null, time: null }, clinicId);

                const procText = "Com certeza! Vamos agendar seu novo horário. Escolha abaixo qual especialidade ou procedimento você gostaria de agendar:";
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: `${procText}\n[SISTEMA: procedimentos exibidos, aguardando escolha]` }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    const sections = [{
                        title: "Tratamentos",
                        rows: PROCEDURES_RICH
                    }];
                    await whatsappService.sendListMessage(phone, procText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: procText,
                    buttons: [],
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: true,
                    requireCpf: false,
                    procedures: PROCEDURES_LIST,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            if (sanitizedText.toLowerCase() === 'remarcar/cancelar') {
                const rcText = "Sem problemas! Você prefere remarcar para uma nova data ou cancelar seu agendamento atual?";
                const rcButtons = ["Remarcar Consulta", "Cancelar Consulta", "Manter Consulta"];
                
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: rcText }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    await whatsappService.sendButtonMessage(phone, rcText, rcButtons, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: rcText,
                    buttons: rcButtons,
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    procedures: null,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            if (sanitizedText.toLowerCase() === 'cancelar consulta' || sanitizedText.toLowerCase() === 'cancelar' || sanitizedText.toLowerCase() === 'sim, cancelar') {
                logger.info('CANCEL_BOOKING', `Paciente [${phone}] solicitou cancelamento da consulta.`);
                let activeAppt = null;
                if (patient && patient.id) {
                    const appts = await db.appointments.findByPatient(patient.id, clinicId).catch(err => { logger.error('FIND_BY_PATIENT_ERR', err.message); return []; });
                    activeAppt = appts.find(a => a.status === 'pending' || a.status === 'confirmed');
                }

                if (activeAppt) {
                    await db.appointments.updateStatus(activeAppt.id, 'cancelled', clinicId);
                    logger.info('CANCEL_BOOKING_SUCCESS', `Consulta ${activeAppt.id} cancelada com sucesso via chat.`);
                }

                draft.date = null;
                draft.time = null;
                await db.sessions.setDraft(phone, { date: null, time: null }, clinicId);

                const cancelText = activeAppt 
                    ? "Sua consulta foi cancelada com sucesso! ❌ Se no futuro você quiser agendar um novo horário, basta clicar no botão abaixo para reagendar:"
                    : "Entendido! O agendamento foi cancelado. Se quiser escolher um novo horário no futuro, basta clicar no botão abaixo para reagendar:";
                const cancelButtons = ["Reagendar Consulta"];

                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: cancelText }] });
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    await whatsappService.sendButtonMessage(phone, cancelText, cancelButtons, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text: cancelText,
                    buttons: cancelButtons,
                    showCalendar: false,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    procedures: null,
                    availableSlots: null,
                    transferToHuman: false
                };
            }

            const isConfirming = sanitizedText.toLowerCase() === 'confirmar';
            if (isConfirming) {
                if (draft.date && draft.time && draft.type) {
                    try {
                        let newApptId = null;
                        // Verifica primeiro se já não existe exatamente esse agendamento ativo para esse paciente (idempotência de reentrega)
                        const existing = await db.appointments.findActiveAppointment(patient.id, draft.date, draft.time, clinicId).catch(() => null);
                        if (existing) {
                            newApptId = existing.id;
                            logger.info('SCHEDULING', `Agendamento idempotente detectado para [${phone}] - ${draft.date} ${draft.time}`);
                        } else {
                            if (!isSimulation) {
                                const newAppt = await calendarService.scheduleAppointment({
                                    clinicId,
                                    phone,
                                    name: draft.name || null,
                                    date: draft.date,
                                    time: draft.time,
                                    type: draft.type,
                                    doctor_id: draft.doctor_id || null,
                                    notes: draft.notes || null
                                });
                                newApptId = newAppt.id;
                                logger.info('SCHEDULING', `Agendamento criado com sucesso via WhatsApp para [${phone}] - ${draft.date} ${draft.time}`);
                            } else {
                                newApptId = 'simulat0r-id';
                                logger.info('SCHEDULING', `Agendamento criado com sucesso via Simulador para [${phone}] - ${draft.date} ${draft.time}`);
                            }
                        }

                        const apptDate = draft.date;
                        const apptTime = draft.time;

                        // Limpa o rascunho após criação com sucesso (no banco e na memória local da requisição)
                        draft.type = null;
                        draft.date = null;
                        draft.time = null;
                        draft.name = null;
                        draft.notes = null;
                        await db.sessions.setDraft(phone, null, clinicId);

                        const dateFmt = apptDate.split('-').reverse().join('/');
                        const shortId = newApptId ? newApptId.substring(0, 8) : '00000000';
                        const appHost = process.env.RENDER_EXTERNAL_URL || 'https://clinic-bot-zksc.onrender.com';
                        const calUrl = `${appHost}/c/${shortId}`;

                        const confirmText = `Agendamento confirmado para o dia ${dateFmt} às ${apptTime.substring(0, 5)}!\n\nVocê receberá lembretes 24h e 2h antes da consulta.\n\n📅 Adicionar ao Google Agenda:\n${calUrl}\n\n📍 Nosso endereço:\nAv. Paulista, 1000 - 12º andar\nBela Vista,\nSão Paulo/SP\n\nAté lá! ✅`;

                        history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                        history.push({ role: 'model', parts: [{ text: confirmText }] });
                        await db.sessions.set(phone, history, clinicId);

                        if (!isSimulation) {
                            await whatsappService.sendTextMessage(phone, confirmText, phoneId, clinicToken).catch(() => {});
                        }

                        return {
                            text: confirmText,
                            buttons: [],
                            showCalendar: false,
                            showTimeSlots: false,
                            showProceduresList: false,
                            requireCpf: false,
                            procedures: null,
                            availableSlots: null,
                            transferToHuman: false
                        };

                    } catch (dbErr) {
                        if (dbErr.code === '23505' || dbErr.message.includes('23505') || dbErr.message.includes('unique_violation')) {
                            logger.warn('SCHEDULING_CONFLICT', `Tentativa de agendamento em slot já preenchido: [${phone}] - ${draft.date} ${draft.time}`);
                            const conflictText = "Esse horário acabou de ser preenchido por outro paciente. Por favor, selecione outra data e horário nas opções abaixo:";
                            
                            // Limpa horário e data conflitantes do rascunho para liberar nova escolha
                            draft.time = null;
                            draft.date = null;
                            await db.sessions.setDraft(phone, draft, clinicId);

                            history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                            history.push({ role: 'model', parts: [{ text: `${conflictText}\n[SISTEMA: calendário exibido, aguardando data, offset=0]` }] });
                            await db.sessions.set(phone, history, clinicId);

                            return {
                                text: conflictText,
                                buttons: [],
                                showCalendar: true,
                                showTimeSlots: false,
                                showProceduresList: false,
                                requireCpf: false,
                                procedures: null,
                                availableSlots: null,
                                transferToHuman: false
                            };
                        }
                        throw dbErr;
                    }
                } else {
                    // Verifica se o paciente já possui agendamento recém-criado (evita falso alerta em clique duplo)
                    let activeAppt = null;
                    if (patient && patient.id) {
                        const appts = await db.appointments.findByPatient(patient.id, clinicId).catch(err => { logger.error('FIND_BY_PATIENT_ERR', err.message); return []; });
                        activeAppt = appts.find(a => a.status === 'pending' || a.status === 'confirmed');
                    }

                    if (activeAppt) {
                        const dateFmt = activeAppt.appointment_date.split('-').reverse().join('/');
                        const timeFmt = activeAppt.appointment_time.substring(0, 5);
                        const shortId = activeAppt.id.substring(0, 8);
                        const appHost = process.env.RENDER_EXTERNAL_URL || 'https://clinic-bot-zksc.onrender.com';
                        const calUrl = `${appHost}/c/${shortId}`;
                        
                        const confirmText = `Sua consulta de ${activeAppt.type || 'avaliação'} já está confirmada para ${dateFmt} às ${timeFmt}! Te esperamos lá! 😊\n\n📅 Adicionar ao Google Agenda:\n${calUrl}`;
                        
                        history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                        history.push({ role: 'model', parts: [{ text: confirmText }] });
                        await db.sessions.set(phone, history, clinicId);

                        if (!isSimulation) {
                            await whatsappService.sendTextMessage(phone, confirmText, phoneId, clinicToken).catch(() => {});
                        }

                        return {
                            text: confirmText,
                            buttons: [],
                            showCalendar: false,
                            showTimeSlots: false,
                            showProceduresList: false,
                            requireCpf: false,
                            procedures: null,
                            availableSlots: null,
                            transferToHuman: false
                        };
                    }

                    logger.warn('SCHEDULING_CONFIRMATION_FAILED', `Rascunho incompleto durante confirmação para [${phone}]: ${JSON.stringify(draft)}`);
                    
                    const errText = 'Não consegui localizar os dados do agendamento. Que tal escolher o procedimento novamente abaixo?';
                    
                    history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                    history.push({ role: 'model', parts: [{ text: `${errText}\n[SISTEMA: procedimentos exibidos, aguardando escolha]` }] });
                    await db.sessions.set(phone, history, clinicId);

                    if (!isSimulation) {
                        const sections = [{
                            title: "Tratamentos",
                            rows: PROCEDURES_RICH
                        }];
                        await whatsappService.sendListMessage(phone, errText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken).catch(() => {});
                    }

                    return {
                        text: errText,
                        buttons: [],
                        showCalendar: false,
                        showTimeSlots: false,
                        showProceduresList: true,
                        requireCpf: false,
                        procedures: PROCEDURES_LIST,
                        availableSlots: null,
                        transferToHuman: false
                    };
                }
            }

            // (Handoff humano já verificado acima, antes da confirmação de agendamento)

            // Detecta o estado anterior a partir da última mensagem do modelo
            let wasCpfRequested = false;
            let wasCalendarShown = false;
            let wasTimeSlotsShown = false;
            let previousOffset = 0;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].role === 'model') {
                    const modelText = history[i].parts?.[0]?.text || '';
                    if (modelText.includes('[SISTEMA: CPF solicitado, aguardando CPF]')) {
                        wasCpfRequested = true;
                    } else if (modelText.includes('[SISTEMA: calendário exibido, aguardando data')) {
                        wasCalendarShown = true;
                        const match = modelText.match(/offset=(\d+)/);
                        if (match) {
                            previousOffset = parseInt(match[1]);
                        }
                    } else if (modelText.includes('[SISTEMA: horários exibidos, aguardando escolha]')) {
                        wasTimeSlotsShown = true;
                    }
                    break;
                }
            }

            // ── NORMALIZAÇÃO DE INPUT PARA WHATSAPP REAL E SIMULADOR ─────────────
            let processedText = sanitizedText;
            const normalizedDate = normalizeInputDate(sanitizedText);
            const normalizedTime = normalizeInputTime(sanitizedText);
            if (normalizedDate && normalizedTime) {
                processedText = `${normalizedDate}\n${normalizedTime}`;
            } else if (normalizedDate) {
                processedText = normalizedDate;
            } else if (normalizedTime) {
                processedText = normalizedTime;
            }

            let offsetDays = 0;
            if (processedText.includes('Outras datas...')) {
                offsetDays = previousOffset + 7;
            }

            // ── COMPILAÇÃO INCREMENTAL DO RASCUNHO (DRAFT) DE AGENDAMENTO ───────
            // 1. Extração do Procedimento/Tratamento (N5 - Match Exato)
            const selectedProc = PROCEDURES_LIST.find(p => sanitizedText.toLowerCase() === p.toLowerCase());
            if (selectedProc) {
                draft.type = selectedProc;
                
                let clinicDoctors = [];
                try {
                    const { data, error } = await db.supabase.from('doctors').select('id, name, specialties').eq('clinic_id', clinicId).eq('is_active', true);
                    if (data) clinicDoctors = data;
                    console.log(`[DEBUG] Fetched ${clinicDoctors.length} doctors for clinicId ${clinicId}. Error:`, error);
                } catch(e) {
                    console.error(`[DEBUG] Error fetching doctors:`, e);
                }
                
                const matchingDoctors = clinicDoctors.filter(d => 
                   selectedProc.toLowerCase() === 'consulta geral' ||
                   !d.specialties || d.specialties.length === 0 || d.specialties.some(s => selectedProc.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(selectedProc.toLowerCase()))
                );
                console.log(`[DEBUG] Matching doctors count: ${matchingDoctors.length}`);

                if (matchingDoctors.length === 1) {
                    draft.doctor_id = matchingDoctors[0].id;
                    draft.doctor_name = matchingDoctors[0].name;
                } else if (matchingDoctors.length > 1) {
                    draft.needs_doctor = true;
                    draft.available_doctors = matchingDoctors;
                } else {
                    draft.doctor_id = null;
                }
                
                await db.sessions.setDraft(phone, draft, clinicId);
            }

            // 1b. Extração do Médico (se múltipla escolha foi ativada)
            if (draft.needs_doctor && draft.available_doctors) {
                const selectedDoc = draft.available_doctors.find(d => sanitizedText.toLowerCase() === d.name.toLowerCase());
                if (selectedDoc) {
                    draft.doctor_id = selectedDoc.id;
                    draft.doctor_name = selectedDoc.name;
                    draft.needs_doctor = false;
                    // Limpa a lista de opções para não pesar o JSON
                    draft.available_doctors = null; 
                    await db.sessions.setDraft(phone, draft, clinicId);
                }
            }

            // 2. Extração do Horário
            const timeNorm = normalizeInputTime(sanitizedText) || normalizeInputTime(processedText) || processedText;
            const timeMatch = timeNorm.match(/Selecionei o horário:\s*(\d{2}:\d{2})/i) || timeNorm.match(/\b(\d{2}:\d{2})\b/);
            if (timeMatch) {
                draft.time = timeMatch[1];
                await db.sessions.setDraft(phone, draft, clinicId);
            }

            // 3. Extração do Nome (se foi solicitado explicitamente no histórico)
            let wasNameRequested = false;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].role === 'model') {
                    const modelText = history[i].parts?.[0]?.text || '';
                    if (modelText.includes('Qual é o seu nome completo?') || modelText.includes('informe seu nome completo')) {
                        wasNameRequested = true;
                        break;
                    }
                }
            }

            if (wasNameRequested) {
                const extractedName = extractCleanName(sanitizedText);
                if (extractedName) {
                    draft.name = extractedName;
                    await db.sessions.setDraft(phone, draft, clinicId);
                    // Atualiza imediatamente a tabela de pacientes no Supabase para sincronizar
                    await db.patients.updateName(phone, extractedName, clinicId).catch(() => {});
                    if (patient) patient.name = extractedName;
                } else {
                    // Se o paciente mandou saudação ou texto genérico ao invés do nome,
                    // barramos de forma determinística e solicitamos o nome novamente
                    const isBypass = /atendente|humano|suporte|cancelar|cancelamento/i.test(sanitizedText);
                    if (!isBypass) {
                        const nameErrText = "Para prosseguirmos com o agendamento, por favor me informe o seu nome completo.";
                        history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                        history.push({ role: 'model', parts: [{ text: `${nameErrText}\n[SISTEMA: Qual é o seu nome completo?]` }] });
                        if (history.length > 20) history = history.slice(-20);
                        await db.sessions.set(phone, history, clinicId);

                        if (!isSimulation) {
                            await whatsappService.sendTextMessage(phone, nameErrText, phoneId, clinicToken).catch(() => {});
                        }

                        return {
                            text:            nameErrText,
                            buttons:         [],
                            showCalendar:    false,
                            showTimeSlots:   false,
                            showProceduresList: false,
                            requireCpf:      false,
                            procedures:      null,
                            availableSlots:  null,
                            transferToHuman: false
                        };
                    }
                }
            }

            // 4. Extração da descrição livre quando o paciente escolheu "Outro" no Passo 1.
            let wasOtherDescriptionRequested = false;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].role === 'model') {
                    const modelText = history[i].parts?.[0]?.text || '';
                    if (modelText.includes('[SISTEMA: aguardando_descricao]')) {
                        wasOtherDescriptionRequested = true;
                    }
                    break;
                }
            }
            if (wasOtherDescriptionRequested && sanitizedText.length > 2 && !sanitizedText.includes('Selecionei')) {
                draft.notes = sanitizedText;
                await db.sessions.setDraft(phone, draft, clinicId);
                processedText = `${sanitizedText}\n[SISTEMA: descrição do paciente para a opção Outro coletada. Avance para a escolha da data (Passo 2)]`;
            }

            // ── Pré-verificação de disponibilidade de data e busca de CPF ─────────
            
            // 1. Interceptação de Data
            const dateNorm = normalizeInputDate(sanitizedText) || normalizeInputDate(processedText) || processedText;
            const dateMatch = dateNorm.match(DATE_SELECTION_REGEX) || dateNorm.match(/\b(\d{4}-\d{2}-\d{2})\b/);
            if (dateMatch) {
                const selectedDate = dateMatch[1];
                const slots = await calendarService.getAvailableSlots(selectedDate, clinicId);
                if (slots.length === 0) {
                    processedText = `${processedText}\n[SISTEMA: Nenhum horário disponível para ${selectedDate}. Informe ao paciente que o dia está cheio e solicite outra data.]`;
                } else {
                    // Salva a data selecionada no rascunho
                    draft.date = selectedDate;
                    await db.sessions.setDraft(phone, draft, clinicId);
                }
            }

            // 2. Interceptação de CPF com separação de conceitos e segurança
            const rawCpf = extractAndNormalizeCpf(sanitizedText);

            // Se o CPF foi solicitado anteriormente, mas o usuário digitou um valor inválido,
            // barramos e pedimos novamente de forma determinística (evita que a LLM processe dados incorretos).
            const isBypassKeyword = /atendente|humano|suporte|cancelar|cancelamento/i.test(sanitizedText);
            if (wasCpfRequested && !rawCpf && !isBypassKeyword) {
                const errText = "O CPF informado é inválido. Por favor, informe seu CPF de 11 dígitos para prosseguirmos.";
                
                // Salva a tentativa inválida e repete o marcador de solicitação no histórico da sessão
                history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                history.push({ role: 'model', parts: [{ text: `${errText}\n[SISTEMA: CPF solicitado, aguardando CPF]` }] });
                if (history.length > 20) history = history.slice(-20);
                await db.sessions.set(phone, history, clinicId);

                if (!isSimulation) {
                    await whatsappService.sendTextMessage(phone, errText, phoneId, clinicToken).catch(() => {});
                }

                return {
                    text:            errText,
                    buttons:         [],
                    showCalendar:    false,
                    showTimeSlots:   false,
                    showProceduresList: false,
                    requireCpf:      true,
                    procedures:      null,
                    availableSlots:  null,
                    transferToHuman: false
                };
            }

            if (rawCpf) {
                try {
                    const foundPatient = await db.patients.findByCpf(rawCpf, clinicId);

                    if (foundPatient) {
                        if (foundPatient.phone !== phone) {
                            logger.warn('SECURITY', `Tentativa de agendamento de terceiros/familiar para CPF ${rawCpf} por telefone [${phone}]. Transferindo para validação humana.`);
                            
                            // Persiste a marca de Handoff no banco para validação humana segura (LGPD)
                            await persistHumanHandoff(phone, patient, history, sanitizedText, '', clinicId);

                            const blockText = "Para a segurança dos seus dados e agendamento de familiares, vou te transferir para um de nossos atendentes confirmar os dados com você.";
                            if (!isSimulation) {
                                await whatsappService.sendTextMessage(phone, blockText, phoneId, clinicToken).catch(() => {});
                            }

                            return {
                                text:            blockText,
                                buttons:         [],
                                showCalendar:    false,
                                showTimeSlots:   false,
                                showProceduresList: false,
                                requireCpf:      false,
                                procedures:      null,
                                availableSlots:  null,
                                transferToHuman: true
                            };
                        } else {
                            if (draft?.is_family_booking) {
                                logger.info('FAMILY_BOOKING', `Agendamento familiar autorizado para CPF ${rawCpf} pelo telefone ${phone}`);
                                processedText = `${sanitizedText}\n[SISTEMA: Agendamento familiar/dependente detectado e autorizado.]`;
                            } else {
                                processedText = `${sanitizedText}\n[SISTEMA: Paciente localizado! Nome: ${foundPatient.name}]`;
                            }
                        }
                    } else {
                        // Vinculação inicial (Cadastro Novo)
                        await db.patients.updateCpf(phone, rawCpf, clinicId);
                        processedText = `${sanitizedText}\n[SISTEMA: CPF não localizado. Novo cadastro iniciado para o número atual.]`;
                    }
                } catch (err) {
                    logger.error('DATABASE_COMMUNICATION', `Falha de comunicação com Supabase: ${err.message}`, err.stack);

                    // Persiste a falha técnica para evitar loop infinito
                    await persistHumanHandoff(phone, patient, history, sanitizedText, '', clinicId);

                    const failText = "Estamos com uma instabilidade técnica temporária. Vou te transferir para um de nossos atendentes continuar seu atendimento.";
                    if (!isSimulation) {
                        await whatsappService.sendTextMessage(phone, failText, phoneId, clinicToken).catch(() => {});
                    }

                    return {
                        text: failText,
                        buttons: [],
                        showCalendar: false,
                        showTimeSlots: false,
                        showProceduresList: false,
                        requireCpf: false,
                        availableSlots: null,
                        transferToHuman: true
                    };
                }
            }

            // Garante que a IA sempre receba o procedimento e nome do médico responsável no prompt
            const matchedProc = PROCEDURES_RICH.find(p => 
                draft.type && (p.title.toLowerCase().includes(draft.type.toLowerCase()) || draft.type.toLowerCase().includes(p.title.toLowerCase()))
            );
            const doctorName = matchedProc ? matchedProc.doctor : 'Dr. Carlos Eduardo / Dra. Juliana Mendes';

            let textForAI = processedText;
            if (patient && patient.name && patient.cpf && !processedText.includes('[SISTEMA:')) {
                textForAI = `[SISTEMA INVISÍVEL: Este paciente já é cadastrado no banco de dados. Nome: ${patient.name}, CPF: Validado.]\n` + processedText;
            }

            const currentPatientName = draft.name || (patient && patient.name && patient.name !== phone && patient.name !== patient.phone ? patient.name : null);

            if (draft.type || draft.date || draft.time || currentPatientName) {
                const draftInfoTag = `[SISTEMA INVISÍVEL: Dados do agendamento — Paciente: ${currentPatientName || 'a definir'}, Procedimento: ${draft.type || 'Consulta'}, Médico: ${doctorName}, Data: ${draft.date || 'a definir'}, Horário: ${draft.time || 'a definir'}. Na mensagem de confirmação, cite obrigatoriamente o nome do paciente ("${currentPatientName || 'a definir'}"), o procedimento ("${draft.type || 'Consulta'}") e o médico ("${doctorName}")].`;
                textForAI = `${textForAI}\n${draftInfoTag}`;
            }

            let aiResponse = await aiService.generateResponse(textForAI, history);
            logger.info('STATE_MACHINE', `text: ${sanitizedText}, draft.type: ${draft.type}, draft.needs_doctor: ${draft.needs_doctor}, draft.doctor_id: ${draft.doctor_id}`);
            console.log(`[DEBUG] draft.type: ${draft.type}, draft.needs_doctor: ${draft.needs_doctor}, draft.doctor_id: ${draft.doctor_id}`);

            // ── MÁQUINA DE ESTADOS 100% DETERMINÍSTICA DO BACKEND ───────────────────
            // Garante 100% de estabilidade navegacional no WhatsApp sem depender do output probabilístico da IA
            const isProcSelection = PROCEDURES_LIST.some(p => sanitizedText.toLowerCase().includes(p.toLowerCase()));
            if (!aiResponse.transferToHuman) {
                // Verifica se o paciente possui nome válido (não é apenas o número de telefone)
                const hasPatientName = !!(draft.name || (patient && patient.name && patient.name !== phone && patient.name !== patient.phone));
                if (draft.type && draft.date && draft.time && (patient?.cpf || draft.cpf || rawCpf) && hasPatientName) {
                    // Passo 5: Todos os dados coletados (incluindo nome) -> Confirmação explícita
                    aiResponse.buttons = ["Confirmar", "Agendar p/ Outro", "Alterar"];
                    aiResponse.showCalendar = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.requireCpf = false;
                } else if (draft.type && draft.date && draft.time && !patient?.cpf && !rawCpf) {
                    // Passo 4: Falta CPF -> Solicita CPF
                    aiResponse.requireCpf = true;
                    aiResponse.showCalendar = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                } else if (draft.type && draft.date && !draft.time) {
                    // Passo 3: Data escolhida -> Exibe horários daquele dia
                    aiResponse.showTimeSlots = true;
                    aiResponse.showCalendar = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.showDoctorList = false;
                } else if (draft.type && draft.needs_doctor && !draft.doctor_id) {
                    // Passo 1.5: Médico faltante -> Exibe opções de médicos
                    aiResponse.showDoctorList = true;
                    aiResponse.showCalendar = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                } else if ((draft.type || isProcSelection || processedText.includes('Outras datas...')) && !draft.date) {
                    // Passo 2: Procedimento escolhido -> Exibe calendário de datas
                    aiResponse.showCalendar = true;
                    aiResponse.showProceduresList = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showDoctorList = false;
                }

                // ── TRAVA ABSOLUTA ANTI-ALUCINAÇÃO DE COMPONENTES VISUAIS (FIX DEFINITIVO) ──
                // Se a IA ou a máquina de estados solicitou CPF ou Nome, NUNCA exiba calendário simultaneamente
                const isAskingCpf = aiResponse.requireCpf || wasCpfRequested || /cpf/i.test(aiResponse.text);
                const isAskingName = wasNameRequested || /nome completo/i.test(aiResponse.text);

                if (isAskingCpf || isAskingName) {
                    aiResponse.showCalendar = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.showDoctorList = false;
                }

                // Garante Exclusividade Mútua Estrita: Apenas 1 componente visual por resposta
                if (aiResponse.showCalendar) {
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.requireCpf = false;
                    aiResponse.showDoctorList = false;
                } else if (aiResponse.showTimeSlots) {
                    aiResponse.showCalendar = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.requireCpf = false;
                    aiResponse.showDoctorList = false;
                } else if (aiResponse.requireCpf) {
                    aiResponse.showCalendar = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.showDoctorList = false;
                } else if (aiResponse.showDoctorList) {
                    aiResponse.showCalendar = false;
                    aiResponse.showTimeSlots = false;
                    aiResponse.showProceduresList = false;
                    aiResponse.requireCpf = false;
                    aiResponse.text = "Perfeito! Selecione o profissional de sua preferência para o atendimento:";
                }
            }

            history.push({ role: 'user', parts: [{ text: processedText }] });

            let responseText = aiResponse.text;

            // Garante a formatação correta com quebras de linha no endereço da mensagem de encerramento
            if (responseText.includes('confirmado') && responseText.includes('Paulista')) {
                responseText = responseText
                    .replace(/!\s*(Você receberá)/i, '!\n\n$1')
                    .replace(/(consulta\.|consulta)\s*(📍 Nosso)/i, '$1\n\n$2')
                    .replace(/(endereço:)\s*(Av\.)/i, '$1\n$2')
                    .replace(/(12º andar|andar)\s*(Bela)/i, '$1\n$2')
                    .replace(/(Vista,)\s*(São)/i, '$1\n$2')
                    .replace(/(Paulo\/SP)\s*(Até)/i, '$1\n\n$2');
            }

            // ── FIX #2: busca horários REAIS no banco (movido para antes do envio real)
            let availableSlots = null;

            if (aiResponse.showTimeSlots) {
                // Tenta extrair a data do texto ou do histórico se não estiver na mensagem atual
                let dateStr = null;
                const matchCurrent = processedText.match(DATE_SELECTION_REGEX);
                if (matchCurrent) {
                    dateStr = matchCurrent[1];
                } else {
                    // Busca data selecionada anteriormente no histórico de sessões
                    for (let i = history.length - 1; i >= 0; i--) {
                        const histMatch = history[i].parts[0].text.match(DATE_SELECTION_REGEX);
                        if (histMatch) {
                            dateStr = histMatch[1];
                            break;
                        }
                    }
                }

                if (dateStr) {
                    availableSlots = await calendarService.getAvailableSlots(dateStr, clinicId, draft.doctor_id);
                } else {
                    logger.warn('SCHEDULING_DATA', `showTimeSlots=true mas nenhuma data extraída da mensagem/histórico [${phone}]`);
                    availableSlots = [];
                }
            }

            // ── Envio real (pulado em modo simulação) ──────────────────────────
            if (!isSimulation) {
                try {
                    if (aiResponse.showProceduresList) {
                        const sections = [{
                            title: "Tratamentos",
                            rows: PROCEDURES_RICH
                        }];
                        await whatsappService.sendListMessage(phone, responseText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken);
                    } else if (aiResponse.showDoctorList) {
                        if (draft.available_doctors && draft.available_doctors.length > 0) {
                            const sections = [{
                                title: "Profissionais",
                                rows: draft.available_doctors.map(d => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: "Selecionar especialista"
                                }))
                            }];
                            await whatsappService.sendListMessage(phone, responseText, "Ver Médicos", sections, "Especialistas", phoneId, clinicToken);
                        } else {
                            // Fallback caso dê erro e a lista esteja vazia
                            await whatsappService.sendTextMessage(phone, responseText, phoneId, clinicToken);
                        }
                    } else if (aiResponse.showCalendar) {
                        const rows = [];
                        const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
                        let date = new Date(brtString);
                        
                        if (offsetDays > 0) {
                            date.setDate(date.getDate() + offsetDays);
                        }

                        const candidateDates = [];
                        
                        // Busca até 14 dias futuros candidatos (pulando domingos)
                        while (candidateDates.length < 14) {
                            date.setDate(date.getDate() + 1);
                            const dayOfWeek = date.getDay();
                            if (dayOfWeek === 0) continue; // Pula Domingo
                            
                            const year = date.getFullYear();
                            const month = (date.getMonth() + 1).toString().padStart(2, '0');
                            const day = date.getDate().toString().padStart(2, '0');
                            
                            candidateDates.push({
                                formattedDate: `${year}-${month}-${day}`,
                                displayDate: `${day}/${month}/${year}`,
                                dayOfWeekName: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dayOfWeek]
                            });
                        }

                        // Consulta disponibilidade de horários para todos os candidatos em paralelo para otimizar o tempo de resposta do lote
                        const availabilities = await Promise.all(
                            candidateDates.map(d => calendarService.getAvailableSlots(d.formattedDate, clinicId).catch(err => { logger.error('CALENDAR_SLOTS_ERR', err.message); return []; }))
                        );

                        // Seleciona até 6 dias (deixando 1 slot para a paginação, pois o teto da Meta é 10 e aqui exibimos 7 opções total)
                        for (let i = 0; i < candidateDates.length; i++) {
                            if (availabilities[i].length > 0) {
                                const d = candidateDates[i];
                                rows.push({
                                    id: `date_${d.formattedDate}`,
                                    title: d.displayDate,
                                    description: d.dayOfWeekName
                                });
                                if (rows.length === 6) break;
                            }
                        }

                        // Se não houver datas com vagas nos 14 dias candidatos, oferece o salto de paginação sem falsas vagas
                        if (rows.length === 0) {
                            rows.push({
                                id: `btn_more_dates`,
                                title: `Outras datas...`,
                                description: `Nenhuma vaga nos próximos dias`
                            });
                        } else {
                            // Rota de Escape Padrão (Paginação)
                            rows.push({
                                id: `btn_more_dates`,
                                title: `Outras datas...`,
                                description: `Ver mais opções de datas`
                            });
                        }

                        const sections = [{
                            title: "Datas Disponíveis",
                            rows
                        }];
                        await whatsappService.sendListMessage(phone, responseText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken);
                    } else if (aiResponse.showTimeSlots) {
                        if (availableSlots && availableSlots.length > 0) {
                            // Limita a 4 opções por período para sobrar espaço para o botão "Outros horários..."
                            const morning = availableSlots.filter(s => parseInt(s.split(':')[0]) < 12).slice(0, 4);
                            const afternoon = availableSlots.filter(s => parseInt(s.split(':')[0]) >= 12 && parseInt(s.split(':')[0]) < 18).slice(0, 4);
                            
                            const sections = [];
                            if (morning.length > 0) {
                                const morningRows = morning.map((slot, index) => ({ id: `slot_m_${index}`, title: slot }));
                                // Rota de Escape se não houver tarde mas houver sobras
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
                                // Rota de Escape se houver tarde e houver sobras
                                if (availableSlots.length > (morning.length + afternoon.length)) {
                                    afternoonRows.push({ id: 'slot_more_options', title: 'Outros horários...' });
                                }
                                sections.push({
                                    title: "Tarde",
                                    rows: afternoonRows
                                });
                            }

                            await whatsappService.sendListMessage(phone, responseText, "Ver Opções", sections, clinicListTitle, phoneId, clinicToken);
                        } else {
                            await whatsappService.sendTextMessage(phone, responseText, phoneId, clinicToken);
                        }
                    } else if (aiResponse.buttons?.length > 0) {
                        await whatsappService.sendButtonMessage(phone, responseText, aiResponse.buttons, phoneId, clinicToken);
                    } else {
                        await whatsappService.sendTextMessage(phone, responseText, phoneId, clinicToken);
                    }
                } catch (sendError) {
                    logger.error('WHATSAPP_SEND', `Falha ao enviar mensagem via WhatsApp API: ${sendError.message}`, sendError.stack);
                    responseText = 'Desculpe, estou com dificuldades técnicas. Retorno em breve.';
                    await whatsappService.sendTextMessage(phone, responseText, phoneId, clinicToken).catch(() => {});
                }
            }

            // ── FIX #1: injeta o estado da conversa no histórico ────────────────
            let stateTag = '';
            if (aiResponse.transferToHuman) {
                stateTag = '[SISTEMA: conversa transferida para atendente humano]';
            } else if (aiResponse.requireCpf) {
                stateTag = '[SISTEMA: CPF solicitado, aguardando CPF]';
            } else if (aiResponse.showProceduresList) {
                stateTag = '[SISTEMA: procedimentos exibidos, aguardando escolha]';
            } else if (aiResponse.showTimeSlots) {
                stateTag = '[SISTEMA: horários exibidos, aguardando escolha]';
            } else if (aiResponse.showCalendar) {
                stateTag = `[SISTEMA: calendário exibido, aguardando data, offset=${offsetDays}]`;
            } else if (aiResponse.requireDescription) {
                stateTag = '[SISTEMA: aguardando_descricao]';
            }

            const textForHistory = stateTag ? `${responseText}\n${stateTag}` : responseText;
            history.push({ role: 'model', parts: [{ text: textForHistory }] });

            if (history.length > 20) {
                history = history.slice(-20);
            }

            await db.sessions.set(phone, history, clinicId);
            await db.conversations.log(patient.id, 'assistant', responseText);

            // Definição da lista real de procedimentos centralizada no Backend
            const procedures = aiResponse.showProceduresList ? PROCEDURES_LIST : null;

            return {
                text:            responseText,
                buttons:         aiResponse.buttons || [],
                showCalendar:    aiResponse.showCalendar,
                showTimeSlots:   aiResponse.showTimeSlots,
                showProceduresList: aiResponse.showProceduresList,
                showDoctorList:  aiResponse.showDoctorList || false,
                requireCpf:      aiResponse.requireCpf || false,
                procedures,
                availableSlots,
                availableDoctors: draft.available_doctors || null,
                transferToHuman: aiResponse.transferToHuman || false
            };

        } catch (error) {
            logger.error('CONTROLLER_ERROR', `Erro no controller [${phone}]: ${error.message}`, error.stack);
            const errText = 'Desculpe, ocorreu um erro interno.';
            if (!isSimulation) {
                await whatsappService.sendTextMessage(phone, errText, phoneId, clinicToken).catch(() => {});
            }
            return {
                text:            errText,
                buttons:         [],
                showCalendar:    false,
                showTimeSlots:   false,
                showProceduresList: false,
                requireCpf:      false,
                procedures:      null,
                availableSlots:  null,
                transferToHuman: false
            };
        }
    }
}

const controllerInstance = new ConversationController();
controllerInstance.extractCleanName = extractCleanName;
module.exports = controllerInstance;
