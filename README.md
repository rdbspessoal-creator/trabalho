# Sistema de Mapeamento de Demandas de Medição

Ferramenta autocontida (HTML + CSS + JS vanilla) para consolidar e gerenciar as
demandas semanais de fechamento de medição em três áreas — **Norte (Bruno)**,
**Sul (Rubening)** e **Oeste (Iltearle)** — a partir de imagens de tabelas
(planilhas fotografadas/print) ou lançamento manual, com correlação
automática **Cliente → Área → Técnico**.

Abra `sistema_demandas_medicao.html` num navegador (ou publique como Artifact
no Claude.ai) para usar o sistema.

## Estrutura do repositório

```
sistema_demandas_medicao.html   # aplicação (abas: Nova Demanda, Histórico, Correlações, Resumo, Dados)
core.js                         # lógica de negócio pura (normalização, correlação, parsing da matriz)
data/seed-clientes-demo.json    # base de clientes DE DEMONSTRAÇÃO (ver "Dados de produção" abaixo)
test/fixture-imagem-teste.json  # transcrição fiel da imagem padrão de teste (tabela em formato matriz)
test/run-tests.js               # testes automatizados (node test/run-tests.js)
```

## Extração de dados a partir de imagem — a imagem padrão de teste

O sistema reconhece dois formatos de tabela numa imagem:

- **Formato A** — colunas de texto livre: Cliente, Executante, Data, Defeito,
  Ação, Detalhamento.
- **Formato B** — matriz/checklist (o formato da imagem fornecida como padrão
  de teste): colunas Estação, Data, DEMANDA MEDIÇÃO, TELEMETRIA,
  ENERGIA (220V), INFRA PENDENTE, DADOS DO CVAZ, PULSO, Comentários, com
  células marcadas "X".

### Decisão de design: extração híbrida (IA + regra determinística)

A especificação original previa que a IA calculasse os textos de `defeito` e
`acao` diretamente. Neste pacote, o cálculo desses dois campos foi movido
para **`core.js` (determinístico)**: a IA (quando disponível) só precisa
identificar **quais colunas estão marcadas** em cada linha — algo que um
modelo de visão faz de forma confiável — e o texto final de `defeito`/`acao`
é montado por uma função pura, testável, sem depender da aritmética textual
do modelo. Isso é o que garante que os dados são extraídos **fielmente e de
forma reprodutível** a cada execução, inclusive contra a imagem em anexo.

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

### Validação contra a imagem fornecida

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

Também valida o algoritmo de correlação (`correlateClient`) contra uma base
de clientes de demonstração, incluindo os casos "GERDAU" (score alto,
correlação direta) e "PRINCESA ISABEL" / "MAURICÉA RAÇÕES" (lacunas já
resolvidas na especificação original, seção 8).

## Uso no dia a dia

1. **Nova Demanda** → arraste/selecione a foto da tabela semanal (ou use a
   câmera no celular). As linhas extraídas caem numa tabela de **conferência**
   100% editável — cliente, técnico, área (select), data, defeito, ação,
   detalhamento — com selos de alerta para data inválida, confiança baixa da
   IA, e status de correlação (✔ ok / ~ sugerido / ⚠ sem correlação). Dá para
   corrigir qualquer campo, salvar uma correlação a partir da própria linha
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
6. **Dados** — importar a base real de clientes/histórico (ver abaixo),
   configurar chave de API (uso fora do Claude.ai), apagar dados locais.

## Dados de produção (importante)

Este repositório **não recebeu os arquivos-fonte** `Demanda_de_Medição_Modelo.xlsx`
e `CLIENTES_X_EQUIPE.xlsx` citados na especificação. Por isso:

- `data/seed-clientes-demo.json` traz **apenas 6 clientes de demonstração**
  (o suficiente para validar o algoritmo de correlação e o fluxo ponta a
  ponta com a imagem de teste) — não os 258 clientes reais.
- Não há seed de histórico (os 429 registros originais).

Para carregar os dados reais, converta as planilhas para JSON no formato
abaixo e cole na aba **Dados**:

- Base de clientes — array de
  `{ "cliente": "CODIGO.NNNNN - NOME", "codigo": "CODIGO.NNNNN", "nome": "NOME", "equipe": "AUTOMAÇÃO NORTE|SUL|OESTE(/SERTÃO)", "area": "NORTE|SUL|OESTE" }`.
- Histórico — array de
  `{ "cliente": "...", "executante": "...", "data": "AAAA-MM-DD", "defeito": "...", "acao": "...", "detalhamento": "..." }`
  (a área é derivada do `executante` automaticamente se você não informar
  `"area"`, seguindo a mesma regra `execToArea` usada no restante do sistema).

Esses imports **acrescentam** aos dados já salvos (não substituem o
histórico); a base de clientes importada **substitui** a base atual.

## Onde a leitura de imagem por IA funciona

- **Como Artifact dentro do Claude.ai**: a chamada à API Anthropic é
  proxied automaticamente pela plataforma, sem chave.
- **Arquivo aberto fora do Claude.ai**: o navegador bloqueia a chamada direta
  por CORS sem uma chave própria. Configure uma em **Dados → Chave de API
  Anthropic**; ela é enviada com `x-api-key` +
  `anthropic-dangerous-direct-browser-access: true` e fica salva só no
  `localStorage` deste navegador. Recomenda-se, sempre que possível, usar o
  sistema como Artifact dentro do Claude.ai.
- `max_tokens` é fixo em 1000 (padrão da API); para tabelas muito grandes
  (~15+ linhas), a interface já avisa para dividir a imagem em duas.

## Armazenamento

Detecção automática: `window.storage` (Claude.ai Artifact, dados privados por
usuário) quando disponível, caindo para `localStorage` do navegador caso
contrário — mesma interface assíncrona, mesmas chaves
(`demandas-registros-v1`, `correlacoes-overrides-v1`,
`anthropic-api-key-v1`, `clientes-base-v1`).

## Testes

```bash
node test/run-tests.js
```

14 casos cobrindo: as 8 linhas da imagem padrão de teste (extração
determinística de defeito/ação/data/comentário + sinalização de confiança
baixa) e o algoritmo de correlação (match direto, lacuna resolvida por
override, cliente sem correlação, override manual, derivação de área a
partir do executante em registros de histórico).

## Limitações conhecidas / próximos passos

- Base de clientes e histórico reais ainda não importados (ver seção acima).
- Sem autenticação multiusuário — dados são por navegador/dispositivo.
- Sem alerta de prazo para demandas "abertas" há muito tempo.
- Auditoria pendente dos ~65 nomes históricos que não são clientes reais
  (ex.: `PREDITIVAS`, `CALIBRAÇÃO`), citada na especificação original —
  recomenda-se não correlacioná-los automaticamente.
