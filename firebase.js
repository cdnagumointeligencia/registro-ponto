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

// ─────────────────────────────────────────────────────────
// window.DB — API pública assíncrona (Promise-based)
// Substitui o objeto LS do shared.js para as chaves do Firestore
// ─────────────────────────────────────────────────────────
window.DB = {

  /**
   * Busca o valor de uma chave no Firestore.
   * @param {string} chave  - ex: 'rh_store', 'rh_ponto'
   * @param {*}      padrao - valor retornado se não existir
   */
  get: async (chave, padrao = null) => {
    // ⚠️ IMPORTANTE: Não captura o erro aqui — propaga para o chamador.
    // Se capturarmos e retornarmos `padrao`, funções como ensureAdmin()
    // podem interpretar uma falha de rede como "store vazio" e apagar todos os dados.
    const snap = await _db.collection(_COL).doc(chave).get();
    return snap.exists ? snap.data().valor : padrao;
  },

  /**
   * Salva um valor no Firestore.
   * @param {string} chave - chave do documento
   * @param {*}      valor - qualquer valor serializável em JSON
   */
  set: async (chave, valor) => {
    // ⚠️ IMPORTANTE: Não captura o erro aqui — propaga para o chamador
    // para que erros de escrita sejam visíveis ao usuário via toast.
    await _db.collection(_COL).doc(chave).set({ valor });
  },

  /**
   * Remove um documento do Firestore.
   * @param {string} chave - chave do documento
   */
  remove: async (chave) => {
    try {
      await _db.collection(_COL).doc(chave).delete();
    } catch (e) {
      console.error("[DB.remove] Erro na chave:", chave, e);
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
