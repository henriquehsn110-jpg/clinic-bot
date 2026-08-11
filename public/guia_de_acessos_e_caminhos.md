# 🔑 GUIA MESTRE DE ACESSOS, LINKS E PLATAFORMAS — CLINICABOT SAAS PRO

> **Documento Oficial de Referência Operacional & Resolução de Problemas**  
> *Este guia reúne todas as contas nas plataformas de nuvem, e-mails de acesso, URLs dos painéis, logins de demonstração, regras de onboarding, migração de planos e o Manual Passo a Passo de Resolução de Problemas para Iniciantes.*

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

## 💻 4. GUIA RÁPIDO DO TERMINAL & GESTÃO DE PLANOS

Sempre abra o terminal do **Antigravity IDE** ou **PowerShell** e navegue para a pasta do backend primeiro:

```powershell
cd clinic-bot-backend
```

### 🔹 A. Cadastrar uma Nova Clínica Cliente (Onboarding)
```powershell
node scripts/onboard_tenant.js --name "Nome da Clínica" --slug "nome-da-clinica" --plan "growth" --phone-id "PHONE_ID_META" --token "TOKEN_META"
```
*(Opções de plano: `starter`, `growth` ou `enterprise`)*

---

### 🔹 B. Migrar ou Atualizar Plano de um Cliente (Upgrade / Downgrade)
Sempre que uma clínica solicitar upgrade de plano (ex: de **Starter** para **Growth** ou **Enterprise**), rode o comando único:

```powershell
node scripts/onboard_tenant.js --update-plan --slug "SLUG_DA_CLINICA" --plan "NOVO_PLANO"
```

---

### 🔹 C. Testar se o Servidor na Nuvem está Online (Health Check)
```powershell
node -e "require('axios').get('https://clinic-bot-zksc.onrender.com/health').then(r => console.log(r.data))"
```

---

### 🔹 D. Publicar Atualizações no Servidor (Deploy no Render)
```powershell
git add .
git commit -m "feat: atualizações do sistema"
git push origin main
```

---

### 🔹 E. Rodar Suíte Completa de QA (38 Testes Automatizados)
```powershell
npm test
```

---

## 🆘 5. GUIA DE RESOLUÇÃO DE PROBLEMAS PARA INICIANTES (TROUBLESHOOTING SIMPLIFICADO)

Se surgir qualquer dúvida ou contratempo no dia a dia, siga esta tabela de solução imediata:

| O que aconteceu? | Causa Provável | Como Resolver em 1 Minuto |
| :--- | :--- | :--- |
| **1. Deu erro `Cannot find module` ao rodar o comando no terminal.** | O terminal está fora da pasta do backend (ex: em `ClinicaBot` ou `System32`). | Digite `cd clinic-bot-backend` no terminal e aperte Enter. Depois tente o comando novamente. |
| **2. O robô parou de responder no WhatsApp da clínica.** | O Token da Meta WhatsApp expirou ou o servidor dormiu. | 1. Clique no link de [Health Check](https://clinic-bot-zksc.onrender.com/health) para verificar se o servidor responde.<br>2. Se o servidor responder `ok`, acesse o [Meta Developers](https://developers.facebook.com) e renove o Token do WhatsApp. |
| **3. A secretária não consegue entrar no Dashboard.** | E-mail ou slug digitado com erro de digitação. | Acesse a URL oficial `https://clinic-bot-zksc.onrender.com/dashboard` e verifique se o slug da clínica foi digitado em minúsculas (ex: `clinica-modelo`). |
| **4. Deu erro `Slug já existe` ao cadastrar nova clínica.** | Você tentou usar um slug que já foi cadastrado anteriormente. | Escolha outro slug único adicionando um sufixo (ex: em vez de `odonto-prime`, use `odonto-prime-sp`). |
| **5. O botão interativo de WhatsApp falhou no celular do paciente.** | Instabilidade temporária nos servidores da Meta. | O ClinicaBot tem fallback automático! Se os botões falharem, o sistema converte sozinho a mensagem para texto numerado (ex: `1. Confirmar`). Não precisa fazer nada. |
| **6. Quero ver o que aconteceu no atendimento sem ver CPFs dos pacientes.** | Mascaramento de dados em conformidade com a LGPD. | Acesse a aba Transbordo Humano no Dashboard ou o portal do [Sentry](https://sentry.io), onde todos os dados confidenciais aparecem como `[CPF_REDACTED]`. |

---

## 📋 6. RESUMO DE CONTATOS E E-MAILS DE SUPORTE
- **E-mail Principal do Gestor:** `henrique.hsn.110@gmail.com`
- **Ambiente de Desenvolvimento:** Antigravity IDE 2.0 (Windows)
- **Fuso Horário Oficial:** `America/Sao_Paulo` (Horário de Brasília)
