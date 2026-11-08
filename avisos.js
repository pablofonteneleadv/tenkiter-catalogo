/* TENKiTER — avisos que não travam a tela (módulo compartilhado, v7.57.0).
 *
 * UMA região de avisos por página (#tk-avisos, role="status"), empilhada acima das faixas fixas
 * (navegação, faixa de juntar/separar, aviso de versão nova, envios flutuantes). Nenhum aviso cobre outro.
 *
 * REGRA DE USO (vale para todas as telas):
 *   - sucesso / informação      -> TKAviso.ok(texto) | TKAviso.info(texto)   some sozinho em 6 s (10 s com "Desfazer")
 *   - falha que a pessoa precisa ler -> TKAviso.erro(texto)                  NÃO some sozinho; tem botão "Fechar"
 *   - alert() só quando a pessoa precisa decidir/agir antes de continuar (arquivo recusado, lista de falhas).
 *   - ação reversível            -> passe { desfazer: { rotulo:'Desfazer', fn } }
 *
 * Também oferece tkPlural(n, 'conversa', 'conversas') -> "1 conversa" / "2 conversas" (um só jeito de pluralizar).
 */
(function () {
  'use strict';
  if (window.TKAviso) return;

  var TEMPO_OK = 6000, TEMPO_DESFAZER = 10000;
  var FAIXAS = ['.tk-fila-lote', '#tk-versao-nova', '.envios-flut', '.sync-bar.ativa', '#tk-env-chip', '#tk-env-toast', '.tk-nav'];
  var regiao = null;

  function css() {
    if (document.getElementById('tk-avisos-css')) return;
    var s = document.createElement('style'); s.id = 'tk-avisos-css';
    s.textContent =
      '#tk-avisos{position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:2147482000;max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:8px;pointer-events:none}' +
      '#tk-avisos:empty{display:none}' +
      '.tk-aviso{pointer-events:auto;display:flex;align-items:center;gap:10px;background:#0d0d0d;color:#fff;border:2px solid #4caf50;border-radius:14px;padding:10px 12px 10px 14px;font:700 .88rem/1.35 system-ui,-apple-system,Roboto,Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
      '.tk-aviso.tk-aviso-info{border-color:#8a8a8a}' +
      '.tk-aviso.tk-aviso-aviso{border-color:#f5c542}' +
      '.tk-aviso.tk-aviso-erro{border-color:#ff6b5e}' +
      '.tk-aviso-txt{flex:1;min-width:0;overflow-wrap:anywhere}' +
      '.tk-aviso button{flex:none;width:auto;min-width:44px;min-height:44px;padding:0 12px;border:0;border-radius:10px;background:#ffffff22;color:#fff;font:800 .85rem/1 system-ui,-apple-system,Roboto,Arial,sans-serif;cursor:pointer}' +
      '.tk-aviso button.tk-aviso-desfazer{background:#E67E22;color:#0d0d0d}' +
      '.tk-aviso button:focus-visible{outline:3px solid #fff;outline-offset:2px}';
    document.head.appendChild(s);
  }

  function garantir() {
    if (regiao && document.body.contains(regiao)) return regiao;
    css();
    regiao = document.getElementById('tk-avisos');
    if (!regiao) {
      regiao = document.createElement('div'); regiao.id = 'tk-avisos';
      regiao.setAttribute('role', 'status'); regiao.setAttribute('aria-live', 'polite');
      document.body.appendChild(regiao);
    }
    return regiao;
  }

  // Sobe a região para ficar acima de qualquer faixa fixa visível (sem mexer no CSS dessas faixas).
  function posicionar() {
    if (!regiao) return;
    var alto = window.innerHeight || document.documentElement.clientHeight, topo = 0;
    FAIXAS.forEach(function (sel) {
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.hidden || regiao.contains(el)) continue;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        var r = el.getBoundingClientRect();
        if (r.height < 1 || r.bottom < alto / 2) continue;
        topo = Math.max(topo, alto - r.top);
      }
    });
    var base = topo ? Math.round(topo + 8) : 0;
    regiao.style.bottom = base > 96 ? base + 'px' : 'calc(96px + env(safe-area-inset-bottom,0px))';
  }

  function fechar(el) { if (el && el.parentNode) { el.parentNode.removeChild(el); posicionar(); } }

  /** mostrar(texto, { tipo:'ok'|'info'|'aviso'|'erro', desfazer:{rotulo,fn}, ms }) */
  function mostrar(texto, opts) {
    opts = opts || {};
    var tipo = opts.tipo || 'ok';
    if (tipo === 'rapido') tipo = 'ok';
    texto = String(texto == null ? '' : texto).trim();
    if (!texto) return null;
    var reg = garantir();
    // o mesmo texto não se repete na pilha
    Array.prototype.slice.call(reg.children).forEach(function (c) { if (c.getAttribute('data-texto') === texto) fechar(c); });
    var el = document.createElement('div');
    el.className = 'tk-aviso tk-aviso-' + tipo; el.setAttribute('data-texto', texto);
    var t = document.createElement('span'); t.className = 'tk-aviso-txt'; t.textContent = texto; el.appendChild(t);
    if (opts.desfazer && typeof opts.desfazer.fn === 'function') {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'tk-aviso-desfazer';
      d.textContent = opts.desfazer.rotulo || 'Desfazer';
      d.addEventListener('click', function () { fechar(el); try { opts.desfazer.fn(); } catch (e) { /* o desfazer cuida do próprio erro */ } });
      el.appendChild(d);
    }
    var persiste = tipo === 'erro';   // só o erro fica até a pessoa fechar; 'aviso' (atenção) some em 8 s
    if (persiste) {
      var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar aviso'); x.textContent = 'Fechar';
      x.addEventListener('click', function () { fechar(el); }); el.appendChild(x);
    }
    reg.appendChild(el);
    posicionar();
    if (!persiste) {
      var ms = opts.ms || (opts.desfazer ? TEMPO_DESFAZER : tipo === 'aviso' ? 8000 : TEMPO_OK);
      setTimeout(function () { fechar(el); }, ms);
    }
    return el;
  }

  // Frase de erro legível: nunca JSON, "HTTP 500" nem exceções em inglês (regra 14).
  function textoErro(x, padrao) {
    padrao = padrao || 'Não consegui concluir agora. Tente de novo.';
    var t = x && typeof x === 'object' ? (x.erro || x.mensagem || x.message || '') : (typeof x === 'string' ? x : '');
    t = String(t || '').trim();
    if (!t || /^[\[{<]/.test(t) || /Exception|TypeError|Failed to fetch|NetworkError|HTTP\s*\d|undefined|\bnull\b/i.test(t)) return padrao;
    return t.length > 220 ? padrao : t;
  }


  /** pedirSenha({ titulo, texto, minimo }) -> Promise<string|null>: campo de senha (texto oculto) numa janela, no lugar de prompt(). */
  function pedirSenha(o) {
    o = o || {};
    return new Promise(function (resolve) {
      css();
      if (!document.getElementById('tk-senha-css')) {
        var st = document.createElement('style'); st.id = 'tk-senha-css';
        st.textContent = '.tk-senha-fundo{position:fixed;inset:0;z-index:2147482500;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}' +
          '.tk-senha-caixa{background:#fff;color:#111;border-radius:14px;padding:18px;width:100%;max-width:380px;font:500 .95rem/1.4 system-ui,-apple-system,Roboto,Arial,sans-serif}' +
          '.tk-senha-caixa h2{margin:0 0 6px;font-size:1.05rem}.tk-senha-caixa p{margin:0 0 10px;color:#444}' +
          '.tk-senha-caixa input{width:100%;min-height:48px;font-size:1rem;padding:0 12px;border:1px solid #888;border-radius:10px;box-sizing:border-box}' +
          '.tk-senha-erro{color:#b3261e;min-height:1.3em;margin:6px 0 0;font-size:.85rem}' +
          '.tk-senha-acoes{display:flex;gap:8px;margin-top:10px}.tk-senha-acoes button{flex:1;min-height:48px;border:0;border-radius:10px;font:800 .95rem system-ui,sans-serif;cursor:pointer;background:#e8e8e8;color:#111}' +
          '.tk-senha-acoes button.tk-senha-ok{background:#E67E22;color:#0d0d0d}';
        document.head.appendChild(st);
      }
      var minimo = o.minimo || 4, anterior = document.activeElement, fim = false;
      var fundo = document.createElement('div'); fundo.className = 'tk-senha-fundo';
      var cx = document.createElement('form'); cx.className = 'tk-senha-caixa'; cx.setAttribute('role', 'dialog'); cx.setAttribute('aria-modal', 'true'); cx.setAttribute('aria-labelledby', 'tk-senha-t');
      cx.innerHTML = '<h2 id="tk-senha-t"></h2><p></p><input type="password" autocomplete="new-password" aria-label="Nova senha"><div class="tk-senha-erro" role="status"></div>' +
        '<div class="tk-senha-acoes"><button type="button" class="tk-senha-cancelar">Cancelar</button><button type="submit" class="tk-senha-ok">Salvar senha</button></div>';
      cx.querySelector('h2').textContent = o.titulo || 'Nova senha';
      cx.querySelector('p').textContent = o.texto || ('Mínimo de ' + minimo + ' caracteres.');
      fundo.appendChild(cx); document.body.appendChild(fundo);
      var campo = cx.querySelector('input'), erro = cx.querySelector('.tk-senha-erro');
      function fechar(v) {
        if (fim) return; fim = true;
        if (fundo.parentNode) fundo.parentNode.removeChild(fundo);
        if (window.TKCamadas && TKCamadas.aberta && TKCamadas.aberta('tk-senha')) { try { TKCamadas.desempilhar('tk-senha'); } catch (e) { /* já fechou */ } }
        try { anterior && anterior.focus && anterior.focus(); } catch (e) { /* sem foco */ }
        resolve(v);
      }
      cx.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (campo.value.length < minimo) { erro.textContent = 'A senha precisa ter pelo menos ' + minimo + ' caracteres.'; campo.focus(); return; }
        fechar(campo.value);
      });
      cx.querySelector('.tk-senha-cancelar').addEventListener('click', function () { fechar(null); });
      fundo.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') fechar(null); });
      if (window.TKCamadas && TKCamadas.empilhar) TKCamadas.empilhar('tk-senha', function () { fechar(null); });
      campo.focus();
    });
  }

  function plural(n, um, varios) { n = Number(n) || 0; return n + ' ' + (n === 1 ? um : varios); }

  window.TKAviso = {
    mostrar: mostrar,
    ok: function (t, o) { return mostrar(t, Object.assign({ tipo: 'ok' }, o || {})); },
    info: function (t, o) { return mostrar(t, Object.assign({ tipo: 'info' }, o || {})); },
    aviso: function (t, o) { return mostrar(t, Object.assign({ tipo: 'aviso' }, o || {})); },
    erro: function (t, o) { return mostrar(t, Object.assign({ tipo: 'erro' }, o || {})); },
    fechar: fechar, pedirSenha: pedirSenha, textoErro: textoErro, plural: plural, reposicionar: posicionar
  };
  window.tkPlural = plural;
  window.addEventListener('resize', posicionar);
})();
