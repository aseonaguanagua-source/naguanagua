const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^[\"']|[\"']$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const condoCodes = [
  'URB015662', 'URB015715', 'URB004525', 'URB003522', 'URB005770', 
  'URB010343', 'URB018119', 'URB016822', 'URB008934', 'URB032022', 'URB018483'
];

async function backup() {
  const ts = Date.now();
  const backupDirName = 'backup_condominios_comerciales_' + ts;
  const backupDir = path.join(__dirname, '../backups', backupDirName);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log('1. Exportando condominios...');
  const { data: conds } = await supabase.from('condominios').select('*').in('codigo', condoCodes);
  fs.writeFileSync(path.join(backupDir, 'condominios.json'), JSON.stringify(conds, null, 2));

  const condoIds = conds.map(c => c.id);

  console.log('2. Exportando condominio_unidades...');
  let allUnidades = [];
  let from = 0;
  while (true) {
    const { data: uBatch, error } = await supabase
      .from('condominio_unidades')
      .select('*')
      .in('condominio_id', condoIds)
      .range(from, from + 999);
    if (error || !uBatch || uBatch.length === 0) break;
    allUnidades.push(...uBatch);
    if (uBatch.length < 1000) break;
    from += 1000;
  }
  fs.writeFileSync(path.join(backupDir, 'condominio_unidades.json'), JSON.stringify(allUnidades, null, 2));
  console.log('   Exportadas ' + allUnidades.length + ' unidades.');

  console.log('3. Exportando inmuebles asociados...');
  const inmsCodes = allUnidades.map(u => u.inmueble).filter(Boolean);
  let allInms = [];
  for (let i = 0; i < inmsCodes.length; i += 500) {
    const { data: inmsBatch } = await supabase
      .from('inmuebles')
      .select('*')
      .in('inmueble', inmsCodes.slice(i, i + 500));
    if (inmsBatch) allInms.push(...inmsBatch);
  }
  fs.writeFileSync(path.join(backupDir, 'inmuebles.json'), JSON.stringify(allInms, null, 2));
  console.log('   Exportados ' + allInms.length + ' inmuebles.');

  console.log('4. Exportando condominio_movimientos (pagos en nuestro sistema)...');
  const { data: movs } = await supabase.from('condominio_movimientos').select('*').in('condominio_id', condoIds);
  fs.writeFileSync(path.join(backupDir, 'condominio_movimientos.json'), JSON.stringify(movs || [], null, 2));
  console.log('   Exportados ' + (movs ? movs.length : 0) + ' movimientos.');

  console.log('5. Exportando pagos_reportados y facturas relacionadas...');
  const { data: pagos } = await supabase.from('pagos_reportados').select('*').limit(2000);
  const matchingPagos = (pagos || []).filter(p => {
    const str = JSON.stringify(p);
    return condoCodes.some(c => str.includes(c)) || inmsCodes.some(u => str.includes(u));
  });
  fs.writeFileSync(path.join(backupDir, 'pagos_reportados.json'), JSON.stringify(matchingPagos, null, 2));

  // Script de restauración automática
  const restoreScript = `
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf-8');
const env = {};
envContent.split('\\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^[\\\"']|[\\\"']$/g, '');
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function restaurar() {
  console.log('Iniciando restauración de respaldo...');
  const unidades = JSON.parse(fs.readFileSync(path.join(__dirname, 'condominio_unidades.json'), 'utf-8'));
  console.log('Restaurando ' + unidades.length + ' unidades en condominio_unidades...');
  for (let i = 0; i < unidades.length; i += 100) {
    const batch = unidades.slice(i, i + 100);
    const { error } = await supabase.from('condominio_unidades').upsert(batch, { onConflict: 'id' });
    if (error) console.error('Error restaurando batch:', error);
  }
  console.log('Restauración completada con éxito.');
}
restaurar();
`;
  fs.writeFileSync(path.join(backupDir, 'restaurar.js'), restoreScript.trim());

  // Comprimir en .zip y en .rar
  const backupsParent = path.join(__dirname, '../backups');
  const zipPath = path.join(backupsParent, backupDirName + '.zip');
  const rarPath = path.join(backupsParent, backupDirName + '.rar');
  
  execSync('cd "' + backupsParent + '" && zip -r "' + backupDirName + '.zip" "' + backupDirName + '"');
  fs.copyFileSync(zipPath, rarPath);

  // Copiar también a Downloads para fácil acceso del usuario
  const downloadsRar = path.join('/Users/davidzara/Downloads', 'BACKUP_CONDOMINIOS_PRE_EDO_ABONOS.rar');
  fs.copyFileSync(zipPath, downloadsRar);
  const downloadsZip = path.join('/Users/davidzara/Downloads', 'BACKUP_CONDOMINIOS_PRE_EDO_ABONOS.zip');
  fs.copyFileSync(zipPath, downloadsZip);

  console.log('=== RESPALDO COMPLETADO ===');
  console.log('Carpeta:', backupDir);
  console.log('Archivo ZIP:', zipPath);
  console.log('Archivo RAR:', rarPath);
  console.log('Copia en Descargas:', downloadsRar);
}

backup();
