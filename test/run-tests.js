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
const dataClientesDemo = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'seed-clientes-demo.json'), 'utf8')
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

console.log('\nCorrelação Cliente -> Área -> Técnico (base demo)\n');

test('GERDAU correlaciona com OESTE/ILTEARLE (score alto, sem alterar o texto)', () => {
  const r = Core.correlateClient('ERPM - GERDAU', dataClientesDemo, {});
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.area, 'OESTE');
  assert.strictEqual(r.tecnico, 'ILTEARLE');
});

test('POSTO IND - PRINCESA ISABEL correlaciona com NORTE/BRUNO (lacuna resolvida, seção 8)', () => {
  const r = Core.correlateClient('ERPM - POSTO IND - PRINCESA ISABEL', dataClientesDemo, {});
  assert.ok(r.score >= 0.42, `score muito baixo: ${r.score}`);
  assert.strictEqual(r.area, 'NORTE');
  assert.strictEqual(r.tecnico, 'BRUNO');
});

test('MAURICÉA RAÇÕES (com acento) correlaciona com OESTE/ILTEARLE mesmo com variante de grafia', () => {
  const r = Core.correlateClient('ERPM - MAURICÉA RAÇÕES', dataClientesDemo, {});
  assert.ok(r.score >= 0.42, `score muito baixo: ${r.score}`);
  assert.strictEqual(r.area, 'OESTE');
});

test('cliente totalmente desconhecido (CERÂMICA MARI 2) fica sem-correlacao contra base demo', () => {
  const r = Core.correlateClient(
    'ERPM - CERÂMICA MARI 2 (MORAES ARTEFATOS CERÂMICOS 2)',
    dataClientesDemo,
    {}
  );
  assert.strictEqual(r.status, 'sem-correlacao');
  assert.strictEqual(r.area, null);
});

test('override manual passa a resolver um cliente antes sem-correlacao', () => {
  const overrides = {
    [Core.normalize('ERPM - CERÂMICA MARI 2 (MORAES ARTEFATOS CERÂMICOS 2)')]: {
      label: 'ERPM - CERÂMICA MARI 2 (MORAES ARTEFATOS CERÂMICOS 2)',
      area: 'NORTE',
    },
  };
  const r = Core.correlateClient(
    'ERPM - CERÂMICA MARI 2 (MORAES ARTEFATOS CERÂMICOS 2)',
    dataClientesDemo,
    overrides
  );
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.area, 'NORTE');
  assert.strictEqual(r.tecnico, 'BRUNO');
});

test('execToArea deriva área a partir do EXECUTANTE de registros seed', () => {
  assert.strictEqual(Core.execToArea('BRUNO SILVA'), 'NORTE');
  assert.strictEqual(Core.execToArea('RUBENING SANTOS'), 'SUL');
  assert.strictEqual(Core.execToArea('ILTEARLE COSTA'), 'OESTE');
  assert.strictEqual(Core.execToArea('MEDIÇÃO'), 'OUTRO');
});

console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
