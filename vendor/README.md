# Bibliotecas de terceiros embutidas

Usadas pelo extrator automático de PDF/imagem (aba **Nova Demanda**), embutidas
no HTML final por `scripts/build_standalone.py`. Nenhuma delas é carregada de
CDN em tempo de execução — todas rodam 100% a partir do que está aqui.

| Arquivo | Projeto | Versão | Licença |
|---|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js` | [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla) | 3.11.174 | Apache-2.0 |
| `tesseract.min.js`, `tesseract.worker.min.js` | [Tesseract.js](https://github.com/naptha/tesseract.js) | 5.1.1 | Apache-2.0 |
| `tesseract-core-lstm.js`, `tesseract-core-lstm.wasm` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) (motor Tesseract OCR compilado para WebAssembly, só o modelo LSTM) | bundled com tesseract.js@5.1.1 | Apache-2.0 |
| `por.traineddata.gz` | [tessdata (naptha)](https://github.com/naptha/tessdata), pacote npm `@tesseract.js-data/por`, variante `4.0.0_best_int` | 1.0.0 | MIT |

Para atualizar: reinstale as versões desejadas via npm num diretório temporário
(`npm install pdfjs-dist@X tesseract.js@Y @tesseract.js-data/por@Z`) e copie os
arquivos correspondentes de `node_modules/.../build|dist` para cá — depois
rode `python3 scripts/build_standalone.py`.

## Patch aplicado em `tesseract.worker.min.js`

O bundle oficial do tesseract.js 5.1.1 tem um bug: ao inicializar o worker com
um idioma pré-carregado (`{code, data}`, usado aqui para não precisar buscar
o `.traineddata` de uma CDN), o código monta a string de idiomas do
`TessBaseAPI.Init()` fazendo `l.data` em vez de `l.code` — ou seja, tenta usar
os **bytes binários do `.traineddata`** como nome do idioma, e o OCR falha
com "Error opening data file ./31,139,8,8,...". Corrigido localmente trocando
`t.data` por `t.code` nesse trecho específico (`a.map((function(t){return
"string"==typeof t?t:t.data})).join("+")` → `...t.code...`). Se atualizar
`tesseract.worker.min.js` para uma versão nova, verifique se o bug ainda
existe (`grep -o '.\{80\}\.data}))\.join' tesseract.worker.min.js`) e reaplique
o patch se necessário.
