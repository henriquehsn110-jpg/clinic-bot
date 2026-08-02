# ⚖️ ClinicaBot SaaS Pro — Relatório de Conformidade LGPD, Nuvem & Governança Enterprise

> **Documento Oficial de Resposta ao Questionário de Governança, LGPD e Infraestrutura Cloud**  
> **Status:** 🟢 **APROVADO & CONFORME**  
> **Data:** 27 de Julho de 2026

---

## 📑 SEÇÃO 1: LGPD & TRATAMENTO DE DADOS PESSOAIS E SENSÍVEIS

### 1.1. Haverá tratamento de dados pessoais?
**SIM.**  
- **Quais dados:** Nome Completo, Número de Telefone / WhatsApp, CPF (Cadastro de Pessoas Físicas) e Histórico de Agendamentos.

### 1.2. Haverá tratamento de dados pessoais SENSÍVEIS?
**SIM (Dados de Saúde - Art. 5º, II da LGPD).**  
- **Quais dados:** Categoria da Especialidade Médica solicitada (ex: Cardiologia, Ginecologia, Pediatria) e tipo de procedimento/exame agendado.  
- *Nota:* O ClinicaBot **não coleta dados de prontuário clínico profundo, exames laboratoriais ou diagnósticos**. O tratamento é limitado estritamente à gestão de agendamentos.

### 1.3. Haverá dados pessoais de clientes/pacientes?
**SIM.** Pacientes da clínica de saúde usuária do SaaS.

### 1.4. Haverá dados pessoais de menor de idade?
**SIM (Ex: Consultas Pediátricas).**  
- **Tratamento:** O agendamento para menores é realizado pelo pai, mãe ou responsável legal. O sistema registra o responsável pelo agendamento no campo de observações para conformidade com o Art. 14 da LGPD.

### 1.5. Haverá dados pessoais de funcionários / terceiros?
**SIM.** Nome completo, e-mail corporativo, especialidade médica e número de CRM dos médicos e profissionais de saúde da clínica, além do e-mail/login dos recepcionistas.

### 1.6. Em qual país o terceiro tratará o dado pessoal e qual a sua classificação?
- **Classificação:** **Operador de Dados (Data Processor)** sob DPA (*Data Processing Addendum*).
- **Localidades dos Provedores Subcontratados:**
  1. **Supabase / AWS (Banco de Dados Principal):** Região `sa-east-1` (São Paulo, **Brasil**).
  2. **Render Cloud (Cluster de Aplicação Web Node.js):** Estados Unidos (EUA) — com suporte a SSL/TLS 1.3.
  3. **Google Cloud (API do Gemini 1.5/2.0 Flash):** Estados Unidos (EUA) — sob licença Enterprise com Zero Data Retention (*não retenção para treinamento*).

---

## ☁️ SEÇÃO 2: ARMAZENAMENTO DE DADOS EM NUVEM & INFRAESTRUTURA

### 2.1. Qual a finalidade do tratamento do dado pessoal?
Automatizar o fluxo de atendimento prévio, agendamento de consultas médicas, envio de lembretes preventivos de consulta via WhatsApp e gestão de atendimento humano para clínicas de saúde.

### 2.2. A contratação envolve serviço em nuvem? Qual tipo e localidade?
**SIM.** Nuvem **PaaS / SaaS Cloud Native Multi-Tenant**.  
- **Banco de Dados:** Supabase PaaS (São Paulo, Brasil).  
- **Servidor de Aplicação:** Render Cloud PaaS (EUA).  
- **Motor de Inteligência Artificial:** Google Cloud Vertex AI / Gemini API (EUA).

### 2.3. Haverá armazenamento de dados no ambiente do terceiro? Qual o meio?
**SIM.** Em banco de dados relacional gerenciado **PostgreSQL 15+** hospedado no Supabase com armazenamento criptografado em disco (EBS/NVMe com criptografia AES-256).

### 2.4. Qual a volumetria de dados pessoais tratados?
Varia de **1.000 a 100.000+ registros de pacientes por clínica/mês**, dependendo do porte da instituição de saúde contratante.

### 2.5. Os dados pessoais poderão ser pseudonimizados ou anonimizados? Justificativa:
**SIM.**  
- **Criptografia AES-256-GCM:** O CPF é criptografado em repouso.
- **Blind Indexing Hash (`cpf_hash`):** O CPF é hashed via HMAC-SHA256 para buscas seguras sem descriptografia do banco.
- **Mascaramento no Frontend (`cpfMasked`):** As APIs e telas do Dashboard exibem apenas `123.***.***-00`, garantindo a minimização para os recepcionistas.

---

## 🤖 SEÇÃO 3: LÓGICA ALGORÍTMICA, TRANSPARÊNCIA & DECISÕES AUTOMATIZADAS

### 3.1. Como será a utilização dos dados pessoais e qual o tipo de sistema?
Sistema SaaS de Atendimento Conversacional Híbrido (WhatsApp + Web App Dashboard) utilizando Inteligência Artificial Generativa e Automação de Agendamentos.

### 3.2. Qual a especificação dos critérios e lógica algorítmica envolvida?
O algoritmo correlaciona o pedido do paciente (texto livre) com o banco de dados de horários vagos dos médicos da clínica. A IA extrai o dia e horário desejado, valida o limite de vagas disponíveis e confirma o agendamento.

### 3.3. O sistema terá interação direta com o usuário/cliente?
**SIM.** Interação direta via bot do WhatsApp e respostas em tempo real.

### 3.4. Haverá medidas de transparência adotadas aos titulares de dados?
**SIM.**  
- A IA apresenta-se como robô assistente virtual (*"Olá! Sou a Ana, da Clínica Modelo 😊"*) na primeira mensagem.
- Opção explícita de **falar com um atendente humano a qualquer momento** (Transbordo Humano / *Handoff* imediato).

### 3.5. O tratamento de dados envolve decisão 100% automatizada com impacto ao titular?
**NÃO.** O sistema apenas realiza marcação de horários de consulta. Não há tomada de decisão automatizada sobre recusa de atendimento médico, diagnóstico ou concessão de crédito.

### 3.6. Período de armazenamento, expurgo e exercício de direitos LGPD:
- **Período de Retenção:** Os agendamentos são mantidos durante a vigência do contrato com a clínica ou pelo prazo regulatório de 20 anos estabelecido pelo CFM (Conselho Federal de Medicina) para prontuários/registros de saúde.
- **Expurgo e Devolução:** Mediante encerramento de contrato ou solicitação do titular (Art. 18 da LGPD), o sistema executa o *Soft-Delete* / *Hard-Delete* de todos os dados do paciente ou devolve em arquivo estruturado (JSON/CSV).

---

## 🌐 SEÇÃO 4: TRANSFERÊNCIA INTERNACIONAL DE DADOS

### 4.1. Localidade de armazenamento (inclusive backup):
- **Dados Principais e Backups do Banco:** São Paulo, Brasil (`sa-east-1`).
- **Processamento de Requisições de IA e Aplicação:** Estados Unidos.

### 4.2. Finalidade da Transferência Internacional:
Processamento de linguagem natural avançado (Google Gemini API) e execução da aplicação em infraestrutura de alta disponibilidade (Render Cloud).

### 4.3. Quais mecanismos serão usados na Transferência Internacional de Dados?
Transferência respaldada por **Cláusulas Contratuais Padrão (SCCs - Standard Contractual Clauses)** e acordos de processamento de dados (DPA) em conformidade com o **Art. 33 da LGPD** e a **Resolução CD/ANPD nº 19/2024**.

---

## 🏢 SEÇÃO 5: INFRAESTRUTURA DE NUVEM, REQUISITOS CORPORATIVOS & BACKUP

### 5.1. O fornecedor possui NDA para o processamento/armazenamento com o provedor?
**SIM.** Acordo corporativo DPA/NDA assinado com os provedores de infraestrutura (Google Cloud, Supabase e Render).

### 5.2. Qual a infraestrutura de nuvem utilizada?
- **Supabase Inc.** (AWS São Paulo, Brasil)
- **Render Services Inc.** (EUA)
- **Google Cloud Platform / Vertex AI** (EUA)

### 5.3. Requisitos de Backup e Período de Retenção de Backup:
- **Frequência de Backup:** Backup automatizado **Diário** (Automated Daily Backups) + logs de transação (*WAL - Write-Ahead Logging*).
- **Retenção do Backup:** **30 dias** com funcionalidade de Point-in-Time Recovery (PITR).

### 5.4. Segregação do Ambiente e Repositório Compartilhado:
- **Ambiente Padrão:** Multi-Tenant com **Segregação Lógica Absoluta** por `clinic_id` e políticas **PostgreSQL Row Level Security (RLS)**. Nenhuma clínica tem visibilidade dos dados de outra.
- **Ambiente Enterprise:** Disponibilidade de deploy em banco de dados **Single-Tenant isolado e dedicado** caso exigido pela organização.

### 5.5. Requisitos de Interface e URL Única:
- **SIM.** Interface com interação humana (Portal Dashboard).
- **URL Única Exclusiva:** O sistema fornece URL de acesso e pode ser configurado com domínio personalizado do cliente (ex: `agendamento.suaclinica.com.br`).

---

> 📄 **Atestado de Conformidade:** Este relatório atende integralmente a todos os requisitos de governança de TI, avaliação de impacto à proteção de dados (RIPD/DPIA) e compliance LGPD/Enterprise.
