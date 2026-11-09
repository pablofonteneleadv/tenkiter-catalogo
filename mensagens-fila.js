/* Fila de envio do Mensageiro: cada mensagem escrita é guardada no aparelho (IndexedDB) ANTES de ir para o servidor.
 * Regras:
 *  - várias mensagens, na mesma conversa ou em conversas diferentes, podem ser escritas enquanto outra ainda está saindo;
 *  - dentro de UMA conversa a ordem é sempre a escrita: a próxima só sai depois que a anterior foi confirmada;
 *  - conversas diferentes saem ao mesmo tempo;
 *  - se uma mensagem falha, as seguintes DA MESMA conversa esperam (não passam na frente) e as outras conversas seguem;
 *  - "Tentar de novo" reenvia com a MESMA chave (idLocal): o servidor devolve a resposta já registrada, então nunca duplica;
 *  - ao recarregar a página, o que ficou pendente volta e segue; item guardado há mais de 30 min NÃO sai sozinho (pede confirmação).
 * Itens com arquivo (foto, vídeo, áudio) entram na mesma ordem, mas ficam só na memória (item.memoria): se a página fechar, não voltam.
 * Nunca guarda credenciais: só conversa, texto e referências da própria mensagem. */
(function () {
  'use strict';
  window.TKFilaEnvio = function (cfg) {
    const NOME = 'tk_mensagens_fila_v1', aba = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())), MAX_IDADE = 30 * 60000, LEASE = 60000;
    const itens = new Map();            // id -> item (desta aba e os adotados da gaveta)
    const rodando = new Set();          // conversas em andamento
    let dbp = null, ultimo = 0;
    const dono = () => String(cfg.dono() || '');
    const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
    function db() { return dbp || (dbp = new Promise((ok, no) => { try { const r = indexedDB.open(NOME, 1); r.onupgradeneeded = () => { r.result.createObjectStore('itens', { keyPath: 'id' }); }; r.onsuccess = () => ok(r.result); r.onerror = r.onblocked = () => { dbp = null; no(Error('Não consegui guardar a mensagem neste aparelho.')); }; } catch (e) { dbp = null; no(e); } })); }
    const gravavel = (i) => ({ id: i.id, dono: i.dono, conversa: i.conversa, seq: i.seq, criado: i.criado, estado: i.estado, erro: i.erro || '', dados: i.dados, lease: { aba, ate: Date.now() + LEASE } });
    async function gravar(i) { if (i.memoria) return; try { const b = await db(); await new Promise((ok, no) => { const t = b.transaction('itens', 'readwrite'); t.objectStore('itens').put(gravavel(i)); t.oncomplete = ok; t.onerror = t.onabort = () => no(); }); } catch (_) { /* sem armazenamento: segue só na memória */ } }
    async function apagar(id) { try { const b = await db(); await new Promise((ok) => { const t = b.transaction('itens', 'readwrite'); t.objectStore('itens').delete(id); t.oncomplete = ok; t.onerror = t.onabort = ok; }); } catch (_) { /* nada a apagar */ } }
    async function lerTodos() { const b = await db(); return new Promise((ok) => { const r = b.transaction('itens').objectStore('itens').getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); }); }
    /* Só uma aba envia cada mensagem: quem tem a reserva em dia (renovada a cada 20 s) é o dono dela. */
    async function reservar(i) {
      if (i.memoria) return true;
      try { const vivas = await abasVivas(); const b = await db(); return await new Promise((ok) => { const t = b.transaction('itens', 'readwrite'), st = t.objectStore('itens'), g = st.get(i.id); let livre = false; g.onsuccess = () => { const x = g.result; if (!x) { livre = false; return; } if (x.lease && x.lease.aba !== aba && vivaAinda(x.lease, vivas)) return; x.lease = { aba, ate: Date.now() + LEASE }; st.put(x); livre = true; }; t.oncomplete = () => ok(livre); t.onerror = t.onabort = () => ok(true); }); } catch (_) { return true; }
    }
    /* Aba viva = ainda segura o seu cadeado (Web Locks): morreu ao recarregar/fechar, o cadeado some e outra aba assume na hora. Sem Web Locks, vale a reserva de 60 s. */
    if (navigator.locks && navigator.locks.request) { try { navigator.locks.request('tk-fila-aba:' + aba, () => new Promise(() => {})); } catch (_) { /* sem cadeado */ } }
    async function abasVivas() { try { if (navigator.locks && navigator.locks.query) { const q = await navigator.locks.query(); return new Set((q.held || []).map((l) => l.name)); } } catch (_) { /* cai na reserva por tempo */ } return null; }
    const vivaAinda = (lease, vivas) => vivas ? vivas.has('tk-fila-aba:' + lease.aba) : lease.ate > Date.now();
    const ordenados = (conversa) => [...itens.values()].filter((i) => i.conversa === conversa && i.dono === dono()).sort((a, b) => a.seq - b.seq);
    function avisar(i) { try { cfg.mudou && cfg.mudou(i, ordenados(i.conversa)); } catch (_) { /* a tela não derruba a fila */ } }
    async function processarConversa(conversa) {
      if (rodando.has(conversa)) return; rodando.add(conversa);
      try {
        for (;;) {
          const cab = ordenados(conversa)[0];
          if (!cab || cab.estado === 'erro') break;              // falhou: o resto desta conversa espera, nada passa na frente
          if (!await reservar(cab)) { itens.delete(cab.id); continue; }   // outra aba cuida desta
          cab.estado = 'enviando'; cab.erro = ''; await gravar(cab); avisar(cab);
          let r;
          for (let t = 0; ; t++) {
            try { r = await cfg.executar(cab); } catch (e) { r = { ok: false, erro: 'Não foi possível enviar agora.' }; }
            /* Sem resposta do servidor: tenta de novo sozinho (mesma chave, não duplica) antes de pedir ajuda. */
            if (r && r.semRede && !r.semEnvio && t < 2) { await esperar(1500 * (t + 1)); if (dono() !== cab.dono) break; continue; }
            break;
          }
          if (r && (r.ok || (r.incerto && r.mensagem))) {
            itens.delete(cab.id); await apagar(cab.id);
            try { cfg.concluiu && cfg.concluiu(cab, r); } catch (_) { /* idem */ }
          } else {
            cab.estado = 'erro'; cab.resultado = r || {}; cab.erro = String((cfg.textoErro ? cfg.textoErro(cab, r || {}) : (r && r.erro)) || 'Não foi possível enviar agora.');
            await gravar(cab); avisar(cab);
            try { cfg.falhou && cfg.falhou(cab, r || {}); } catch (_) { /* idem */ }
            break;
          }
        }
      } finally { rodando.delete(conversa); }
    }
    function processar() { const cs = new Set([...itens.values()].filter((i) => i.dono === dono() && i.estado !== 'erro').map((i) => i.conversa)); cs.forEach((c) => { void processarConversa(c); }); }
    async function adicionar(dados) {
      const conta = dono(); if (!conta) throw Error('Entre na sua conta para enviar.');
      const seq = Math.max(Date.now() * 1000, ultimo + 1); ultimo = seq;
      const i = { id: dados.id, dono: conta, conversa: dados.conversa, seq, criado: Date.now(), estado: 'fila', erro: '', dados: dados.dados, memoria: !!dados.memoria, local: dados.local };
      itens.set(i.id, i); avisar(i);
      void gravar(i).then(() => processarConversa(i.conversa));
      return i;
    }
    async function tentar(id) { const i = itens.get(id); if (!i || i.estado !== 'erro') return false; i.estado = 'fila'; i.erro = ''; await gravar(i); avisar(i); void processarConversa(i.conversa); return true; }
    async function descartar(id) { const i = itens.get(id); if (!i || i.estado === 'enviando') return false; itens.delete(id); await apagar(id); void processarConversa(i.conversa); avisarTodos(i.conversa); return true; }
    function avisarTodos(conversa) { const l = ordenados(conversa); if (l[0]) avisar(l[0]); }
    /* Recupera o que ficou guardado (recarga da página, aba fechada). Devolve os itens adotados para a tela desenhar as bolhas. */
    async function restaurar() {
      const conta = dono(); if (!conta) return [];
      let todos = []; try { todos = await lerTodos(); } catch (_) { return []; }
      const agora = Date.now(), novos = [], vivas = await abasVivas();
      for (const x of todos) {
        if (agora - x.criado > 3 * 86400000) { void apagar(x.id); continue; }       // varrida de lixo antigo, de qualquer conta
        if (x.dono !== conta || itens.has(x.id)) continue;
        if (x.lease && x.lease.aba !== aba && vivaAinda(x.lease, vivas)) continue;       // outra aba viva cuida dele
        const i = { id: x.id, dono: x.dono, conversa: x.conversa, seq: x.seq, criado: x.criado, estado: x.estado === 'erro' ? 'erro' : 'fila', erro: x.erro || '', dados: x.dados, memoria: false };
        if (i.estado === 'fila' && agora - i.criado > MAX_IDADE) { i.estado = 'erro'; i.erro = 'Esta mensagem ficou guardada há mais de 30 minutos e não foi enviada sozinha. Confira a conversa e toque em Tentar de novo.'; }
        itens.set(i.id, i); await gravar(i); novos.push(i);
      }
      novos.sort((a, b) => a.seq - b.seq);
      if (novos.length) { try { cfg.restaurou && cfg.restaurou(novos); } catch (_) { /* idem */ } processar(); }
      return novos;
    }
    setInterval(() => { [...itens.values()].filter((i) => !i.memoria && i.dono === dono() && i.estado !== 'erro').forEach((i) => { void gravar(i); }); }, 20000);   // renova a reserva
    window.addEventListener('online', () => { processar(); });
    setInterval(() => { if (dono() && !document.hidden) { void restaurar(); processar(); } }, 15000);
    window.addEventListener('tk:sessao', () => { void restaurar(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { void restaurar(); processar(); } });
    void restaurar();
    return { adicionar, tentar, descartar, restaurar, processar, itensDaConversa: ordenados, pendentes: () => [...itens.values()].filter((i) => i.dono === dono()) };
  };
})();
