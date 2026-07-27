---
name: multitenant-clinic-id
activation: glob
glob: "clinic-bot-backend/{controllers,services}/**/*.js"
---

# Regra Inviolável de Isolamento Multi-Tenant & `clinicId`

1. **Parâmetro Obligatório:**  
   Toda e qualquer função de `databaseService.js` ou `calendarService.js` que receba `clinicId` DEVE verificar no início:
   ```javascript
   if (!clinicId) throw new Error('clinicId é obrigatório');
   ```
   NUNCA use fallbacks silenciosos ou atribuições de ID hardcoded se `clinicId` for nulo.

2. **Propagação de `clinicId` em Chamadas de Pacientes:**  
   Todas as chamadas para `db.patients.findOrCreate`, `db.patients.updateName`, `db.patients.updateCpf` e `db.patients.findByCpf` DEVEM passar o `clinicId` como argumento explícito.

3. **Proibição de Catch Silencioso:**  
   NUNCA utilize `.catch(() => [])` ou `try {} catch {}` silenciosos que descartem erros de banco de dados ou ausência de `clinicId`. Registre o erro no `logger.error` antes de tratar qualquer exceção.

4. **Constraint Composta Supabase:**  
   Lembre-se que a tabela `patients` utiliza a constraint `UNIQUE (phone, clinic_id)`. Toda e qualquer operação de busca ou inserção deve estar devidamente escopada por clínica.
