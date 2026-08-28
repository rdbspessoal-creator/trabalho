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

  // Lista fechada de defeitos — a UI usa exatamente estas opções (select),
  // e matrixToDefeito só pode devolver um destes valores.
  const DEFEITO_OPTIONS = [
    'COMISSIONAMENTO DA TELEMETRIA',
    'FALHA NO CVAZ',
    'FALTA DE ALIMENTAÇÃO EXT.',
    'FALHA NO PULSO',
    'INFRA DE TELEMETRIA PENDENTE',
    'MODEM DESCONECTADO',
    'N/A',
    'OUTROS',
  ];

  // Quando mais de uma coluna vem marcada na mesma linha, só uma vira o
  // defeito — nesta ordem de prioridade (a mais prioritária primeiro).
  const DEFEITO_PRIORITY = [
    { flag: 'infraPendente', defeito: 'INFRA DE TELEMETRIA PENDENTE' },
    { flag: 'pulso', defeito: 'FALHA NO PULSO' },
    { flag: 'energia', defeito: 'FALTA DE ALIMENTAÇÃO EXT.' },
    { flag: 'cvaz', defeito: 'FALHA NO CVAZ' },
    { flag: 'telemetria', defeito: 'MODEM DESCONECTADO' },
  ];

  function matrixToDefeito(flags) {
    flags = flags || {};
    const hit = DEFEITO_PRIORITY.find((p) => flags[p.flag]);
    return hit ? hit.defeito : 'N/A';
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

  // ---------------------------------------------------------------------
  // Importação de tabela colada (Excel/CSV/TSV) — sem IA, 100% local.
  // ---------------------------------------------------------------------

  function detectDelimiter(line) {
    if (line.includes('\t')) return '\t';
    if (line.includes(';')) return ';';
    if (line.includes(',')) return ',';
    return null;
  }

  function splitRow(line, delim) {
    if (delim) return line.split(delim).map((c) => c.trim());
    return line.trim().split(/\s{2,}/).map((c) => c.trim());
  }

  function findCol(normalizedHeader, candidates) {
    for (const cand of candidates) {
      const i = normalizedHeader.findIndex((h) => h.includes(cand));
      if (i >= 0) return i;
    }
    return -1;
  }

  function cellDate(cell) {
    if (!cell) return '';
    return isValidIsoDate(cell) ? cell : brDateToIso(cell);
  }

  /**
   * Interpreta texto colado (copiado de uma planilha Excel — tabulado — ou
   * CSV/TSV exportado) na mesma estrutura que a extração por imagem produz:
   * { formato: 'A'|'B', linhas: [...] }, consumível por ingestParsedImage.
   * Primeira linha não vazia = cabeçalho; detecta o formato pelos nomes de
   * coluna (formato B tem TELEMETRIA/CVAZ/PULSO/ENERGIA/INFRA PENDENTE).
   */
  function parsePastedTable(text) {
    const lines = (text || '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) return { formato: 'A', linhas: [] };

    const delim = detectDelimiter(lines[0]);
    const header = splitRow(lines[0], delim);
    const normHeader = header.map(normalize);

    const isFormatB = normHeader.some(
      (h) => h.includes('TELEMETRIA') || h.includes('CVAZ') || h.includes('PULSO') || h.includes('ENERGIA') || h.includes('INFRA PENDENTE')
    );
    const formato = isFormatB ? 'B' : 'A';
    const linhas = [];

    if (formato === 'A') {
      const iCliente = findCol(normHeader, ['CLIENTE', 'ESTACAO']);
      const iExecutante = findCol(normHeader, ['EXECUTANTE', 'TECNICO']);
      const iData = findCol(normHeader, ['DATA']);
      const iDefeito = findCol(normHeader, ['DEFEITO']);
      const iAcao = findCol(normHeader, ['ACAO']);
      const iDetalhamento = findCol(normHeader, ['DETALHAMENTO', 'COMENTARIO']);
      for (let r = 1; r < lines.length; r++) {
        const cells = splitRow(lines[r], delim);
        const cliente = (iCliente >= 0 ? cells[iCliente] : '') || '';
        if (!cliente.trim()) continue;
        linhas.push({
          cliente: cliente.trim(),
          executante: iExecutante >= 0 ? (cells[iExecutante] || '').trim() : '',
          data: cellDate(cells[iData]),
          defeito: iDefeito >= 0 ? (cells[iDefeito] || '').trim() : '',
          acao: iAcao >= 0 ? (cells[iAcao] || '').trim() : '',
          detalhamento: iDetalhamento >= 0 ? (cells[iDetalhamento] || '').trim() : '',
          confianca: 'alta',
        });
      }
    } else {
      const iEstacao = findCol(normHeader, ['ESTACAO', 'CLIENTE']);
      const iData = findCol(normHeader, ['DATA']);
      const iDemanda = findCol(normHeader, ['DEMANDA MEDICAO']);
      const iTelemetria = findCol(normHeader, ['TELEMETRIA']);
      const iEnergia = findCol(normHeader, ['ENERGIA']);
      const iInfra = findCol(normHeader, ['INFRA PENDENTE']);
      const iCvaz = findCol(normHeader, ['CVAZ']);
      const iPulso = findCol(normHeader, ['PULSO']);
      const iComentarios = findCol(normHeader, ['COMENTARIO']);
      for (let r = 1; r < lines.length; r++) {
        const cells = splitRow(lines[r], delim);
        const estacao = (iEstacao >= 0 ? cells[iEstacao] : '') || '';
        if (!estacao.trim()) continue;
        const marked = (i) => i >= 0 && !!(cells[i] || '').trim();
        const comentarios = iComentarios >= 0 ? (cells[iComentarios] || '').trim() : '';
        const energia = marked(iEnergia);
        const confianca = /220\s*V/i.test(comentarios) && !energia ? 'baixa' : 'alta';
        linhas.push({
          estacao: estacao.trim(),
          data: cellDate(cells[iData]),
          demandaMedicao: marked(iDemanda),
          telemetria: marked(iTelemetria),
          energia,
          infraPendente: marked(iInfra),
          cvaz: marked(iCvaz),
          pulso: marked(iPulso),
          comentarios,
          confianca,
        });
      }
    }
    return { formato, linhas };
  }

  // ---------------------------------------------------------------------
  // Reconstrução de tabela a partir de itens posicionados (x, y) — usada
  // pelo extrator de PDF (pdf.js, coordenadas do texto real) e pelo OCR de
  // imagem (Tesseract, coordenadas de cada palavra reconhecida). Agrupa
  // itens em linhas por proximidade vertical, usa a primeira linha como
  // cabeçalho para definir as colunas (por posição horizontal) e encaixa
  // o resto das linhas nessas colunas, produzindo texto TSV consumível
  // por parsePastedTable — exatamente como colar do Excel.
  // ---------------------------------------------------------------------

  // OCR de tabela costuma ler as bordas verticais das células como um
  // caractere de texto isolado ("|" e variantes) — nunca é conteúdo real,
  // e se não for descartado antes do agrupamento por proximidade ele "cola"
  // duas colunas vizinhas em uma só (o traço fica perto demais de ambas).
  const BORDER_NOISE = /^[|¦‖]$/;

  function reconstructTableText(items) {
    const pts = (items || [])
      .filter((it) => it && it.text && String(it.text).trim() !== '')
      .filter((it) => !BORDER_NOISE.test(String(it.text).trim()));
    if (!pts.length) return '';

    const sorted = pts.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const heights = sorted.map((p) => p.height || 12).filter((h) => h > 0).sort((a, b) => a - b);
    const medH = heights.length ? heights[Math.floor(heights.length / 2)] : 12;
    const lineGap = Math.max(medH * 0.6, 4);

    const lines = [];
    let current = null;
    sorted.forEach((p) => {
      if (!current || Math.abs(p.y - current.y) > lineGap) {
        current = { y: p.y, n: 0, items: [] };
        lines.push(current);
      }
      current.items.push(p);
      current.n += 1;
      current.y = current.y + (p.y - current.y) / current.n;
    });
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));

    // Em fotos reais o cabeçalho normalmente quebra em 2 linhas visuais
    // dentro da mesma célula (ex.: "DEMANDA" / "MEDIÇÃO", "DADOS DO" /
    // "CVAZ") — cada sublinha vira um cluster de linha diferente acima
    // (mesmo sendo a mesma linha de cabeçalho), o que quebraria a
    // detecção de colunas se não fossem juntadas antes de seguir. Junta
    // todas as linhas iniciais que ainda "parecem" fragmento de cabeçalho;
    // para não engolir a primeira linha de dado por engano (comentários
    // como "Sem dados desde..." também citam palavras do cabeçalho, tipo
    // "dados"), qualquer linha com uma data (DD/MM/AAAA) é tratada como
    // dado e interrompe a junção.
    const HEADER_KEYWORDS = ['ESTACAO', 'CLIENTE', 'DATA', 'DEMANDA', 'MEDICAO', 'TELEMETRIA', 'ENERGIA', 'INFRA', 'PENDENTE', 'CVAZ', 'DADOS', 'PULSO', 'COMENTARIO'];
    const DATE_TOKEN = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
    const looksLikeHeaderFragment = (line) => {
      const raw = line.items.map((it) => it.text).join(' ');
      if (DATE_TOKEN.test(raw)) return false;
      const norm = normalize(raw);
      if (!norm) return false;
      return HEADER_KEYWORDS.some((k) => norm.includes(k) || (norm.length >= 2 && k.includes(norm)));
    };
    let headerLineCount = 0;
    while (headerLineCount < lines.length && looksLikeHeaderFragment(lines[headerLineCount])) {
      headerLineCount++;
    }
    if (headerLineCount > 1) {
      const merged = [].concat(...lines.slice(0, headerLineCount).map((l) => l.items)).sort((a, b) => a.x - b.x);
      lines.splice(0, headerLineCount, { y: lines[0].y, items: merged });
    }

    // Um fragmento minúsculo de ruído do OCR (borda, pedaço de caractere
    // cortado) às vezes cai bem no meio do caminho entre duas colunas de
    // cabeçalho de verdade e as funde numa só. Descarta itens do
    // cabeçalho com altura muito menor que a mediana do próprio
    // cabeçalho — só aqui, não nas linhas de dado (que têm traços curtos
    // legítimos, como o "-" de "ERPM - GERDAU").
    const headerHeights = lines[0].items.map((it) => it.height || 0).filter((h) => h > 0).sort((a, b) => a - b);
    if (headerHeights.length > 2) {
      const medHeaderH = headerHeights[Math.floor(headerHeights.length / 2)];
      lines[0].items = lines[0].items.filter((it) => (it.height || medHeaderH) >= medHeaderH * 0.4);
    }

    // Cabeçalhos costumam ter células com mais de uma palavra (ex.: "DADOS
    // DO CVAZ", "ENERGIA (220V)") — cada palavra chega como um item
    // separado (principalmente vindo de OCR), então agrupa palavras
    // próximas horizontalmente numa mesma célula de cabeçalho antes de
    // definir as colunas; um espaçamento bem maior que o normal entre
    // palavras é o que separa uma célula da outra.
    const gapThreshold = Math.max(medH * 1.5, 10);
    const header = [];
    lines[0].items.forEach((it) => {
      const right = it.x + (it.width || 0);
      const last = header[header.length - 1];
      if (last && it.x - last.right <= gapThreshold) {
        last.text = `${last.text} ${it.text}`;
        last.right = Math.max(last.right, right);
      } else {
        header.push({ x: it.x, right, text: it.text });
      }
    });

    const bounds = header.map((h, i) => {
      const nextX = i < header.length - 1 ? header[i + 1].x : Infinity;
      return (h.right + nextX) / 2;
    });
    // A última coluna (tipicamente "Comentários", texto livre) costuma ter
    // o rótulo do cabeçalho centralizado bem à direita, enquanto o texto de
    // dado é alinhado à esquerda e começa bem antes disso — usar o meio do
    // caminho faria o início do comentário cair na coluna anterior. Dá a
    // penúltima fronteira para a borda direita da própria penúltima coluna,
    // deixando toda a folga para a última.
    if (bounds.length >= 2) bounds[bounds.length - 2] = header[header.length - 2].right;
    const colOf = (x) => {
      for (let i = 0; i < bounds.length; i++) {
        if (x < bounds[i]) return i;
      }
      return header.length - 1;
    };

    return lines
      .map((line) => {
        const cols = new Array(header.length).fill('');
        line.items.forEach((it) => {
          const idx = colOf(it.x);
          cols[idx] = cols[idx] ? `${cols[idx]} ${it.text}` : it.text;
        });
        return cols.join('\t');
      })
      .join('\n');
  }

  // ---------------------------------------------------------------------
  // Sugestão de preenchimento (autocomplete) para Defeito/Ação — valores
  // distintos já usados no histórico, do mais frequente para o menos.
  // ---------------------------------------------------------------------

  function topFieldValues(records, field, limit) {
    const counts = new Map();
    (records || []).forEach((r) => {
      const v = ((r && r[field]) || '').toString().trim();
      if (!v) return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit || counts.size)
      .map(([value, count]) => ({ value, count }));
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
    DEFEITO_OPTIONS,
    matrixToDefeito,
    matrixToAcao,
    matrixRowToDemanda,
    brDateToIso,
    isValidIsoDate,
    parsePastedTable,
    reconstructTableText,
    topFieldValues,
  };
});
