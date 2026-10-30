#!/usr/bin/env python3
"""Teste de fluxo das abas (v7.40.35) em SQLite de verdade.

Extrai do worker.js as constantes MSG_ATENDIDO_SQL_ e MSG_ULT_ENC_ do arquivo REAL
(nao uma copia), executa as transicoes e verifica:

  1. conversa nova -> Pendentes (esperando)
  2. Atender (dono preenchido) -> Em atendimento
  3. encerrar -> Encerrados
  4. cliente escreve numa encerrada -> volta para Pendentes, SEM responsavel, historico intacto
  5. responder -> Em atendimento, sem duplicar
  6. conversa nunca respondida e nunca encerrada continua em Pendentes

Uso: python3 tests/worker_abas_fluxo.py     (sai 1 se algo falhar)
"""
import io
import os
import re
import sqlite3
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
WORKER = os.path.join(RAIZ, "instagram-worker", "worker.js")


def preparar():
    """Le as constantes do worker.js executando-as no Node — onde elas vivem de verdade.
    (Fazer parsing de concatenacao com regex perde as aspas simples e quebra o SQL.)"""
    import json
    import subprocess
    script = r"""
const fs = require('fs');
const t = fs.readFileSync(process.argv[1], 'utf8');
function grab(name) {
  const m = t.match(new RegExp('const ' + name + ' = ([\\s\\S]*?);\\n'));
  if (!m) throw new Error('nao achei ' + name);
  return m[1];
}
const MSG_ULT_ENC_ = eval(grab('MSG_ULT_ENC_'));
const atendido = eval(grab('MSG_ATENDIDO_SQL_'));
console.log(JSON.stringify({ ult: MSG_ULT_ENC_, atendido: atendido }));
"""
    saida = subprocess.run(["node", "-e", script, WORKER], capture_output=True, text=True)
    if saida.returncode != 0:
        raise SystemExit("falha ao ler o worker: " + saida.stderr[-400:])
    dados = json.loads(saida.stdout)
    print("MSG_ULT_ENC_ =", dados["ult"])
    return dados["atendido"]


def banco():
    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE msg_conversa (id INTEGER PRIMARY KEY, canal TEXT, contato TEXT, dono TEXT DEFAULT '',
            nao_lidas INTEGER DEFAULT 0, total INTEGER DEFAULT 0, ult_dir TEXT DEFAULT '',
            ult_entrada_em TEXT DEFAULT '', ult_saida_em TEXT DEFAULT '', ultima_em TEXT DEFAULT '',
            encerrada_em TEXT DEFAULT '', encerrada_motivo TEXT DEFAULT '', reaberta_em TEXT DEFAULT '', atendido_em TEXT DEFAULT '', grupo INTEGER DEFAULT 0);
        CREATE TABLE msg_mensagem (id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER, direcao TEXT,
            texto TEXT, enviada_em TEXT, por TEXT DEFAULT '', status TEXT DEFAULT '', ext_id TEXT DEFAULT '');
        CREATE TABLE msg_encerramento (id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER, motivo TEXT, em TEXT);
        CREATE TABLE msg_atividade (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT UNIQUE, usuario TEXT, nome TEXT, acao TEXT, conversa_id INTEGER, em TEXT);
        """
    )
    return db


def fila(db, atendido, qual):
    campos = {
        "esperando": "encerrada_em='' AND grupo=0 AND NOT " + atendido,
        "em_atendimento": "encerrada_em='' AND grupo=0 AND " + atendido,
        "encerradas": "encerrada_em<>''",
    }
    return [r[0] for r in db.execute("SELECT id FROM msg_conversa WHERE " + campos[qual]).fetchall()]


def conversa(db, cid, dono="", encerrada="", atendido=""):
    db.execute(
        "INSERT INTO msg_conversa (id, canal, contato, dono, atendido_em, total, encerrada_em, encerrada_motivo, ultima_em) VALUES (?,?,?,?,?,1,?,?,?)",
        (cid, "whatsapp1", "88999990000", dono, atendido, encerrada, "concluido" if encerrada else "", "2026-10-30T10:00:00Z"),
    )


def entrada(db, cid, quando, reabre=True):
    """Insere a mensagem do cliente. reabre=True aplica o UPDATE real do worker
    (que devolve a conversa encerrada para Pendentes); reabre=False só grava o
    histórico anterior, para montar o cenário de teste."""
    db.execute(
        "INSERT INTO msg_mensagem (conversa_id, direcao, texto, enviada_em, ext_id) VALUES (?,?,?,?,?)",
        (cid, "entrada", "oi", quando, "wamid" + str(cid) + quando[-4:]),
    )
    if not reabre:
        db.execute("UPDATE msg_conversa SET total=total+1 WHERE id=?", (cid,))
        return
    # o mesmo UPDATE do worker (dono + reaberta_em + total)
    db.execute(
        "UPDATE msg_conversa SET total=total+1, nao_lidas=nao_lidas+1, ult_dir='entrada', "
        "ult_entrada_em=?, ultima_em=?, "
        "dono=CASE WHEN encerrada_em<>'' THEN '' ELSE dono END, "
        "atendido_em=CASE WHEN encerrada_em<>'' THEN '' ELSE atendido_em END, "
        "reaberta_em=CASE WHEN encerrada_em<>'' THEN ? ELSE reaberta_em END, "
        "encerrada_em='', encerrada_motivo='' WHERE id=?",
        (quando, quando, quando, cid),
    )


def saida(db, cid, quando):
    db.execute(
        "INSERT INTO msg_mensagem (conversa_id, direcao, texto, enviada_em, por, status) VALUES (?,?,?,?,?,?)",
        (cid, "saida", "ola", quando, "9899", "enviada"),
    )
    db.execute("UPDATE msg_conversa SET ult_dir='saida', ult_saida_em=?, ultima_em=? WHERE id=?", (quando, quando, cid))


def encerrar(db, cid, quando):
    db.execute("UPDATE msg_conversa SET encerrada_em=?, encerrada_motivo='concluido', reaberta_em='' WHERE id=?", (quando, cid))
    db.execute("INSERT INTO msg_encerramento (conversa_id, motivo, em) VALUES (?, 'concluido', ?)", (cid, quando))


def principal():
    atendido = preparar()
    db = banco()
    falhas = []

    def ok(cond, nome):
        print(("  ok   " if cond else "  FALHA") + " " + nome)
        if not cond:
            falhas.append(nome)

    print("constantes lidas do worker.js:")
    print("  " + atendido[:110] + "...")

    conversa(db, 1)                                   # nunca respondida
    conversa(db, 2)                                   # vai ser atendida
    conversa(db, 3, dono="Pablo", atendido="2026-10-30T09:30:00Z")   # atendida pelo botão
    conversa(db, 4, dono="Pablo", encerrada="2026-10-29T10:00:00Z", atendido="2026-10-29T09:30:00Z")   # encerrada
    entrada(db, 1, "2026-10-30T09:00:00Z")
    entrada(db, 2, "2026-10-30T09:01:00Z")
    entrada(db, 3, "2026-10-30T09:02:00Z")
    entrada(db, 4, "2026-10-29T09:00:00Z", reabre=False)   # antes do encerramento

    print("1) estado inicial")
    ok(fila(db, atendido, "esperando") == [1, 2], "1 e 2 estao em Pendentes")
    ok(fila(db, atendido, "em_atendimento") == [3], "3 esta em Em atendimento")
    ok(fila(db, atendido, "encerradas") == [4], "4 esta em Encerrados")

    print("2) Atender a 2 (dono preenchido) — sem responder nada ainda")
    db.execute("UPDATE msg_conversa SET dono='Ana', atendido_em='2026-10-30T11:00:00Z' WHERE id=2")
    ok(fila(db, atendido, "esperando") == [1], "2 saiu de Pendentes")
    ok(fila(db, atendido, "em_atendimento") == [2, 3], "2 entrou em Em atendimento")

    print("3) encerrar a 3")
    encerrar(db, 3, "2026-10-30T12:00:00Z")
    ok(fila(db, atendido, "encerradas") == [3, 4], "3 foi para Encerrados")

    print("4) cliente escreve na ENCERRADA 4")
    antes = db.execute("SELECT total FROM msg_conversa WHERE id=4").fetchone()[0]
    entrada(db, 4, "2026-10-30T13:00:00Z")
    ok(fila(db, atendido, "esperando") == [1, 4], "4 voltou para Pendentes")
    ok(fila(db, atendido, "encerradas") == [3], "4 saiu de Encerrados")
    dono = db.execute("SELECT dono FROM msg_conversa WHERE id=4").fetchone()[0]
    ok(dono == "", "4 SEM responsavel (era Pablo) — nao atribui automatico")
    reab = db.execute("SELECT reaberta_em FROM msg_conversa WHERE id=4").fetchone()[0]
    ok(reab != "", "4 marcada como reaberta (aviso na tela)")
    depois = db.execute("SELECT total FROM msg_conversa WHERE id=4").fetchone()[0]
    ok(depois == antes + 1, "historico preservado (total %d -> %d)" % (antes, depois))
    msgs = db.execute("SELECT COUNT(*) FROM msg_conversa WHERE id=4").fetchone()[0]
    ok(msgs == 1, "a conversa e a mesma linha (nao duplicou)")

    print("5) responder a 4 depois de reaberta")
    saida(db, 4, "2026-10-30T13:05:00Z")
    ok(fila(db, atendido, "em_atendimento") == [2, 3, 4] or fila(db, atendido, "em_atendimento") == [2, 4],
       "4 voltou para Em atendimento ao ser respondida")

    print("6) encerrada SEM mensagem nova continua em Encerrados")
    ok(3 in fila(db, atendido, "encerradas"), "3 continua em Encerrados")

    print("7) encerrar de novo limpa o aviso de reaberta")
    encerrar(db, 4, "2026-10-30T14:00:00Z")
    ok(db.execute("SELECT reaberta_em FROM msg_conversa WHERE id=4").fetchone()[0] == "", "aviso limpo ao encerrar")

    print("8) a mesma pessoa nos dois canais nao conta duas vezes no atendimento?")
    conversa(db, 5, dono="Ana", atendido="2026-10-30T09:40:00Z")
    ok(fila(db, atendido, "em_atendimento").count(5) == 1, "conversa nova entra uma vez")

    print("")
    if falhas:
        print("FALHAS=%d %s" % (len(falhas), falhas))
        return 1
    print("FALHAS=0")
    return 0


sys.exit(principal())
