/* TENKiTER Modas -- treinamento "verificado" (v1)
 * Checagem dentro da lição, prova com pergunta crítica, prática validada pela gestão e certificado com código.
 * Tudo aqui é OPCIONAL: só aparece em manual que tem "Checagem:" no texto ou capítulo "Prática..." e,
 * para o painel/certificado, só quando o servidor anuncia `certificados` em ?action=versao.
 * Manuais 1 a 3 (sem esses marcadores) ficam exatamente como eram. */
(function(){
  'use strict';
  var TMV = window.TMV = {};
  var E = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var C = {}; TMV.init = function(o){ C = o || {}; };
  var S = function(){ return C.state(); }, D = function(){ return C.data(); };
  TMV.servidor = false; // ligado pelo treinamentos.html quando ?action=versao traz certificados:true

  /* ---------- CSS ---------- */
  var css = [
   '.tmv-facaagora{background:var(--tip-bg);border:1px solid var(--tip-border);color:var(--tip-text);border-radius:12px;padding:12px 14px;margin:14px 0;font-weight:600;line-height:1.5;max-width:68ch}',
   '.tmv-facaagora b{display:block;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px}',
   '.tmv-chk{border:2px solid var(--accent-2);background:var(--surface);border-radius:14px;padding:14px;margin:16px 0;max-width:68ch}',
   '.tmv-chk-tag{font-size:.75rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-txt);margin-bottom:4px}',
   '.tmv-chk-q{font-weight:700;margin:0 0 10px;line-height:1.4}',
   '.tmv-op{display:block;width:100%;text-align:left;min-height:48px;padding:12px 14px;margin:8px 0;border:2px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text);font:inherit;cursor:pointer;line-height:1.35}',
   '.tmv-op:hover:not(:disabled){border-color:var(--accent-2)}',
   '.tmv-op.errada{border-color:var(--danger);background:var(--danger-bg);opacity:.85}',
   '.tmv-op.certa{border-color:var(--good-border);background:var(--good-bg);color:var(--good-text);font-weight:700}',
   '.tmv-fb{margin-top:8px;font-size:.95rem;line-height:1.45}',
   '.tmv-fb.ok{color:var(--good-text)}.tmv-fb.erro{color:var(--danger)}',
   '.tmv-aviso-leitura{font-size:.9rem;color:var(--muted);margin:6px 0 0}',
   '.tmv-painel{border:2px solid var(--accent-2);background:var(--accent-soft);border-radius:16px;padding:16px;margin:22px 0;max-width:68ch}',
   '.tmv-painel h3{margin:0 0 8px}',
   '.tmv-req{list-style:none;padding:0;margin:10px 0}',
   '.tmv-req li{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);line-height:1.4}',
   '.tmv-req li:last-child{border-bottom:0}',
   '.tmv-ic{flex:0 0 26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;background:var(--surface-2);color:var(--muted)}',
   '.tmv-req li.ok .tmv-ic{background:var(--good-border);color:#fff}',
   '.tmv-req li.falta .tmv-ic{background:var(--warn-border);color:#fff}',
   '.tmv-btn{display:block;width:100%;min-height:52px;border:0;border-radius:12px;font:inherit;font-weight:800;background:var(--accent-2);color:#0d0d0d;cursor:pointer;margin-top:10px;padding:12px}',
   '.tmv-btn:disabled{opacity:.5;cursor:not-allowed}',
   '.tmv-btn.sec{background:var(--surface-2);color:var(--text);border:2px solid var(--border)}',
   '.tmv-tag-teste{display:inline-block;background:#2C2C2C;color:#F39C12;font-size:.72rem;font-weight:800;letter-spacing:.04em;padding:3px 8px;border-radius:999px;margin-left:6px;vertical-align:middle}',
   /* certificado */
   '#tmv-cert{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);overflow:auto;padding:14px;display:flex;flex-direction:column;align-items:center}',
   '.tmv-cert-bar{display:flex;gap:8px;flex-wrap:wrap;width:100%;max-width:760px;margin-bottom:10px}',
   '.tmv-cert-bar button{flex:1 1 140px}',
   '.tmv-cert-page{position:relative;background:#F5F1E8;color:#2C2C2C;width:100%;max-width:760px;min-height:420px;border:10px solid #E67E22;outline:3px solid #F39C12;outline-offset:-18px;border-radius:6px;padding:34px 28px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;font-family:Poppins,Inter,system-ui,sans-serif;box-sizing:border-box}',
   '.tmv-cert-page img.logo{height:44px;margin:0 auto}',
   '.tmv-cert-tit{font-size:clamp(1.1rem,4.6vw,1.9rem);font-weight:800;letter-spacing:.14em;color:#E67E22;margin:6px 0}',
   '.tmv-cert-txt{font-size:clamp(.78rem,2.6vw,1rem);line-height:1.5;margin:4px 0}',
   '.tmv-cert-nome{font-size:clamp(1.3rem,6vw,2.3rem);font-weight:800;border-bottom:2px solid #F39C12;display:inline-block;padding:0 14px 4px;margin:8px auto;word-break:break-word}',
   '.tmv-cert-treino{font-size:clamp(.95rem,3.4vw,1.3rem);font-weight:700}',
   '@media (min-width:720px){.tmv-cert-page{aspect-ratio:1.414/1}}',
   '.tmv-cert-page>div{margin:6px 0}',
   '.tmv-cert-rod{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:10px;text-align:left;font-size:clamp(.6rem,2vw,.78rem);line-height:1.4}',
   '.tmv-cert-qr{width:84px;height:84px;background:#fff;padding:4px;flex:0 0 auto}',
   '.tmv-cert-qr svg,.tmv-cert-qr img{width:100%;height:100%}',
   '.tmv-cert-cod{font-family:ui-monospace,Menlo,monospace;font-weight:800;letter-spacing:.06em;font-size:clamp(.8rem,2.8vw,1.05rem)}',
   '.tmv-cert-nota{font-size:clamp(.55rem,1.8vw,.7rem);color:#6B675E;margin-top:4px}',
   '@media print{body.tmv-imprimindo>*:not(#tmv-cert){display:none!important}body.tmv-imprimindo #tmv-cert{position:static;background:#fff;padding:0;overflow:visible}.tmv-cert-bar{display:none!important}.tmv-cert-page{max-width:none;width:100%;border-width:12px;aspect-ratio:auto;min-height:175mm}@page{size:A4 landscape;margin:10mm}}',
   /* painel do gestor */
   '.tmv-adm .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}',
   '.tmv-adm select{min-height:44px;padding:8px 10px;border-radius:10px;border:2px solid var(--border);background:var(--surface);color:var(--text);font:inherit;flex:1 1 200px}',
   '.tmv-adm label.it{display:flex;gap:12px;align-items:flex-start;padding:12px;border:2px solid var(--border);border-radius:12px;margin:8px 0;background:var(--surface);cursor:pointer;line-height:1.4}',
   '.tmv-adm label.it input{width:22px;height:22px;margin-top:1px;flex:0 0 auto}',
   '.tmv-adm table{width:100%;border-collapse:collapse;font-size:.9rem}.tmv-adm td,.tmv-adm th{padding:8px;border-bottom:1px solid var(--border);text-align:left}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'tmv-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- texto rico (v3.17): negrito/itálico/sublinhado/riscado, cor da letra, marca-texto e links por trecho ---------- */
  var HEX = /^#[0-9a-f]{6}$/i;
  function lum_(h){ var r = parseInt(h.substr(1,2),16)/255, g = parseInt(h.substr(3,2),16)/255, b = parseInt(h.substr(5,2),16)/255; return 0.2126*r + 0.7152*g + 0.0722*b; }
  function mix_(h, alvo, f){ // mistura h com 'alvo' (0 = preto, 255 = branco) na proporção f
    var out = '#'; for (var i = 0; i < 3; i++){ var v = parseInt(h.substr(1 + i*2, 2), 16); out += ('0' + Math.round(v + (alvo - v) * f).toString(16)).slice(-2); } return out;
  }
  /** Cor da letra para tema claro (l) e escuro (d): cor muito clara escurece no claro; cor escura clareia no escuro. */
  TMV.coresDoTema = function(h){
    var L = lum_(h);
    return { l: L > 0.72 ? mix_(h, 0, 0.5) : h, d: L < 0.45 ? mix_(h, 255, 0.6) : h };
  };
  function quebras_(t){ return E(t).replace(/[\r\n\u000b]+/g, '<br>'); }
  /** HTML seguro de um parágrafo: `runs` = [{t,b,i,u,s,c,h,a}] (ou nenhum = texto simples). */
  TMV.rico = function(texto, runs){
    if (!runs || !runs.length || !runs.some(function(r){ return r && typeof r.t === 'string'; })) return quebras_(texto);
    return runs.map(function(r){
      if (!r || typeof r.t !== 'string') return '';
      var h = quebras_(r.t), cls = [], sty = '';
      if (r.c && HEX.test(r.c)){ var c = TMV.coresDoTema(r.c); cls.push('rc'); sty += '--c-l:' + c.l + ';--c-d:' + c.d + ';'; }
      var marca = r.h && HEX.test(r.h);
      if (marca){ cls.push('rh'); sty += 'background:' + r.h + ';'; }
      if (r.b) h = '<strong>' + h + '</strong>';
      if (r.i) h = '<em>' + h + '</em>';
      if (r.u) h = '<u>' + h + '</u>';
      if (r.s) h = '<s>' + h + '</s>';
      if (marca) h = '<mark class="' + cls.join(' ') + '" style="' + sty + '">' + h + '</mark>';
      else if (cls.length) h = '<span class="' + cls.join(' ') + '" style="' + sty + '">' + h + '</span>';
      if (r.a && /^https?:\/\//i.test(r.a)) h = '<a href="' + E(r.a) + '" target="_blank" rel="noopener noreferrer">' + h + '</a>';
      return h;
    }).join('');
  };
  /** Tira os primeiros `n` caracteres dos trechos (o rótulo "Faça agora:" etc.). */
  function fatiar_(runs, n){
    if (!runs || !runs.length) return null;
    var fora = [], resta = n;
    runs.forEach(function(r){
      if (!r || typeof r.t !== 'string') return;
      if (resta <= 0){ fora.push(r); return; }
      if (r.t.length <= resta){ resta -= r.t.length; return; }
      var c = {}; Object.keys(r).forEach(function(k){ c[k] = r[k]; }); c.t = r.t.substring(resta); resta = 0; fora.push(c);
    });
    return fora.length ? fora : null;
  }

  /* ---------- texto do Doc -> blocos de checagem e avisos coloridos ---------- */
  var RE_CHK = /^\s*Checagem\s*:\s*(.+)$/i, RE_OPC = /^\s*([a-f])\)\s*(.+)$/i, RE_EXP = /^\s*Explica[cç][aã]o\s*:\s*(.+)$/i, RE_FA = /^\s*Fa[cç]a\s+agora\s*:\s*(.+)$/i;
  /* caixas coloridas: a linha começa com o rótulo e dois pontos */
  var RE_AVISO = /^\s*(Relaxa|Aten[cç][aã]o|Importante|Cuidado|Dica|Exemplo|Regra\s+de\s+ouro)\s*:\s*(.+)$/i;
  var AVISOS = {
    'relaxa': ['good', '🌿 Relaxa'], 'atencao': ['warn', '⚠️ Atenção'], 'importante': ['warn', '⚠️ Importante'], 'cuidado': ['warn', '⚠️ Cuidado'],
    'dica': ['tip', '💡 Dica'], 'exemplo': ['neutro', '📌 Exemplo'], 'regra de ouro': ['ouro', '⭐ Regra de ouro']
  };
  function chaveAviso_(w){ return w.toLowerCase().replace(/[çÇ]/g, 'c').replace(/[ãâáÃ]/g, 'a').replace(/\s+/g, ' '); }
  TMV.preparar = function(blocks){
    var out = [], i = 0, n = 0;
    while (i < blocks.length){
      var b = blocks[i], m;
      if (b.type === 'p' && (m = RE_FA.exec(b.text))){ out.push({ type: 'facaagora', text: m[1], runs: fatiar_(b.runs, b.text.length - m[1].length) }); i++; continue; }
      if (b.type === 'p' && (m = RE_AVISO.exec(b.text)) && AVISOS[chaveAviso_(m[1])]){
        var def = AVISOS[chaveAviso_(m[1])];
        out.push({ type: 'aviso', kind: def[0], rotulo: def[1], text: m[2], runs: fatiar_(b.runs, b.text.length - m[2].length) }); i++; continue;
      }
      if (b.type === 'p' && (m = RE_CHK.exec(b.text))){
        var q = m[1], ops = [], correct = -1, expl = '', j = i + 1;
        while (j < blocks.length && blocks[j].type === 'p' && (m = RE_OPC.exec(blocks[j].text))){
          var t = m[2].trim(), cert = /\s\*\s*$|\s✓\s*$/.test(t + ' ');
          t = t.replace(/\s*[\*✓]\s*$/, '');
          if (cert) correct = ops.length;
          ops.push(t); j++;
        }
        if (j < blocks.length && blocks[j].type === 'p' && (m = RE_EXP.exec(blocks[j].text))){ expl = m[1]; j++; }
        if (ops.length >= 2 && correct >= 0){ out.push({ type: 'checagem', q: q, options: ops, correct: correct, explain: expl, n: n++ }); i = j; continue; }
      }
      out.push(b); i++;
    }
    return out;
  };
  TMV.temChecagem = function(blocks){ return TMV.preparar(blocks || []).some(function(b){ return b.type === 'checagem'; }); };

  /* ---------- estado salvo no aparelho (só conforto; a leitura oficial continua no servidor) ---------- */
  TMV.quem = function(){ return (C.state && S().user && S().user.whatsapp) || 'x'; };
  var chave = function(key, n){ return 'tm_chk_' + TMV.quem() + '_' + key + '_' + n; };
  var lerOk = function(key, n){ try{ return localStorage.getItem(chave(key, n)) === '1'; }catch(e){ return false; } };
  var gravarOk = function(key, n){ try{ localStorage.setItem(chave(key, n), '1'); }catch(e){} };
  TMV.todasRespondidas = function(blocks, key){
    return TMV.preparar(blocks).filter(function(b){ return b.type === 'checagem'; }).every(function(b){ return lerOk(key, b.n); });
  };

  TMV.renderBloco = function(b, key){
    if (b.type === 'facaagora') return '<div class="tmv-facaagora"><b>Faça agora</b>' + TMV.rico(b.text, b.runs) + '</div>';
    if (b.type === 'aviso') return '<div class="aviso aviso-' + E(b.kind) + '"><b class="aviso-tag">' + E(b.rotulo) + '</b>' + TMV.rico(b.text, b.runs) + '</div>';
    if (b.type !== 'checagem') return '';
    var ja = lerOk(key, b.n);
    return '<div class="tmv-chk" data-key="' + E(key) + '" data-n="' + b.n + '" data-correct="' + b.correct + '" data-expl="' + E(b.explain) + '" role="group" aria-label="Checagem rápida">' +
      '<div class="tmv-chk-tag">Checagem rápida · sem nota</div><p class="tmv-chk-q">' + E(b.q) + '</p>' +
      b.options.map(function(o, i){ return '<button type="button" class="tmv-op' + (ja && i === b.correct ? ' certa' : '') + '" data-i="' + i + '"' + (ja ? ' disabled' : '') + '>' + E(o) + '</button>'; }).join('') +
      '<div class="tmv-fb' + (ja ? ' ok' : '') + '" role="status" aria-live="polite">' + (ja ? '✓ Certo! ' + E(b.explain) : '') + '</div></div>';
  };

  /* clique nas alternativas: errou -> marca, avisa e deixa tentar de novo; acertou -> trava, explica e avisa o capítulo */
  TMV.ligar = function(raiz, aoAcertar){
    (raiz || document).querySelectorAll('.tmv-chk').forEach(function(box){
      if (box._tmv) return; box._tmv = true;
      box.addEventListener('click', function(ev){
        var btn = ev.target.closest ? ev.target.closest('.tmv-op') : null;
        if (!btn || btn.disabled) return;
        var i = parseInt(btn.getAttribute('data-i'), 10), certa = parseInt(box.getAttribute('data-correct'), 10);
        var fb = box.querySelector('.tmv-fb');
        if (i === certa){
          box.querySelectorAll('.tmv-op').forEach(function(o){ o.disabled = true; });
          btn.classList.remove('errada'); btn.classList.add('certa');
          fb.className = 'tmv-fb ok'; fb.textContent = '✓ Certo! ' + (box.getAttribute('data-expl') || '');
          gravarOk(box.getAttribute('data-key'), box.getAttribute('data-n'));
          if (aoAcertar) aoAcertar(box);
        } else {
          btn.classList.add('errada'); btn.disabled = true;
          fb.className = 'tmv-fb erro'; fb.textContent = 'Essa não. Releia o texto logo acima e tente outra.';
        }
      });
    });
  };

  /* ---------- prova: pergunta CRÍTICA ---------- */
  TMV.critica = function(texto){
    var m = /^\s*\[\s*CR[IÍ]TICA\s*\]\s*(.*)$/i.exec(String(texto || ''));
    return m ? { texto: m[1], critica: true } : { texto: String(texto || ''), critica: false };
  };

  /* ---------- prática: itens vêm do capítulo "Prática..." do próprio manual ---------- */
  TMV.itensPratica = function(manual){
    var itens = [], achou = false;
    ((manual && manual.parts) || []).forEach(function(pt){ (pt.chapters || []).forEach(function(c){
      if (/^\s*Pr[aá]tica/i.test(c.title || '')){ achou = true; (c.blocks || []).forEach(function(b){ if (b.type === 'bul' && !b.level) itens.push(b.text); }); }
    }); });
    return achou ? itens : null;
  };

  /* ---------- painel "Seu certificado" no fim do manual ---------- */
  var api = function(p){ return C.submit(Object.assign({ whatsapp: S().user.whatsapp, sessao: S().user.password }, p)); };
  TMV.painelSlot = function(level){
    if (!TMV.servidor || !TMV.itensPratica(D().manuals[level])) return '';
    return '<div class="tmv-painel" id="tmv-painel" data-level="' + E(level) + '"><h3>Seu certificado</h3><p class="tmv-aviso-leitura">Carregando…</p></div>';
  };
  TMV.montarPainel = async function(level){
    var box = document.getElementById('tmv-painel'); if (!box) return;
    var r = await api({ action: 'certificado_status', manualId: String(level) });
    box = document.getElementById('tmv-painel'); if (!box) return;
    if (!r || !r.ok){ box.innerHTML = '<h3>Seu certificado</h3><p class="tmv-aviso-leitura">Não consegui consultar agora. Tente de novo mais tarde.</p>'; return; }
    var li = function(ok, txt){ return '<li class="' + (ok ? 'ok' : 'falta') + '"><span class="tmv-ic">' + (ok ? '✓' : '•') + '</span><span>' + txt + '</span></li>'; };
    var prat = r.praticaResultado === 'aprovada' ? 'Prática aprovada pela gestão' : (r.praticaResultado === 'refazer' ? 'A gestão pediu para refazer a prática. Fale com ela.' : 'Prática na loja, acompanhada pela gestão (ainda não validada)');
    var html = '<h3>Seu certificado</h3>' +
      '<p class="tmv-aviso-leitura">O certificado não tem nota. Para ser <b>verificado</b>, você precisa cumprir os três itens:</p><ul class="tmv-req">' +
      li(r.req.leitura, 'Ler todas as lições (' + r.lidos + ' de ' + r.capitulos + ')') +
      li(r.req.prova, r.req.prova ? 'Prova feita com o mínimo exigido' : (r.criticaErrada ? 'Prova: você errou uma pergunta da regra de ouro. Releia e refaça.' : (r.melhorFeito ? 'Prova: ainda não atingiu o mínimo de ' + r.minimo + '%' : 'Fazer a prova (mínimo de ' + r.minimo + '%, sem errar as perguntas da regra de ouro)'))) +
      li(r.req.pratica, prat) + '</ul>';
    if (r.certificado) html += '<button type="button" class="tmv-btn" id="tmv-ver">Ver meu certificado</button>';
    else html += '<button type="button" class="tmv-btn" id="tmv-emitir"' + (r.elegivel ? '' : ' disabled') + '>' + (r.elegivel ? 'Receber meu certificado' : 'Certificado ainda bloqueado') + '</button>';
    box.innerHTML = html;
    var ver = box.querySelector('#tmv-ver'); if (ver) ver.addEventListener('click', function(){ TMV.mostrarCertificado(r.certificado); });
    var em = box.querySelector('#tmv-emitir');
    if (em && r.elegivel) em.addEventListener('click', async function(){
      em.disabled = true; em.textContent = 'Emitindo…';
      var x = await api({ action: 'certificado_emitir', manualId: String(level) });
      if (x && x.ok && x.certificado){ TMV.mostrarCertificado(x.certificado); TMV.montarPainel(level); }
      else { em.disabled = false; em.textContent = 'Receber meu certificado'; if (C.toast) C.toast((x && x.erro) || 'Não foi possível emitir agora.'); }
    });
  };

  /* ---------- certificado (modelo A) ---------- */
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var dataExtenso = function(iso){ var d = new Date(iso); if (isNaN(d)) return ''; return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(); };
  var siteUrl = function(){ try{ return (typeof SITE_URL === 'string' && SITE_URL) || (location.origin + '/'); }catch(e){ return location.origin + '/'; } };
  TMV.urlVerificar = function(cod){ return siteUrl() + 'verificar.html?c=' + encodeURIComponent(cod); };
  var carregarQr = function(){
    return new Promise(function(res){
      if (window.qrcode) return res(true);
      var s = document.createElement('script'); s.src = 'vendor-qrcode.js'; s.onload = function(){ res(!!window.qrcode); }; s.onerror = function(){ res(false); };
      document.head.appendChild(s);
    });
  };
  TMV.mostrarCertificado = function(c){
    var velho = document.getElementById('tmv-cert'); if (velho) velho.remove();
    var wrap = document.createElement('div'); wrap.id = 'tmv-cert'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Certificado de conclusão');
    var url = TMV.urlVerificar(c.codigo);
    wrap.innerHTML = '<div class="tmv-cert-bar"><button type="button" class="tmv-btn" id="tmv-imp">Imprimir / salvar PDF</button><button type="button" class="tmv-btn sec" id="tmv-fechar">Fechar</button></div>' +
      '<div class="tmv-cert-page"><div><img class="logo" src="logo-mark.png" alt="TENKiTER Modas" onerror="this.style.display=\'none\'"><div class="tmv-cert-tit">CERTIFICADO DE CONCLUSÃO</div></div>' +
      '<div><p class="tmv-cert-txt">A TENKiTER Modas certifica que</p><div class="tmv-cert-nome">' + E(c.nome) + '</div>' +
      '<p class="tmv-cert-txt">concluiu o treinamento</p><p class="tmv-cert-treino">' + E(c.titulo) + '</p>' +
      '<p class="tmv-cert-txt">em ' + E(dataExtenso(c.emitidoEm)) + ', com prática validada por <b>' + E(c.validadoPor || 'a gestão') + '</b>.</p></div>' +
      '<div class="tmv-cert-rod"><div>Código de verificação<br><span class="tmv-cert-cod">' + E(c.codigo) + '</span><div class="tmv-cert-nota">Certificado interno da TENKiTER Modas.<br>Confira em ' + E(siteUrl().replace(/^https?:\/\//, '')) + 'verificar.html</div></div><div class="tmv-cert-qr" id="tmv-qr" aria-label="QR code de verificação"></div></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#tmv-fechar').addEventListener('click', function(){ wrap.remove(); document.body.classList.remove('tmv-imprimindo'); });
    wrap.querySelector('#tmv-imp').addEventListener('click', function(){ document.body.classList.add('tmv-imprimindo'); setTimeout(function(){ window.print(); }, 50); });
    window.addEventListener('afterprint', function(){ document.body.classList.remove('tmv-imprimindo'); });
    carregarQr().then(function(ok){
      var q = document.getElementById('tmv-qr'); if (!q) return;
      if (!ok){ q.style.display = 'none'; return; }
      var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); q.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    });
  };

  /* ---------- aba do gestor: validar prática e ver certificados ---------- */
  TMV.abaGestor = function(){
    return '<div class="admin-panel tmv-adm" id="tmv-adm"><h2 style="margin-top:0">Prática e certificados</h2>' +
      '<p class="tmv-aviso-leitura">Escolha a pessoa e o manual, marque o que você viu na loja e aprove. Fica registrado quem validou e quando.</p>' +
      '<div class="row"><select id="tmv-pes" aria-label="Pessoa"></select><select id="tmv-man" aria-label="Manual"></select></div>' +
      '<div id="tmv-itens"><p class="tmv-aviso-leitura">Carregando…</p></div><div id="tmv-lista"></div></div>' +
      '<div id="tut-editor-slot"></div>';
  };
  TMV.ligarGestor = async function(){
    var raiz = document.getElementById('tmv-adm'); if (!raiz) return;
    var pes = raiz.querySelector('#tmv-pes'), man = raiz.querySelector('#tmv-man'), itensBox = raiz.querySelector('#tmv-itens'), lista = raiz.querySelector('#tmv-lista');
    var func = ((S().adminData && S().adminData.funcionarios) || []).filter(function(f){ return String(f.status || 'ativo').toLowerCase() !== 'inativo'; });
    func.sort(function(a, b){ return String(a.nome || '').localeCompare(String(b.nome || '')); });
    pes.innerHTML = func.map(function(f){ return '<option value="' + E(String(f.whatsapp).replace(/\D/g, '')) + '">' + E(f.nome || f.whatsapp) + '</option>'; }).join('');
    var manuais = (S().manuaisList || []).filter(function(m){ return TMV.itensPratica(D().manuals[m.id]); });
    man.innerHTML = manuais.map(function(m){ return '<option value="' + E(m.id) + '">' + E(m.titulo) + '</option>'; }).join('');
    if (!manuais.length){ itensBox.innerHTML = '<p class="tmv-aviso-leitura">Nenhum manual tem o capítulo "Prática" ainda.</p>'; return; }
    var praticas = [];
    var carregar = async function(){
      var r = await api({ action: 'pratica_listar' }); praticas = (r && r.ok && r.praticas) || [];
      desenhar();
      var c = await api({ action: 'certificado_meus', todos: true });
      var cs = (c && c.ok && c.certificados) || [];
      lista.innerHTML = '<h3>Certificados emitidos</h3>' + (cs.length ? '<table><tr><th>Pessoa</th><th>Treinamento</th><th>Código</th><th></th></tr>' + cs.map(function(x){
        return '<tr><td>' + E(x.nome) + '</td><td>' + E(x.titulo) + '</td><td>' + E(x.codigo) + (x.status === 'revogado' ? ' (revogado)' : '') + '</td><td>' + (x.status === 'revogado' ? '' : '<button class="tmv-btn sec" style="margin:0;min-height:40px" data-rev="' + E(x.codigo) + '">Revogar</button>') + '</td></tr>'; }).join('') + '</table>' : '<p class="tmv-aviso-leitura">Nenhum ainda.</p>');
      lista.querySelectorAll('[data-rev]').forEach(function(b){ b.addEventListener('click', async function(){
        if (!confirm('Revogar este certificado? Ele passa a aparecer como inválido na verificação.')) return;
        var x = await api({ action: 'certificado_revogar', codigo: b.getAttribute('data-rev') }); if (C.toast) C.toast(x && x.ok ? 'Certificado revogado.' : ((x && x.erro) || 'Não consegui revogar.')); carregar();
      }); });
    };
    var desenhar = function(){
      var w = pes.value, id = man.value, itens = TMV.itensPratica(D().manuals[id]) || [];
      var ult = praticas.filter(function(p){ return p.whatsapp === w && p.manualId === id; })[0];
      var marcados = {}; if (ult) (ult.itens || []).forEach(function(i){ if (i.ok) marcados[i.t] = true; });
      itensBox.innerHTML = (ult ? '<p class="tmv-aviso-leitura">Último registro: <b>' + (ult.resultado === 'aprovada' ? 'aprovada' : 'refazer') + '</b> por ' + E(ult.validadoPor) + (ult.obs ? ' · ' + E(ult.obs) : '') + '</p>' : '<p class="tmv-aviso-leitura">Ainda sem prática registrada.</p>') +
        itens.map(function(t, i){ return '<label class="it"><input type="checkbox" data-t="' + E(t) + '"' + (marcados[t] ? ' checked' : '') + '><span>' + E(t) + '</span></label>'; }).join('') +
        '<div class="row"><input id="tmv-obs" type="text" placeholder="Observação (opcional)" style="flex:1 1 220px;min-height:44px;padding:8px 10px;border-radius:10px;border:2px solid var(--border);background:var(--surface);color:var(--text);font:inherit"></div>' +
        '<button type="button" class="tmv-btn" id="tmv-aprovar">Aprovar prática</button><button type="button" class="tmv-btn sec" id="tmv-refazer">Pedir para refazer</button>';
      var enviar = async function(aprovado){
        var its = [].map.call(itensBox.querySelectorAll('input[data-t]'), function(c){ return { t: c.getAttribute('data-t'), ok: c.checked }; });
        if (aprovado && !its.every(function(x){ return x.ok; })){ if (C.toast) C.toast('Para aprovar, marque todos os itens.'); return; }
        var x = await api({ action: 'pratica_validar', whatsappAlvo: w, manualId: id, itens: its, aprovado: aprovado, obs: (document.getElementById('tmv-obs') || {}).value || '' });
        if (C.toast) C.toast(x && x.ok ? (aprovado ? 'Prática aprovada e registrada.' : 'Registrado: refazer.') : ((x && x.erro) || 'Não foi possível registrar.'));
        if (x && x.ok) carregar();
      };
      itensBox.querySelector('#tmv-aprovar').addEventListener('click', function(){ enviar(true); });
      itensBox.querySelector('#tmv-refazer').addEventListener('click', function(){ enviar(false); });
    };
    pes.addEventListener('change', desenhar); man.addEventListener('change', desenhar);
    carregar();
    if (window.TKTutorial) window.TKTutorial.montarEditor();
  };
})();
