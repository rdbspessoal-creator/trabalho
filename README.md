# Sistema de Mapeamento de Demandas de Medição

Ferramenta autocontida — um único arquivo HTML, sem instalação, sem backend —
para consolidar e gerenciar as demandas semanais de fechamento de medição em
três áreas — **Norte (Bruno)**, **Sul (Rubening)** e **Oeste (Iltearle)** — a
partir de uma foto/print do relatório semanal ou de lançamento manual, com
correlação automática **Cliente → Área → Técnico**.

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
vendor/                          # Tesseract.js (OCR de foto) — ver vendor/README.md
test/fixture-imagem-teste.json   # transcrição fiel da imagem padrão de teste (tabela em formato matriz)
test/run-tests.js                # testes automatizados (node test/run-tests.js)
```

`sistema_demandas_medicao.html` é o artefato final — **um único arquivo**,
sem `<script src>` externo, sem `fetch()` de arquivo local: `core.js`, os
dois JSONs de seed e a biblioteca de OCR (`vendor/`) estão todos embutidos
dentro dele (em `<script id="coreJsInline">`,
`<script type="application/json" id="seedClientesData"/"seedDemandasData">`
e os `<script id="tesseractLibSrc">`/`<script type="application/octet-stream"
id="...B64">` descritos em `vendor/README.md`). Isso é o que permite abri-lo
direto com duplo-clique (`file://`), sem precisar de servidor — e o arquivo
final fica com ~6 MB por causa disso (a maior parte é o núcleo do OCR em
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

## Importação — foto/print (JPEG) do relatório semanal

A aba **Nova Demanda** tem um único campo de importação: anexe (ou solte) a
foto/print da tabela semanal no formato matriz/checklist — colunas Estação,
Data, DEMANDA MEDIÇÃO, TELEMETRIA, ENERGIA (220V), INFRA PENDENTE, DADOS DO
CVAZ, PULSO, Comentários, com células marcadas "X" — como a imagem usada de
referência para este sistema.

O reconhecimento de texto (OCR) roda **100% no navegador, em português** —
usa [Tesseract.js](https://github.com/naptha/tesseract.js) (motor Tesseract
OCR compilado para WebAssembly), com o motor e o modelo de linguagem
**embutidos no próprio arquivo HTML** (`vendor/`, ver `vendor/README.md` para
versões/licenças e um patch aplicado a um bug do tesseract.js 5.1.1) — nada é
enviado para fora do computador do usuário, nem em tempo de execução, e por
isso também funciona publicado como Artifact no Claude.ai. Para tabelas com
bordas de célula, o modo de segmentação de página do Tesseract é forçado para
"texto esparso" (PSM 11), porque o modo automático padrão tende a enxergar só
a primeira linha da imagem como texto quando há bordas.

O texto de cada célula é reconstruído a partir da posição (x, y) de cada
palavra reconhecida — `core.js`, função `reconstructTableText`: agrupa
palavras na mesma linha por proximidade vertical, usa a primeira linha como
cabeçalho para definir as colunas (agrupando palavras próximas
horizontalmente, já que uma célula de cabeçalho pode ter mais de uma palavra,
como "DADOS DO CVAZ") e encaixa o restante das linhas nessas colunas — o
resultado é interpretado como a tabela matriz/checklist (`parsePastedTable`)
e cada linha cai direto na **conferência**, já com defeito/ação preenchidos,
pronta para revisão antes de consolidar. Trata ainda três problemas comuns em
fotos reais de tabela, sem depender de nenhum modelo externo:

- **Cabeçalho quebrado em 2+ linhas visuais** (célula com o texto em duas
  linhas, ex.: "DEMANDA" / "MEDIÇÃO") — cada sublinha chegaria do OCR como se
  fosse uma linha da tabela à parte; as linhas iniciais que ainda "parecem"
  fragmento de cabeçalho são unidas antes de definir as colunas (uma linha
  com uma data já reconhecida é tratada como início dos dados, não de
  cabeçalho, para não confundir com comentários que também citam palavras do
  cabeçalho, como "Sem **dados** desde...").
- **Ruído de borda/artefato** — um fragmento minúsculo mal lido bem entre
  duas colunas de cabeçalho de verdade (altura muito menor que o resto do
  texto do cabeçalho) é descartado antes de definir onde uma coluna termina
  e a outra começa.
- **Rótulo de cabeçalho centralizado longe de onde o dado começa** — comum na
  última coluna (texto livre, tipo "Comentários"): o rótulo do cabeçalho fica
  centralizado bem à direita da coluna, enquanto o comentário de cada linha é
  alinhado à esquerda e começa bem antes disso; sem tratar esse caso, o
  início do comentário vazava para a coluna anterior.

> Uma versão anterior deste sistema também aceitava colar a tabela do Excel
> como texto e/ou anexar PDF. A pedido do usuário, esse fluxo foi simplificado
> para um único campo (foto JPEG) — ver "Histórico de decisões" abaixo.

Fotos de baixa qualidade, tabelas muito inclinadas/tortas ou com iluminação
irregular tendem a sair com mais erros de reconhecimento — nesse caso,
prefira o lançamento manual. Logo abaixo do card de importação, um segundo
card mostra a **foto que foi importada** (nome do arquivo + prévia da
imagem), para comparar lado a lado com o que caiu na conferência e conferir
se o OCR leu tudo certo.

### Preenchimento automático de Defeito a partir das colunas marcadas

`core.js`, função `matrixToDefeito` — pura, testável, sem depender de nenhum
modelo de IA: a leitura de imagem só precisa identificar **quais colunas
estão marcadas** em cada linha (algo que o OCR faz de forma confiável); o
campo **Defeito** é uma lista fechada de opções (`C.DEFEITO_OPTIONS`, um
`<select>` no lançamento manual, na conferência e na edição do Histórico):

- `COMISSIONAMENTO DA TELEMETRIA`
- `FALHA NO CVAZ`
- `FALTA DE ALIMENTAÇÃO EXT.`
- `FALHA NO PULSO`
- `INFRA DE TELEMETRIA PENDENTE`
- `MODEM DESCONECTADO`
- `N/A`
- `OUTROS`

Quando mais de uma coluna vem marcada na mesma linha, só uma vira o defeito —
pela ordem de prioridade abaixo (a primeira que estiver marcada vence):

| Prioridade | Coluna marcada | Defeito selecionado |
|---|---|---|
| 1 (mais alta) | INFRA PENDENTE | INFRA DE TELEMETRIA PENDENTE |
| 2 | PULSO | FALHA NO PULSO |
| 3 | ENERGIA (220V) | FALTA DE ALIMENTAÇÃO EXT. |
| 4 | DADOS DO CVAZ | FALHA NO CVAZ |
| 5 (mais baixa) | TELEMETRIA | MODEM DESCONECTADO |

`DEMANDA MEDIÇÃO` é ignorada (é só o flag estrutural do lote). Se nenhuma
coluna estiver marcada, o defeito vira `N/A`. O campo **Ação**, por outro
lado, continua somando a ação de cada coluna marcada (`matrixToAcao`, ex.:
"COLETAR MEDIÇÃO + RESTABELECER TELEMETRIA + VERIFICAR COMUNICAÇÃO DO CVAZ")
— só o Defeito é restrito a um valor único da lista fechada. O texto da
coluna "Comentários" vira `detalhamento`, e o nome da estação/cliente **nunca
é alterado** pelo pipeline — mantém-se exatamente como veio da imagem
(inclusive prefixos como `"ERPM -"`), porque a base de clientes também
carrega esses prefixos e isso melhora o score de correlação. Se a data não
for reconhecida/for inválida, o sistema sugere **a data de hoje** (dia da
importação) em vez de deixar em branco — revise antes de consolidar.

O campo **Ação**, ao contrário do Defeito, é **texto livre** — sem lista
fechada e sem autocomplete — tanto no lançamento manual quanto na
conferência e na edição de linhas do Histórico. Continua vindo pré-
preenchido pela soma das ações de cada coluna marcada (`matrixToAcao`), mas
pode ser reescrito com qualquer texto.

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

## Histórico — tendências e maiores ocorrências

A aba **Histórico** tem um painel de gráficos, logo acima da tabela, que
reage aos mesmos filtros da busca (área, status de correlação, situação,
período):

- **Top defeitos** e **Top clientes/estações** — barras horizontais com as 8
  ocorrências mais frequentes no conjunto filtrado (`core.js`,
  `topFieldValues`).
- **Por área** — barras horizontais com a contagem em NORTE/SUL/OESTE/OUTRO,
  coloridas com a mesma cor de cada área usada no resto do sistema.
- **Demandas por mês** — barras verticais com a contagem por mês (`AAAA-MM`
  da data da demanda), últimos 12 meses com dado.

São componentes simples em HTML/CSS (sem biblioteca de gráficos externa,
mesma filosofia "tudo embutido, sem dependência de rede" do resto do
sistema), com tooltip ao passar o mouse sobre cada barra.

## Correlações — vincular ao mesmo ponto de consumo de um cliente existente

Às vezes o mesmo ponto de medição aparece nas demandas com nomes diferentes
(ex.: "NORSA REFRIGERANTES" e "ERPM.00892 - ERPM COCA COLA SUAPE" são o mesmo
cliente). Além do cadastro manual Cliente → Área, a aba **Correlações** tem
um segundo campo — "Ou vincular ao mesmo ponto de consumo de um cliente já
cadastrado" — com busca (`<datalist>`) sobre os clientes da base real. Ao
escolher um cliente existente:

- a **Área** é preenchida automaticamente com a do cliente vinculado (a
  correlação criada usa essa mesma área/técnico, então demandas futuras com
  o nome novo caem no técnico certo);
- a ligação fica registrada (`aliasOf`, dentro do próprio registro de
  correlação manual) e aparece na tabela abaixo, na coluna Origem, como
  "Manual — mesmo ponto que: ‹cliente vinculado›", para consulta futura.

Isso não altera o algoritmo de correlação (`correlateClient`) em si — o novo
nome vira uma correlação manual comum, com a área do cliente vinculado; o
`aliasOf` é só metadado para rastreabilidade, exibido na tabela de
correlações.

## Resumo — pendências abertas com filtro e ordenação por coluna

A aba **Resumo** tem uma tabela dedicada a demandas com situação **Aberta**
(`statusOp === 'aberta'`), separada da lista de "Pendências de correlação"
(que é sobre clientes não mapeados, não sobre o andamento da demanda). Cada
coluna do cabeçalho (Data, Cliente, Técnico, Área, Defeito, Ação,
Detalhamento) é clicável para ordenar (crescente/decrescente, com indicador
▲/▼) e tem um campo de filtro logo abaixo do título — texto livre para a
maioria das colunas, seleção para Área. Os filtros combinam entre si (E
lógico) e a contagem "(N de M aberta(s))" mostra quantas ficaram visíveis
depois do filtro.

## Uso no dia a dia

1. **Nova Demanda** → anexe a foto JPEG do relatório semanal. As linhas
   extraídas caem numa **conferência** de cards 100% editáveis (um card por
   linha, em grid responsivo — nunca precisa de rolagem horizontal, os
   campos se reorganizam conforme a largura da tela) — cliente, técnico,
   área (select colorido por área — Norte azul, Sul verde, Oeste roxo, Outro
   cinza — para bater o olho rápido), data (sugere a data de hoje quando não
   reconhecida), defeito (select com a lista fechada de opções), ação (texto
   livre), detalhamento — com selos de alerta para data inválida, confiança
   baixa (inconsistência entre colunas marcadas e o comentário), e status de
   correlação (✔ ok / ~ sugerido / ⚠ sem correlação). Dá para corrigir
   qualquer campo, salvar uma correlação a partir da própria linha (💾),
   remover linhas (✕), ou lançar uma demanda manualmente.
2. **Consolidar demandas** grava tudo em `state.demandas` — antes disso, o
   sistema checa duplicidade (mesmo cliente normalizado + mesma data já no
   histórico) e pede confirmação.
3. **Histórico** — busca, filtros (área / status de correlação / situação
   aberta-resolvida / período), gráficos de tendências e maiores ocorrências,
   ordenação por coluna, paginação real (50 por página), edição inline,
   toggle Aberta/Resolvida, exportação CSV.
4. **Correlações** — cadastro manual Cliente → Área **ou** vínculo direto a
   um cliente já cadastrado quando o mesmo ponto de consumo aparece com
   nomes diferentes nas demandas (ver abaixo), tabela com busca/filtro/
   ordenação, remoção de correlações manuais.
5. **Resumo** — KPIs, quadro por área/técnico, tabela de **pendências
   abertas** com filtro/ordenação por coluna, lista de pendências de
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

O botão **🔄 Atualizar**, no cabeçalho, recarrega demandas, correlações e a
base de clientes do armazenamento persistido e **revalida o status de
correlação** (`correlateClient`) de toda demanda no histórico e toda linha
ainda em conferência — útil depois de cadastrar/editar uma correlação na
aba Correlações, para que registros antigos com status desatualizado (ex.:
"~ sugerido" ou "⚠ sem correlação") passem a refletir a correlação nova sem
precisar editar linha por linha. Também serve para sincronizar com dados
alterados em outra aba/janela do navegador com o mesmo armazenamento, sem
precisar dar F5 na página. A revalidação atualiza status/score/match, não a
área de cada registro (a área continua sendo ajustada manualmente ou pelos
fluxos que já fazem isso). O botão **não** reimporta a base embutida
(`data/seed-*.json`) — a flag `seed-carregado-v1` continua controlando
isso, então clicar em Atualizar nunca duplica o histórico.

O botão **🧹 Limpar Importação**, ao lado, limpa a foto importada (prévia) e
a tabela de **conferência** da aba Nova Demanda, deixando o sistema pronto
para importar uma foto nova — não mexe no histórico já consolidado. Se
houver linhas na conferência ainda não consolidadas, pede confirmação antes
de limpar (evita perder um lançamento por engano); se não houver nada para
limpar, limpa direto e avisa.

## Testes

```bash
node test/run-tests.js
```

34 casos cobrindo: as 8 linhas da imagem padrão de teste (extração
determinística de defeito/ação/data/comentário + sinalização de confiança
baixa, incluindo a prioridade de seleção do defeito quando várias colunas
estão marcadas — `INFRA PENDENTE > PULSO > ENERGIA > CVAZ > TELEMETRIA` — e a
garantia de que `matrixToDefeito` só devolve valores da lista fechada
`DEFEITO_OPTIONS`), o algoritmo de correlação contra a **base de clientes
real** de 258
registros (match direto, lacuna já resolvida, lacuna genuína ainda em
aberto, override manual, derivação de área a partir do executante em
registros de histórico), a contagem de registros do seed real (419 + 9 = 428),
o parser de tabela colada/`.csv` (`parsePastedTable`, ainda usado
internamente para interpretar o texto que a foto vira), a sugestão de
preenchimento (`topFieldValues`): ordenação por frequência, limite de itens,
entradas vazias/nulas; e a reconstrução de tabela a partir de coordenadas
(`reconstructTableText`, usada pelo OCR de foto): agrupamento de palavras em
linhas e em células de cabeçalho com mais de uma palavra, cabeçalho quebrado
em 2+ linhas visuais (reproduzindo o bug relatado numa foto real, onde a
tabela inteira falhava ao ser reconhecida) e comentário de texto livre que
não deve vazar para a coluna anterior.

Esses testes cobrem a lógica pura (`core.js`) e rodam em Node, sem browser —
não validam o Tesseract.js em si (que só existe no navegador). Essa parte,
junto com os gráficos do Histórico e a tabela de pendências abertas do
Resumo, foi validada manualmente nesta sessão com Playwright + Chromium
contra uma foto sintética, confirmando a extração e a interface ponta a
ponta; não há um teste automatizado de navegador no repositório para isso
ainda.

## Limitações conhecidas / próximos passos

- Sem autenticação multiusuário — dados são por navegador/dispositivo.
- Sem alerta de prazo para demandas "abertas" há muito tempo.
- OCR de foto só tem o modelo de **português** embutido (não inglês) — nomes
  de cliente/comentário em outro idioma podem sair com mais erros.
- A reconstrução de tabela por coordenadas assume uma tabela "reta" (linhas e
  colunas alinhadas); fotos muito inclinadas, tortas ou com iluminação
  irregular tendem a confundir tanto o agrupamento de linhas quanto o de
  colunas — revise sempre a conferência antes de consolidar.
- Auditoria pendente de outros nomes históricos que não têm correspondência
  clara na base de clientes (ex.: registros administrativos como
  `PREDITIVAS`, `CALIBRAÇÃO`) — o sistema já os sinaliza corretamente como
  "sem correlação" em vez de arriscar um palpite; a aba **Resumo → Resolver
  pendências** é o ponto de entrada para essa auditoria manual, cliente a
  cliente.

## Histórico de decisões

- A primeira versão tentava ler foto/PDF chamando a API da Anthropic direto
  do navegador (`fetch` para `api.anthropic.com`) — bloqueado pela CSP do
  Artifact (só permite requisições ao próprio host e ao Google Fonts) e por
  CORS fora dele, então sempre dava erro. Foi substituída por importação via
  colar texto/CSV, e depois por extração automática de PDF (pdf.js) e OCR de
  foto (Tesseract.js), ambos embutidos e 100% locais.
- A pedido do usuário, o fluxo foi simplificado outra vez: os dois campos de
  importação (colar/CSV e extrator de PDF/foto) foram substituídos por um
  único campo, baseado só em foto JPEG do relatório semanal — mais direto
  para o uso real (fotografar a tabela impressa/no quadro), sem exigir que o
  técnico gere um CSV ou PDF antes. O suporte a PDF (pdf.js) foi removido do
  `vendor/` nessa simplificação.
