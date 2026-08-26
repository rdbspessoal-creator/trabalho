#!/usr/bin/env node
/**
 * Testes automatizados do núcleo de lógica (core.js), usando a imagem
 * padrão de teste (tabela em formato matriz/checklist) como fixture.
 * Rodar com: node test/run-tests.js
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const Core = require(path.join(__dirname, '..', 'core.js'));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-imagem-teste.json'), 'utf8'));
const dataClientesReais = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'seed-clientes.json'), 'utf8')
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL  - ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

console.log('Fixture: tabela em formato matriz (imagem padrão de teste)\n');

const rows = fixture.linhas;
assert.strictEqual(rows.length, 8, 'fixture deve ter 8 linhas (transcrição da imagem)');

test('linha 1 (CERÂMICA MARI 2): defeito/ação/data/comentário extraídos fielmente', () => {
  const d = Core.matrixRowToDemanda(rows[0]);
  assert.strictEqual(d.cliente, 'ERPM - CERÂMICA MARI 2 (MORAES ARTEFATOS CERÂMICOS 2)');
  assert.strictEqual(Core.brDateToIso(rows[0].data), '2026-08-03');
  assert.strictEqual(d.defeito, 'INFRA DE TELEMETRIA PENDENTE | FALHA NO CVAZ');
  assert.strictEqual(d.acao, 'COLETAR MEDIÇÃO + RESTABELECER TELEMETRIA + VERIFICAR COMUNICAÇÃO DO CVAZ');
  assert.strictEqual(d.detalhamento, 'Sem dados desde 13/7');
});

test('linha 2 (VOLTA AO MUNDO): mesmo padrão telemetria+cvaz', () => {
  const d = Core.matrixRowToDemanda(rows[1]);
  assert.strictEqual(d.defeito, 'INFRA DE TELEMETRIA PENDENTE | FALHA NO CVAZ');
  assert.strictEqual(d.acao, 'COLETAR MEDIÇÃO + RESTABELECER TELEMETRIA + VERIFICAR COMUNICAÇÃO DO CVAZ');
});

test('linha 3 (GERDAU): telemetria + energia + cvaz -> defeito e ação somados corretamente', () => {
  const d = Core.matrixRowToDemanda(rows[2]);
  assert.strictEqual(
    d.defeito,
    'INFRA DE TELEMETRIA PENDENTE | FALTA DE ALIMENTAÇÃO EXT. | FALHA NO CVAZ'
  );
  assert.strictEqual(
    d.acao,
    'COLETAR MEDIÇÃO + RESTABELECER ALIMENTAÇÃO 220V + RESTABELECER TELEMETRIA + VERIFICAR COMUNICAÇÃO DO CVAZ'
  );
});

test('linha 4 (MAURICÉA RAÇÕES): confiança baixa sinalizada (inconsistência 220V x checkbox)', () => {
  assert.strictEqual(rows[3].confianca, 'baixa');
  const d = Core.matrixRowToDemanda(rows[3]);
  assert.strictEqual(d.confianca, 'baixa');
});

test('linha 7 (PRINCESA ISABEL): só energia marcada -> defeito e ação mínimos', () => {
  const d = Core.matrixRowToDemanda(rows[6]);
  assert.strictEqual(d.defeito, 'FALTA DE ALIMENTAÇÃO EXT.');
  assert.strictEqual(d.acao, 'COLETAR MEDIÇÃO + RESTABELECER ALIMENTAÇÃO 220V');
});

test('linha 8 (SHOPPING RECIFE): energia + cvaz somados, telemetria ausente', () => {
  const d = Core.matrixRowToDemanda(rows[7]);
  assert.strictEqual(d.defeito, 'FALTA DE ALIMENTAÇÃO EXT. | FALHA NO CVAZ');
  assert.strictEqual(d.acao, 'COLETAR MEDIÇÃO + RESTABELECER ALIMENTAÇÃO 220V + VERIFICAR COMUNICAÇÃO DO CVAZ');
});

test('nenhuma linha usa "DEMANDA MEDIÇÃO" como coluna de defeito (é só flag estrutural)', () => {
  rows.forEach((r) => {
    const d = Core.matrixToDefeito(r);
    assert.ok(!d.includes('DEMANDA'), `defeito não deveria mencionar DEMANDA MEDIÇÃO: "${d}"`);
  });
});

test('todas as 8 linhas produzem data ISO válida 2026-08-03', () => {
  rows.forEach((r) => {
    const iso = Core.brDateToIso(r.data);
    assert.strictEqual(iso, '2026-08-03');
    assert.ok(Core.isValidIsoDate(iso));
  });
});

console.log(`\nCorrelação Cliente -> Área -> Técnico (base REAL: ${dataClientesReais.length} clientes de CLIENTES_X_EQUIPE.xlsx)\n`);

test('base de clientes real tem 258 registros (254 da planilha + 4 lacunas resolvidas da seção 8)', () => {
  assert.strictEqual(dataClientesReais.length, 258);
});

test('as 8 estações da imagem correlacionam contra a base real como esperado (7 mapeadas, 1 lacuna genuína)', () => {
  const results = fixture.linhas.map((row) => Core.correlateClient(row.estacao, dataClientesReais, {}));
  const naoSemCorrelacao = results.filter((r) => r.status !== 'sem-correlacao');
  assert.strictEqual(
    naoSemCorrelacao.length,
    7,
    `esperado 7 estações correlacionadas, obtido ${naoSemCorrelacao.length}`
  );
});

test('ERPM - GERDAU correlaciona com OESTE/ILTEARLE contra a base real', () => {
  const r = Core.correlateClient('ERPM - GERDAU', dataClientesReais, {});
  assert.strictEqual(r.area, 'OESTE');
  assert.strictEqual(r.tecnico, 'ILTEARLE');
  assert.ok(r.score >= 0.42);
});

test('ERPM - PERQUÍMICA correlaciona com alta confiança (status ok) para SUL/RUBENING', () => {
  const r = Core.correlateClient('ERPM - PERQUÍMICA', dataClientesReais, {});
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.area, 'SUL');
  assert.strictEqual(r.tecnico, 'RUBENING');
});

test('ERPM - POSTO IND - PRINCESA ISABEL correlaciona com NORTE/BRUNO (lacuna resolvida, seção 8)', () => {
  const r = Core.correlateClient('ERPM - POSTO IND - PRINCESA ISABEL', dataClientesReais, {});
  assert.ok(r.score >= 0.42, `score muito baixo: ${r.score}`);
  assert.strictEqual(r.area, 'NORTE');
  assert.strictEqual(r.tecnico, 'BRUNO');
});

test('ERPM - MAURICÉA RAÇÕES (variante de grafia) correlaciona com OESTE/ILTEARLE', () => {
  const r = Core.correlateClient('ERPM - MAURICÉA RAÇÕES', dataClientesReais, {});
  assert.ok(r.score >= 0.42, `score muito baixo: ${r.score}`);
  assert.strictEqual(r.area, 'OESTE');
  assert.strictEqual(r.tecnico, 'ILTEARLE');
});

test('ERPM - POSTO IND - MM PETROLEO TACARUNA fica sem-correlacao (lacuna genuína e ainda não resolvida)', () => {
  const r = Core.correlateClient('ERPM - POSTO IND - MM PETROLEO TACARUNA', dataClientesReais, {});
  assert.strictEqual(r.status, 'sem-correlacao');
  assert.strictEqual(r.area, null);
});

test('override manual resolve a lacuna do MM PETROLEO TACARUNA', () => {
  const overrides = {
    [Core.normalize('ERPM - POSTO IND - MM PETROLEO TACARUNA')]: {
      label: 'ERPM - POSTO IND - MM PETROLEO TACARUNA',
      area: 'OESTE',
    },
  };
  const r = Core.correlateClient('ERPM - POSTO IND - MM PETROLEO TACARUNA', dataClientesReais, overrides);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.area, 'OESTE');
  assert.strictEqual(r.tecnico, 'ILTEARLE');
});

test('execToArea deriva área a partir do EXECUTANTE de registros seed', () => {
  assert.strictEqual(Core.execToArea('BRUNO SILVA'), 'NORTE');
  assert.strictEqual(Core.execToArea('RUBENING SANTOS'), 'SUL');
  assert.strictEqual(Core.execToArea('ILTEARLE COSTA'), 'OESTE');
  assert.strictEqual(Core.execToArea('MEDIÇÃO'), 'OUTRO');
});

console.log('\nSeed de histórico real (Demanda_de_Medição_Modelo.xlsx)\n');

test('seed-demandas.json tem 419 registros de HISTÓRICO_ORIGINAL e 9 de MÊS_ATUAL', () => {
  const seed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'seed-demandas.json'), 'utf8')
  );
  assert.strictEqual(seed.historico.length, 419);
  assert.strictEqual(seed.mesAtual.length, 9);
});

console.log('\nImportação de tabela colada (Excel/CSV/TSV) — parsePastedTable\n');

test('formato A: cabeçalho de texto livre é reconhecido e linhas viram registros', () => {
  const texto = [
    'CLIENTE\tEXECUTANTE\tDATA\tDEFEITO\tAÇÃO\tDETALHAMENTO',
    'ERPM - GERDAU\tILTEARLE\t11/08/2026\tMODEM DESCONECTADO\tCOLETAR MEDIÇÃO\tAGENDAR ESCOLTA',
  ].join('\n');
  const r = Core.parsePastedTable(texto);
  assert.strictEqual(r.formato, 'A');
  assert.strictEqual(r.linhas.length, 1);
  assert.strictEqual(r.linhas[0].cliente, 'ERPM - GERDAU');
  assert.strictEqual(r.linhas[0].data, '2026-08-11');
  assert.strictEqual(r.linhas[0].defeito, 'MODEM DESCONECTADO');
});

test('formato B: cabeçalho matriz/checklist é reconhecido, "X" vira flag e datas BR viram ISO', () => {
  const texto = [
    'Estação\tData\tDEMANDA MEDIÇÃO\tTELEMETRIA\tENERGIA (220V)\tINFRA PENDENTE\tDADOS DO CVAZ\tPULSO\tComentários',
    'ERPM - GERDAU\t03/08/2026\tX\tX\tX\t\tX\t\tSem dados desde 30/6',
  ].join('\n');
  const r = Core.parsePastedTable(texto);
  assert.strictEqual(r.formato, 'B');
  assert.strictEqual(r.linhas.length, 1);
  const linha = r.linhas[0];
  assert.strictEqual(linha.estacao, 'ERPM - GERDAU');
  assert.strictEqual(linha.data, '2026-08-03');
  assert.strictEqual(linha.telemetria, true);
  assert.strictEqual(linha.energia, true);
  assert.strictEqual(linha.infraPendente, false);
  assert.strictEqual(linha.pulso, false);
  const d = Core.matrixRowToDemanda(linha);
  assert.strictEqual(d.defeito, 'INFRA DE TELEMETRIA PENDENTE | FALTA DE ALIMENTAÇÃO EXT. | FALHA NO CVAZ');
});

test('formato B: linha sem colunas de defeito marcadas mas comentário cita "220 V" sinaliza confiança baixa', () => {
  const texto = [
    'Estação\tData\tDEMANDA MEDIÇÃO\tTELEMETRIA\tENERGIA (220V)\tINFRA PENDENTE\tDADOS DO CVAZ\tPULSO\tComentários',
    'ERPM - MAURICÉA RAÇÕES\t03/08/2026\tX\tX\t\t\t\t\tSem 220 V e dados desde 31/7',
  ].join('\n');
  const r = Core.parsePastedTable(texto);
  assert.strictEqual(r.linhas[0].confianca, 'baixa');
});

test('linhas sem valor na coluna de cliente/estação são descartadas (separadores em branco)', () => {
  const texto = [
    'CLIENTE\tEXECUTANTE\tDATA\tDEFEITO\tAÇÃO\tDETALHAMENTO',
    '\t\t11/08/2026\t\t\t',
    'GERDAU\tILTEARLE\t11/08/2026\tMODEM DESCONECTADO\tCOLETAR MEDIÇÃO\t',
  ].join('\n');
  const r = Core.parsePastedTable(texto);
  assert.strictEqual(r.linhas.length, 1);
  assert.strictEqual(r.linhas[0].cliente, 'GERDAU');
});

test('texto vazio retorna zero linhas sem lançar erro', () => {
  const r = Core.parsePastedTable('   \n  \n');
  assert.strictEqual(r.linhas.length, 0);
});

console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
