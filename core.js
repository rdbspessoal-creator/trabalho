/**
 * core.js — lógica de negócio do Sistema de Mapeamento de Demandas de Medição.
 * Compartilhado entre a aplicação (sistema_demandas_medicao.html) e os testes
 * automatizados (test/run-tests.js). UMD simples: expõe `DemandasCore` tanto
 * em `window` (browser) quanto via `module.exports` (Node).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.DemandasCore = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const AREA_TECNICO = { NORTE: 'BRUNO', SUL: 'RUBENING', OESTE: 'ILTEARLE' };

  // ---------------------------------------------------------------------
  // Normalização e correlação Cliente -> Área -> Técnico
  // ---------------------------------------------------------------------

  function normalize(s) {
    return (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function areaToTecnico(area) {
    return AREA_TECNICO[area] || null;
  }

  // EXECUTANTE (registros de histórico/seed) -> ÁREA
  function execToArea(executante) {
    const n = normalize(executante);
    if (n.includes('BRUNO')) return 'NORTE';
    if (n.includes('RUBENING')) return 'SUL';
    if (n.includes('ILTEARLE')) return 'OESTE';
    return 'OUTRO';
  }

  // EQUIPE (planilha CLIENTES_X_EQUIPE) -> ÁREA
  function equipeToArea(equipe) {
    const n = normalize(equipe);
    if (n.includes('NORTE')) return 'NORTE';
    if (n.includes('SUL')) return 'SUL';
    if (n.includes('OESTE') || n.includes('SERTAO')) return 'OESTE';
    return null;
  }

  function buildEntries(dataClientes, overrides) {
    const entries = (dataClientes || []).map((c) => ({
      label: c.cliente,
      area: c.area,
      origem: 'base',
      codigo: c.codigo,
      nome: c.nome,
      norm: normalize(c.cliente),
    }));
    Object.keys(overrides || {}).forEach((k) => {
      const o = overrides[k];
      entries.push({ label: o.label, area: o.area, origem: 'override', norm: k });
    });
    return entries;
  }

  function scoreMatch(normA, normB) {
    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;
    if (normA.includes(normB) || normB.includes(normA)) {
      const shorter = Math.min(normA.length, normB.length);
      const longer = Math.max(normA.length, normB.length);
      return 0.65 + 0.3 * (shorter / longer);
    }
    const tokensA = new Set(normA.split(' ').filter(Boolean));
    const tokensB = new Set(normB.split(' ').filter(Boolean));
    const inter = [...tokensA].filter((t) => tokensB.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    if (union === 0) return 0;
    return (inter / union) * 0.9;
  }

  /**
   * Correlaciona o texto de cliente vindo da imagem/manual com a base de
   * clientes (DATA_CLIENTES) + overrides manuais. Mantém o texto original
   * (ex.: "ERPM - GERDAU"), sem remover prefixos — descoberta documentada:
   * a base também carrega esses prefixos, então isso melhora o score.
   */
  function correlateClient(clienteRaw, dataClientes, overrides) {
    const normQuery = normalize(clienteRaw);
    const entries = buildEntries(dataClientes, overrides);
    let best = null;
    for (const e of entries) {
      let score = scoreMatch(normQuery, e.norm);
      if (e.origem === 'override') score += 0.001;
      if (!best || score > best.score) {
        best = { score, label: e.label, area: e.area, origem: e.origem };
      }
    }
    let status;
    if (!best || best.score < 0.42) status = 'sem-correlacao';
    else if (best.score < 0.82) status = 'sugerido';
    else status = 'ok';

    const area = status === 'sem-correlacao' ? null : best.area;
    return {
      status,
      score: best ? Number(best.score.toFixed(4)) : 0,
      match: best ? best.label : null,
      area,
      tecnico: area ? areaToTecnico(area) : null,
    };
  }

  function topCandidates(clienteRaw, dataClientes, overrides, n) {
    const normQuery = normalize(clienteRaw);
    const entries = buildEntries(dataClientes, overrides);
    return entries
      .map((e) => ({ ...e, score: scoreMatch(normQuery, e.norm) + (e.origem === 'override' ? 0.001 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n || 3);
  }

  // ---------------------------------------------------------------------
  // Formato B (matriz/checklist) -> defeito / ação
  // Regras da seção 6.1 das especificações.
  // ---------------------------------------------------------------------

  const DEFEITO_TEXT = {
    telemetria: 'INFRA DE TELEMETRIA PENDENTE',
    infraPendente: 'INFRA DE TELEMETRIA PENDENTE',
    energia: 'FALTA DE ALIMENTAÇÃO EXT.',
    cvaz: 'FALHA NO CVAZ',
    pulso: 'FALHA NO PULSO',
  };

  function matrixToDefeito(flags) {
    flags = flags || {};
    const parts = [];
    const seen = new Set();
    const push = (t) => {
      if (!seen.has(t)) {
        seen.add(t);
        parts.push(t);
      }
    };
    if (flags.telemetria) push(DEFEITO_TEXT.telemetria);
    if (flags.infraPendente) push(DEFEITO_TEXT.infraPendente);
    if (flags.energia) push(DEFEITO_TEXT.energia);
    if (flags.cvaz) push(DEFEITO_TEXT.cvaz);
    if (flags.pulso) push(DEFEITO_TEXT.pulso);
    return parts.length ? parts.join(' | ') : 'N/A';
  }

  function matrixToAcao(flags) {
    flags = flags || {};
    const parts = ['COLETAR MEDIÇÃO'];
    if (flags.energia) parts.push('RESTABELECER ALIMENTAÇÃO 220V');
    if (flags.telemetria || flags.infraPendente) parts.push('RESTABELECER TELEMETRIA');
    if (flags.cvaz) parts.push('VERIFICAR COMUNICAÇÃO DO CVAZ');
    if (flags.pulso) parts.push('VERIFICAR PULSO');
    return parts.join(' + ');
  }

  /**
   * Converte uma linha lida no formato matriz (booleans por coluna) no
   * registro de demanda parcial {cliente, data, defeito, acao, detalhamento, confianca}.
   * `cliente` (coluna "Estação") não é alterado.
   */
  function matrixRowToDemanda(row) {
    return {
      cliente: row.estacao || row.cliente || '',
      executante: '',
      data: row.data || '',
      defeito: matrixToDefeito(row),
      acao: matrixToAcao(row),
      detalhamento: row.comentarios || row.detalhamento || '',
      confianca: row.confianca || 'alta',
    };
  }

  // ---------------------------------------------------------------------
  // Datas
  // ---------------------------------------------------------------------

  // Converte "DD/MM/AAAA" -> "AAAA-MM-DD"; retorna '' se inválido/vazio.
  function brDateToIso(s) {
    if (!s) return '';
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
    if (!m) return '';
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  function isValidIsoDate(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  }

  return {
    normalize,
    areaToTecnico,
    execToArea,
    equipeToArea,
    buildEntries,
    scoreMatch,
    correlateClient,
    topCandidates,
    matrixToDefeito,
    matrixToAcao,
    matrixRowToDemanda,
    brDateToIso,
    isValidIsoDate,
  };
});
