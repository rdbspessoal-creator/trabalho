# Sistema de Mapeamento de Demandas de Medição

Ferramenta autocontida — um único arquivo HTML, sem instalação, sem backend —
para consolidar e gerenciar as demandas semanais de fechamento de medição em
três áreas — **Norte (Bruno)**, **Sul (Rubening)** e **Oeste (Iltearle)** — a
partir de documentos (imagem ou PDF da tabela semanal) ou lançamento manual,
com correlação automática **Cliente → Área → Técnico**.

Abra `sistema_demandas_medicao.html` num navegador (basta dar duplo-clique —
não precisa de servidor) ou publique como Artifact no Claude.ai. Os dados
reais (histórico + base de clientes, ver abaixo) e toda a lógica (`core.js`)
já vêm **embutidos no próprio arquivo** e carregados automaticamente na
primeira execução — não há nenhuma configuração manual a fazer.

## Estrutura do repositório

```
sistema_demandas_medicao.html    # aplicação FINAL, autocontida (abra direto no navegador)
core.js                          # lógica de negócio pura — fonte de verdade, embutida no HTML no build
data/seed-clientes.json          # base de clientes REAL (258 registros) — fonte de verdade, embutida no build
data/seed-demandas.json          # histórico REAL (428 registros) — fonte de verdade, embutida no build
scripts/convert_xlsx_to_seed.py  # gera os dois JSONs acima a partir das planilhas .xlsx originais
scripts/build_standalone.py      # embute core.js + os dois JSONs dentro de sistema_demandas_medicao.html
test/fixture-imagem-teste.json   # transcrição fiel da imagem padrão de teste (tabela em formato matriz)
test/run-tests.js                # testes automatizados (node test/run-tests.js)
```

`sistema_demandas_medicao.html` é o artefato final — **um único arquivo**,
sem `<script src>` externo, sem `fetch()` de arquivo local: `core.js` e os
dois JSONs de seed estão embutidos dentro dele (em `<script id="coreJsInline">`
e `<script type="application/json" id="seedClientesData"/"seedDemandasData">`).
Isso é o que permite abri-lo direto com duplo-clique (`file://`), sem
precisar de servidor. Depois de editar `core.js`, `data/seed-clientes.json`
ou `data/seed-demandas.json`, rode `python3 scripts/build_standalone.py`
para propagar a mudança ao HTML final (idempotente — pode rodar quantas
vezes for preciso).

## Dados reais embutidos

As planilhas-fonte foram fornecidas e convertidas com
`scripts/convert_xlsx_to_seed.py`:

- **`CLIENTES_X_EQUIPE.xlsx`** (aba "Cliente X Equipe") → `data/seed-clientes.json`:
  **254 clientes** da planilha + **4 lacunas já resolvidas** na especificação
  original (seção 8) — `POSTO PRINCESA ISABEL` → NORTE, e `MAURICEIA RAÇÕES` /
  `MAURICÉA RAÇÕES` / `MAURICEA RAÇÕES` (variantes de grafia) → OESTE. Total:
  **258 clientes**.
- **`Demanda_de_Medição_Modelo.xlsx`** → `data/seed-demandas.json`:
  - aba `HISTÓRICO_ORIGINAL`: **419 registros** (linhas cujo cabeçalho real
    começa após o bloco de anotações soltas do topo da aba; linhas sem
    `CLIENTE` preenchido são separadores de data e foram descartadas).
  - aba `MÊS_ATUAL`: **9 registros**.
  - Total: **428 registros**, carregados como `origem: 'seed'`,
    `status: 'historico'`, `statusOp: 'resolvida'` — a área de cada um é
    derivada diretamente do `EXECUTANTE` original (`execToArea`), sem
    tentar correlacionar via nome de cliente, exatamente como descrito na
    especificação (registros históricos já fechados).
  - a aba `ACOMPANHAMENTO` não foi incorporada (mesma decisão da
    especificação original).

Esses dois JSONs são carregados automaticamente **uma única vez**, na
primeira execução do sistema em cada navegador/dispositivo (controlado pela
flag interna `seed-carregado-v1`); depois disso o estado persistido manda.
Para re-gerar os JSONs a partir de versões atualizadas das planilhas:

```bash
python3 scripts/convert_xlsx_to_seed.py <Demanda_de_Medição_Modelo.xlsx> <CLIENTES_X_EQUIPE.xlsx>
```

## Importação de relatório — colar da planilha ou anexar .csv/.tsv

O sistema **não faz leitura de foto/PDF por IA** — uma versão anterior tentava
chamar a API da Anthropic direto do navegador (`fetch` para
`api.anthropic.com`), o que é bloqueado tanto rodando como Artifact (a CSP do
Artifact só permite requisições para o próprio host e para o Google Fonts)
quanto fora dele (CORS, sem chave), e por isso sempre resultava em erro. A
importação de relatório agora é **100% local, sem rede**: copie o intervalo de
células direto da planilha do Excel (`Ctrl+C` → colar na caixa de texto da aba
**Nova Demanda**, mantém a tabulação entre colunas) ou anexe um `.csv`/`.tsv`/
`.txt` exportado — em ambos os casos o parsing roda no próprio navegador
(`core.js`, função `parsePastedTable`).

O sistema reconhece dois formatos de tabela pelo cabeçalho (primeira linha):

- **Formato A** — colunas de texto livre: Cliente, Executante, Data, Defeito,
  Ação, Detalhamento.
- **Formato B** — matriz/checklist (o formato da imagem fornecida como padrão
  de teste): colunas Estação, Data, DEMANDA MEDIÇÃO, TELEMETRIA,
  ENERGIA (220V), INFRA PENDENTE, DADOS DO CVAZ, PULSO, Comentários, com
  células marcadas "X".

### Decisão de design: extração determinística, sem IA

O cálculo de `defeito`/`acao` para o formato matriz é feito por
**`core.js` (determinístico)**: `parsePastedTable` só precisa identificar
**quais colunas estão marcadas** em cada linha colada — e o texto final de
`defeito`/`acao` é montado por uma função pura, testável, sem depender de
nenhum modelo externo. Isso garante que os dados são extraídos **fielmente e
de forma reprodutível** a cada execução, inclusive contra a tabela do relatório
semanal em anexo (basta copiá-la do Excel e colar).

Mapeamento (`core.js`, funções `matrixToDefeito` / `matrixToAcao`):

| Coluna marcada          | Entra em "defeito"            | Entra em "ação" (soma a "COLETAR MEDIÇÃO") |
|--------------------------|--------------------------------|----------------------------------------------|
| TELEMETRIA / INFRA PENDENTE | INFRA DE TELEMETRIA PENDENTE | RESTABELECER TELEMETRIA |
| ENERGIA (220V)           | FALTA DE ALIMENTAÇÃO EXT.      | RESTABELECER ALIMENTAÇÃO 220V |
| DADOS DO CVAZ             | FALHA NO CVAZ                  | VERIFICAR COMUNICAÇÃO DO CVAZ |
| PULSO                     | FALHA NO PULSO                 | VERIFICAR PULSO |

`DEMANDA MEDIÇÃO` é ignorada (é só o flag estrutural do lote). Se nenhuma
coluna de defeito estiver marcada, `defeito` vira `"N/A"`.

O nome da estação/cliente **nunca é alterado** pelo pipeline — mantém-se
exatamente como veio da imagem (inclusive prefixos como `"ERPM -"`), porque a
base de clientes também carrega esses prefixos e isso melhora o score de
correlação.

### Validação contra a imagem fornecida (com a base de clientes real)

`test/fixture-imagem-teste.json` é a transcrição manual, linha a linha, da
imagem anexada na tarefa (8 estações, checklist de 03/08/2026). Rodar:

```bash
node test/run-tests.js
```

Isso valida, para as 8 linhas da imagem: geração correta de `defeito`/`acao`
por combinação de colunas marcadas, conversão de data `DD/MM/AAAA →
AAAA-MM-DD`, preservação fiel do texto do cliente e do comentário, e o
sinalizador de confiança baixa (linha "MAURICÉA RAÇÕES", cujo comentário
menciona "220 V" mas a coluna ENERGIA (220V) não está marcada na imagem —
uma inconsistência real que o sistema deve sinalizar para revisão humana, e
não tentar adivinhar).

Também valida o algoritmo de correlação (`correlateClient`) das 8 estações
contra a **base de clientes real** (258 registros): 7 das 8 correlacionam
(GERDAU e PERQUÍMICA com score alto/direto; VOLTA AO MUNDO, CERÂMICA MARI 2,
SHOPPING RECIFE, PRINCESA ISABEL e MAURICÉA RAÇÕES como sugestão ou correlação
direta); **"POSTO IND - MM PETROLEO TACARUNA" fica genuinamente sem
correlação** — não existe entrada equivalente na planilha `CLIENTES_X_EQUIPE.xlsx`
fornecida, então o sistema sinaliza corretamente a lacuna em vez de arriscar
um palpite, exatamente o comportamento descrito na seção 8 da especificação.

## Uso no dia a dia

1. **Nova Demanda** → cole a tabela semanal copiada do Excel (ou anexe um
   `.csv`/`.tsv`). As linhas importadas caem numa tabela de **conferência**
   100% editável — cliente, técnico, área (select), data, defeito, ação,
   detalhamento — com selos de alerta para data inválida, confiança baixa
   (inconsistência entre colunas marcadas e o comentário), e status de
   correlação (✔ ok / ~ sugerido / ⚠ sem correlação). Dá para corrigir
   qualquer campo, salvar uma correlação a partir da própria linha
   (💾), remover linhas (✕), ou lançar uma demanda manualmente.
2. **Consolidar demandas** grava tudo em `state.demandas` — antes disso, o
   sistema checa duplicidade (mesmo cliente normalizado + mesma data já no
   histórico) e pede confirmação.
3. **Histórico** — busca, filtros (área / status de correlação / situação
   aberta-resolvida / período), ordenação por coluna, paginação real (50 por
   página), edição inline, toggle Aberta/Resolvida, exportação CSV.
4. **Correlações** — cadastro manual Cliente → Área, tabela com busca/filtro/
   ordenação, remoção de correlações manuais.
5. **Resumo** — KPIs, quadro por área/técnico, lista de pendências de
   correlação com assistente ("Resolver pendências") que sugere os 3
   candidatos mais parecidos e aplica retroativamente a todos os registros
   daquele cliente, última leva consolidada agrupada por técnico, impressão/
   exportação.
6. **Dados** — importar uma atualização das planilhas (ver abaixo), apagar
   dados locais (restaura o histórico original embutido).

## Atualizando a base de clientes/histórico

Para recarregar os dados a partir de uma versão mais recente das planilhas,
rode novamente `scripts/convert_xlsx_to_seed.py` (substitui os arquivos em
`data/`) **ou** cole o JSON gerado diretamente na aba **Dados** do sistema:

- Base de clientes — array de
  `{ "cliente": "CODIGO.NNNNN - NOME", "codigo": "CODIGO.NNNNN", "nome": "NOME", "equipe": "AUTOMAÇÃO NORTE|SUL|OESTE(/SERTÃO)", "area": "NORTE|SUL|OESTE" }`.
  Esse import **substitui** a base de clientes atualmente carregada.
- Histórico — array de
  `{ "cliente": "...", "executante": "...", "data": "AAAA-MM-DD", "defeito": "...", "acao": "...", "detalhamento": "..." }`
  (a área é derivada do `executante` automaticamente se você não informar
  `"area"`, seguindo a mesma regra `execToArea` usada no restante do sistema).
  Esse import **acrescenta** ao histórico já salvo (não substitui).

## Importação — sem configuração manual, sem chamadas de rede

O upload/colagem de relatório não depende de nenhuma chave de API nem de
conectividade — funciona igual em qualquer ambiente (Artifact do Claude.ai,
`file://` direto no navegador, ou servido por qualquer servidor estático):

- Cole o intervalo copiado do Excel na caixa de texto da aba **Nova Demanda**
  e clique em "Importar texto colado", **ou**
- anexe um arquivo `.csv`/`.tsv`/`.txt` exportado da planilha.

Em ambos os casos o parsing roda inteiramente no navegador
(`core.js#parsePastedTable`), sem enviar nada para fora da máquina do
usuário. Para tabelas muito grandes, não há limite artificial de linhas —
o único cuidado é manter a primeira linha como cabeçalho (Cliente/Executante/
Data/... ou Estação/Data/Telemetria/...) para que o formato seja reconhecido.

Exportar CSV do histórico (aba **Histórico** → "Exportar CSV") usa a
capacidade nativa de download quando disponível como Artifact
(`window.claude.use('downloads')`), com fallback automático para o link de
blob tradicional quando o arquivo é aberto direto no navegador.

## Armazenamento

Detecção automática: capacidade de artefato do Claude.ai (dados privados por
usuário) quando disponível, caindo para `localStorage` do navegador caso
contrário — mesma interface assíncrona, mesmas chaves
(`demandas-registros-v1`, `correlacoes-overrides-v1`, `clientes-base-v1`,
`seed-carregado-v1`).

## Testes

```bash
node test/run-tests.js
```

23 casos cobrindo: as 8 linhas da imagem padrão de teste (extração
determinística de defeito/ação/data/comentário + sinalização de confiança
baixa), o algoritmo de correlação contra a **base de clientes real** de 258
registros (match direto, lacuna já resolvida, lacuna genuína ainda em
aberto, override manual, derivação de área a partir do executante em
registros de histórico), a contagem de registros do seed real (419 + 9 = 428),
e o parser de tabela colada/`.csv` (`parsePastedTable`): reconhecimento dos
dois formatos pelo cabeçalho, conversão de data BR→ISO, flags de coluna
marcada, sinalização de confiança baixa e descarte de linhas em branco.

## Limitações conhecidas / próximos passos

- Sem autenticação multiusuário — dados são por navegador/dispositivo.
- Sem alerta de prazo para demandas "abertas" há muito tempo.
- Auditoria pendente de outros nomes históricos que não têm correspondência
  clara na base de clientes (ex.: registros administrativos como
  `PREDITIVAS`, `CALIBRAÇÃO`) — o sistema já os sinaliza corretamente como
  "sem correlação" em vez de arriscar um palpite; a aba **Resumo → Resolver
  pendências** é o ponto de entrada para essa auditoria manual, cliente a
  cliente.
