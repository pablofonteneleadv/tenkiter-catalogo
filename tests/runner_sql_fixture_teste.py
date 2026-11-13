"""Regressão BUG-15: runner completo inicia SQLite falso sem porta fixa/rede real.

Executar: python3 tests/runner_sql_fixture_teste.py (Node 22+ instalado).
"""
import os
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from run_support import sqlite_fixture_needed, sqlite_fixture_server

SQL_SUITES = [
    ("mensagens_registros_fundo_ui.py", lambda _: True),
    ("mensagens_solicitacoes_excluir_ui.py", lambda _: True),
]
NO_SQL = [("indicador_agenda_card.py", lambda _: True)]
count = 0


def check(label, cond):
    global count
    assert cond, label
    print("PASS:", label)
    count += 1


check("ambas suítes afetadas precisam do Worker SQLite",
      sqlite_fixture_needed(ROOT, SQL_SUITES))
check("suíte sem SQLite não liga servidor desnecessário",
      not sqlite_fixture_needed(ROOT, NO_SQL))

saved = os.environ.pop("TK_QA_PORT", None)
try:
    with sqlite_fixture_server(ROOT, NO_SQL) as port:
        check("nenhuma porta criada para testes sem fixture", port is None)

    with sqlite_fixture_server(ROOT, SQL_SUITES) as port:
        check("fixture escolhe porta localhost efêmera", port.isdecimal() and 1024 < int(port) < 65536)
        url = "http://127.0.0.1:%s/qa/estado" % port
        with urllib.request.urlopen(url, timeout=2) as response:
            data = response.read(65536)
            check("healthcheck do Worker SQLite local responde sem dados reais",
                  response.status == 200 and b'"solicitacoes"' in data and b'"fila"' in data)
        # O teste usa uma porta externa preexistente para conferir o reaproveitamento.
        os.environ["TK_QA_PORT"] = port
        with sqlite_fixture_server(ROOT, SQL_SUITES) as reused:
            check("runner com porta explicitamente informada reutiliza fixture válida", reused == port)
        os.environ.pop("TK_QA_PORT", None)

    # Não há mais serviço depois de fechar o contexto gerenciado.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        check("o processo simulado termina e libera sua porta",
              sock.connect_ex(("127.0.0.1", int(port))) != 0)

    os.environ["TK_QA_PORT"] = "0"
    try:
        with sqlite_fixture_server(ROOT, SQL_SUITES):
            raise AssertionError("Porta inválida aceita indevidamente")
    except RuntimeError as exc:
        check("porta externa inválida é recusada", "intervalo" in str(exc))
finally:
    if saved is None:
        os.environ.pop("TK_QA_PORT", None)
    else:
        os.environ["TK_QA_PORT"] = saved

print("PASS runner SQLite local:", count, "verificações")
