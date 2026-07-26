const fs = require('fs');
let text = fs.readFileSync('services/databaseService.js', 'utf8');

if (!text.includes('getAll: async ()')) {
  const newFunc = `
        getAll: async () => {
            try {
                const { data, error } = await supabase.from('clinics').select('*');
                if (error) throw error;
                return data;
            } catch (err) {
                logger.error('DB_CLINICS_GETALL', err.message);
                return [];
            }
        }`;
  
  text = text.replace(/findByPhoneNumberId:\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*\}/s, match => match + ',' + newFunc);
  fs.writeFileSync('services/databaseService.js', text);
  console.log('Added getAll to clinics');
} else {
  console.log('getAll already exists');
}
