#!/usr/bin/env python3
"""
Gera a versão final e autocontida de sistema_demandas_medicao.html:
embute core.js e os dois JSONs de seed (data/seed-clientes.json,
data/seed-demandas.json) diretamente no HTML, para que o arquivo funcione
sozinho ao ser aberto direto no navegador (file://, sem servidor local) e
também como Artifact no Claude.ai — conforme a especificação original
("sem backend/banco externo... dados-base embutidos como JSON inline").

Uso:
  python3 scripts/build_standalone.py

Idempotente: pode ser rodado quantas vezes forem necessárias — sempre
substitui o conteúdo já embutido (identificado por id) pelo conteúdo atual
de core.js / data/seed-clientes.json / data/seed-demandas.json. Rodar
sempre que qualquer um desses três arquivos mudar.
"""
import re
import json

HTML_PATH = "sistema_demandas_medicao.html"
CORE_PATH = "core.js"
CLIENTES_PATH = "data/seed-clientes.json"
DEMANDAS_PATH = "data/seed-demandas.json"


def replace_or_insert(html, pattern, new_block, insert_before_marker):
    """Substitui o bloco que casa com `pattern` por `new_block`; se não
    existir ainda, insere `new_block` antes de `insert_before_marker`."""
    if re.search(pattern, html, re.S):
        return re.sub(pattern, lambda m: new_block, html, count=1, flags=re.S)
    idx = html.index(insert_before_marker)
    return html[:idx] + new_block + "\n" + html[idx:]


def main():
    with open(HTML_PATH, encoding="utf-8") as f:
        html = f.read()
    with open(CORE_PATH, encoding="utf-8") as f:
        core_js = f.read()
    with open(CLIENTES_PATH, encoding="utf-8") as f:
        clientes = json.load(f)
    with open(DEMANDAS_PATH, encoding="utf-8") as f:
        demandas = json.load(f)

    app_marker = "<script>\n(function(){"

    # 1) core.js inline, num <script id="coreJsInline"> identificável para re-runs.
    core_block = f'<script id="coreJsInline">\n{core_js}\n</script>'
    html = replace_or_insert(
        html,
        r'<script id="coreJsInline">.*?</script>',
        core_block,
        app_marker,
    )

    # 2) Seeds embutidos como <script type="application/json" id="...">.
    # Escapa "</" para que nenhum texto de dado feche a tag <script> prematuramente.
    clientes_json = json.dumps(clientes, ensure_ascii=False).replace("</", "<\\/")
    demandas_json = json.dumps(demandas, ensure_ascii=False).replace("</", "<\\/")
    clientes_block = f'<script type="application/json" id="seedClientesData">{clientes_json}</script>'
    demandas_block = f'<script type="application/json" id="seedDemandasData">{demandas_json}</script>'
    html = replace_or_insert(
        html,
        r'<script type="application/json" id="seedClientesData">.*?</script>',
        clientes_block,
        app_marker,
    )
    html = replace_or_insert(
        html,
        r'<script type="application/json" id="seedDemandasData">.*?</script>',
        demandas_block,
        app_marker,
    )

    # 3) loadJson(): garante que ele lê primeiro do <script id="..."> embutido,
    #    caindo para fetch() só como fallback (fetch não funciona em file://).
    old_load_json = """async function loadJson(path){
  try{
    const res = await fetch(path);
    if(res.ok) return await res.json();
  }catch(e){}
  return null;
}"""
    new_load_json = """async function loadJson(path){
  const idMap = {
    'data/seed-clientes.json': 'seedClientesData',
    'data/seed-demandas.json': 'seedDemandasData'
  };
  const embeddedId = idMap[path];
  if(embeddedId){
    const el = document.getElementById(embeddedId);
    if(el){
      try{ return JSON.parse(el.textContent); }catch(e){}
    }
  }
  try{
    const res = await fetch(path);
    if(res.ok) return await res.json();
  }catch(e){}
  return null;
}"""
    if old_load_json in html:
        html = html.replace(old_load_json, new_load_json)
    elif "idMap = {" not in html:
        raise SystemExit("loadJson() não encontrado no formato esperado — ajuste o script de build.")

    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    total_hist = len(demandas.get("historico", [])) + len(demandas.get("mesAtual", []))
    print(
        f"OK: {HTML_PATH} regravado como arquivo autocontido "
        f"({len(clientes)} clientes, {total_hist} registros de histórico embutidos)."
    )


if __name__ == "__main__":
    main()
