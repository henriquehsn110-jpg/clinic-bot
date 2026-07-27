---
name: timezone-brt-dates
activation: always_on
---

# Regra Inviolável de Fuso Horário BRT (`America/Sao_Paulo`) & Formatação de Datas

1. **Fuso Horário Obrigatório:**  
   NUNCA utilize `new Date().toISOString().split('T')[0]` nem `.toISOString()` para calcular a data corrente do sistema ou apresentar datas ao usuário. O servidor de produção roda em UTC, o que causa virada de data equivocada após as 21:00 BRT.

2. **Padrão Oficial de Data Atual:**  
   Utilize sempre o formato padronizado com timeZone explícito:
   ```javascript
   const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
   const now = new Date(brtString);
   const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
   ```

3. **Formato Exibido ao Paciente:**  
   Toda e qualquer data exibida para o paciente no chat do WhatsApp ou mensagens do bot DEVE estar no formato brasileiro **`DD/MM/YYYY`** (ex: `27/07/2026`). NUNCA exiba datas no formato ISO (`YYYY-MM-DD`) para o paciente.
