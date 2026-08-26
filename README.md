# RH Nagumo v3.0

Sistema de gestão de ponto e funcionários com persistência JSON mensal e pasta compartilhada na rede.

## Como usar

```bash
npm install
npm start
```

## Estrutura

- Cada líder tem seu próprio subdiretório na pasta compartilhada
- Dados partitionados por mês (ponto, ocorrências, aptidões)
- Transferência portátil de funcionários entre líderes
