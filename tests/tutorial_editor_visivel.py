from pathlib import Path

codigo = Path("tm-verificado.js").read_text(encoding="utf-8")
inicio = codigo.index("TMV.ligarGestor = async function()")
fim = codigo.index("})();", inicio)
trecho = codigo[inicio:fim]

montar = trecho.index("TKTutorial.montarEditor()")
retorno_sem_pratica = trecho.index("if (!manuais.length)")
assert montar < retorno_sem_pratica, "editor precisa ser montado antes do retorno sem práticas"
print("tutorial_editor_visivel: OK")
