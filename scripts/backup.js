// ════════════════════════════════════════════════════════
// scripts/backup.js
// Roda via GitHub Actions toda segunda de manhã
// Busca dados do Firestore e envia por email via EmailJS
// ════════════════════════════════════════════════════════

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

// ── Configuração Firebase ────────────────────────────────
const firebaseConfig = {
  apiKey:            process.env.FIREBASE_API_KEY,
  authDomain:        "registro-ponto-rh.firebaseapp.com",
  projectId:         "registro-ponto-rh",
  storageBucket:     "registro-ponto-rh.firebasestorage.app",
  messagingSenderId: "198868826877",
  appId:             "1:198868826877:web:44d62bdee50a473cf25c94"
};

// ── Configuração EmailJS ─────────────────────────────────
const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;

async function main() {
  console.log('🔄 Iniciando backup semanal...');

  // 1. Inicializa Firebase
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  // 2. Busca todos os documentos da coleção 'dados'
  console.log('📦 Buscando dados do Firestore...');
  const snapshot = await getDocs(collection(db, 'dados'));
  
  const dados = {};
  snapshot.forEach(doc => {
    dados[doc.id] = doc.data().valor;
  });

  // 3. Monta resumo
  const store       = dados['rh_store'] || {};
  const users       = store.users       || {};
  const employees   = store.employees   || [];
  const filiais     = store.filiais     || [];
  const depts       = store.depts       || [];
  const ocorrencias = dados['rh_ocorrencias'] || [];
  const auditLog    = dados['rh_audit_log']   || [];

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const resumo = `
📊 RESUMO DO SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Funcionários cadastrados : ${employees.length}
🏢 Filiais                  : ${filiais.length}
🗂️  Departamentos            : ${depts.length}
👤 Usuários do sistema      : ${Object.keys(users).length}
📝 Ocorrências registradas  : ${ocorrencias.length}
🔍 Logs de auditoria        : ${auditLog.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();

  // 4. Serializa dados completos (limitado para caber no email)
  const backupCompleto = JSON.stringify(dados, null, 2);
  
  // EmailJS tem limite de tamanho — trunca se necessário
  const MAX_CHARS = 40000;
  const backupTexto = backupCompleto.length > MAX_CHARS
    ? backupCompleto.slice(0, MAX_CHARS) + '\n\n... [TRUNCADO — use o backup pelo sistema para dados completos]'
    : backupCompleto;

  console.log(`📝 Dados coletados: ${employees.length} funcionários, ${Object.keys(users).length} usuários`);

  // 5. Envia email via EmailJS REST API
  console.log('📧 Enviando email...');

  const fetch = (await import('node-fetch')).default;

  const emailPayload = {
    service_id:  EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id:     EMAILJS_PUBLIC_KEY,
    template_params: {
      name:               'Sistema CD Nagumo',
      email:              'cdnagumo.inteligencia@gmail.com',
      data:               hoje,
      total_funcionarios: employees.length,
      backup_resumo:      resumo,
      backup_dados:       backupTexto,
    }
  };

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(emailPayload)
  });

  if (response.ok) {
    console.log('✅ Backup enviado com sucesso!');
    console.log(`📅 Data: ${hoje}`);
    console.log(`👥 Funcionários: ${employees.length}`);
  } else {
    const erro = await response.text();
    console.error('❌ Erro ao enviar email:', erro);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Erro no backup:', err);
  process.exit(1);
});
