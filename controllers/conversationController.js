const aiService        = require('../services/aiService');
const whatsappService   = require('../services/whatsappService');
const db                = require('../services/databaseService');
const calendarService   = require('../services/calendarService');
const logger            = require('../services/logger');

// Reconhece o formato enviado pelo frontend quando o paciente
// clica numa data no widget de calendário
const DATE_SELECTION_REGEX = /Selecionei a data:\s*(\d{4}-\d{2}-\d{2})/i;

const PROCEDURES_RICH = [
    { id: 'proc_0', title: "Consulta geral", description: "Avaliação, diagnóstico e check-up" },
    { id: 'proc_1', title: "Limpeza", description: "Profilaxia e remoção de tártaro" },
    { id: 'proc_2', title: "Clareamento Dental", description: "Tratamento estético para os dentes" },
    { id: 'proc_3', title: "Implante", description: "Reposição de dentes perdidos" },
    { id: 'proc_4', title: "Aparelho Ortodôntico", description: "Alinhamento e correção" },
    { id: 'proc_5', title: "Outro", description: "Descreva seu problema no chat" }
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
async function persistHumanHandoff(phone, patient, history, userText, extraNote = '') {
    const marker = `[SISTEMA: conversa transferida para atendente humano]${extraNote ? ' ' + extraNote : ''}`;
    const updatedHistory = [
        ...history,
        { role: 'user', parts: [{ text: userText }] },
        { role: 'model', parts: [{ text: marker }] }
    ].slice(-20);

    try {
        await db.sessions.set(phone, updatedHistory);
        if (patient?.id) {
            await db.conversations.log(patient.id, 'assistant', '[Transferido para atendimento humano]');
        }
    } catch (persistErr) {
        logger.error('PERSIST_HANDOFF', `Falha ao persistir handoff humano: ${persistErr.message}`, persistErr.stack);
    }
}

function normalizeInputDate(text) {
    // 1. Matches DD/MM/YYYY
    const dmyRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
    const dmyMatch = text.match(dmyRegex);
    if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `Selecionei a data: ${year}-${month}-${day}`;
    }
    
    // 2. Matches DD/MM (Infere o ano dinamicamente para evitar corrupção em viradas de ano)
    const dmRegex = /\b(\d{1,2})[\/\-](\d{1,2})\b/;
    const dmMatch = text.match(dmRegex);
    if (dmMatch) {
        const day = parseInt(dmMatch[1]);
        const month = parseInt(dmMatch[2]);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            const formattedDay = day.toString().padStart(2, '0');
            const formattedMonth = month.toString().padStart(2, '0');
            
            const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const now = new Date(brtString);
            let year = now.getFullYear();
            if (month < (now.getMonth() + 1)) {
                year++; 
            }
            return `Selecionei a data: ${year}-${formattedMonth}-${formattedDay}`;
        }
    }
    return null;
}

function normalizeInputTime(text) {
    const timeRegex = /\b(\d{1,2})[:hH](\d{2})?\b/;
    const match = text.match(timeRegex);
    if (match) {
        const hour = parseInt(match[1]);
        const min = parseInt(match[2] || '0');
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
            const formattedHour = hour.toString().padStart(2, '0');
            const formattedMin = min.toString().padStart(2, '0');
            return `Selecionei o horário: ${formattedHour}:${formattedMin}`;
        }
    }
    return null;
}

class ConversationController {

    async handleIncomingMessage(phone, text, isSimulation = false) {
        try {
            const patient = await db.patients.findOrCreate(phone);
            await db.conversations.log(patient.id, 'user', text);

            // ── SANITIZAÇÃO DE SEGURANÇA ──────────────────────────────────────────
            // Impede injeção de prompt que tenta forçar comandos do sistema via colchetes
            const sanitizedText = text.replace(/\[\s*SISTEMA\s*:.*?\]/gi, '').trim();

            let history = await db.sessions.get(phone);

            // Carrega ou inicializa o rascunho de agendamento estruturado da sessão
            let draft = await db.sessions.getDraft(phone) || {};

            // ── RECONHECIMENTO DE PACIENTE CADASTRADO ────────────────────────────
            // Se o paciente já tem nome e CPF salvos, pré-popula o rascunho e
            // injeta o marcador para a IA pular a coleta de dados (Passo 4).
            if (patient.name && patient.cpf) {
                if (!draft.name) {
                    draft.name = patient.name;
                    await db.sessions.setDraft(phone, { name: patient.name });
                }
            }
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
                if (/\b(voltar|robô|robo|ia|inteligência artificial|reiniciar|menu|cancelar)\b/i.test(sanitizedText)) {
                    logger.info('HUMAN_HANDOFF_CANCELED', `Paciente [${phone}] solicitou retorno à IA. Histórico e rascunho resetados.`);
                    history = [];
                    draft = {};
                    await db.sessions.set(phone, history);
                    await db.sessions.setDraft(phone, null);
                } else {
                    const responseText = "Você já está em atendimento com um de nossos atendentes no momento.";
                    if (!isSimulation) {
                        await whatsappService.sendTextMessage(phone, responseText).catch(() => {});
                    }
                    return {
                        text: responseText,
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

            // ── FASE 1: RESERVA ATÔMICA & CRIAÇÃO DE AGENDAMENTO DE CONSULTA ───────
            const isConfirming = sanitizedText.toLowerCase() === 'confirmar';
            if (isConfirming) {
                if (draft.date && draft.time && draft.type) {
                    try {
                        // Verifica primeiro se já não existe exatamente esse agendamento ativo para esse paciente (idempotência de reentrega)
                        const existing = await db.appointments.findActiveAppointment(patient.id, draft.date, draft.time);
                        if (existing) {
                            logger.info('SCHEDULING', `Agendamento idempotente detectado para [${phone}] - ${draft.date} ${draft.time}`);
                        } else {
                            await calendarService.scheduleAppointment({
                                phone,
                                name: draft.name || null,
                                date: draft.date,
                                time: draft.time,
                                type: draft.type,
                                notes: draft.notes || null
                            });
                            logger.info('SCHEDULING', `Agendamento criado com sucesso via WhatsApp/Simulador para [${phone}] - ${draft.date} ${draft.time}`);
                        }

                        // Limpa o rascunho após criação com sucesso
                        await db.sessions.setDraft(phone, null);

                    } catch (dbErr) {
                        if (dbErr.code === '23505' || dbErr.message.includes('23505') || dbErr.message.includes('unique_violation')) {
                            logger.warn('SCHEDULING_CONFLICT', `Tentativa de agendamento em slot já preenchido: [${phone}] - ${draft.date} ${draft.time}`);
                            const conflictText = "Esse horário acabou de ser preenchido por outro paciente. Por favor, selecione outra data e horário.";
                            
                            history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                            history.push({ role: 'model', parts: [{ text: `${conflictText}\n[SISTEMA: calendário exibido, aguardando data, offset=0]` }] });
                            await db.sessions.set(phone, history);

                            if (!isSimulation) {
                                await whatsappService.sendTextMessage(phone, conflictText).catch(() => {});
                            }

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
                    logger.warn('SCHEDULING_CONFIRMATION_FAILED', `Rascunho incompleto durante confirmação para [${phone}]: ${JSON.stringify(draft)}`);
                    
                    const errText = 'Não consegui localizar todos os dados da sua consulta. Vamos recomeçar a escolha?';
                    
                    history.push({ role: 'user', parts: [{ text: sanitizedText }] });
                    history.push({ role: 'model', parts: [{ text: `${errText}\n[SISTEMA: procedimentos exibidos, aguardando escolha]` }] });
                    await db.sessions.set(phone, history);

                    if (!isSimulation) {
                        await whatsappService.sendTextMessage(phone, errText).catch(() => {});
                    }

                    return {
                        text: errText,
                        buttons: [],
                        showCalendar: false,
                        showTimeSlots: false,
                        showProceduresList: true,
                        requireCpf: false,
                        procedures: PROCEDURES_RICH,
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

            // ── NORMALIZAÇÃO DE INPUT PARA WHATSAPP REAL ──────────────────────────
            let processedText = sanitizedText;
            if (!isSimulation) {
                if (wasCalendarShown) {
                    const normalizedDate = normalizeInputDate(sanitizedText);
                    if (normalizedDate) processedText = normalizedDate;
                } else if (wasTimeSlotsShown) {
                    const normalizedTime = normalizeInputTime(sanitizedText);
                    if (normalizedTime) processedText = normalizedTime;
                }
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
                await db.sessions.setDraft(phone, { type: selectedProc });
            }

            // 2. Extração do Horário
            const timeMatch = processedText.match(/Selecionei o horário:\s*(\d{2}:\d{2})/i) || processedText.match(/^\b(\d{2}:\d{2})\b$/);
            if (timeMatch) {
                draft.time = timeMatch[1];
                await db.sessions.setDraft(phone, { time: draft.time });
            }

            // 3. Extração do Nome (se foi solicitado explicitamente no histórico)
            let wasNameRequested = false;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].role === 'model') {
                    const modelText = history[i].parts?.[0]?.text || '';
                    if (modelText.includes('Qual é o seu nome completo?')) {
                        wasNameRequested = true;
                        break;
                    }
                }
            }
            if (wasNameRequested && sanitizedText.length > 2 && !sanitizedText.includes('CPF') && !sanitizedText.includes('Selecionei')) {
                draft.name = sanitizedText;
                await db.sessions.setDraft(phone, { name: draft.name });
            }

            // 4. Extração da descrição livre quando o paciente escolheu "Outro" no Passo 1.
            let wasOtherDescriptionRequested = false;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].role === 'model') {
                    const modelText = history[i].parts?.[0]?.text || '';
                    if (modelText.includes('[SISTEMA: aguardando_descricao]')) {
                        wasOtherDescriptionRequested = true;
                        break;
                    }
                }
            }
            if (wasOtherDescriptionRequested && sanitizedText.length > 2 && !sanitizedText.includes('Selecionei')) {
                draft.notes = sanitizedText;
                await db.sessions.setDraft(phone, { notes: draft.notes });
                processedText = `${sanitizedText}\n[SISTEMA: descrição do paciente para a opção Outro coletada. Avance para a escolha da data (Passo 2)]`;
            }

            // ── Pré-verificação de disponibilidade de data e busca de CPF ─────────
            
            // 1. Interceptação de Data
            const dateMatch = processedText.match(DATE_SELECTION_REGEX);
            if (dateMatch) {
                const selectedDate = dateMatch[1];
                const slots = await calendarService.getAvailableSlots(selectedDate);
                if (slots.length === 0) {
                    processedText = `${processedText}\n[SISTEMA: Nenhum horário disponível para ${selectedDate}. Informe ao paciente que o dia está cheio e solicite outra data.]`;
                } else {
                    // Salva a data selecionada no rascunho
                    draft.date = selectedDate;
                    await db.sessions.setDraft(phone, { date: selectedDate });
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
                await db.sessions.set(phone, history);

                if (!isSimulation) {
                    await whatsappService.sendTextMessage(phone, errText).catch(() => {});
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
                    const foundPatient = await db.patients.findByCpf(rawCpf);

                    if (foundPatient) {
                        // Cross-check explícito de autorização
                        if (foundPatient.phone !== phone) {
                            logger.warn('SECURITY', `Tentativa de acesso CPF ${rawCpf} por telefone não autorizado (${phone}). Block aplicado.`);
                            
                            // Persiste a marca de Handoff no banco de dados com contexto da mensagem para evitar bypass
                            await persistHumanHandoff(phone, patient, history, sanitizedText, '(motivo: CPF de outro telefone)');

                            const blockText = "Não conseguimos confirmar seus dados automaticamente. Vou te transferir para um de nossos atendentes para finalizar.";
                            if (!isSimulation) {
                                await whatsappService.sendTextMessage(phone, blockText).catch(() => {});
                            }

                            // HARD BLOCK: Aborta o fluxo imediatamente com resposta genérica e sem vazamento de dados.
                            return {
                                text: blockText,
                                buttons: [],
                                showCalendar: false,
                                showTimeSlots: false,
                                showProceduresList: false,
                                requireCpf: false,
                                availableSlots: null,
                                transferToHuman: true
                            };
                        } else {
                            // Autenticado com sucesso. O update redundante foi removido.
                            processedText = `${sanitizedText}\n[SISTEMA: Paciente localizado! Nome: ${foundPatient.name}]`;
                        }
                    } else {
                        // Vinculação inicial (Cadastro Novo)
                        await db.patients.updateCpf(phone, rawCpf);
                        processedText = `${sanitizedText}\n[SISTEMA: CPF não localizado. Novo cadastro iniciado para o número atual.]`;
                    }
                } catch (err) {
                    logger.error('DATABASE_COMMUNICATION', `Falha de comunicação com Supabase: ${err.message}`, err.stack);

                    // Persiste a falha técnica para evitar loop infinito
                    await persistHumanHandoff(phone, patient, history, sanitizedText, '(motivo: falha de infraestrutura)');

                    const failText = "Estamos com uma instabilidade técnica temporária. Vou te transferir para um de nossos atendentes continuar seu atendimento.";
                    if (!isSimulation) {
                        await whatsappService.sendTextMessage(phone, failText).catch(() => {});
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

            let aiResponse;
            if (wasOtherDescriptionRequested && sanitizedText.length > 2 && !sanitizedText.includes('Selecionei')) {
                aiResponse = {
                    text: "Perfeito! Escolha a melhor data para sua consulta.",
                    buttons: [],
                    showCalendar: true,
                    showTimeSlots: false,
                    showProceduresList: false,
                    requireCpf: false,
                    transferToHuman: false,
                    requireDescription: false
                };
            } else {
                // Injeta marcador de paciente conhecido para a IA pular o Passo 4
                let aiInput = processedText;
                if (patient.name && patient.cpf && !processedText.includes('[SISTEMA:')) {
                    aiInput = `${processedText}\n[SISTEMA: paciente_conhecido, nome=${patient.name}, cpf=SIM]`;
                }
                aiResponse = await aiService.generateResponse(aiInput, history);
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
                    availableSlots = await calendarService.getAvailableSlots(dateStr);
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
                        await whatsappService.sendListMessage(phone, responseText, "Ver Opções", sections, "Especialidades");
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
                            candidateDates.map(d => calendarService.getAvailableSlots(d.formattedDate).catch(() => []))
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
                        await whatsappService.sendListMessage(phone, responseText, "Ver Calendário", sections, "Calendário");
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

                            await whatsappService.sendListMessage(phone, responseText, "Ver Horários", sections, "Horários Disponíveis");
                        } else {
                            await whatsappService.sendTextMessage(phone, responseText);
                        }
                    } else if (aiResponse.buttons?.length > 0) {
                        await whatsappService.sendButtonMessage(phone, responseText, aiResponse.buttons);
                    } else {
                        await whatsappService.sendTextMessage(phone, responseText);
                    }
                } catch (sendError) {
                    logger.error('WHATSAPP_SEND', `Falha ao enviar mensagem via WhatsApp API: ${sendError.message}`, sendError.stack);
                    responseText = 'Desculpe, estou com dificuldades técnicas. Retorno em breve.';
                    await whatsappService.sendTextMessage(phone, responseText).catch(() => {});
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

            await db.sessions.set(phone, history);
            await db.conversations.log(patient.id, 'assistant', responseText);

            // Definição da lista real de procedimentos centralizada no Backend
            const procedures = aiResponse.showProceduresList ? PROCEDURES_LIST : null;

            return {
                text:            responseText,
                buttons:         aiResponse.buttons || [],
                showCalendar:    aiResponse.showCalendar,
                showTimeSlots:   aiResponse.showTimeSlots,
                showProceduresList: aiResponse.showProceduresList,
                requireCpf:      aiResponse.requireCpf || false,
                procedures,
                availableSlots,
                transferToHuman: aiResponse.transferToHuman || false
            };

        } catch (error) {
            logger.error('CONTROLLER_ERROR', `Erro no controller [${phone}]: ${error.message}`, error.stack);
            const errText = 'Desculpe, ocorreu um erro interno.';
            if (!isSimulation) {
                await whatsappService.sendTextMessage(phone, errText).catch(() => {});
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

module.exports = new ConversationController();
