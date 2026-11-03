/* v7.50.0 — Sessão rápida entre a loja (index) e a Gestão (admin.html).
 * Quem já entrou num lado aparece logado NA HORA no outro: a página usa a sessão guardada no aparelho (tm_session, de common.js)
 * e o último "quem é você" confirmado pelo servidor PARA ESSA MESMA SESSÃO. A conferência com o servidor continua por trás;
 * se a sessão não valer mais, a página desloga com aviso. O servidor confere a credencial em toda chamada de qualquer jeito.
 * Guarda só nome, perfil, nível e permissões, presos a uma impressão da sessão (nunca a senha nem o token em si).
 * common.js não muda (o APK embute esse arquivo). */
(function () {
  'use strict';
  const CHAVE = 'tk_usuario_cache_v1';
  const VALIDADE_MS = 7 * 24 * 3600 * 1000;   // depois disso a página espera o servidor antes de pintar logado
  /** Impressão curta da sessão (não dá para voltar ao token a partir dela). */
  function impressao(s) {
    const t = String((s && s.whatsapp) || '') + '|' + String((s && s.sessao) || '');
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }
  function sessao() { try { return typeof getSessao === 'function' ? getSessao() : null; } catch (e) { return null; } }
  function ler() {
    const s = sessao(); if (!s) return null;
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (!c || c.h !== impressao(s) || !Array.isArray(c.permissoes)) return null;
      if (!(Date.now() - Number(c.em || 0) < VALIDADE_MS)) return null;
      return { whatsapp: s.whatsapp, name: c.nome || '', nome: c.nome || '', perfil: c.perfil || '', level: c.level, permissoes: c.permissoes.slice(), doCache: true };
    } catch (e) { return null; }
  }
  function gravar(usuario) {
    const s = sessao(); if (!s || !usuario || usuario.semRede || !Array.isArray(usuario.permissoes)) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ h: impressao(s), nome: String(usuario.name || usuario.nome || '').slice(0, 80), perfil: String(usuario.perfil || '').slice(0, 80), level: usuario.level, permissoes: usuario.permissoes.filter((p) => typeof p === 'string').slice(0, 80), em: Date.now() }));
    } catch (e) {}
  }
  function limpar() { try { localStorage.removeItem(CHAVE); } catch (e) {} }
  // Trocou de conta ou saiu (nesta ou em outra aba): o "quem é você" guardado deixa de valer sozinho (a impressão não bate mais).
  try { window.addEventListener('tk:sessao', () => { const c = ler(); if (!c) limpar(); }); } catch (e) {}
  window.TKUsuarioCache = { ler, gravar, limpar };
})();
