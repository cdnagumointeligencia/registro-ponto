// ════════════════════════════════════════════════════════
// firebase.js — Camada de dados: Firestore no lugar do localStorage
// Usa Firebase Compat SDK (carregado via CDN antes deste arquivo)
// Deve ser carregado ANTES de permissions.js e shared.js
//
// CDN necessários em cada HTML (antes deste arquivo):
//   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
// ════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey:            "AIzaSyBoqD-UZKdVuaYlR0EcmZINpXUEw5n59Qo",
  authDomain:        "registro-ponto-rh.firebaseapp.com",
  projectId:         "registro-ponto-rh",
  storageBucket:     "registro-ponto-rh.firebasestorage.app",
  messagingSenderId: "198868826877",
  appId:             "1:198868826877:web:44d62bdee50a473cf25c94"
};

// Evita inicializar duas vezes (acontece em hot-reload de dev)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const _db  = firebase.firestore();
const _COL = "dados"; // coleção única no Firestore

// ── Prefixo do cache local ──────────────────────────────
const _LC = '_db_';

// ── mergeArrays: mescla arrays por campo id ──────────────
function _dbMergeArr(a, b, key) {
  var map = {};
  (a || []).forEach(function(x) { if (x[key] !== undefined) map[x[key]] = x; });
  (b || []).forEach(function(x) { if (x[key] !== undefined) map[x[key]] = x; });
  return Object.values(map);
}

// ── mergePorChave: mescla objetos pelas chaves do 1º nível ─
function _dbMergeObj(a, b) {
  var r = {};
  if (a) Object.keys(a).forEach(function(k) { r[k] = a[k]; });
  if (b) Object.keys(b).forEach(function(k) { r[k] = b[k]; });
  return r;
}

// ── merge específico por tipo de documento ────────────────
function _dbMerge(key, local, fb) {
  if (!local) return fb;
  if (!fb) return local;
  if (key === 'rh_ocorrencias' || key === 'rh_aptidoes') {
    return _dbMergeArr(local, fb, 'id');
  }
  if (key === 'rh_ponto') {
    var r = {}, ks = [];
    if (local) Object.keys(local).forEach(function(k) { if (ks.indexOf(k)===-1) ks.push(k); });
    if (fb)     Object.keys(fb).forEach(function(k) { if (ks.indexOf(k)===-1) ks.push(k); });
    ks.forEach(function(k) { r[k] = _dbMergeObj((local||{})[k], (fb||{})[k]); });
    return r;
  }
  if (key === 'rh_audit_log') {
    return _dbMergeObj(local, fb);
  }
  if (key === 'rh_store') {
    var empMap = {};
    (local.employees || []).forEach(function(e) { empMap[e.id] = e; });
    (fb.employees || []).forEach(function(e) { empMap[e.id] = e; });
    var usrMap = {};
    if (local.users) Object.keys(local.users).forEach(function(k) { usrMap[k] = local.users[k]; });
    if (fb.users)    Object.keys(fb.users).forEach(function(k) { usrMap[k] = fb.users[k]; });
    return {
      users:     usrMap,
      employees: Object.values(empMap),
      config:    Object.assign({}, (fb.config || {}), (local.config || {})),
      filiais:   (local.filiais || fb.filiais || []),
      turnos:    (local.turnos  || fb.turnos  || []),
      depts:     (local.depts   || fb.depts   || []),
      funcoes:   (local.funcoes || fb.funcoes || []),
      authCode:  (local.authCode || fb.authCode || 'NAGUMO2025'),
      permissions: Object.assign({}, (fb.permissions || {}), (local.permissions || {})),
    };
  }
  // fallback — se for objeto simples mescla, se for array/outro prefere local
  if (typeof local === 'object' && typeof fb === 'object' && !Array.isArray(local) && !Array.isArray(fb)) {
    return Object.assign({}, fb, local);
  }
  return local;
}

// ─────────────────────────────────────────────────────────
// window.DB — API pública assíncrona (Promise-based)
// ─────────────────────────────────────────────────────────
window.DB = {

  get: async (chave, padrao = null) => {
    var cache = null;
    try { cache = JSON.parse(localStorage.getItem(_LC + chave)); } catch(e) {}
    try {
      const snap = await _db.collection(_COL).doc(chave).get();
      if (snap.exists && snap.data().valor !== undefined) {
        var fb = snap.data().valor;
        var merged = cache !== null ? _dbMerge(chave, cache, fb) : fb;
        try { localStorage.setItem(_LC + chave, JSON.stringify(merged)); } catch(e) {}
        return merged;
      }
      if (cache !== null) return cache;
      if (padrao !== null) {
        try { localStorage.setItem(_LC + chave, JSON.stringify(padrao)); } catch(e) {}
      }
      return padrao;
    } catch(e) {
      if (cache !== null) return cache;
      throw e;
    }
  },

  set: async (chave, valor) => {
    try { localStorage.setItem(_LC + chave, JSON.stringify(valor)); } catch(e) {}
    for (var a = 0; a < 3; a++) {
      try {
        await _db.collection(_COL).doc(chave).set({ valor });
        return;
      } catch(e) {
        if (a < 2) await new Promise(function(r) { setTimeout(r, 1000 * Math.pow(2, a)); });
      }
    }
    console.warn('[DB.set] Offline — dados salvos apenas localmente:', chave);
  },

  remove: async (chave) => {
    try { localStorage.removeItem(_LC + chave); } catch(e) {}
    try { await _db.collection(_COL).doc(chave).delete(); } catch(e) {}
  },

  sync: async (chave) => {
    try {
      var cache = null;
      try { cache = JSON.parse(localStorage.getItem(_LC + chave)); } catch(e) {}
      const snap = await _db.collection(_COL).doc(chave).get();
      if (!snap.exists || !snap.data() || snap.data().valor === undefined) {
        if (cache !== null) {
          await _db.collection(_COL).doc(chave).set({ valor: cache }).catch(function(){});
        }
        return;
      }
      var fb = snap.data().valor;
      var merged = cache !== null ? _dbMerge(chave, cache, fb) : fb;
      try { localStorage.setItem(_LC + chave, JSON.stringify(merged)); } catch(e) {}
      if (JSON.stringify(merged) !== JSON.stringify(fb)) {
        await _db.collection(_COL).doc(chave).set({ valor: merged }).catch(function(){});
      }
    } catch(e) {
      console.warn('[DB.sync] Erro:', chave, e);
    }
  }
};

// ─────────────────────────────────────────────────────────
// Chaves que DEVEM permanecer no localStorage do navegador
// (dados locais por sessão/dispositivo — não compartilhados)
// ─────────────────────────────────────────────────────────
// rh_session      → sessão do usuário logado neste navegador
// rh_theme        → preferência de tema (claro/escuro)
// rh_perm_overrides → overrides de permissão (cache local)
//
// Essas chaves são acessadas via LS_LOCAL em shared.js
// ─────────────────────────────────────────────────────────

console.log("[Firebase] Inicializado com sucesso. Projeto:", firebaseConfig.projectId);
