# 🧠 ClinicaBot SaaS Pro — Análise de Coleta & Processamento de Dados com IA Generativa

> **Escopo da Análise:** Ingestão de Dados, Privacidade, LGPD e Arquitetura de IA Generativa (Google Gemini Enterprise API).  
> **Data:** 27 de Julho de 2026

---

## 🎯 Resumo Executivo: Como a IA Coleta e Processa os Dados

No **ClinicaBot SaaS Pro**, a IA Generativa (Google Gemini 1.5/2.0 Flash) opera sob o modelo de **LLM como Serviço Corporativo (Enterprise LLM API)**. 

Isso significa que a IA **não "coleta" dados de forma autônoma ou passiva na internet**, nem armazena as conversas dos pacientes para aprendizado contínuo público. A IA recebe apenas os dados que o servidor backend injeta explicitamente no momento da requisição (*In-Context Prompting*).

---

## 📊 1. Fluxo de Ingestão: Quais Dados São Enviados para a IA?

Quando um paciente envia uma mensagem no WhatsApp, o backend do ClinicaBot monta um pacote de contexto restrito e envia para a API da IA:

1. **Mensagem do Paciente:** O texto da mensagem sanitizada (ex: *"Quero agendar uma consulta com cardiologista"*).
2. **Histórico da Sessão Ativa:** As últimas mensagens da conversa mantidas na tabela `sessions` do Supabase.
3. **Catálogo de Especialidades e Médicos:** As especialidades, horários livres e profissionais disponíveis para aquela clínica em particular (`clinic_id`).
4. **Nome do Paciente:** Nome higienizado (`extractCleanName`) para personalização do atendimento.

---

## 🛡️ 2. O que NUNCA é Enviado para a IA (Minimização LGPD)

Para garantir 100% de conformidade com a LGPD e regras de segurança corporativa:

- ❌ **CPF do Paciente:** **NUNCA** é enviado no prompt da IA. A coleta, validação matemática do dígito verificador e a consulta no banco de dados ocorrem de forma 100% determinística no código backend (`conversationController.js` e `databaseService.js`).
- ❌ **Dados Financeiros / Cartões:** Não passam pela IA.
- ❌ **Dados de Outras Clínicas:** Impossível ocorrer contaminação de contexto. O backend filtra exclusivamente os dados da clínica dona do WhatsApp ativo.

---

## 🔒 3. Política de Privacidade & Não-Treinamento (Zero Data Retention)

Uma das maiores dúvidas corporativas sobre IA Generativa é: *"Os dados da minha clínica serão usados para treinar a IA do Google?"*

### 🟢 A Resposta no ClinicaBot é: **NÃO.**

- **Contrato Google Cloud Enterprise API:** As chamadas à API do Gemini via SDK oficial utilizam o modelo **Zero Data Retention / Privacy Shield**.
- **Sem Re-Treinamento:** As mensagens enviadas e as respostas geradas **não são utilizadas para treinar, ajustar ou aprimorar os modelos públicos da Google**.
- **Stateless Requests:** A API do Gemini trata cada requisição como isolada. Quando a resposta é entregue ao ClinicaBot, a memória da sessão no lado da Google é descartada.

---

## ⚙️ 4. Como os Dados São Extraídos e Processados da Resposta da IA

A IA Generativa no ClinicaBot atua em duas frentes:

1. **Geração de Linguagem Natural (NLG):** Responde dúvidas com empatia humana (Persona *Ana* 😊), formata opções de horários e esclarece local/endereço da clínica.
2. **Reconhecimento de Intenção (Intent Parsing):** O backend analisa o retorno da IA e as escolhas do paciente para executar ações concretas no banco de dados:
   - Identificou escolha de data/horário ➔ Atualiza o rascunho `sessions.draft`.
   - Identificou confirmação final ➔ Cria o agendamento oficial na tabela `appointments`.
   - Identificou pedido de atendente humano ➔ Ativa o flag `transferToHuman` e notifica o Dashboard.

---

## 📋 Resumo para Auditoria e Compliance LGPD

| Pergunta de Compliance | Resposta Técnica |
| :--- | :--- |
| **A IA coleta dados automaticamente?** | Não. Recebe apenas o texto enviado pelo paciente e o contexto fornecido pelo backend. |
| **A IA armazena dados em seus próprios servidores?** | Não. O estado fica armazenado 100% no Supabase do ClinicaBot. A API do Gemini é *stateless*. |
| **Os dados são usados para treinar o modelo da IA?** | Não. A licença corporativa via API proíbe a retenção para treinamento de modelos públicos. |
| **Como dados sensíveis (CPF) são tratados?** | Isolados do prompt da IA. Validados matematicamente e criptografados em repouso com **AES-256-GCM**. |
| **Como é garantido o isolamento de dados entre clínicas?** | Cada requisição à IA injeta apenas o catálogo de horários e regras da clínica autenticada por `clinic_id`. |
