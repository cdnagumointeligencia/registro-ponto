// ════════════════════════════════════════════════════════
// shared.js — Funções compartilhadas entre todas as páginas
// Requer firebase.js + permissions.js carregados antes
// ════════════════════════════════════════════════════════

const ADMIN_ID          = 'admin';
const AUTH_CODE_DEFAULT = 'NAGUMO2025';

const NAV_ITEMS = [
  { id:'dashboard',    icon:'📊', label:'Dashboard',          href:'../index.html',      page:'dashboard'    },
  { id:'employees',    icon:'👥', label:'Funcionários',       href:'employees.html',     page:'employees'    },
  { id:'leaders',      icon:'🧑‍💼', label:'Líderes',            href:'leaders.html',       page:'leaders'      },
  { id:'absenteeism',  icon:'📅', label:'Absenteísmo',        href:'absenteeism.html',   page:'absenteeism'  },
  { id:'ranking',      icon:'🏆', label:'Ranking',            href:'ranking.html',       page:'ranking'      },
  { id:'quadro',       icon:'📋', label:'Quadro Operacional', href:'quadro.html',        page:'quadro'       },
  { id:'aptidoes',     icon:'🎯', label:'Aptidões',           href:'aptidoes.html',      page:'aptidoes',    fullscreen:true },
  { id:'ponto',        icon:'🗓️', label:'Ponto Diário',       href:'ponto.html',         page:'ponto',       fullscreen:true },
  { id:'ocorrencias',  icon:'📝', label:'Ocorrências',        href:'ocorrencias.html',   page:'ocorrencias'  },
  { id:'report',       icon:'📄', label:'Relatório',          href:'report.html',        page:'report'       },
  { id:'audit',        icon:'🔍', label:'Registros',          href:'audit.html',         page:'audit'        },
  { id:'config',       icon:'⚙️', label:'Configurações',      href:'config.html',        page:'config'       },
];

// ════════════════════════════════════════════════════════
// STORAGE — duas camadas
// ════════════════════════════════════════════════════════

// ── LS_LOCAL: localStorage síncrono (sessão + tema + overrides) ──────────
// Dados que são POR DISPOSITIVO/NAVEGADOR e não precisam ser compartilhados.
const LS_LOCAL = {
  get:    (k, def=null) => { try { const v=localStorage.getItem(k); return v!==null?JSON.parse(v):def; } catch(e){return def;} },
  set:    (k, v)        => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  remove: (k)           => { try { localStorage.removeItem(k); } catch(e){} },
};

// ── LS: Firestore assíncrono (todos os dados compartilhados) ─────────────
// Delega para window.DB definido em firebase.js.
const LS = {
  get:    async (k, def=null) => await window.DB.get(k, def),
  set:    async (k, v)        => await window.DB.set(k, v),
  remove: async (k)           => await window.DB.remove(k),
};

// ════════════════════════════════════════════════════════
// STORE — objeto principal de dados (Firestore)
// ════════════════════════════════════════════════════════
async function getStore() {
  return await LS.get('rh_store', {
    users:    {},
    config:   { perfWeight:40, aptWeight:35, maxAbs:36, feriadosCustom:[] },
    filiais:  [], turnos:[], depts:[], funcoes:[],
    authCode: AUTH_CODE_DEFAULT,
  });
}
async function saveStore(store) { await LS.set('rh_store', store); }

async function ensureAdmin() {
  const store = await getStore();
  if (!store.users[ADMIN_ID]) {
    store.users[ADMIN_ID] = {
      id:'admin', name:'Administrador', pass:'admin123',
      nivel:'admin_master', setor:'',
      perfil:{ filial:'', turno:'', depts:[] },
    };
    await saveStore(store);
  }
}

// ════════════════════════════════════════════════════════
// SESSÃO — usa LS_LOCAL (síncrono, por dispositivo)
// ════════════════════════════════════════════════════════
async function getSession() {
  const id = LS_LOCAL.get('rh_session');   // síncrono — localStorage
  if (!id) return null;
  const store = await getStore();
  return store.users[id] || null;
}

function _redirectLogin() {
  if (window.parent !== window) {
    window.parent.location.href = '../login.html';
  } else {
    window.location.href = '../login.html';
  }
}

async function requireSession() {
  await ensureAdmin();
  const user = await getSession();
  if (!user) { _redirectLogin(); return null; }
  return user;
}

function doLogout() {
  if (!confirm('Deseja sair?')) return;
  LS_LOCAL.remove('rh_session');   // síncrono — localStorage
  window.close();
  // Fallback: se window.close() for bloqueado pelo navegador, redireciona para login
  setTimeout(() => { _redirectLogin(); }, 300);
}

// ════════════════════════════════════════════════════════
// PERFIL
// ════════════════════════════════════════════════════════
function getUserPerfil(user) {
  if (!user) return 'lider';
  if (user.id === ADMIN_ID || user.nivel === 'admin_master') return 'admin_master';
  if (['encarregado','coordenacao','gerencia','diretoria'].includes(user.nivel)) return 'admin_gestor';
  return 'lider';
}

const NIVEL_LABELS = {
  admin_master: { label:'Admin Master',      emoji:'🛡️', cor:'#f87171' },
  diretoria:    { label:'Diretoria',         emoji:'🏢', cor:'#fb923c' },
  gerencia:     { label:'Gerência',          emoji:'📊', cor:'#fbbf24' },
  coordenacao:  { label:'Coordenação',       emoji:'📋', cor:'#a78bfa' },
  encarregado:  { label:'Encarregado',       emoji:'🔰', cor:'#22d3ee' },
  lider:        { label:'Líder Operacional', emoji:'👷', cor:'#34d399' },
};

const NIVEL_NAMES = {
  lider:'Liderança Operacional', encarregado:'Encarregado',
  coordenacao:'Coordenação',     gerencia:'Gerência',
  diretoria:'Diretoria',         admin_master:'Admin Master',
};

// ════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════
function showToast(msg, type='ok') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  t.style.pointerEvents = 'auto';
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ════════════════════════════════════════════════════════
// TEMA — usa LS_LOCAL (síncrono, preferência local por dispositivo)
// ════════════════════════════════════════════════════════
function initTheme() {
  if (LS_LOCAL.get('rh_theme') === 'light') document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
  syncThemeButtons();
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  LS_LOCAL.set('rh_theme', isLight ? 'light' : 'dark');
  syncThemeButtons();
}

function syncThemeButtons() {
  const isLight = document.body.classList.contains('light-theme');
  document.querySelectorAll('.theme-toggle-btn').forEach(b => b.classList.toggle('light-on', isLight));
  document.querySelectorAll('.theme-toggle-label').forEach(l => {
    l.textContent = isLight ? '🌙 Tema Escuro' : '☀️ Tema Claro';
  });
}

// ════════════════════════════════════════════════════════
// SIDEBAR — função única, usada em todas as páginas
// CSS vem do sidebar.css (nunca duplicar nos HTMLs)
// ════════════════════════════════════════════════════════
function initSidebar(activeId, user) {
  const nivel   = user?.nivel || 'lider';
  const meta    = NIVEL_LABELS[nivel] || NIVEL_LABELS['lider'];

  const inPages = window.location.pathname.includes('/pages/');

  if (inPages) {
    document.body.classList.add('sb-collapsed');
  } else {
    document.body.classList.remove('sb-collapsed');
  }

  const dashHref = inPages ? '../index.html' : 'index.html';

  const visibleItems = (typeof canSee === 'function')
    ? NAV_ITEMS.filter(item => canSee(user, item.page))
    : NAV_ITEMS;

  const navHtml = visibleItems.map(item => {
    const isActive = item.id === activeId;
    let href;

    if (item.id === 'dashboard') {
      href = dashHref;
    } else if (inPages) {
      href = item.href;
    } else {
      href = 'pages/' + item.href;
    }

    const fsAttr = (!inPages && item.fullscreen)
      ? ` onclick=""`
      : '';

    return `<a class="sb-item ${isActive ? 'active' : ''}" href="${href}"${fsAttr} data-tip="${item.label}" aria-label="${item.label}">
      <span class="sb-icon">${item.icon}</span>
      <span class="sb-label">${item.label}</span>
    </a>`;
  }).join('');

  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sb-logo">
      <div class="sb-logo-box"><span>CD Nagumo</span></div>
      <small>Performance</small>
    </div>

    <div class="sb-user">
      <div class="sb-user-badge"
        style="background:${meta.cor}18;color:${meta.cor};border:1px solid ${meta.cor}33">
        <span>${meta.emoji}</span>
        <span>${user?.name?.split(' ')[0] || ''}</span>
      </div>
      <div class="sb-user-role">${meta.label}</div>
    </div>

    <nav class="sb-nav">${navHtml}</nav>

    <div class="sb-footer">
      <div class="sb-brand"><center>Sistema Inteligente<br>Gestão de Ponto Nagumo<br>Desenvolvido por<br> Departamento de Inteligência</center></div>
      <button class="sb-logout" onclick="doLogout()">
        <span>🚪</span>
        <span>Sair</span>
      </button>
    </div>`;

  _initSidebarTooltip();
}

function _initSidebarTooltip() {
  const old = document.getElementById('_sb-tip');
  if (old) old.remove();

  const tip = document.createElement('div');
  tip.id = '_sb-tip';
  tip.style.cssText = [
    'position:fixed','z-index:99999','pointer-events:none',
    'background:linear-gradient(135deg,#1a1e2e,#12151f)',
    'color:#e2e8f0',
    "font-family:'DM Sans',sans-serif",'font-size:12px','font-weight:600',
    'padding:7px 14px','border-radius:10px',
    'border:1px solid rgba(79,142,247,.3)',
    'box-shadow:0 8px 24px rgba(0,0,0,.6)',
    'white-space:nowrap','letter-spacing:.2px',
    'opacity:0','transition:opacity .18s','top:0','left:0'
  ].join(';');
  document.body.appendChild(tip);

  if (window._sbTipInit) return;
  window._sbTipInit = true;

  document.body.addEventListener('mouseover', e => {
    if (!document.body.classList.contains('sb-collapsed')) return;
    const item = e.target.closest('#app-sidebar .sb-item[data-tip]');
    if (!item) return;
    const rect = item.getBoundingClientRect();
    const t = document.getElementById('_sb-tip');
    if (!t) return;
    t.textContent = item.getAttribute('data-tip');
    t.style.top  = (rect.top + rect.height/2 - 14) + 'px';
    t.style.left = (rect.right + 12) + 'px';
    t.style.opacity = '1';
  });

  document.body.addEventListener('mouseover', e => {
    if (!e.target.closest('#app-sidebar .sb-item')) {
      const t = document.getElementById('_sb-tip');
      if (t) t.style.opacity = '0';
    }
  });

  document.getElementById('app-sidebar')?.addEventListener('mouseleave', () => {
    const t = document.getElementById('_sb-tip');
    if (t) t.style.opacity = '0';
  });
}

function renderSidebar(activeId, user) { initSidebar(activeId, user); }

// ════════════════════════════════════════════════════════
// BLOQUEIO DE AFASTADO / FÉRIAS / MATERNIDADE
// ════════════════════════════════════════════════════════
function isEmpBloqueado(emp) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  if (emp.afastado) {
    if (emp.data_afastamento) {
      const inicio = new Date(emp.data_afastamento + 'T00:00:00');
      if (inicio <= hoje) return { bloqueado:true, motivo:'afastado' };
    } else {
      return { bloqueado:true, motivo:'afastado' };
    }
  }
  if (emp.maternidade && emp.data_maternidade) {
    const inicio = new Date(emp.data_maternidade + 'T00:00:00');
    if (emp.data_maternidade_fim) {
      // Com data de fim: bloqueia apenas dentro do intervalo
      const fim = new Date(emp.data_maternidade_fim + 'T00:00:00');
      if (inicio <= hoje && fim >= hoje) return { bloqueado:true, motivo:'maternidade' };
    } else {
      // Sem data de fim: bloqueia a partir do início (como afastado)
      if (inicio <= hoje) return { bloqueado:true, motivo:'maternidade' };
    }
  }
  if (emp.ferias && emp.data_ferias_inicio && emp.data_ferias_fim) {
    const ini = new Date(emp.data_ferias_inicio + 'T00:00:00');
    const fim = new Date(emp.data_ferias_fim    + 'T00:00:00');
    if (ini <= hoje && fim >= hoje) return { bloqueado:true, motivo:'ferias' };
  }
  return { bloqueado:false, motivo:null };
}

function isScoreCongelado(emp) {
  return isEmpBloqueado(emp).bloqueado;
}

// ════════════════════════════════════════════════════════
// UTILITÁRIOS
// ════════════════════════════════════════════════════════
function toTitleCase(str) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

// ════════════════════════════════════════════════════════
// AUDIT LOG — assíncrono (grava no Firestore)
// ════════════════════════════════════════════════════════
async function registrarLog(acao, modulo, detalhes, userOverride) {
  try {
    const session = userOverride || await getSession();
    if (!session) return;
    const ua = navigator.userAgent;
    let browser = 'Desconhecido';
    if      (ua.includes('Edg/'))     browser = 'Edge';
    else if (ua.includes('OPR/'))     browser = 'Opera';
    else if (ua.includes('Chrome/'))  browser = 'Chrome';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/'))  browser = 'Safari';
    let os = 'Desconhecido';
    if      (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Mac'))     os = 'macOS';
    else if (ua.includes('Linux'))   os = 'Linux';
    const LOG_KEY = 'rh_audit_log';
    const logs    = await LS.get(LOG_KEY, []);
    logs.unshift({
      id:       uid(),
      ts:       new Date().toISOString(),
      userId:   session.id,
      userName: session.name,
      acao, modulo, detalhes,
      device:   `${browser} · ${os}`,
    });
    const corte48h = new Date();
    corte48h.setHours(corte48h.getHours() - 48);
    const filtrado = logs.filter(l => new Date(l.ts) >= corte48h);
    await LS.set(LOG_KEY, filtrado.slice(0, 500));
  } catch(e) {
    console.error('[registrarLog] erro:', e);
  }
}
