#!/usr/bin/env python3
"""TENKiTER: plano auditável e execução segura de testes por impacto.

Sem LLM, sem rede no planejador e sem confiança em nomes de branches/PRs.
Desconhecido => TODOS (fail-safe). Dúvida => ampliar, nunca pular silenciosamente.
Uso:
 python3 scripts/ci/testes_impacto.py planejar --arquivos treinamentos.html
 python3 scripts/ci/testes_impacto.py planejar --evento pull_request --base SHA --head SHA --saida "$GITHUB_OUTPUT"
 python3 scripts/ci/testes_impacto.py executar --modulos treinamentos
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[2]
MANIFESTO = ROOT / "scripts/ci/testes_impacto_manifesto.json"
M = json.loads(MANIFESTO.read_text(encoding="utf-8"))
MODULOS = set(M["modules"])
ORDEM = M["modules"]
DIRETORIOS_IGNORADOS = ("docs/", "documentacao/")
GRAPHIFY = re.compile(r"^(scripts/graphify/|scripts/ci/check_graphify\.py$|tests/graphify_automatico\.py$|\.graphifyignore$|\.gitignore$|AGENTS\.md$|CLAUDE\.md$|GEMINI\.md$|docs/ia/|\.(agents|claude|codex)/skills/graphify/|\.claude/(hooks/graphify-session\.sh|settings\.json)$|\.cursor/|\.github/(copilot-instructions\.md|workflows/(ci|copilot-setup-steps)\.yml)$)")

# Mudanças APENAS no contrato do seletor/CI: testes do próprio seletor + smoke de
# catálogo, mensagens e treinamento. Fluxos de deploy, segurança e código de produto
# fora desta lista continuam com cobertura ampla (fail-safe).
ARQUIVOS_CI_ISOLADO = frozenset({
    ".github/workflows/ci.yml",
    "scripts/ci/testes_impacto.py",
    "scripts/ci/testes_impacto_manifesto.json",
    "tests/testes_impacto_seletor.py",
    "docs/ia/testes-por-impacto.md",
    "agents.md", "claude.md",
})

def somente_ci_isolado(arquivos: list[str]) -> bool:
    return bool(arquivos) and all(a.replace("\\", "/").removeprefix("./").lower() in ARQUIVOS_CI_ISOLADO for a in arquivos)

def classificar(arquivo: str) -> set[str]:
    """Caminhos compartilhados/novos retornam TODOS; primeiro a segurança."""
    p = arquivo.replace("\\", "/").removeprefix("./").lower()
    nome = p.rsplit("/", 1)[-1]
    if p in ("ag ents.md".replace(" ", ""), "claude.md", "gemini.md"):
        return set(MODULOS)
    if p.startswith((".github/", ".agents/", ".claude/", ".codex/", "scripts/ci/", "scripts/deploy/", "scripts/graphify/")):
        return set(MODULOS)
    if nome in ("common.js", "nav.js", "avisos.js", "package.json", "package-lock.json", "requirements.txt", "sw.js", "service-worker.js", "wrangler.toml"):
        return set(MODULOS)
    if p.startswith(DIRETORIOS_IGNORADOS) and p.endswith(".md"):
        return set()
    if p.endswith(".md") and not p.startswith("tests/"):
        return set()
    if p in M["tests"]:
        return set(M["tests"][p])
    if p.startswith("tests/"):
        # Novos testes não mapeados são executados pela seleção total até classificação explícita.
        return set(MODULOS)
    if p.startswith(("instagram-worker/", "instagram-worker-", "instagram/", "instagram-worker")):
        return {"mensagens", "postagens", "esteira", "fotoia", "midia", "infra"}
    if p.startswith(("midia-worker/", "media-worker/", "video-worker/")):
        return {"midia", "postagens", "esteira", "fotoia", "infra"}
    if p.startswith(("og-worker/", "og-service/")):
        return {"catalogo", "infra"}
    if p.startswith(("android/", "app-android/")) or re.search(r"android|apk|manifesto|push", p):
        return {"push", "infra"}
    if re.search(r"(treinamento|curricul|tm-verificado|manual|prova|certificad|rh-)", p):
        return {"treinamentos"}
    if re.search(r"(agendament|expediente|acompanhamento|atendimento|mensage|mensagens|whatsapp|wafly|zapflux|contatos|pessoas|solicitacoes|solicitações|grupos_busca)", p):
        return {"mensagens", "esteira"} if "solicitac" in p else {"mensagens"}
    if re.search(r"(postagen|story|status|repost|fila-midia)", p):
        return {"postagens", "midia"}
    if re.search(r"(esteira|pedir-fotos|conferenc|tarefa)", p):
        return {"esteira"}
    if re.search(r"(foto.?ia|ia-fotos|fotos-ia)", p):
        return {"fotoia", "catalogo"}
    if re.search(r"(video|videos|transcod|camera|upload|midia|m[ií]dia)", p):
        return {"midia", "postagens"}
    if re.search(r"(catalogo|cat[aá]logo|produto|cadastro|vitrine|index\.html|admin|estoque|tamanho|tecido|filtro|carrinho|pedido)", p):
        return {"catalogo", "mensagens"} if re.search(r"produto|tamanho", p) else {"catalogo"}
    # Mudança de CSS global, worker, configuração e qualquer novo arquivo: cobertura conservadora.
    return set(MODULOS)

def diff_arquivos(base: str, head: str) -> list[str]:
    if not (re.fullmatch(r"[0-9a-f]{40}", base or "") and re.fullmatch(r"[0-9a-f]{40}", head or "")):
        raise ValueError("SHAs ausentes ou inválidos")
    result = subprocess.run(["git", "-C", str(ROOT), "diff", "--name-only", base, head],
                            capture_output=True, text=True, check=True)
    return [x.strip() for x in result.stdout.splitlines() if x.strip()]

def plano(arquivos: list[str], evento: str, suite: str, rotulos: list[str], descricao: str = "") -> dict:
    # A IA pode adicionar no corpo do PR "CI-EXTRA: mensagens,postagens"
    # sem depender de rótulos pré-cadastrados. Apenas AMPLIA, nunca restringe.
    extra = []
    for linha in (descricao or "").splitlines():
        achou = re.match(r"^\s*CI-EXTRA\s*:\s*(.*?)\s*$", linha, re.I)
        if achou:
            extra += [x.strip().lower() for x in achou.group(1).split(",") if x.strip()]
    completo = evento == "schedule" or suite == "completo" or "ci:todos" in rotulos or "todos" in extra or any(x not in MODULOS for x in extra)
    so_docs = bool(arquivos) and not completo and all(a.lower().endswith(".md") for a in arquivos)
    motivos = {}
    modulos: set[str] = set()
    ci_isolado = somente_ci_isolado(arquivos) and not completo
    for a in arquivos:
        # CI puro: evita a armadilha de acionar a plataforma inteira só porque
        # uma PR altera o seletor. Se houver QUALQUER arquivo além da lista
        # restrita, volta à classificação conservadora normal.
        encontrados = {"ci"} if ci_isolado else classificar(a)
        motivos[a] = sorted(encontrados)
        modulos.update(encontrados)
    if ci_isolado:
        motivos["controle do CI isolado"] = ["seletor validado em testes estáticos + quatro testes smoke de código"]
    for extra_modulo in extra:
        if extra_modulo in MODULOS:
            modulos.add(extra_modulo)
            motivos["descrição CI-EXTRA"] = sorted(set(extra))
    for rotulo in rotulos:
        if rotulo.startswith("ci:") and rotulo[3:] in MODULOS:
            modulos.add(rotulo[3:])
            motivos["rótulo " + rotulo] = [rotulo[3:]]
    if completo or not arquivos:
        modulos = set(MODULOS)
        motivos["proteção"] = ["suite completa/agendada, diff vazio ou indefinido"]
    # Não pular validação para PR com código quando classificação deu zero.
    if not so_docs and not modulos:
        modulos = set(MODULOS)
        motivos["proteção"] = ["código sem cobertura classificada"]
    graphify = completo or any(GRAPHIFY.search(x) for x in arquivos)
    if so_docs and not completo:
        modulos = set()
    return {"arquivos": arquivos, "modulos": [x for x in ORDEM if x in modulos],
            "so_docs": so_docs, "suite_completa": completo,
            "graphify_alterado": bool(graphify), "motivos": motivos}

def escrever_saida(pl: dict, saida: str, resumo: str) -> None:
    campos = {"so_docs": str(pl["so_docs"]).lower(),
              "suite_completa": str(pl["suite_completa"]).lower(),
              "graphify_alterado": str(pl["graphify_alterado"]).lower(),
              "modulos": ",".join(pl["modulos"])}
    if saida:
        with open(saida, "a", encoding="utf-8") as f:
            for k, v in campos.items():
                f.write(f"{k}={v}\n")
    linhas = ["### Plano de testes por impacto",
              f"**Módulos:** {', '.join(pl['modulos']) or 'nenhum (só documentação)'}",
              f"**Modo:** {'completo' if pl['suite_completa'] else 'seletivo'}",
              "| Arquivo alterado / gatilho | Cobertura escolhida |", "|---|---|"]
    for k, v in pl["motivos"].items():
        linhas.append(f"| {k.replace('|', '/')} | {', '.join(v) or 'documentação'} |")
    texto = "\n".join(linhas) + "\n"
    print(texto, flush=True)
    if resumo:
        with open(resumo, "a", encoding="utf-8") as f: f.write(texto)

def cmd(comando: list[str], env: dict[str, str] | None = None) -> None:
    # Limite por comando: evita job silenciosamente preso durante horas.
    # Ampliações longas têm que ser justificadas no próprio teste.
    limite = int(os.environ.get("TK_CI_TIMEOUT_SEGUNDOS", "600"))
    print("CI-impacto: " + " ".join(comando) + f" (limite {limite}s)", flush=True)
    try:
        subprocess.run(comando, cwd=ROOT, env={**os.environ, **(env or {})}, check=True, timeout=limite)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Teste/comando ultrapassou {limite}s: {' '.join(comando)}")

@contextmanager
def servidor(cmdline: list[str], porta: int):
    import socket
    p = subprocess.Popen(cmdline, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(35):
            if p.poll() is not None:
                raise RuntimeError(f"Servidor de teste encerrou: {cmdline}")
            try:
                with socket.create_connection(("127.0.0.1", porta), timeout=.5):
                    break
            except OSError:
                time.sleep(.25)
        else:
            raise RuntimeError(f"Servidor de teste não iniciou na porta {porta}")
        yield
    finally:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill(); p.wait()

def executar(modulos: list[str]) -> None:
    if not modulos or any(x not in MODULOS for x in modulos):
        raise ValueError("Lista de módulos vazia ou desconhecida; recusar execução silenciosa")
    escolhidos = [(p, tags) for p, tags in M["tests"].items() if set(tags).intersection(modulos)]
    if not escolhidos:
        raise RuntimeError("Nenhum teste selecionado: configuração inválida")
    faltando = [p for p, _ in escolhidos if not (ROOT / p).is_file()]
    if faltando:
        raise RuntimeError("Arquivo(s) de teste inexistente(s): " + ", ".join(faltando))
    escolhido = {p for p, _ in escolhidos}
    precisa_ui = any(p.endswith(".py") and
                     not re.search(r"(transcode|video_processor_http|video_partes_encoder|android_manifest_release)",p)
                     for p in escolhido)
    precisa_ffmpeg = "midia" in modulos
    print(f"Plano: {len(escolhidos)} testes; módulos: {', '.join(modulos)}; "
          f"Chromium={precisa_ui}; ffmpeg={precisa_ffmpeg}", flush=True)
    if precisa_ffmpeg and not shutil.which("ffmpeg"):
        if Path("/etc/apt/apt-mirrors.txt").exists():
            # Correção para mirrors lentos de runners Azure, sem instalar pacotes de origem insegura.
            cmd(["sudo", "sed", "-i", "s|http://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g", "/etc/apt/apt-mirrors.txt"])
        cmd(["sudo", "apt-get", "update"])
        cmd(["sudo", "apt-get", "install", "-y", "--no-install-recommends", "ffmpeg"])
    if any("worker_" in p or "mensagens_eventos_cliente" in p for p in escolhido):
        cmd(["npm", "ci", "--prefix", "instagram-worker", "--ignore-scripts"])
    if precisa_ui:
        cmd([sys.executable, "-m", "pip", "install", "playwright", "pillow"])
        cmd([sys.executable, "-m", "playwright", "install", "chromium"])
        destino = ROOT / "tests/axe.min.js"
        if not destino.is_file():
            cmd(["curl", "-fsSL", "--retry", "3", "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js",
                 "-o", str(destino)])
    # Servidor local só quando uma jornada de UI realmente precisa dele.
    from contextlib import nullcontext
    ui_server = servidor([sys.executable, "-m", "http.server", "8773", "--bind", "127.0.0.1"], 8773) if precisa_ui else nullcontext()
    sql = any(p in M["sql_fixture"] for p in escolhido)
    with ui_server:
        fixture = servidor(["node", "tests/fixtures/solicitacoes_server.cjs"], 8774) if sql else nullcontext()
        with fixture:
            if "tests/jornada_pedido.py" in escolhido:
                cmd([sys.executable, "tests/rodar_tudo.py", "--suite", "jornada_pedido.py",
                     "--json-report", "tests/saida/pedido-ci.json"])
            rh = [Path(p).name for p in ("tests/rh_modelos.py","tests/acessos_perfis.py","tests/mensagens_acessos_rh.py")
                  if p in escolhido]
            if rh:
                cmd([sys.executable, "tests/rodar_tudo.py", *sum((["--suite",p] for p in rh), []),
                     "--json-report", "tests/saida/rh-ci.json"])
            especiais = {"tests/jornada_pedido.py", "tests/rh_modelos.py","tests/acessos_perfis.py","tests/mensagens_acessos_rh.py"}
            for teste, _tags in escolhidos:
                if teste in especiais: continue
                args = ["node", teste] if teste.endswith((".js",".cjs")) else [sys.executable, teste]
                variaveis = {"TK_BASE": "http://localhost:8773/"}
                if teste in M.get("evidencias", {}):
                    variaveis["TK_EVID"] = M["evidencias"][teste]
                cmd(args, variaveis)
    print(f"CI-impacto: {len(escolhidos)} testes selecionados sem falhas.", flush=True)

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="acao", required=True)
    a = sub.add_parser("planejar")
    a.add_argument("--arquivos", nargs="*", default=None)
    a.add_argument("--evento", default="pull_request")
    a.add_argument("--base", default="")
    a.add_argument("--head", default="")
    a.add_argument("--suite", default="rapido")
    a.add_argument("--rotulos", default="[]", help="JSON de rótulos (ci:todos, ci:mensagens, ...)")
    a.add_argument("--descricao", default="", help="Corpo do PR (CI-EXTRA: mensagens,postagens)")
    a.add_argument("--saida", default="")
    a.add_argument("--resumo", default="")
    b = sub.add_parser("executar")
    b.add_argument("--modulos", default="todos", help="CSV dos módulos ou 'todos'")
    args = p.parse_args()
    if args.acao == "planejar":
        try: rotulos = json.loads(args.rotulos or "[]")
        except json.JSONDecodeError: rotulos = ["ci:todos"]
        if rotulos is None: rotulos = []
        if not isinstance(rotulos, list): rotulos = ["ci:todos"]
        if args.arquivos is not None:
            arquivos = args.arquivos
        else:
            try:
                if args.evento == "pull_request":
                    arquivos = diff_arquivos(args.base, args.head)
                elif args.evento == "workflow_call":
                    x = subprocess.run(["git","-C",str(ROOT),"diff","--name-only","HEAD^","HEAD"],
                                       text=True,capture_output=True,check=True)
                    arquivos = [s for s in x.stdout.splitlines() if s]
                else:
                    arquivos = []  # agenda/dispatch sem diff: selecionar todos, por segurança.
            except (subprocess.CalledProcessError, ValueError) as e:
                print("::warning::Não foi possível calcular o diff. Cobertura completa por precaução: "+str(e))
                arquivos = []
        pl = plano(arquivos, args.evento, args.suite, [str(i) for i in rotulos], args.descricao)
        escrever_saida(pl, args.saida, args.resumo)
    else:
        mods = ORDEM if args.modulos == "todos" else [x.strip() for x in args.modulos.split(",") if x.strip()]
        executar(mods)
    return 0

if __name__ == "__main__":
    try: sys.exit(main())
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as e:
        print("::error::CI por impacto falhou: "+str(e), file=sys.stderr)
        sys.exit(1)
