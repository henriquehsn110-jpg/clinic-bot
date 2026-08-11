# 🔑 GUIA MESTRE DE ACESSOS, LINKS E PLATAFORMAS — CLINICABOT SAAS PRO

> **Documento Oficial de Referência Operacional para o Gestor e Família/Equipe**  
> *Este guia reúne todas as contas nas plataformas de nuvem, e-mails de acesso, URLs dos painéis, logins de demonstração, regras de onboarding e comandos do terminal.*

---

## 📌 1. LINKS PÚBLICOS E PAINÉIS DO SISTEMA

| Nome do Painel / Página | Para que serve? | Quando Acessar? | URL Oficial de Acesso |
| :--- | :--- | :--- | :--- |
| **🌐 Landing Page Comercial (Vendas)** | Página de apresentação B2B do ClinicaBot com simulador de WhatsApp e tabela de planos. | Enviar para clínicas parceiras, médicos e potenciais clientes. | [clinic-bot-zksc.onrender.com](https://clinic-bot-zksc.onrender.com/) |
| **🖥️ Portal Pro da Recepção (Dashboard)** | Painel de controle da clínica (Agenda visual, CRM, Transbordo Humano, Pacientes e Configurações). | No dia a dia da recepção para visualizar consultas, confirmar/cancelar e atender pacientes. | [clinic-bot-zksc.onrender.com/dashboard](https://clinic-bot-zksc.onrender.com/dashboard) |
| **🩺 Health Check de Produção** | Endpoint técnico que mostra o status do servidor e a conexão com o banco de dados. | Sempre que quiser verificar se o sistema está 100% online na nuvem. | [clinic-bot-zksc.onrender.com/health](https://clinic-bot-zksc.onrender.com/health) |

---

## ☁️ 2. CONTAS E ACESSOS ÀS PLATAFORMAS NA NUVEM

### 1. 🚀 Render (Hospedagem do Servidor Backend Node.js)
- **URL de Acesso:** [dashboard.render.com](https://dashboard.render.com)
- **E-mail de Login da Conta:** `henrique.hsn.110@gmail.com` *(Login via GitHub)*
- **Nome do Serviço Ativo:** `clinic-bot-zksc`
- **Quando Acessar:** Para conferir logs de produção, verificar o status de deploys do backend ou gerenciar variáveis de ambiente.

---

### 2. 🗄️ Supabase (Banco de Dados PostgreSQL Multi-Tenant)
- **URL de Acesso:** [supabase.com/dashboard](https://supabase.com/dashboard/project/vqnhtejriorlegqvtivq)
- **E-mail de Login da Conta:** `henrique.hsn.110@gmail.com`
- **ID do Projeto:** `vqnhtejriorlegqvtivq`
- **URL do Banco:** `https://vqnhtejriorlegqvtivq.supabase.co`
- **Quando Acessar:** Para visualizar tabelas (`clinics`, `patients`, `appointments`, `clinic_hours`), verificar backups ou consultar dados cadastrados.

---

### 3. 💬 Meta Developers (WhatsApp Cloud API Oficial)
- **URL de Acesso:** [developers.facebook.com](https://developers.facebook.com)
- **Conta de Login:** Meta Business / Facebook da clínica
- **Phone Number ID (Padrão):** `1240708369119720`
- **Verify Token Webhook:** `clinica_bot_seguro_2026`
- **Quando Acessar:** Para cadastrar novos números de WhatsApp de clientes, gerar Access Tokens permanentes ou validar Webhooks.

---

### 4. 📦 GitHub (Repositório do Código Fonte)
- **URL de Acesso:** [github.com/henriquehsn110-jpg/clinic-bot](https://github.com/henriquehsn110-jpg/clinic-bot)
- **Usuário / E-mail:** `henriquehsn110-jpg` / `henrique.hsn.110@gmail.com`
- **Quando Acessar:** Para acompanhar commits de atualização do sistema e sincronização automática com o Render.

---

### 5. 🔔 UptimeRobot (Monitoramento 24/7 de Uptime e Alertas por E-mail)
- **URL de Acesso:** [uptimerobot.com](https://uptimerobot.com/dashboard)
- **E-mail de Cadastro / Notificações:** `henrique.hsn.110@gmail.com`
- **Monitores Ativos:** `https://clinic-bot-zksc.onrender.com/health` (Checagem contínua a cada 5 min)
- **Quando Acessar:** Para conferir o gráfico de uptime (99.9%) ou cadastrar novos e-mails de alerta caso o servidor sofra instabilidade.

---

### 6. 🛡️ Sentry (Observabilidade & Erros Sanitizados LGPD)
- **URL de Acesso:** [sentry.io](https://sentry.io)
- **E-mail da Conta:** `henrique.hsn.110@gmail.com`
- **ID da Organização:** `o4511821389037568`
- **Quando Acessar:** Para investigar exceções técnicas ou relatórios de erro em tempo real com mascaramento automático de PII.

---

## 🔑 3. CREDENCIAIS DE LOGIN DE DEMONSTRAÇÃO (MODO TESTE)

Para demonstrar o painel da recepção para um cliente ou testar as abas do sistema:

- **URL do Dashboard:** `https://clinic-bot-zksc.onrender.com/dashboard`
- **E-mail de Login:** `admin@clinicamodelo.com.br`
- **Senha:** `123456`
- **Slug da Clínica:** `clinica-modelo`

---

## 💻 4. GUIA RÁPIDO DO TERMINAL (COMANDOS PRÁTICOS)

Sempre abra o terminal do **Antigravity IDE** ou **PowerShell** e navegue para a pasta do backend primeiro:

```powershell
cd clinic-bot-backend
```

### 🔹 A. Cadastrar uma Nova Clínica Cliente (Onboarding)
```powershell
node scripts/onboard_tenant.js --name "Nome da Clínica" --slug "nome-da-clinica" --phone-id "PHONE_ID_META" --token "TOKEN_META"
```

### 🔹 B. Testar se o Servidor na Nuvem está Online
```powershell
node -e "require('axios').get('https://clinic-bot-zksc.onrender.com/health').then(r => console.log(r.data))"
```

### 🔹 C. Publicar Atualizações no Servidor (Deploy no Render)
```powershell
git add .
git commit -m "feat: atualizações do sistema"
git push origin main
```

### 🔹 D. Rodar Suíte Completa de QA (38 Testes Automatizados)
```powershell
npm test
```

---

## 📋 5. RESUMO DE CONTATOS E E-MAILS DE SUPORTE
- **E-mail Principal do Gestor:** `henrique.hsn.110@gmail.com`
- **Ambiente de Desenvolvimento:** Antigravity IDE 2.0 (Windows)
- **Fuso Horário Oficial:** `America/Sao_Paulo` (Horário de Brasília)
