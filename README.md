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
scripts/build_standalone.py      # embute core.js + os dois JSONs + vendor/* dentro de sistema_demandas_medicao.html
vendor/                          # pdf.js + Tesseract.js (extrator de PDF/imagem) — ver vendor/README.md
test/fixture-imagem-teste.json   # transcrição fiel da imagem padrão de teste (tabela em formato matriz)
test/run-tests.js                # testes automatizados (node test/run-tests.js)
```

`sistema_demandas_medicao.html` é o artefato final — **um único arquivo**,
sem `<script src>` externo, sem `fetch()` de arquivo local: `core.js`, os
dois JSONs de seed e as bibliotecas do extrator de PDF/imagem (`vendor/`)
estão todos embutidos dentro dele (em `<script id="coreJsInline">`,
`<script type="application/json" id="seedClientesData"/"seedDemandasData">`
e os `<script id="pdfjsLibSrc">`/`<script type="application/octet-stream"
id="...B64">` descritos em `vendor/README.md`). Isso é o que permite abri-lo
direto com duplo-clique (`file://`), sem precisar de servidor — e o arquivo
final fica com ~8 MB por causa disso (a maior parte é o núcleo do OCR em
WebAssembly e o modelo de português). Depois de editar `core.js`,
`data/seed-clientes.json`, `data/seed-demandas.json` ou qualquer arquivo em
`vendor/`, rode `python3 scripts/build_standalone.py` para propagar a
mudança ao HTML final (idempotente — pode rodar quantas vezes for preciso).

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

## Extração automática de PDF ou foto/print (OCR) — offline, sem IA

Além de colar/anexar `.csv`/`.tsv`, a aba **Nova Demanda** tem um segundo
card ("Extrair automaticamente de PDF ou foto/print") que lê o arquivo
original direto:

- **PDF** — usa [pdf.js](https://github.com/mozilla/pdf.js) para ler o texto
  real do documento (funciona bem com relatórios exportados/impressos do
  Excel, que têm camada de texto de verdade, não uma imagem escaneada).
- **Foto/print (JPEG/PNG)** — usa [Tesseract.js](https://github.com/naptha/tesseract.js)
  (motor Tesseract OCR compilado para WebAssembly) com o modelo de português
  para reconhecer o texto na imagem.

Em ambos os casos, o texto de cada célula é reconstruído a partir da posição
(x, y) de cada palavra — `core.js`, função `reconstructTableText`: agrupa
palavras na mesma linha por proximidade vertical, usa a primeira linha como
cabeçalho para definir as colunas (agrupando palavras próximas
horizontalmente, já que uma célula de cabeçalho pode ter mais de uma palavra,
como "DADOS DO CVAZ") e encaixa o restante das linhas nessas colunas — o
resultado é um texto TSV, exatamente como se você tivesse colado a tabela do
Excel, que cai na mesma caixa de texto para revisão antes de importar.

**Tudo roda no navegador, nada é enviado para fora do computador do
usuário** — diferente da tentativa anterior de leitura por IA (ver seção
acima), que dependia de uma chamada de rede e por isso não funcionava. As
bibliotecas (pdf.js, Tesseract.js, o núcleo do Tesseract em WebAssembly e o
modelo de português) estão embutidas no próprio HTML (`vendor/`, ver
`vendor/README.md` para versões/licenças e um patch aplicado a um bug do
tesseract.js 5.1.1) — inclusive funciona como Artifact no Claude.ai, sem
nenhuma requisição de rede em tempo de execução. Para tabelas com bordas
(como o formato matriz/checklist), o modo de segmentação de página do
Tesseract é forçado para "texto esparso" (PSM 11), porque o modo automático
padrão tende a enxergar só a primeira linha da imagem como texto quando há
bordas de célula. Fotos de baixa qualidade, tabelas muito inclinadas ou muito
grandes tendem a sair com mais erros de reconhecimento — sempre revise o
texto reconstruído antes de clicar em "Importar texto colado".

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

1. **Nova Demanda** → cole a tabela semanal copiada do Excel, anexe um
   `.csv`/`.tsv`, ou anexe direto o PDF/foto do relatório para extração
   automática (offline, sem IA). As linhas importadas caem numa tabela de
   **conferência**
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

27 casos cobrindo: as 8 linhas da imagem padrão de teste (extração
determinística de defeito/ação/data/comentário + sinalização de confiança
baixa), o algoritmo de correlação contra a **base de clientes real** de 258
registros (match direto, lacuna já resolvida, lacuna genuína ainda em
aberto, override manual, derivação de área a partir do executante em
registros de histórico), a contagem de registros do seed real (419 + 9 = 428),
o parser de tabela colada/`.csv` (`parsePastedTable`): reconhecimento dos
dois formatos pelo cabeçalho, conversão de data BR→ISO, flags de coluna
marcada, sinalização de confiança baixa e descarte de linhas em branco; e a
reconstrução de tabela a partir de coordenadas (`reconstructTableText`, usada
pelo extrator de PDF/imagem): agrupamento de palavras em linhas e em células
de cabeçalho com mais de uma palavra, e alimentação direta do resultado no
`parsePastedTable`.

Esses testes cobrem a lógica pura (`core.js`) e rodam em Node, sem browser —
não validam pdf.js/Tesseract.js em si (que só existem no navegador). Essa
parte foi validada manualmente nesta sessão com Playwright + Chromium contra
um PDF e uma foto sintéticos, confirmando a extração ponta a ponta; não há
um teste automatizado de navegador no repositório para isso ainda.

## Limitações conhecidas / próximos passos

- Sem autenticação multiusuário — dados são por navegador/dispositivo.
- Sem alerta de prazo para demandas "abertas" há muito tempo.
- OCR de imagem só tem o modelo de **português** embutido (não inglês) — nomes
  de cliente/comentário em outro idioma podem sair com mais erros.
- A reconstrução de tabela por coordenadas assume uma tabela "reta" (linhas e
  colunas alinhadas); fotos muito inclinadas, tortas ou com iluminação
  irregular tendem a confundir tanto o agrupamento de linhas quanto o de
  colunas — revise sempre o texto antes de importar.
- Auditoria pendente de outros nomes históricos que não têm correspondência
  clara na base de clientes (ex.: registros administrativos como
  `PREDITIVAS`, `CALIBRAÇÃO`) — o sistema já os sinaliza corretamente como
  "sem correlação" em vez de arriscar um palpite; a aba **Resumo → Resolver
  pendências** é o ponto de entrada para essa auditoria manual, cliente a
  cliente.
