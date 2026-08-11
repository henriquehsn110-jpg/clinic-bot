require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
    const testPhone = '5511999DDLTEST';
    
    // 1. Find any existing clinic_id to use
    const { data: clinics } = await s.from('clinics').select('id, slug').limit(1);
    if (!clinics || clinics.length === 0) {
        console.error('No clinics found');
        process.exit(1);
    }
    const clinicId = clinics[0].id;
    console.log('Using clinic:', clinics[0].slug, clinicId);

    // 2. Clean up any leftover test data
    await s.from('patients').delete().eq('phone', testPhone);

    // 3. Insert first record
    const { data: ins1, error: err1 } = await s.from('patients').insert({ 
        phone: testPhone, 
        name: 'DDL Test 1', 
        clinic_id: clinicId 
    }).select();
    console.log('INSERT 1:', err1 ? `ERROR: ${JSON.stringify(err1)}` : `OK (id: ${ins1[0].id})`);

    // 4. Insert duplicate - this will reveal the exact constraint name and definition in the error
    const { data: ins2, error: err2 } = await s.from('patients').insert({ 
        phone: testPhone, 
        name: 'DDL Test 2', 
        clinic_id: clinicId 
    }).select();
    console.log('INSERT 2 (duplicate):', JSON.stringify(err2, null, 2));

    // 5. Now try to insert with same phone but different clinic (should succeed if partial index)
    const { data: otherClinics } = await s.from('clinics').select('id, slug').neq('id', clinicId).limit(1);
    if (otherClinics && otherClinics.length > 0) {
        const otherClinicId = otherClinics[0].id;
        console.log('\nUsing OTHER clinic:', otherClinics[0].slug, otherClinicId);
        const { data: ins3, error: err3 } = await s.from('patients').insert({ 
            phone: testPhone, 
            name: 'DDL Test Cross-Clinic', 
            clinic_id: otherClinicId 
        }).select();
        console.log('INSERT 3 (same phone, different clinic):', err3 ? `ERROR: ${JSON.stringify(err3)}` : `OK (id: ${ins3[0].id})`);
        
        // Clean up cross-clinic
        if (ins3) await s.from('patients').delete().eq('id', ins3[0].id);
    }

    // 6. Test with soft-delete: set deleted_at on the first record, then try inserting same phone+clinic again
    if (ins1) {
        await s.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', ins1[0].id);
        console.log('\nSoft-deleted first record. Trying insert with same phone+clinic...');
        const { data: ins4, error: err4 } = await s.from('patients').insert({ 
            phone: testPhone, 
            name: 'DDL Test After Soft Delete', 
            clinic_id: clinicId 
        }).select();
        console.log('INSERT 4 (after soft-delete):', err4 ? `ERROR: ${JSON.stringify(err4)}` : `OK (id: ${ins4[0].id})`);
        console.log('  → This tells us if the constraint is a PARTIAL unique index (WHERE deleted_at IS NULL)');
        console.log('     If INSERT 4 succeeded: PARTIAL unique index');
        console.log('     If INSERT 4 failed with 23505: simple UNIQUE constraint (no WHERE clause)');

        // Clean up
        if (ins4) await s.from('patients').delete().eq('id', ins4[0].id);
        await s.from('patients').delete().eq('id', ins1[0].id);
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
