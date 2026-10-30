#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aplica o delta 7.40.34 sobre os arquivos da 7.40.33 (estado do patch base).

Escreve por substituicao exata de trechos: cada trecho antigo tem de aparecer
uma e apenas uma vez. Se algo nao bater, falha antes de gravar nada: e melhor
nao aplicar do que aplicar pela metade.

Uso: python3 _delta.py <raiz-do-repo>
"""
import sys
import pathlib


def troca(texto, antigo, novo, onde):
    n = texto.count(antigo)
    if n != 1:
        raise SystemExit(f"ERRO em {onde}: trecho ocorre {n}x (esperado 1)")
    return texto.replace(antigo, novo, 1)


WORKER_SIG_OLD = """async function iniciarConversa_(env, d) {
  const canal = String((d && d.canal) || '');"""

WORKER_SIG_NEW = """async function iniciarConversa_(env, d, whats) {
  const canal = String((d && d.canal) || '');"""

WORKER_RET_OLD = """  return { ok: true, conversa: conversa.id };
}"""

WORKER_RET_NEW = """  /* v7.40.34: no WhatsApp a loja pode escrever primeiro. A conversa \u00e9 aberta e a primeira
     mensagem sai pela integra\u00e7\u00e3o Wafly j\u00e1 cadastrada em Conex\u00f5es \u2014 as credenciais ficam s\u00f3
     no backend (D1), nunca no navegador. No Instagram nada \u00e9 enviado: a API oficial n\u00e3o
     permite conversa iniciada pela loja, ent\u00e3o a gaveta apenas abre/registra a conversa.
     Sem texto continua apenas abrindo, que \u00e9 o que a tela usa para s\u00f3 abrir. */
  if (canal === 'instagram') return { ok: true, conversa: conversa.id, enviada: false };
  const texto = String((d && d.texto) == null ? '' : d.texto).replace(/\\r\\n/g, '\\n').trim();
  if (!texto) return { ok: true, conversa: conversa.id, enviada: false };
  // Mesmo caminho do /msg/enviar: reserva idempotente, Wafly, grava\u00e7\u00e3o da bolha e recibo.
  const idLocal = /^[A-Za-z0-9_-]{8,64}$/.test(String((d && d.idLocal) || '')) ? String(d.idLocal) : crypto.randomUUID().replace(/-/g, '');
  const [cod, corpo] = await responderMensagem_(env, whats || '', { conversa: conversa.id, texto: texto, idLocal: idLocal });
  if (cod !== 200 || !corpo || !corpo.ok) return { ok: false, cod: cod === 200 ? 409 : cod, conversa: conversa.id, enviada: false, erro: (corpo && corpo.erro) || 'N\u00e3o foi poss\u00edvel enviar a primeira mensagem.' };
  return { ok: true, conversa: conversa.id, enviada: true, mensagem: corpo.mensagem };
}"""

ROTA_OLD = """      if (p === '/msg/iniciar' && req.method === 'POST') {
        const d=await req.json().catch(()=>({}));
        auditarAtividade_=Promise.resolve(d);
        const r=await iniciarConversa_(env,d),cod=r.cod||200;delete r.cod;return J(r,cod);
      }"""

ROTA_NEW = """      if (p === '/msg/iniciar' && req.method === 'POST') {
        const d=await req.json().catch(()=>({}));
        auditarAtividade_=Promise.resolve(d);
        // v7.40.34: a primeira mensagem pelo WhatsApp segue a mesma assinatura de equipe do /msg/enviar.
        if(String(d.texto||'').trim()&&!perms.includes('gerir_acessos')&&(d.canal==='whatsapp1'||d.canal==='whatsapp2'))d.texto=await textoAssinadoEquipe_(env,req,d.canal,d.texto);
        const r=await iniciarConversa_(env,d,req.headers.get('X-TK-Whats')||''),cod=r.cod||200;delete r.cod;
        if(r.ok&&r.enviada&&r.conversa){
          // Quem abre a conversa e fala primeiro vira o respons\u00e1vel, igual ao /msg/enviar.
          try{await env.DB.prepare("UPDATE msg_conversa SET dono=? WHERE id=? AND (dono IS NULL OR dono='')").bind(await meuNomeAtendente_(env,req),Number(r.conversa)).run();}catch(e){/* dono \u00e9 conforto */}
          // Duas a\u00e7\u00f5es reais: a conversa criada (trilha do J) e a resposta confirmada.
          try{await registrarAtividade_(env,req,{conversa:r.conversa,idLocal:d.idLocal},'responder');}catch(e){/* trilha \u00e9 conforto */}
        }
        return J(r,cod);
      }"""

UI_AJ_OLD = "    const aj = el('p', 'ms-dica', 'O cliente ainda n\u00e3o recebe nada agora: a conversa \u00e9 s\u00f3 aberta aqui para voc\u00ea escrever a primeira mensagem.');"

UI_AJ_NEW = "    const aj = el('p', 'ms-dica', 'No WhatsApp a loja pode escrever primeiro: a mensagem sai na hora. No Instagram s\u00f3 \u00e9 poss\u00edvel abrir conversa que o cliente j\u00e1 iniciou.');"

UI_BLOCO_OLD = """    const dica = el('p', 'ms-dica', 'Use o n\u00famero com DDD. Se a pessoa j\u00e1 tem conversa neste canal, abrimos a existente.');
    const troca = () => {
      const ig = canal.value === 'instagram';
      rotulo.textContent = ig ? '@ do Instagram' : 'WhatsApp com DDD';
      destino.type = ig ? 'text' : 'tel'; destino.inputMode = ig ? 'text' : 'tel';
      destino.placeholder = ig ? '@loja.cliente' : '(88) 99999-9999';
      dica.textContent = ig ? 'A API oficial do Instagram n\u00e3o deixa escrever primeiro: s\u00f3 abre conversa que o cliente j\u00e1 iniciou.' : 'Use o n\u00famero com DDD. Se a pessoa j\u00e1 tem conversa neste canal, abrimos a existente.';
    };
    canal.addEventListener('change', troca);
    form.append(lbCanal, lbDestino, dica, aj);
    const pe = el('div', 'ms-filtros-pe');
    pe.append(botao('ms-btn', 'Cancelar', 'gaveta-fechar'), botao('ms-btn prim', 'Abrir conversa', 'nova-conversa-ir'));
    form.appendChild(pe); corpo.appendChild(form);
    setTimeout(() => destino.focus(), 60);
  }
  async function irParaConversa_(b) {
    const canal = $('ms-nova-canal')?.value, destino = ($('ms-nova-destino')?.value || '').trim();
    if (!destino) { aviso_(canal === 'instagram' ? 'Digite o @ do Instagram.' : 'Digite o WhatsApp com DDD.'); return; }
    b.disabled = true;
    const r = await worker_('/msg/iniciar', 'POST', { canal, destino });
    b.disabled = false;
    if (!r.ok) { aviso_(r.erro || 'N\u00e3o foi poss\u00edvel abrir a conversa.'); return; }
    const id = Number(r.conversa);"""

UI_BLOCO_NEW = """    const dica = el('p', 'ms-dica', 'Use o n\u00famero com DDD. Se a pessoa j\u00e1 tem conversa neste canal, abrimos a existente.');
    const msg = el('textarea', 'ms-copia'); msg.id = 'ms-nova-texto'; msg.rows = 3;
    msg.maxLength = 1000; msg.placeholder = 'Escreva a primeira mensagem';
    msg.setAttribute('aria-label', 'Primeira mensagem');
    const lbMsg = el('label', 'ms-cfg-linha'); const rotMsg = el('span', '', 'Primeira mensagem'); lbMsg.append(rotMsg, msg);
    const ir = botao('ms-btn prim', 'Enviar pelo WhatsApp', 'nova-conversa-ir');
    const troca = () => {
      const ig = canal.value === 'instagram';
      rotulo.textContent = ig ? '@ do Instagram' : 'WhatsApp com DDD';
      destino.type = ig ? 'text' : 'tel'; destino.inputMode = ig ? 'text' : 'tel';
      destino.placeholder = ig ? '@loja.cliente' : '(88) 99999-9999';
      dica.textContent = ig ? 'A API oficial do Instagram n\u00e3o deixa escrever primeiro: s\u00f3 abre conversa que o cliente j\u00e1 iniciou.' : 'Use o n\u00famero com DDD. Se a pessoa j\u00e1 tem conversa neste canal, abrimos a existente.';
      // O Instagram n\u00e3o recebe texto de in\u00edcio: o campo some para n\u00e3o prometer o que n\u00e3o acontece.
      lbMsg.hidden = ig;
      if (ig) msg.value = '';
      ir.textContent = ig ? 'Abrir conversa' : 'Enviar pelo WhatsApp';
    };
    canal.addEventListener('change', troca);
    form.append(lbCanal, lbDestino, lbMsg, dica, aj);
    const pe = el('div', 'ms-filtros-pe');
    pe.append(botao('ms-btn', 'Cancelar', 'gaveta-fechar'), ir);
    form.appendChild(pe); corpo.appendChild(form);
    troca();
    setTimeout(() => destino.focus(), 60);
  }
  async function irParaConversa_(b) {
    const canal = $('ms-nova-canal')?.value, destino = ($('ms-nova-destino')?.value || '').trim();
    const texto = canal === 'instagram' ? '' : ($('ms-nova-texto')?.value || '').trim();
    if (!destino) { aviso_(canal === 'instagram' ? 'Digite o @ do Instagram.' : 'Digite o WhatsApp com DDD.'); return; }
    if (canal !== 'instagram' && !texto) { aviso_('Escreva a primeira mensagem: ela sai agora pelo WhatsApp.'); $('ms-nova-texto')?.focus(); return; }
    if (canal !== 'instagram' && !/\\d{10,}/.test(destino.replace(/\\D/g, ''))) { aviso_('Digite o WhatsApp com DDD, como (88) 99999-9999.'); return; }
    // Mesmo idLocal em duas tentativas: a reserva do Worker impede a mesma mensagem sair duas vezes.
    if (!irParaConversa_.id) irParaConversa_.id = idLocal_();
    b.disabled = true;
    const r = await worker_('/msg/iniciar', 'POST', { canal, destino, texto, idLocal: irParaConversa_.id });
    b.disabled = false;
    if (!r.ok) { aviso_(r.erro || 'N\u00e3o foi poss\u00edvel abrir a conversa.'); return; }
    irParaConversa_.id = null;
    const id = Number(r.conversa);"""

UI_FIM_OLD = """    if (id) { await desempilharEsperando_('ms-gaveta'); await abrirConversa(id); }
  }"""

UI_FIM_NEW = """    if (id) { await desempilharEsperando_('ms-gaveta'); await abrirConversa(id); }
    if (r.enviada === false && canal !== 'instagram') aviso_('Conversa aberta, mas a mensagem n\u00e3o saiu. Confira a Conex\u00e3o do WhatsApp.');
  }"""


def main():
    raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
    worker = raiz / 'instagram-worker' / 'worker.js'
    ui = raiz / 'admin-mensagens.js'

    w = worker.read_text(encoding='utf-8')
    w2 = troca(w, WORKER_SIG_OLD, WORKER_SIG_NEW, 'worker.js assinatura')
    w2 = troca(w2, WORKER_RET_OLD, WORKER_RET_NEW, 'worker.js retorno de iniciarConversa_')
    w2 = troca(w2, ROTA_OLD, ROTA_NEW, 'worker.js rota /msg/iniciar')

    u = ui.read_text(encoding='utf-8')
    u2 = troca(u, UI_AJ_OLD, UI_AJ_NEW, 'admin-mensagens.js aviso')
    u2 = troca(u2, UI_BLOCO_OLD, UI_BLOCO_NEW, 'admin-mensagens.js gaveta')
    u2 = troca(u2, UI_FIM_OLD, UI_FIM_NEW, 'admin-mensagens.js fim de irParaConversa_')

    worker.write_text(w2, encoding='utf-8')
    ui.write_text(u2, encoding='utf-8')
    print(f"worker.js: {len(w)} -> {len(w2)} bytes")
    print(f"admin-mensagens.js: {len(u)} -> {len(u2)} bytes")
    print("delta aplicado")


if __name__ == '__main__':
    main()
