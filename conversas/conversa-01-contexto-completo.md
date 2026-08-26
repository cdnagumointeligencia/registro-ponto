# Conversa 01 — Contexto Completo do Projeto RH Nagumo

**Data:** 2026-05-22
**Objetivo:** Migrar app Electron de SQLite para JSON mensal com pasta compartilhada

---

## 1. O que é o projeto

App desktop Electron chamado "RH Nagumo" v2.0.0 — sistema RH offline-first para controle de ponto, funcionários, ocorrências, aptidões, ranking, etc.

- **Electron 31.0.0** + **better-sqlite3** + **bcryptjs**
- **Credenciais admin:** `admin@nagumo.com.br` / `admin123` / auth code `NAGUMO2025`
- **Localização atual:** `C:\Users\marcos.marques\Desktop\REGISTRO PONTO\electron-app\`
- **GitHub:** `https://github.com/cdnagumointeligencia/registro-ponto` (será limpo e recriado)

---

## 2. O que o usuário quer

### Modelo de pasta compartilhada na rede
- Cada **líder** tem seu próprio subdiretório na pasta compartilhada
- Cada líder vê **apenas seus próprios dados**
- O **admin** vê todos
- Um atalho no desktop de cada líder aponta para a pasta compartilhada

### Particionamento mensal por JSON
- `config.json` — dados não datados (employees, users, config)
- `ponto-YYYY-MM.json` — registros de ponto
- `ocorrencias-YYYY-MM.json` — ocorrências
- `aptidoes-YYYY-MM.json` — aptidões
- Lazy loading: só carrega mês corrente + meses visitados
- Gravação restrita ao mês corrente

### Transferência de funcionários
- Botão "Transferir" gera JSON portátil com todos os dados do funcionário
- Destino importa e integra com novo setor/turno
- Validação de integridade e duplicatas

### Hierarquia
- Admin registra líderes
- Líderes registram seus funcionários
- Coordenador importa arquivos mensais de vários líderes para visão consolidada

---

## 3. O que já foi feito (esta sessão)

### Concluído
- [x] Identificado bug no `db-local.js` (linhas 46/69 — aspas escapadas)
- [x] Lido todos os arquivos-chave do projeto atual
- [x] Lido documento de particionamento mensal (`Prompts/particionamento-mensal-dados-electron.md`)
- [x] Lido PROMPT MESTRE de engenharia (`Prompts/PROMPT MESTRE...md`)
- [x] Projetado arquitetura nova
- [x] Criada estrutura de pastas do novo projeto em `registro-ponto/`
- [x] Criada pasta `conversas/`

### Pendente
- [ ] Criar `package.json` e configurar Electron
- [ ] Criar `main.js` e `preload.js`
- [ ] Criar `db-local.js` (persistência JSON)
- [ ] Criar `shared.js`
- [ ] Migrar todas as páginas HTML/JS/CSS
- [ ] Implementar transferência de funcionários
- [ ] Implementar importação/exportação mensal
- [ ] Testar login e funcionamento
- [ ] Push para GitHub

---

## 4. Estrutura do novo projeto

```
registro-ponto/
├── conversas/                    # Histórico de conversas
├── electron/
│   ├── main.js                   # Processo principal + IPC
│   └── preload.js                # Context bridge
├── renderer/
│   ├── db-local.js               # Persistência JSON por mês
│   ├── shared.js                 # Lógica de negócio
│   ├── permissions.js            # Permissões
│   ├── login.html                # Tela de login
│   ├── index.html                # Dashboard
│   ├── sidebar.css               # Sidebar
│   ├── dashboard.css             # Dashboard
│   ├── light-theme.css           # Tema claro
│   ├── responsive.css            # Responsivo
│   ├── base.css                  # Variáveis CSS
│   ├── lib/                      # Bibliotecas
│   │   ├── chart.umd.min.js
│   │   └── jspdf.umd.min.js
│   └── pages/
│       ├── config.html + .js     # Configurações
│       ├── employees.html + .js  # Funcionários
│       ├── leaders.html + .js    # Líderes
│       ├── ponto.html + .js      # Ponto diário
│       ├── ocorrencias.html + .js # Ocorrências
│       ├── aptidoes.html + .js   # Aptidões
│       ├── report.html + .js     # Relatório
│       ├── audit.html + .js      # Auditoria
│       ├── absenteeism.html + .js # Absenteísmo
│       ├── quadro.html + .js     # Quadro operacional
│       └── ranking.html + .js    # Ranking
├── assets/                       # Logos, imagens
├── package.json
├── .gitignore
└── README.md
```

---

## 5. Arquitetura de persistência JSON

### Estrutura de dados por líder
```
\\servidor\nagumo\
├── admin@nagumo.com.br\
│   ├── config.json
│   ├── ponto-2026-05.json
│   ├── ocorrencias-2026-05.json
│   └── aptidoes-2026-05.json
├── lider1@email.com\
│   ├── config.json
│   ├── ponto-2026-05.json
│   └── ...
└── lider2@email.com\
    ├── config.json
    └── ...
```

### Formato dos arquivos

**config.json:**
```json
{
  "users": { "email@exemplo.com": { "id": "...", "name": "...", "nivel": "lider", ... } },
  "employees": [ { "id": "...", "nome": "...", "login_id": "...", ... } ],
  "depts": [ { "nome": "Produção" } ],
  "filiais": [ { "nome": "Matriz" } ],
  "turnos": [ { "nome": "Diurno" } ],
  "funcoes": [ { "nome": "Operador" } ],
  "feriados": [],
  "permOverrides": null,
  "authCode": "NAGUMO2025",
  "config": { "companyName": "RH Nagumo", ... }
}
```

**ponto-2026-05.json:**
```json
{
  "registros": [
    {
      "id": "func_id",
      "nome": "João da Silva",
      "dept": "Produção",
      "filial": "Matriz",
      "turno": "Diurno",
      "dias": {
        "2026-05-01": { "entrada": "08:00", "saida": "17:00", "obs": "" },
        "2026-05-02": { "entrada": "08:00", "saida": "17:00", "obs": "" }
      }
    }
  ]
}
```

### Funções do novo db-local.js
- `loadData(type, yearMonth)` — carrega JSON do disco (com cache)
- `saveData(type, yearMonth, data)` — salva JSON no disco
- `ensureMonthLoaded(yearMonth)` — lazy loading do mês
- `migrateFromDB()` — migra SQLite → JSON (one-shot)
- `getLeaderDir()` — retorna pasta do líder logado
- `listMonths()` — lista meses disponíveis

---

## 6. Documentos de referência

### Particionamento mensal (`Prompts/particionamento-mensal-dados-electron.md`)
- Lazy loading com `ensureMonthLoaded()`
- Cache em memória (Map)
- Nunca carregar todos os meses
- Gravação restrita ao mês corrente
- Migração one-shot do formato antigo

### PROMPT MESTRE (`Prompts/PROMPT MESTRE...md`)
- Issues + branches + PRs no GitHub
- Commits convencionais (feat:, fix:, refactor:)
- Código limpo, sem overengineering
- Testes proporcionais
- Tratamento de erros amigável
- Sem dependências desnecessárias

---

## 7. Observações importantes

- `gh` CLI **não está instalado** na máquina do usuário — usar `github_*` tools
- `better-sqlite3` é incompatível com Node v24 do sistema (ABI mismatch) — não será necessário após migração
- O repositório GitHub antigo terá todo o conteúdo removido e será recriado do zero
- Usuário prefere respostas breves ("big" = ser breve)
- Usuário se comunica em português

---

## 8. Próximo passo

Apresentar plano ao usuário para aprovação → Implementar Fase 1 (projeto limpo + package.json)
