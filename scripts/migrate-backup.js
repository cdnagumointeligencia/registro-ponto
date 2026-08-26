#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BACKUP_PATH = path.join('C:\\Users\\marcos.marques\\Desktop', 'rh-nagumo-backup-2026-06-12-clean.json');
const OUTPUT_DIR  = path.join(__dirname, 'migracao');
const NOW         = new Date();
const CURRENT_MONTH = NOW.getFullYear() + '-' + String(NOW.getMonth() + 1).padStart(2, '0');

function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/\u0192/g, 'c').replace(/\u0191/g, 'C')
    .replace(/\u019D/g, 'N').replace(/\u019E/g, 'n')
    .replace(/\u0160/g, 'S').replace(/\u0161/g, 's')
    .replace(/\u017D/g, 'Z').replace(/\u017E/g, 'z')
    .replace(/\u0141/g, 'L').replace(/\u0142/g, 'l')
    .replace(/\u00C7/g, 'C').replace(/\u00E7/g, 'c')
    .replace(/\u00C3/g, 'A').replace(/\u00E3/g, 'a')
    .replace(/\u00D5/g, 'O').replace(/\u00F5/g, 'o')
    .replace(/\u00C2/g, 'A').replace(/\u00E2/g, 'a')
    .replace(/\u00CA/g, 'E').replace(/\u00EA/g, 'e')
    .replace(/\u00C0/g, 'A').replace(/\u00E0/g, 'a')
    .replace(/\u00C1/g, 'A').replace(/\u00E1/g, 'a')
    .replace(/\u00C9/g, 'E').replace(/\u00E9/g, 'e')
    .replace(/\u00CD/g, 'I').replace(/\u00ED/g, 'i')
    .replace(/\u00D3/g, 'O').replace(/\u00F3/g, 'o')
    .replace(/\u00DA/g, 'U').replace(/\u00FA/g, 'u')
    .replace(/\u00D4/g, 'O').replace(/\u00F4/g, 'o')
    .replace(/\u00DC/g, 'U').replace(/\u00FC/g, 'u')
    .replace(/\u00C4/g, 'A').replace(/\u00E4/g, 'a')
    .replace(/\u00D6/g, 'O').replace(/\u00F6/g, 'o')
    .replace(/\u00DF/g, 'ss')
    .replace(/\u00BA/g, 'o').replace(/\u00AA/g, 'a')
    .replace(/[\u0080-\u00FF]/g, function(c) {
      var map = {'\u00E3':'a','\u00C3':'A','\u00F5':'o','\u00D5':'O','\u00E7':'c','\u00C7':'C','\u00E1':'a','\u00C1':'A','\u00E9':'e','\u00C9':'E','\u00ED':'i','\u00CD':'I','\u00F3':'o','\u00D3':'O','\u00FA':'u','\u00DA':'U','\u00E2':'a','\u00C2':'A','\u00EA':'e','\u00CA':'E','\u00F4':'o','\u00D4':'O','\u00E0':'a','\u00C0':'A','\u00FC':'u','\u00DC':'U','\u00E4':'a','\u00C4':'A','\u00F6':'o','\u00D6':'O','\u00E6':'ae','\u00C6':'AE','\u00DF':'ss','\u00BA':'o','\u00AA':'a','\u00B0':'o'};
      return map[c] || c;
    });
}

function fixObject(obj) {
  if (Array.isArray(obj)) return obj.map(fixObject);
  if (obj && typeof obj === 'object') {
    var fixed = {};
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) fixed[k] = fixObject(obj[k]);
    }
    return fixed;
  }
  if (typeof obj === 'string') return fixEncoding(obj);
  return obj;
}

function main() {
  console.log('[Migrate] Lendo backup...');
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error('[Migrate] Arquivo nao encontrado: ' + BACKUP_PATH);
    process.exit(1);
  }

  var raw = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'));
  var store = fixObject(raw.rh_store || raw);

  var adminId = 'admin@nagumo.com.br';
  var employees = store.employees || [];
  var byOwner = {};

  for (var i = 0; i < employees.length; i++) {
    var emp = employees[i];
    var ownerId = emp.owner_id || emp.ownerId || '';
    if (!ownerId) {
      console.warn('[Migrate] Sem owner_id: ' + emp.name + ' (id=' + emp.id + ')');
      continue;
    }
    if (!byOwner[ownerId]) byOwner[ownerId] = [];
    byOwner[ownerId].push(emp);
  }

  var owners = Object.keys(byOwner);
  console.log('[Migrate] ' + employees.length + ' funcionarios em ' + owners.length + ' lideres');

  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Admin master
  var adminDir = path.join(OUTPUT_DIR, adminId);
  fs.mkdirSync(adminDir, { recursive: true });

  var defaultConfig = store.config || { perfWeight: 40, aptWeight: 35, maxAbs: 36, feriadosCustom: [] };

  var adminConfig = {
    users: {},
    employees: [],
    config: defaultConfig,
    filiais: store.filiais || [],
    turnos: store.turnos || [],
    depts: store.depts || [],
    funcoes: store.funcoes || [],
    authCode: store.authCode || 'NAGUMO2025',
    permissions: store.permissions || {},
    permOverrides: store.permOverrides || {}
  };
  adminConfig.users[adminId] = {
    id: adminId, name: 'Administrador', pass: '', avatar: null,
    nivel: 'admin_master', setor: '', perfil: { filial: '', turno: '', depts: [] }
  };

  fs.writeFileSync(path.join(adminDir, 'config.json'), JSON.stringify(adminConfig, null, 2), 'utf-8');
  fs.writeFileSync(path.join(adminDir, 'ponto-' + CURRENT_MONTH + '.json'), '{}', 'utf-8');
  fs.writeFileSync(path.join(adminDir, 'ocorrencias-' + CURRENT_MONTH + '.json'), '{}', 'utf-8');
  fs.writeFileSync(path.join(adminDir, 'aptidoes-' + CURRENT_MONTH + '.json'), '{}', 'utf-8');
  console.log('[Migrate] OK ' + adminId + '/ (admin master, 0 funcionarios)');

  // Lideres
  for (var oi = 0; oi < owners.length; oi++) {
    var ownerId = owners[oi];
    var leaderDir = path.join(OUTPUT_DIR, ownerId);
    fs.mkdirSync(leaderDir, { recursive: true });

    var leaderUser = store.users && store.users[ownerId] ? store.users[ownerId] : {
      id: ownerId, name: ownerId, pass: '', avatar: null,
      nivel: 'lider', setor: '', perfil: { filial: '', turno: '', depts: [] }
    };

    var leaderEmployees = byOwner[ownerId];

    var leaderConfig = {
      users: {},
      employees: leaderEmployees,
      config: defaultConfig,
      filiais: store.filiais || [],
      turnos: store.turnos || [],
      depts: store.depts || [],
      funcoes: store.funcoes || [],
      authCode: store.authCode || 'NAGUMO2025',
      permissions: store.permissions || {},
      permOverrides: store.permOverrides || {}
    };
    leaderConfig.users[adminId] = adminConfig.users[adminId];
    leaderConfig.users[ownerId] = leaderUser;

    fs.writeFileSync(path.join(leaderDir, 'config.json'), JSON.stringify(leaderConfig, null, 2), 'utf-8');
    fs.writeFileSync(path.join(leaderDir, 'ponto-' + CURRENT_MONTH + '.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(leaderDir, 'ocorrencias-' + CURRENT_MONTH + '.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(leaderDir, 'aptidoes-' + CURRENT_MONTH + '.json'), '{}', 'utf-8');

    var nivel = leaderUser.nivel || 'lider';
    console.log('[Migrate] OK ' + ownerId + '/ (' + leaderEmployees.length + ' funcionarios, ' + nivel + ')');
  }

  console.log('\n[Migrate] Concluido! Pastas em: ' + OUTPUT_DIR);
  console.log('[Migrate] ' + (owners.length + 1) + ' pastas criadas (' + owners.length + ' lideres + 1 admin)');
}

main();
