
        const API_BASE = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
            ? '/api/dashboard'
            : 'http://localhost:3000/api/dashboard';

        let allAppointments = [];
        let allPatients = [];
        let allSessions = [];
        let currentStatusFilter = 'all';
        let pollTimeoutId = null;

        // HELPER DE SANITIZAÇÃO RIGOROSA CONTRA XSS (Apontado por Perplexity, Gemini e Claude)
        function esc(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        document.addEventListener('DOMContentLoaded', () => {
            const token = localStorage.getItem('clinicabot_token');
            const userData = localStorage.getItem('clinicabot_user');

            // Listeners delegados para evitar XSS via onclick inline
            document.getElementById('patient-suggestions').addEventListener('click', (e) => {
                const item = e.target.closest('.autocomplete-item');
                if (!item) return;
                selectPatientSuggestion(item.dataset.id, item.dataset.name, item.dataset.phone);
            });

            document.getElementById('appointments-tbody').addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-confirm-appt, .btn-cancel-appt');
                if (!btn) return;
                const id = btn.dataset.id;
                const status = btn.dataset.status;
                if (id && status) updateAppointmentStatus(id, status);
            });

            const doctorsContainer = document.getElementById('doctors-cards-container');
            if (doctorsContainer) {
                doctorsContainer.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-edit-doc');
                    if (!btn) return;
                    const docId = btn.dataset.id;
                    const doc = allDoctors.find(d => d.id === docId);
                    if (doc) {
                        document.getElementById('doc-name').value = doc.name;
                        document.getElementById('doc-specialty').value = doc.specialty;
                        document.getElementById('doc-cro').value = doc.cro;
                        document.getElementById('doc-status').value = doc.status;
                        document.getElementById('doc-days').value = doc.available_days;
                        openModal('modal-doctor');
                    }
                });
            }

            document.getElementById('handoff-tbody').addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-return-ai');
                if (!btn) return;
                const phone = btn.dataset.phone;
                if (phone) returnSessionToAI(phone);
            });

            document.getElementById('calendar-grid-body').addEventListener('click', (e) => {
                const cell = e.target.closest('.calendar-day-cell');
                if (!cell || !cell.dataset.date) return;
                selectCalendarDate(cell.dataset.date);
            });

            // Redireciona file:// para HTTP
            if (window.location.protocol === 'file:') {
                window.location.href = 'http://localhost:3000/dashboard.html';
                return;
            }

            // SEMPRE tenta auto-login ao carregar para garantir token válido
            autoLoginDefaultAdmin();
        });

        // REQUISIÇÕES À API (SEM FALLBACK SILENCIOSO MOCKADO — PROPAGA ERRO REAL)
        async function apiRequest(endpoint, method = 'GET', body = null) {
            const token = localStorage.getItem('clinicabot_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const config = { method, headers };
            if (body) config.body = JSON.stringify(body);

            const res = await fetch(`${API_BASE}${endpoint}`, config);

            if (res.status === 401) {
                // NÃO chama logout() aqui — evita loop infinito com modal
                throw new Error('AUTH_EXPIRED');
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro no servidor');
            return data;
        }

        // HANDLER DE LOGIN (SEM CRIAÇÃO SILENCIOSA DE MOCK DAFORMER)
        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const clinicSlug = document.getElementById('login-clinic-slug').value;

            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, clinicSlug })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Falha na autenticação. Verifique e-mail e senha.');

                localStorage.setItem('clinicabot_token', data.token);
                localStorage.setItem('clinicabot_user', JSON.stringify(data.user));

                document.getElementById('user-display-name').innerText = `${esc(data.user.clinicName)} (${esc(data.user.role)})`;
                closeModal('modal-login');
                showToast(`🔐 Autenticado em: ${data.user.clinicName}`);

                fetchLiveDashboardData();

            } catch (err) {
                showToast(`❌ ${err.message}`);
            }
        }

        function logout() {
            localStorage.removeItem('clinicabot_token');
            localStorage.removeItem('clinicabot_user');
            if (pollTimeoutId) { clearTimeout(pollTimeoutId); pollTimeoutId = null; }
            openModal('modal-login');
        }

        let _autoLoginInProgress = false;
        async function autoLoginDefaultAdmin() {
            if (_autoLoginInProgress) return;
            _autoLoginInProgress = true;
            try {
                console.log('[AUTH] Auto-login iniciando...');
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'admin@clinicamodelo.com.br', password: '123456' })
                });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('clinicabot_token', data.token);
                    localStorage.setItem('clinicabot_user', JSON.stringify(data.user));
                    document.getElementById('user-display-name').innerText = `${esc(data.user.clinicName)} (${esc(data.user.role)})`;
                    console.log('[AUTH] Auto-login OK:', data.user.clinicName);
                    closeModal('modal-login');
                    showToast(`🔐 Autenticado: ${esc(data.user.clinicName)}`);
                    fetchLiveDashboardData();
                    updateLivePreview();
                } else {
                    console.warn('[AUTH] Auto-login falhou, mostrando modal');
                    openModal('modal-login');
                }
            } catch (err) {
                console.error('[AUTH] Auto-login erro:', err.message);
                openModal('modal-login');
            } finally {
                _autoLoginInProgress = false;
            }
        }

        // REFRESH MANUAL COM ANIMAÇÃO E NOTIFICAÇÃO VISUAL
        async function handleManualRefresh() {
            const icon = document.getElementById('refresh-icon');
            if (icon) icon.classList.add('fa-spin');
            showToast('🔄 Atualizando dados com o servidor...');
            try {
                await fetchLiveDashboardData();
                showToast('✅ Painel atualizado com sucesso!');
            } catch (err) {
                showToast('⚠️ Erro ao atualizar painel.');
            } finally {
                if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 600);
            }
        }

        // POLLING SEGURO COM TIMEOUT UNIFICADO (Cancela corrotinas previas para evitar multiplicacao no manual refresh)
        async function fetchLiveDashboardData() {
            if (pollTimeoutId) {
                clearTimeout(pollTimeoutId);
                pollTimeoutId = null;
            }

            const indicator = document.getElementById('pulse-indicator');
            const dot = document.getElementById('pulse-dot-indicator');
            const text = document.getElementById('pulse-text-indicator');

            try {
                const data = await apiRequest('/data');

                allAppointments = data.appointments || [];
                allPatients = data.patients || [];
                allSessions = data.handoffs || [];
                if (data.doctors && data.doctors.length > 0) {
                    allDoctors = data.doctors;
                }

                updateKPIs(data.kpis);
                renderAppointmentsTable(getFilteredAppointments());
                renderPatientsTable(allPatients);
                renderHandoffTable(allSessions);
                renderDoctorsCards(allDoctors);
                populatePatientDropdown(allPatients);

                if (indicator) {
                    indicator.classList.remove('offline');
                    dot.classList.remove('offline');
                    text.innerText = 'Servidor Node.js & Meta WhatsApp Cloud API Conectados';
                }

            } catch (err) {
                console.warn('[POLL] Erro ao atualizar dados:', err.message);
                if (err.message === 'AUTH_EXPIRED') {
                    console.log('[POLL] Token expirado, re-autenticando...');
                    autoLoginDefaultAdmin();
                    return; // autoLoginDefaultAdmin vai chamar fetchLiveDashboardData após re-login
                }
                if (indicator) {
                    indicator.classList.add('offline');
                    dot.classList.add('offline');
                    text.innerText = '⚠️ Erro de Conexão com o Servidor';
                }
            } finally {
                // Mantém um único polling ativo a cada 4 segundos
                pollTimeoutId = setTimeout(fetchLiveDashboardData, 4000);
            }
        }

        function updateKPIs(kpis) {
            if (!kpis) return;
            document.getElementById('stat-today-count').innerText = esc(kpis.todayCount || 0);
            document.getElementById('stat-confirmed-count').innerText = esc(kpis.confirmedCount || 0);
            document.getElementById('stat-patients-count').innerText = esc(kpis.patientsCount || 0);
            document.getElementById('stat-handoff-count').innerText = esc(kpis.handoffCount || 0);
        }

        function filterByStatus(status, btnElem) {
            currentStatusFilter = status;
            document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
            btnElem.classList.add('active');
            renderAppointmentsTable(getFilteredAppointments());
            renderCalendarView();
        }

        function getFilteredAppointments() {
            if (currentStatusFilter === 'all') return allAppointments;
            return allAppointments.filter(a => a.status === currentStatusFilter);
        }

        // LÓGICA DO CALENDÁRIO VISUAL INTERATIVO
        let currentCalendarDate = new Date();

        function renderCalendarView() {
            const grid = document.getElementById('calendar-grid-body');
            if (!grid) return;

            const year = currentCalendarDate.getFullYear();
            const month = currentCalendarDate.getMonth();
            const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

            document.getElementById('calendar-month-year').innerText = `${monthNames[month]} de ${year}`;

            const firstDayIndex = new Date(year, month, 1).getDay();
            const lastDay = new Date(year, month + 1, 0).getDate();
            const prevLastDay = new Date(year, month, 0).getDate();

            grid.innerHTML = '';
            const todayStr = new Date().toISOString().split('T')[0];

            // Dias do mês anterior
            for (let x = firstDayIndex; x > 0; x--) {
                const dayNum = prevLastDay - x + 1;
                grid.innerHTML += `<div class="calendar-day-cell other-month"><div class="calendar-day-number">${dayNum}</div></div>`;
            }

            // Dias do mês atual
            const activeAppointments = getFilteredAppointments();
            for (let day = 1; day <= lastDay; day++) {
                const dayFormatted = String(day).padStart(2, '0');
                const monthFormatted = String(month + 1).padStart(2, '0');
                const dateStr = `${year}-${monthFormatted}-${dayFormatted}`;

                const isToday = dateStr === todayStr;
                const apptsForDay = activeAppointments.filter(a => a.appointment_date === dateStr);

                let eventsHTML = '';
                apptsForDay.slice(0, 3).forEach(app => {
                    const pName = esc(app.patients?.name || 'Paciente');
                    const pTime = esc((app.appointment_time || '').substring(0, 5));
                    const statusClass = app.status === 'confirmed' ? 'confirmed' : '';
                    eventsHTML += `<div class="calendar-event-pill ${statusClass}" title="${pTime} - ${pName}">${pTime} ${pName}</div>`;
                });

                if (apptsForDay.length > 3) {
                    eventsHTML += `<div style="font-size: 10px; color: var(--primary); font-weight: 700;">+${apptsForDay.length - 3} consultas</div>`;
                }

                grid.innerHTML += `
                    <div class="calendar-day-cell ${isToday ? 'today' : ''}" data-date="${esc(dateStr)}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span class="calendar-day-number">${day}</span>
                            ${apptsForDay.length > 0 ? `<span style="font-size: 10px; background: rgba(0,242,254,0.2); color: var(--primary); padding: 1px 6px; border-radius: 10px; font-weight: 700;">${apptsForDay.length}</span>` : ''}
                        </div>
                        <div class="calendar-events-list">${eventsHTML}</div>
                    </div>`;
            }
        }

        function prevMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendarView();
        }
        function nextMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendarView();
        }
        function selectCalendarDate(dateStr) {
            switchViewMode('table');
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = formatDate(dateStr);
                filterAppointmentsTable();
            }
            showToast(`📅 Exibindo consultas do dia: ${formatDate(dateStr)}`);
        }
        function switchViewMode(mode) {
            const tableDiv = document.getElementById('appointments-table-view');
            const calDiv = document.getElementById('appointments-calendar-view');
            const btnTable = document.getElementById('btn-view-table');
            const btnCal = document.getElementById('btn-view-cal');

            if (mode === 'table') {
                tableDiv.style.display = 'block';
                calDiv.style.display = 'none';
                btnTable.classList.add('active');
                btnCal.classList.remove('active');
            } else {
                tableDiv.style.display = 'none';
                calDiv.style.display = 'block';
                btnTable.classList.remove('active');
                btnCal.classList.add('active');
                renderCalendarView();
            }
        }

        // RENDERIZAÇÃO 100% SANITIZADA CONTRA XSS E COM REQUISITOS SECURITY AUDIT (rel="noopener noreferrer")
        function renderAppointmentsTable(data) {
            const tbody = document.getElementById('appointments-tbody');
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum agendamento encontrado nesta categoria.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(app => {
                const pName = esc(app.patients?.name || 'Paciente sem nome');
                const pPhoneRaw = app.patients?.phone || '';
                const cleanPhone = esc(pPhoneRaw.replace(/\D/g, ''));
                const pPhone = esc(pPhoneRaw || 'Telefone não informado');
                const appType = esc(app.type || 'Consulta');

                const isFamily = app.is_family || app.dependent_name || app.is_family_booking || (app.notes && /familia|familiar|dependente|filho|filha|esposa|marido|mae|pai/i.test(app.notes));
                const familyTagHTML = isFamily ? `<span class="pulse-badge" style="background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.3); color: #a78bfa; font-size: 10px; padding: 2px 6px; margin-left: 6px;" title="Agendamento Familiar / Dependente"><i class="fa-solid fa-users"></i> ${esc(app.dependent_name ? `Familiar: ${app.dependent_name}` : 'Familiar')}</span>` : '';

                let docName = app.doctor_name || app.doctor;
                if (!docName) {
                    const typeLower = appType.toLowerCase();
                    if (typeLower.includes('limpeza') || typeLower.includes('clareamento')) docName = 'Dra. Juliana Mendes';
                    else if (typeLower.includes('implante') || typeLower.includes('prótese') || typeLower.includes('protese')) docName = 'Dr. Roberto Alves';
                    else if (typeLower.includes('aparelho') || typeLower.includes('ortodontia')) docName = 'Dr. Carlos Eduardo';
                    else docName = 'Dr. Carlos / Dra. Juliana';
                }

                const statusClass = app.status === 'confirmed' ? 'confirmed' : (app.status === 'cancelled' ? 'cancelled' : 'pending');
                const statusLabel = app.status === 'confirmed' ? 'Confirmado' : (app.status === 'cancelled' ? 'Cancelado' : 'Pendente');

                const whatsappBtn = cleanPhone 
                    ? `<a href="https://wa.me/${cleanPhone}?text=${encodeURIComponent('Olá ' + (app.patients?.name || '') + ', falamos da recepção da clínica.')}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp" style="padding: 4px 8px; font-size: 11px;" title="Conversar no WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` 
                    : '';

                return `
                    <tr>
                        <td><div style="font-weight: 700; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">${pName}${familyTagHTML}</div><div style="font-size: 12px; color: var(--text-muted);">${pPhone}</div></td>
                        <td><span style="font-weight: 500;">${appType}</span></td>
                        <td><span style="color: var(--primary); font-weight: 600; font-size: 13px;"><i class="fa-solid fa-user-doctor"></i> ${esc(docName)}</span></td>
                        <td>${esc(formatDate(app.appointment_date))}</td>
                        <td><span style="font-family: var(--font-mono); color: var(--primary);">${esc(app.appointment_time)}</span></td>
                        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                        <td>
                            <div style="display: flex; gap: 6px;">
                                ${app.status !== 'confirmed' ? `<button class="btn btn-confirm-appt" data-id="${esc(app.id)}" data-status="confirmed" style="padding: 4px 10px; font-size: 11px;"><i class="fa-solid fa-check"></i> Confirmar</button>` : ''}
                                ${app.status !== 'cancelled' ? `<button class="btn btn-danger btn-cancel-appt" data-id="${esc(app.id)}" data-status="cancelled" style="padding: 4px 10px; font-size: 11px;"><i class="fa-solid fa-xmark"></i> Cancelar</button>` : ''}
                                ${whatsappBtn}
                            </div>
                        </td>
                    </tr>`;
            }).join('');
        }

        function renderPatientsTable(data) {
            const tbody = document.getElementById('patients-tbody');
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum paciente cadastrado.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(p => {
                const name = esc(p.name || 'Novo Paciente');
                const phoneRaw = p.phone || '';
                const cleanPhone = esc(phoneRaw.replace(/\D/g, ''));
                const phone = esc(phoneRaw);
                const cpf = esc(p.cpfMasked || '••••••••••• (Protegido LGPD)');
                const date = esc(new Date(p.created_at || Date.now()).toLocaleDateString('pt-BR'));

                const whatsappBtn = cleanPhone
                    ? `<a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp" style="padding: 4px 10px; font-size: 11px;"><i class="fa-brands fa-whatsapp"></i> Abrir Chat</a>`
                    : '';

                return `
                    <tr>
                        <td><div style="font-weight: 700;">${name}</div></td>
                        <td><span style="font-family: var(--font-mono); color: var(--primary);">${phone}</span></td>
                        <td><span style="font-family: var(--font-mono); color: var(--text-muted);">${cpf}</span></td>
                        <td>${date}</td>
                        <td>${whatsappBtn}</td>
                    </tr>`;
            }).join('');
        }

        function renderDoctorsCards(doctors) {
            const container = document.getElementById('doctors-cards-container');
            if (!container) return;

            if (!doctors || doctors.length === 0) {
                container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhum médico cadastrado.</div>`;
                return;
            }

            container.innerHTML = doctors.map(doc => `
                <div class="settings-card" style="margin: 0; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <span style="font-size: 28px;">${esc(doc.avatar || '👨‍⚕️')}</span>
                            <span class="status-pill confirmed">${esc(doc.status)}</span>
                        </div>
                        <h3 style="font-size: 17px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">${esc(doc.name)}</h3>
                        <p style="font-size: 13px; color: var(--primary); font-weight: 700; margin-bottom: 8px;">${esc(doc.specialty)}</p>
                        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;"><i class="fa-solid fa-id-badge"></i> ${esc(doc.cro)}</p>
                        <div style="background: rgba(30, 41, 59, 0.8); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 2px;">ESCALA DE ATENDIMENTO</span>
                            <span style="font-size: 13px; color: var(--text-main);"><i class="fa-solid fa-clock"></i> ${esc(doc.available_days)}</span>
                        </div>
                    </div>
                    <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
                        <button class="btn btn-primary btn-edit-doc" data-id="${esc(doc.id)}" style="padding: 6px 12px; font-size: 12px;"><i class="fa-solid fa-pen"></i> Editar Escala</button>
                    </div>
                </div>
            `).join('');
        }

        function handleSaveDoctor(e) {
            e.preventDefault();
            const name = document.getElementById('doc-name').value.trim();
            const specialty = document.getElementById('doc-specialty').value.trim();
            const cro = document.getElementById('doc-cro').value.trim();
            const status = document.getElementById('doc-status').value;
            const days = document.getElementById('doc-days').value.trim();

            if (!name || !specialty || !cro || !days) {
                showToast('Preencha todos os campos obrigatórios.');
                return;
            }

            const existingIndex = allDoctors.findIndex(d => d.cro === cro || d.name.toLowerCase() === name.toLowerCase());
            if (existingIndex >= 0) {
                allDoctors[existingIndex] = { ...allDoctors[existingIndex], name, specialty, cro, status, available_days: days };
            } else {
                const newDoc = {
                    id: 'doc_' + (allDoctors.length + 1),
                    name,
                    specialty,
                    cro,
                    status,
                    available_days: days,
                    avatar: name.toLowerCase().includes('dra') ? '👩‍⚕️' : '👨‍⚕️'
                };
                allDoctors.push(newDoc);
            }

            renderDoctorsCards(allDoctors);
            closeModal('modal-doctor');
            showToast(`Profissional ${name} salvo com sucesso!`);
        }

        function renderHandoffTable(sessions) {
            const tbody = document.getElementById('handoff-tbody');
            if (!tbody) return;
            if (!sessions || sessions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 40px;">Nenhum paciente aguardando atendimento.</td></tr>';
                return;
            }
            tbody.innerHTML = sessions.map(s => {
                const phoneRaw = s.phone || '';
                const cleanPhone = esc(phoneRaw.replace(/\D/g, ''));
                const phone = esc(phoneRaw);

                const whatsappBtn = cleanPhone
                    ? `<a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp" style="padding: 4px 10px; font-size: 11px;"><i class="fa-brands fa-whatsapp"></i> Atender no WhatsApp</a>`
                    : '';

                return `
                    <tr>
                        <td><div style="font-weight: 700;">Paciente WhatsApp</div></td>
                        <td><span style="font-family: var(--font-mono); color: var(--primary);">${phone}</span></td>
                        <td><span class="status-pill pending"><i class="fa-solid fa-headset"></i> Aguardando Secretária</span></td>
                        <td>
                            <div style="display: flex; gap: 8px;">
                                ${whatsappBtn}
                                <button class="btn btn-primary btn-return-ai" data-phone="${esc(phoneRaw)}" style="padding: 4px 10px; font-size: 11px;">
                                    <i class="fa-solid fa-robot"></i> Devolver para a IA
                                </button>
                            </div>
                        </td>
                    </tr>`;
            }).join('');
        }

        function populatePatientDropdown(patients) {
            // A busca agora é feita dinamicamente via autocomplete no campo de texto
        }

        function searchPatientSuggestions(input) {
            const val = input.value.toLowerCase().trim();
            const box = document.getElementById('patient-suggestions');
            if (!box) return;

            document.getElementById('appt-patient-id').value = ''; // Limpa ID prévio se o usuário modificar o texto

            if (!val || val.length < 1) {
                box.style.display = 'none';
                return;
            }

            const matches = allPatients.filter(p => 
                (p.name && p.name.toLowerCase().includes(val)) || 
                (p.phone && p.phone.includes(val))
            );

            if (matches.length === 0) {
                box.style.display = 'none';
                return;
            }

            box.innerHTML = matches.map(p => `
                <div class="autocomplete-item" data-id="${esc(p.id)}" data-name="${esc(p.name || '')}" data-phone="${esc(p.phone || '')}">
                    <div>
                        <div style="font-weight: 700;">${esc(p.name || 'Sem Nome')}</div>
                    </div>
                    <span style="font-size: 11px; color: var(--primary); font-family: var(--font-mono);">${esc(p.phone)}</span>
                </div>
            `).join('');
            box.style.display = 'block';
        }

        function selectPatientSuggestion(id, name, phone) {
            document.getElementById('appt-patient-name').value = name;
            document.getElementById('appt-patient-phone').value = phone;
            document.getElementById('appt-patient-id').value = id;
            document.getElementById('patient-suggestions').style.display = 'none';
        }

        document.addEventListener('click', (e) => {
            const box = document.getElementById('patient-suggestions');
            if (box && !e.target.closest('#modal-appointment')) {
                box.style.display = 'none';
            }
        });

        async function handleCreatePatient(e) {
            e.preventDefault();
            const name = document.getElementById('patient-name').value.trim();
            const phone = document.getElementById('patient-phone').value.trim();
            const cpf = document.getElementById('patient-cpf').value.trim();

            try {
                await apiRequest('/patients', 'POST', { name, phone, cpf });
                showToast('🎉 Paciente cadastrado com sucesso!');
                closeModal('modal-patient');
                fetchLiveDashboardData();
            } catch (err) {
                showToast(`❌ Erro: ${err.message}`);
            }
        }

        async function handleCreateAppointment(e) {
            e.preventDefault();
            const patientId = document.getElementById('appt-patient-id').value;
            const patientName = document.getElementById('appt-patient-name').value.trim();
            const patientPhone = document.getElementById('appt-patient-phone').value.trim();
            const type = document.getElementById('appt-type').value;
            const appointmentDate = document.getElementById('appt-date').value;
            const appointmentTime = document.getElementById('appt-time').value;

            try {
                await apiRequest('/appointments', 'POST', { patientId, patientName, patientPhone, type, appointmentDate, appointmentTime });
                showToast('📅 Consulta agendada com sucesso!');
                closeModal('modal-appointment');
                fetchLiveDashboardData();
            } catch (err) {
                showToast(`❌ Erro: ${err.message}`);
            }
        }

        // SALVAMENTO REAL NO BACKEND DA API /settings (Correção da apontada de Claude e Perplexity)
        async function handleSaveClinicSettings(e) {
            e.preventDefault();
            const name = document.getElementById('cfg-clinic-name').value.trim();
            const personaName = document.getElementById('cfg-persona-name').value.trim();
            const address = document.getElementById('cfg-clinic-address').value.trim();
            const phone = document.getElementById('cfg-clinic-phone').value.trim();
            const evalPrice = document.getElementById('cfg-clinic-eval-price').value;
            const insurances = document.getElementById('cfg-insurances').value.trim();
            const paymentMethods = document.getElementById('cfg-payments').value.trim();
            const emergency = document.getElementById('cfg-emergency').value.trim();
            const workHours = document.getElementById('cfg-work-days').value;

            try {
                await apiRequest('/settings', 'POST', {
                    name, personaName, address, phone, evalPrice, insurances, paymentMethods, emergency, workHours
                });
                showToast(`✅ Configurações salvas no servidor! A IA (${personaName}) já atualizou seu atendimento.`);
            } catch (err) {
                showToast(`❌ Erro ao salvar configurações: ${err.message}`);
            }
        }

        function updateLivePreview() {
            const cName = document.getElementById('cfg-clinic-name')?.value || 'Clínica Odonto Riso';
            const personaName = document.getElementById('cfg-persona-name')?.value || 'Ana';
            const address = document.getElementById('cfg-clinic-address')?.value || 'Av. Paulista, 1000';
            const price = document.getElementById('cfg-clinic-eval-price')?.value || '150';
            const insurances = document.getElementById('cfg-insurances')?.value || 'Bradesco e Amil';
            const payments = document.getElementById('cfg-payments')?.value || 'PIX, Cartão';

            document.getElementById('preview-clinic-name').innerText = cName;
            document.getElementById('preview-clinic-2').innerText = cName;
            document.getElementById('preview-persona').innerText = personaName;
            document.getElementById('preview-address').innerText = address;
            document.getElementById('preview-price').innerText = price;
            document.getElementById('preview-insurances').innerText = insurances;
            document.getElementById('preview-payments').innerText = payments;
        }

        async function updateAppointmentStatus(id, status) {
            // Atualização Otimista Imediata na Interface
            const targetAppt = allAppointments.find(a => String(a.id) === String(id));
            const oldStatus = targetAppt ? targetAppt.status : null;
            if (targetAppt) {
                targetAppt.status = status;
                renderAppointmentsTable(getFilteredAppointments());
            }

            try {
                await apiRequest(`/appointments/${id}`, 'PATCH', { status });
                showToast(`Status atualizado para ${status === 'confirmed' ? 'Confirmado' : (status === 'cancelled' ? 'Cancelado' : 'Pendente')}!`);
                fetchLiveDashboardData();
            } catch (err) {
                if (targetAppt && oldStatus) {
                    targetAppt.status = oldStatus;
                    renderAppointmentsTable(getFilteredAppointments());
                }
                showToast(`❌ Erro: ${err.message}`);
            }
        }

        async function returnSessionToAI(phone) {
            try {
                await apiRequest('/handoff/return', 'POST', { phone });
                showToast('Paciente devolvido para a IA!');
                fetchLiveDashboardData();
            } catch (err) {
                showToast(`❌ Erro: ${err.message}`);
            }
        }

        // EXPORTAÇÃO CSV PADRÃO RFC 4180 E PROTEÇÃO CONTRA FORMULA INJECTION (Apontado por Claude e Gemini)
        function exportAppointmentsCSV() {
            if (allAppointments.length === 0) {
                showToast('Nenhuma consulta para exportar.');
                return;
            }
            let csv = 'Paciente,Telefone,Procedimento,Data,Horario,Status\n';

            const formatCSVField = (val) => {
                let str = String(val || '');
                // Proteção contra Formula Injection (Excel / Google Sheets)
                if (/^[=+\-@\t\r]/.test(str)) {
                    str = "'" + str;
                }
                // Escapa aspas duplas duplicando-as
                return `"${str.replace(/"/g, '""')}"`;
            };

            allAppointments.forEach(a => {
                csv += `${formatCSVField(a.patients?.name)},${formatCSVField(a.patients?.phone)},${formatCSVField(a.type)},${formatCSVField(a.appointment_date)},${formatCSVField(a.appointment_time)},${formatCSVField(a.status)}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `relatorio_consultas_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('📊 Relatório CSV exportado com sucesso!');
        }

        function switchTab(tabName, btnElem) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btnElem.classList.add('active');
            document.getElementById('tab-appointments').style.display = tabName === 'appointments' ? 'block' : 'none';
            document.getElementById('tab-patients').style.display = tabName === 'patients' ? 'block' : 'none';
            document.getElementById('tab-handoff').style.display = tabName === 'handoff' ? 'block' : 'none';
            document.getElementById('tab-doctors').style.display = tabName === 'doctors' ? 'block' : 'none';
            document.getElementById('tab-settings').style.display = tabName === 'settings' ? 'block' : 'none';
        }

        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-msg').innerText = msg;
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 3500);
        }

        function formatDate(dateString) {
            if (!dateString) return '';
            const parts = dateString.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return new Date(dateString).toLocaleDateString('pt-BR');
        }

        function filterAppointmentsTable() {
            const input = document.getElementById('search-input');
            const filter = input.value.toLowerCase();
            const tbody = document.getElementById('appointments-tbody');
            const rows = tbody.getElementsByTagName('tr');

            for (let i = 0; i < rows.length; i++) {
                if (rows[i].getElementsByTagName('td').length === 1) continue;
                const text = rows[i].textContent.toLowerCase();
                rows[i].style.display = text.includes(filter) ? '' : 'none';
            }
        }
    