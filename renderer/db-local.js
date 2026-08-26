(function () {
  const API = window.electronAPI;

  if (!API || !API.fs) {
    console.error('[db-local] electronAPI.fs not found. Running outside Electron?');
    return;
  }

  // ════════════════════════════════════════════════════════════
  // PATH HELPER (renderer não tem require('path'))
  // ════════════════════════════════════════════════════════════
  function joinPath(...parts) {
    return parts.join('\\').replace(/[\\/]+/g, '\\');
  }

  // ════════════════════════════════════════════════════════════
  // CACHE EM MEMÓRIA
  // ════════════════════════════════════════════════════════════
  const _cache = new Map();
  let _leaderDir = null;
  let _sharedFolder = null;

  function getCacheKey(type, yearMonth) {
    return yearMonth ? `${type}:${yearMonth}` : type;
  }

  function getFromCache(key) {
    const entry = _cache.get(key);
    if (entry && (Date.now() - entry.ts) < 5000) return entry.data;
    return null;
  }

  function setCache(key, data) {
    _cache.set(key, { data, ts: Date.now() });
  }

  function invalidateCache(key) {
    if (key) _cache.delete(key);
    else _cache.clear();
  }

  // ════════════════════════════════════════════════════════════
  // PASTA DO LÍDER — Detecção Inteligente
  // ════════════════════════════════════════════════════════════

  async function initLeaderDir(userEmail) {
    // Verifica status da pasta configurada
    const check = await API.app.checkSharedFolder();
    
    // Pasta configurada e existe — OK
    if (check.exists) {
      _sharedFolder = check.path;
      _leaderDir = _sharedFolder;
      await API.fs.mkdir(_leaderDir);
      console.log('[db-local] Shared folder found:', _leaderDir);
      return true;
    }
    
    // Pasta não configurada ou não existe — precisa resolver
    console.warn('[db-local] Shared folder not found or not configured');
    
    // Emite evento para a UI mostrar modal
    window.dispatchEvent(new CustomEvent('shared-folder:resolve', {
      detail: {
        configured: check.configured,
        path: check.path,
        message: check.configured 
          ? `A pasta "${check.path}" não foi encontrada. Ela foi movida ou renomeada?`
          : 'Nenhuma pasta de dados configurada. Selecione onde salvar os dados.'
      }
    }));
    
    return false;
  }

  async function resolveSharedFolder() {
    const result = await API.app.resolveSharedFolder();
    if (result.success) {
      _sharedFolder = result.folder;
      _leaderDir = _sharedFolder;
      await API.fs.mkdir(_leaderDir);
      invalidateCache();
      console.log('[db-local] Shared folder resolved:', _leaderDir);
      return { success: true, hasData: result.hasData };
    }
    return { success: false };
  }

  function getLeaderDir() {
    return _leaderDir;
  }

  // ════════════════════════════════════════════════════════════
  // CAMINHOS DE ARQUIVO
  // ════════════════════════════════════════════════════════════

  function getConfigPath() {
    return joinPath(_leaderDir, 'config.json');
  }

  function getDataPath(type, yearMonth) {
    return joinPath(_leaderDir, `${type}-${yearMonth}.json`);
  }

  // ════════════════════════════════════════════════════════════
  // LEITURA / ESCRITA
  // ════════════════════════════════════════════════════════════

  async function loadData(type, yearMonth) {
    // Garante que _leaderDir está inicializado
    if (!_leaderDir) {
      const ok = await initLeaderDir();
      if (!ok) return null;
    }

    const key = getCacheKey(type, yearMonth);
    const cached = getFromCache(key);
    if (cached !== null) return cached;

    const filePath = yearMonth
      ? getDataPath(type, yearMonth)
      : getConfigPath();

    try {
      const result = await API.fs.readFile(filePath);
      if (result.success && result.data) {
        setCache(key, result.data);
        return result.data;
      }
      return null;
    } catch (e) {
      console.error(`[db-local] loadData error (${type}):`, e);
      return null;
    }
  }

  async function saveData(type, yearMonth, data) {
    const filePath = yearMonth
      ? getDataPath(type, yearMonth)
      : getConfigPath();

    try {
      const result = await API.fs.writeFile(filePath, data);
      if (result.success) {
        const key = getCacheKey(type, yearMonth);
        setCache(key, data);
        return true;
      }
      return false;
    } catch (e) {
      console.error(`[db-local] saveData error (${type}):`, e);
      return false;
    }
  }

  // ════════════════════════════════════════════════════════════
  // LAZY LOADING POR MÊS
  // ════════════════════════════════════════════════════════════

  async function ensureMonthLoaded(yearMonth) {
    const key = getCacheKey('ponto', yearMonth);
    if (getFromCache(key)) return;

    await loadData('ponto', yearMonth);
    await loadData('ocorrencias', yearMonth);
    await loadData('aptidoes', yearMonth);
  }

  async function listMonths() {
    if (!_leaderDir) return [];
    try {
      const result = await API.fs.readdir(_leaderDir);
      if (!result.success) return [];
      return result.data
        .filter(f => f.match(/^(ponto|ocorrencias|aptidoes)-\d{4}-\d{2}\.json$/))
        .map(f => f.match(/-(\d{4}-\d{2})\.json/)?.[1])
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort();
    } catch (e) {
      return [];
    }
  }

  // ════════════════════════════════════════════════════════════
  // COMPATIBILIDADE — Interface antiga (window.DB)
  // ════════════════════════════════════════════════════════════

  const DB = {
    get: async function (key, def) {
      const data = await loadData(key, null);
      return data !== null ? data : (def !== undefined ? def : null);
    },

    set: async function (key, val) {
      return await saveData(key, null, val);
    },

    remove: async function (key) {
      invalidateCache(key);
    },

    setVersioned: async function (key, val) {
      return await saveData(key, null, val);
    },

    getVersion: async function () {
      return 0;
    },

    setMerge: async function (key, mergeFn) {
      const current = await DB.get(key, null);
      const result = mergeFn(current);
      await DB.set(key, result);
      return result;
    },

    query: async function (sql, params) {
      return await API.db.query(sql, params);
    },

    run: async function (sql, params) {
      return await API.db.run(sql, params);
    },

    getDeviceId: async function () {
      return await API.app.getDeviceId();
    },

    initLeaderDir,
    resolveSharedFolder,
    getLeaderDir,
    loadData,
    saveData,
    ensureMonthLoaded,
    listMonths,
    invalidateCache,
  };

  window.DB = DB;
  console.log('[db-local] JSON file persistence (v3.0)');

  // """"""""""""""""""""""""""""""""""""""""""""""""""""""""
  // MIGRAÇÃO DO SQLITE → JSON
  // """"""""""""""""""""""""""""""""""""""""""""""""""""""""
  DB.migrateFromSQLite = async function (statusEl) {
    const updateStatus = (msg) => {
      if (statusEl) statusEl.textContent = msg;
      console.log('[migrate]', msg);
    };

    try {
      updateStatus('⏳ Verificando banco antigo...');

      // Verifica se existe banco SQLite
      const dbPath = await API.app.getDataPath();
      const dbFile = joinPath(dbPath, 'rh_nagumo.db');
      const exists = await API.fs.exists(dbFile);
      if (!exists) {
        updateStatus('❌ Banco rh_nagumo.db não encontrado.');
        return false;
      }

      updateStatus('⏳ Lendo dados do SQLite...');

      // Lê rh_store (tabela principal)
      const storeResult = await API.db.query({ sql: 'SELECT data FROM rh_store WHERE key = ?', params: ['rh_store'] });
      if (!storeResult.success || !storeResult.data?.length) {
        updateStatus('❌ Tabela rh_store não encontrada ou vazia.');
        return false;
      }

      const storeData = JSON.parse(storeResult.data[0].data);

      // Lê ponto
      const pontoResult = await API.db.query({ sql: 'SELECT data FROM rh_store WHERE key = ?', params: ['rh_ponto'] });
      const pontoData = pontoResult.success && pontoResult.data?.length ? JSON.parse(pontoResult.data[0].data) : {};

      // Lê ocorrências
      const ocorrResult = await API.db.query({ sql: 'SELECT data FROM rh_store WHERE key = ?', params: ['rh_ocorrencias'] });
      const ocorrData = ocorrResult.success && ocorrResult.data?.length ? JSON.parse(ocorrResult.data[0].data) : [];

      // Lê aptidões
      const aptResult = await API.db.query({ sql: 'SELECT data FROM rh_store WHERE key = ?', params: ['rh_aptidoes'] });
      const aptData = aptResult.success && aptResult.data?.length ? JSON.parse(aptResult.data[0].data) : {};

      // Lê audit log
      const logResult = await API.db.query({ sql: 'SELECT data FROM rh_store WHERE key = ?', params: ['rh_audit_log'] });
      const logData = logResult.success && logResult.data?.length ? JSON.parse(logResult.data[0].data) : [];

      updateStatus('⏳ Convertendo para JSON...');

      // Salva config.json (store)
      await saveData('config', null, storeData);

      // Salva ponto por mês
      if (pontoData && typeof pontoData === 'object') {
        for (const [mk, registros] of Object.entries(pontoData)) {
          if (/^\d{4}-\d{2}$/.test(mk) && Array.isArray(registros)) {
            await saveData('ponto', mk, { registros });
          }
        }
      }

      // Salva ocorrências por mês
      if (Array.isArray(ocorrData) && ocorrData.length > 0) {
        const ocorrByMonth = {};
        for (const o of ocorrData) {
          const d = new Date(o.data || o.created_at);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!ocorrByMonth[mk]) ocorrByMonth[mk] = [];
          ocorrByMonth[mk].push(o);
        }
        for (const [mk, items] of Object.entries(ocorrByMonth)) {
          await saveData('ocorrencias', mk, items);
        }
      }

      // Salva aptidões por mês
      if (aptData && typeof aptData === 'object') {
        for (const [mk, avaliacoes] of Object.entries(aptData)) {
          if (/^\d{4}-\d{2}$/.test(mk)) {
            await saveData('aptidoes', mk, Array.isArray(avaliacoes) ? { avaliacoes } : avaliacoes);
          }
        }
      }

      // Salva audit log
      await saveData('audit_log', null, logData);

      updateStatus('✅ Migração concluída! Reinicie o app.');
      console.log('[migrate] Done');
      return true;

    } catch (e) {
      console.error('[migrate] Error:', e);
      updateStatus('❌ Erro na migração: ' + e.message);
      return false;
    }
  };
})();
