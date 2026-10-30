#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ajusta os testes da 7.40.33 para a 7.40.34 (envio pelo WhatsApp no Nova conversa)."""
import sys
import pathlib


def troca(texto, antigo, novo, onde):
    n = texto.count(antigo)
    if n != 1:
        raise SystemExit(f"ERRO em {onde}: trecho ocorre {n}x (esperado 1)")
    return texto.replace(antigo, novo, 1)


MOCK_OLD = """    if path == "/msg/iniciar" and method == "POST":   # v7.40.33: abrir conversa sem enviar nada
        destino = str(body.get("destino", ""))
        if body.get("canal") != "instagram" and len("".join(ch for ch in destino if ch.isdigit())) < 10:
            return J({"ok": False, "erro": "Digite um WhatsApp com DDD, como (88) 99999-9999."}, 400) or True
        c = next((x for x in s["convs"] if x["id"] == 1), None)
        s.setdefault("iniciadas", []).append(body)
        return J({"ok": True, "conversa": c["id"] if c else 1}) or True"""

MOCK_NEW = """    if path == "/msg/iniciar" and method == "POST":   # v7.40.34: WhatsApp envia; Instagram s\u00f3 abre
        destino = str(body.get("destino", ""))
        canal = body.get("canal")
        if canal != "instagram" and len("".join(ch for ch in destino if ch.isdigit())) < 10:
            return J({"ok": False, "erro": "Digite um WhatsApp com DDD, como (88) 99999-9999."}, 400) or True
        c = next((x for x in s["convs"] if x["id"] == 1), None)
        texto = "" if canal == "instagram" else str(body.get("texto", "")).strip()
        s.setdefault("iniciadas", []).append(dict(body, enviada=bool(texto)))
        if texto:
            s.setdefault("enviadas", []).append({"conversa": c["id"] if c else 1, "texto": texto})
        return J({"ok": True, "conversa": c["id"] if c else 1, "enviada": bool(texto)}) or True"""

W_OLD_1 = """  // ---- trilha das a\u00e7\u00f5es confirmadas ----"""

W_NEW_1 = """  // ---- primeira mensagem pelo WhatsApp (v7.40.34) ----
  sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_1', JSON.stringify({ instance: 'teste-01', token: 'simulado', clientToken: 'simulado' }));
  sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_2', JSON.stringify({ instance: 'teste-02', token: 'simulado', clientToken: 'simulado' }));
  // Sem texto continua apenas abrindo (o Instagram e o "s\u00f3 abrir" dependem disso).
  const soAbre = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp1', destino: '(88) 99123-4567' });
  assert.equal(soAbre.status, 200); assert.equal(soAbre.j.enviada, false);
  assert.equal(envios.length, 0, 'Sem texto n\u00e3o envia nada');
  // Com texto: sai pela Wafly e a bolha fica gravada na conversa.
  const primeira = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp2', destino: '88 98888-7777', texto: 'Oi! Chegou a pe\u00e7a que voc\u00ea pediu.', idLocal: 'iniciar-conversa-0001' });
  assert.equal(primeira.status, 200, JSON.stringify(primeira.j));
  assert.equal(primeira.j.enviada, true, 'WhatsApp com texto envia a primeira mensagem');
  assert.equal(primeira.j.conversa, nova.j.conversa, 'Envia na conversa que a gaveta abriu');
  assert.equal(envios.length, 1, 'Uma mensagem, um envio');
  assert.equal(envios[0].message, 'Oi! Chegou a pe\u00e7a que voc\u00ea pediu.', 'O texto sai inteiro, sem assinatura para administrador');
  const bolha = sqlite.prepare("SELECT * FROM msg_mensagem WHERE conversa_id=? AND direcao='saida'").get(primeira.j.conversa);
  assert(bolha, 'A mensagem enviada \u00e9 gravada na conversa'); assert.equal(bolha.texto, 'Oi! Chegou a pe\u00e7a que voc\u00ea pediu.');
  assert.equal(sqlite.prepare('SELECT total FROM msg_conversa WHERE id=?').get(primeira.j.conversa).total, 1, 'A conversa deixa de nascer vazia');
  assert.equal(sqlite.prepare('SELECT dono FROM msg_conversa WHERE id=?').get(primeira.j.conversa).dono.startsWith('Ana'), true, 'Quem fala primeiro vira respons\u00e1vel');
  await new Promise(r => setTimeout(r, 120));
  assert(sqlite.prepare("SELECT * FROM msg_atividade WHERE acao='responder' AND conversa_id=?").get(primeira.j.conversa), 'A resposta confirmada entra na trilha');
  // Repetir o mesmo idLocal n\u00e3o manda a mensagem duas vezes.
  const repetido = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp2', destino: '88 98888-7777', texto: 'Oi! Chegou a pe\u00e7a que voc\u00ea pediu.', idLocal: 'iniciar-conversa-0001' });
  assert.equal(repetido.status, 200); assert.equal(envios.length, 1, 'Mesmo idLocal n\u00e3o reenvia');
  // Instagram nunca envia, mesmo que chegue texto.
  assert.equal((await chamar('/msg/iniciar', 'POST', { canal: 'instagram', destino: '@naoexiste', texto: 'Oi' })).status, 409, 'Instagram segue s\u00f3 abrindo conversa existente');
  assert.equal(envios.length, 1, 'Instagram nunca envia');

  // ---- trilha das a\u00e7\u00f5es confirmadas ----"""

W_OLD_2 = """  const linha = sqlite.prepare("SELECT * FROM msg_atividade WHERE acao='responder'").get();"""
W_NEW_2 = """  const linha = sqlite.prepare("SELECT * FROM msg_atividade WHERE acao='responder' AND conversa_id=?").get(conv);"""

W_OLD_3 = """  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_atividade WHERE acao='responder'").get().n, 1, 'Reenvio do mesmo idLocal n\u00e3o duplica');"""
W_NEW_3 = """  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_atividade WHERE acao='responder' AND conversa_id=?").get(conv).n, 1, 'Reenvio do mesmo idLocal n\u00e3o duplica');"""

W_OLD_5 = """  // ---- trilha das a\u00e7\u00f5es confirmadas ----
  sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_1', JSON.stringify({ instance: 'teste-01', token: 'simulado', clientToken: 'simulado' }));
  const envio ="""
W_NEW_5 = """  // ---- trilha das a\u00e7\u00f5es confirmadas ----
  const envio ="""

W_OLD_4 = """  assert(total && total.respostas === 1, 'Totais contam a resposta confirmada');"""
W_NEW_4 = """  assert(total && total.respostas === 2, 'Totais contam as duas respostas confirmadas (primeira mensagem + envio)');"""

UI_OLD_1 = """        assert 'nada agora' in pg.inner_text('.ms-gaveta-corpo'), 'Falta o aviso de que o cliente n\u00e3o recebe nada'"""
UI_NEW_1 = """        assert 'sai na hora' in pg.inner_text('.ms-gaveta-corpo'), 'Falta o aviso de que o WhatsApp envia na hora'"""

UI_OLD_2 = """        # Instagram troca o r\u00f3tulo e explica por que n\u00e3o escreve primeiro."""
UI_NEW_2 = """        # N\u00famero bom sem texto tamb\u00e9m n\u00e3o sai: o WhatsApp n\u00e3o manda mensagem vazia.
        pg.fill('#ms-nova-destino', '(88) 99123-4567'); pg.click('[data-ms="nova-conversa-ir"]'); pg.wait_for_timeout(250)
        assert not st["ig"]["msg"].get('iniciadas'), 'Sem texto n\u00e3o deveria abrir conversa'
        # Instagram troca o r\u00f3tulo, esconde o texto e explica por que n\u00e3o escreve primeiro."""

UI_OLD_3 = """        pg.select_option('#ms-nova-canal', 'whatsapp1')"""
UI_NEW_3 = """        assert pg.locator('#ms-nova-texto').is_hidden(), 'Instagram n\u00e3o pode oferecer campo de mensagem'
        assert 'Abrir conversa' in pg.inner_text('[data-ms="nova-conversa-ir"]'), 'Instagram s\u00f3 abre conversa'
        pg.select_option('#ms-nova-canal', 'whatsapp1'); pg.wait_for_timeout(120)
        assert 'Enviar pelo WhatsApp' in pg.inner_text('[data-ms="nova-conversa-ir"]')"""

UI_OLD_4 = """        pg.fill('#ms-nova-destino', '(88) 99123-4567')
        ax = pg.evaluate"""
UI_NEW_4 = """        pg.fill('#ms-nova-destino', '(88) 99123-4567')
        pg.fill('#ms-nova-texto', 'Oi! Chegou a pe\u00e7a que voc\u00ea pediu.')
        ax = pg.evaluate"""

UI_OLD_6 = """        assert pg.input_value('#ms-nova-canal') == 'whatsapp1'"""
UI_NEW_6 = """        assert pg.input_value('#ms-nova-canal') == 'whatsapp1'
        assert pg.locator('#ms-nova-texto').count() == 1, 'WhatsApp precisa do campo da primeira mensagem'"""

UI_OLD_5 = """        assert st["ig"]["msg"].get('iniciadas'), 'Abrir conversa deveria chamar /msg/iniciar'"""
UI_NEW_5 = """        assert st["ig"]["msg"].get('iniciadas'), 'Abrir conversa deveria chamar /msg/iniciar'
        assert st["ig"]["msg"]["iniciadas"][-1]["texto"] == 'Oi! Chegou a pe\u00e7a que voc\u00ea pediu.', 'O texto digitado vai junto'
        assert st["ig"]["msg"].get('enviadas'), 'A primeira mensagem deveria sair pelo WhatsApp'"""


def main():
    raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')

    m = raiz / 'tests' / 'mock_msg.py'
    t = m.read_text(encoding='utf-8')
    t = troca(t, MOCK_OLD, MOCK_NEW, 'mock_msg.py /msg/iniciar')
    m.write_text(t, encoding='utf-8')

    w = raiz / 'tests' / 'worker_equipe_inicio.js'
    s = w.read_text(encoding='utf-8')
    s = troca(s, W_OLD_1, W_NEW_1, 'worker teste bloco')
    s = troca(s, W_OLD_2, W_NEW_2, 'worker teste linha')
    s = troca(s, W_OLD_3, W_NEW_3, 'worker teste contagem')
    s = troca(s, W_OLD_4, W_NEW_4, 'worker teste totais')
    s = troca(s, W_OLD_5, W_NEW_5, 'worker teste wafly_1 movido')
    w.write_text(s, encoding='utf-8')

    u = raiz / 'tests' / 'mensagens_equipe_inicio_ui.py'
    p = u.read_text(encoding='utf-8')
    p = troca(p, UI_OLD_1, UI_NEW_1, 'ui aviso')
    p = troca(p, UI_OLD_6, UI_NEW_6, 'ui campo de texto')
    p = troca(p, UI_OLD_2, UI_NEW_2, 'ui comentario instagram')
    p = troca(p, UI_OLD_3, UI_NEW_3, 'ui volta para whatsapp')
    p = troca(p, UI_OLD_4, UI_NEW_4, 'ui preenche texto')
    p = troca(p, UI_OLD_5, UI_NEW_5, 'ui assercoes finais')
    u.write_text(p, encoding='utf-8')

    print('testes ajustados para 7.40.34')


if __name__ == '__main__':
    main()
