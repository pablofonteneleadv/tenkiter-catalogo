"""Temporario: poe os testes do #305 na suite rapida do CI.

Motivo: worker_equipe_inicio.js e mensagens_equipe_inicio_ui.py estavam apenas
em tests/rodar_tudo.py, que o CI PULA em pull_request e em push. Sem isto os
cinco checks passam sem nunca exercitar o recurso.
"""
import io
import sys

P = ".github/workflows/ci.yml"

ALVO_JS = "          node tests/worker_mobile_push.js\n"
NOVO_JS = ALVO_JS + "          node tests/worker_equipe_inicio.js\n"

ALVO_PY = "          python3 tests/agendamentos_painel_ui.py\n"
NOVO_PY = ALVO_PY + "          python3 tests/mensagens_equipe_inicio_ui.py\n"


def main():
    s = io.open(P, encoding="utf-8").read()
    if "worker_equipe_inicio.js" in s and "mensagens_equipe_inicio_ui.py" in s:
        print("ja aplicado, nada a fazer")
        return 0
    for alvo in (ALVO_JS, ALVO_PY):
        n = s.count(alvo)
        if n != 1:
            print("ancora ambigua ou ausente (%d): %r" % (n, alvo))
            return 1
    s = s.replace(ALVO_JS, NOVO_JS, 1)
    s = s.replace(ALVO_PY, NOVO_PY, 1)
    io.open(P, "w", encoding="utf-8").write(s)
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
