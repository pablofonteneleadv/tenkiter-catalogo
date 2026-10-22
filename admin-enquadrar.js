/* admin-enquadrar.js — janela "✂ Enquadrar a foto" do cadastro de peça (v4.32, só front).
 *
 * Pedido do Pablo (18/10/2026): as miniaturas do cadastro refletem como a foto aparece no site (4:5) e como será postada;
 * tocar abre uma janela para posicionar, girar e dar zoom JÁ vendo Story, Feed/Carrossel e Site.
 *
 * Como funciona: a foto é montada num quadro 4:5 (1080×1350, o formato do site, do Feed e do Carrossel) por
 *   • Cortar (preencher o quadro, sem sobra) ou • Encaixar (foto inteira sobre fundo desfocado),
 * com zoom, mover e girar. "Usar esta foto" devolve um JPEG 4:5 pronto (aoAplicar) — o admin troca a foto da peça por ele
 * e a original continua guardada na peça até salvar ("↩ Voltar à original"). Nada é gravado aqui: quem chama decide.
 *
 * API: TKEnquadrar.abrir({ src, podeVoltar, aoAplicar(dataUrlJpeg), aoVoltar() })
 *   src = endereço https:// (precisa de CORS) ou data:/blob: da foto original.
 */
(function () {
  'use strict';
  var FW = 1080, FH = 1350;          // quadro final 4:5
  var PW = 432, PH = 540;            // quadro da área de edição (mesma proporção, 0,4×)
  var el = null, estado = null, rafId = 0, css = false;

  function $(s) { return el && el.querySelector(s); }
  function rad(g) { return g * Math.PI / 180; }
  function lim(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- geometria (tudo no quadro unitário FW×FH; x,y = deslocamento do centro da foto, em fração do quadro) ---------- */
  function sBase(st) {
    var iw = st.img.naturalWidth, ih = st.img.naturalHeight;
    return st.modo === 'cortar' ? Math.max(FW / iw, FH / ih) : Math.min(FW / iw, FH / ih);
  }
  // menor zoom em que o retângulo girado da foto ainda cobre o quadro inteiro (modo Cortar)
  function zMin(st, x, y, r) {
    if (st.modo !== 'cortar') return 0.3;
    var iw = st.img.naturalWidth, ih = st.img.naturalHeight, c = Math.cos(rad(r)), s = Math.sin(rad(r)), cx = FW / 2 + x * FW, cy = FH / 2 + y * FH, need = 0;
    [[0, 0], [FW, 0], [0, FH], [FW, FH]].forEach(function (p) {
      var dx = p[0] - cx, dy = p[1] - cy, u = dx * c + dy * s, v = -dx * s + dy * c;
      need = Math.max(need, Math.abs(u) / (iw / 2), Math.abs(v) / (ih / 2));
    });
    return need / sBase(st);
  }
  function ajustarZoom(st) {
    var mn = zMin(st, st.x, st.y, st.r);
    st.z = lim(st.z, Math.max(mn, st.modo === 'cortar' ? 1 : 0.3), 5);
    if (st.modo === 'cortar' && zMin(st, st.x, st.y, st.r) > st.z + 1e-6) st.z = zMin(st, st.x, st.y, st.r);
  }
  // mover: só aceita o deslocamento que mantém o quadro coberto (Cortar); tenta cada eixo separado
  function mover(st, nx, ny) {
    function ok(x, y) { return st.modo === 'cortar' ? zMin(st, x, y, st.r) <= st.z + 1e-6 : (Math.abs(x) <= 0.6 && Math.abs(y) <= 0.6); }
    if (ok(nx, ny)) { st.x = nx; st.y = ny; return; }
    if (ok(nx, st.y)) { st.x = nx; return; }
    if (ok(st.x, ny)) { st.y = ny; }
  }

  /* ---------- desenho ---------- */
  function fundoDesfocado(ctx, W, H, img) {
    var t = document.createElement('canvas'); t.width = 36; t.height = Math.max(8, Math.round(36 * H / W));
    var tc = t.getContext('2d'), s = Math.max(t.width / img.naturalWidth, t.height / img.naturalHeight);
    tc.drawImage(img, (t.width - img.naturalWidth * s) / 2, (t.height - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
  }
  function pintarQuadro(ctx, W, H, st) {
    var k = W / FW, img = st.img, s = sBase(st) * st.z * k;
    ctx.save(); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (st.modo === 'encaixar') fundoDesfocado(ctx, W, H, img);
    ctx.translate(W / 2 + st.x * W, H / 2 + st.y * H); ctx.rotate(rad(st.r));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
  }
  // Story 9:16: o quadro 4:5 encaixado no centro sobre o próprio fundo desfocado (como a aba Postagens faz por padrão)
  function pintarStory(cv, quadro) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, h = W * 1.25;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H);
    var t = document.createElement('canvas'); t.width = 24; t.height = 42;
    var tc = t.getContext('2d'), s = Math.max(24 / quadro.width, 42 / quadro.height);
    tc.drawImage(quadro, (24 - quadro.width * s) / 2, (42 - quadro.height * s) / 2, quadro.width * s, quadro.height * s);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(t, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(quadro, 0, (H - h) / 2, W, h);
  }
  function pintarTudo() {
    rafId = 0; if (!estado || !estado.img) return;
    var st = estado, main = $('#enq-cv'); if (!main) return;
    pintarQuadro(main.getContext('2d'), main.width, main.height, st);
    var q = document.createElement('canvas'); q.width = 216; q.height = 270;     // quadro pequeno reaproveitado nas 3 prévias
    pintarQuadro(q.getContext('2d'), q.width, q.height, st);
    ['#enq-p-site', '#enq-p-feed'].forEach(function (id) { var c = $(id); if (c) { var x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.drawImage(q, 0, 0, c.width, c.height); } });
    var sc = $('#enq-p-story'); if (sc) pintarStory(sc, q);
    var zs = $('#enq-z'), rs = $('#enq-r');
    if (zs && document.activeElement !== zs) zs.value = String(Math.round(st.z * 100));
    if (rs && document.activeElement !== rs) rs.value = String(Math.round(st.r));
    var zo = $('#enq-z-v'), ro = $('#enq-r-v'); if (zo) zo.textContent = Math.round(st.z * 100) + '%'; if (ro) ro.textContent = Math.round(st.r) + '°';
    var ms = el.querySelectorAll('[data-enq="modo"]'); ms.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === st.modo)); });
    if (zs) zs.min = st.modo === 'cortar' ? '100' : '30';
  }
  function agendar() { if (!rafId) rafId = requestAnimationFrame(pintarTudo); }

  /* ---------- carregar a foto ---------- */
  function carregar(src) {
    return new Promise(function (resolve, reject) {
      function img(u, rev) {
        var i = new Image(); i.onload = function () { if (rev) setTimeout(function () { URL.revokeObjectURL(u); }, 3000); resolve(i); };
        i.onerror = function () { if (rev) URL.revokeObjectURL(u); reject(new Error('imagem')); }; i.src = u;
      }
      if (/^(data|blob):/.test(src)) return img(src, false);
      fetch(src, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); })
        .then(function (b) { img(URL.createObjectURL(b), true); }).catch(function () { reject(new Error('cors')); });
    });
  }

  /* ---------- janela ---------- */
  function injetarCss() {
    if (css) return; css = true;
    var s = document.createElement('style');
    s.textContent = [
      '.enq-ov{align-items:flex-end}',
      '.enq-box{background:var(--branco,#fff);width:100%;max-width:560px;height:96dvh;max-height:96dvh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}',
      '.enq-topo{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px;font-family:"Poppins",sans-serif;font-size:1.02rem}',
      '.enq-corpo{flex:1 1 auto;overflow-y:auto;padding:4px 16px 12px;-webkit-overflow-scrolling:touch}',
      '.enq-palco{position:relative;width:min(60vw,250px,calc(36dvh * .8));margin:2px auto 8px}',
      '.enq-palco canvas{display:block;width:100%;height:auto;aspect-ratio:4/5;border-radius:10px;border:2px solid var(--laranja,#E67E22);background:#eee;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}',
      '.enq-palco canvas:focus-visible{outline:3px solid #0b57d0;outline-offset:2px}',
      '.enq-aviso{margin:8px 0;padding:8px 10px;border-radius:8px;background:#fdecea;color:#8a1c14;font-size:.85rem;line-height:1.35}',
      '.enq-aviso[hidden]{display:none}',
      '.enq-palco{width:min(78vw,360px,calc(53dvh * .8))}',
      '.enq-box:has(.enq-avancados[open]) .enq-palco{width:min(48vw,190px,calc(27dvh * .8))}',
      '.enq-box:has(.enq-avancados[open]) .enq-dica-gestos{display:none}',
      '.enq-avancados summary{min-height:44px;padding:12px 0;cursor:pointer;font-weight:700}',
      '.enq-modo{display:flex;gap:8px;margin:0 0 10px}',
      '.enq-modo button,.enq-acoes button,.enq-rodape button{width:auto;min-height:44px;padding:8px 12px;border-radius:12px;border:1.5px solid #c9c9c9;background:#fff;color:#222;font:inherit;font-size:.86rem;font-weight:700;cursor:pointer}',
      '.enq-modo button{flex:1 1 0}',
      '.enq-modo button[aria-pressed="true"]{background:var(--laranja,#E67E22);border-color:var(--laranja,#E67E22);color:#0d0d0d}',
      '.enq-sl{display:grid;grid-template-columns:64px 1fr 52px;align-items:center;gap:10px;min-height:44px;margin:0 0 6px}',
      '.enq-sl label{font-weight:700;font-size:.86rem}',
      '.enq-sl output{font-size:.82rem;text-align:right;color:#444}',
      '.enq-sl input[type=range]{width:100%;height:44px;margin:0;touch-action:pan-y}',
      '.enq-acoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin:0 0 14px}',
      '.enq-prev-tit{font-family:"Poppins",sans-serif;font-size:.8rem;margin:0 0 4px;text-align:center;color:#444}',
      '.enq-prev{display:flex;gap:10px;justify-content:center;align-items:flex-end;margin:0 0 12px}',
      '.enq-prev figure{margin:0;text-align:center}',
      '.enq-prev canvas{display:block;height:92px;width:auto;border-radius:8px;border:1px solid #ddd;background:#eee}',
      '.enq-prev figcaption{font-size:.68rem;color:#555;margin-top:3px;line-height:1.2}',
      '.enq-dica{font-size:.78rem;color:#555;margin:10px 0 0;line-height:1.4}',
      '.enq-rodape{display:flex;gap:10px;padding:10px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #eee;background:#fff}',
      '.enq-rodape .enq-ok{flex:1 1 auto;background:var(--laranja,#E67E22);border-color:var(--laranja,#E67E22);color:#0d0d0d;font-size:.95rem}',
      '.enq-rodape .enq-ok:disabled{opacity:.45;cursor:default}'
    ].join('');
    document.head.appendChild(s);
  }
  function montar() {
    if (el) return;
    injetarCss();
    el = document.createElement('div'); el.id = 'enq-ov'; el.className = 'overlay-sheet enq-ov';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'enq-tit');
    el.innerHTML =
      '<div class="enq-box">' +
        '<div class="enq-topo"><strong id="enq-tit">✂ Enquadrar a foto</strong><button type="button" class="sheet-x btn-fechar" aria-label="Fechar" data-enq="fechar">✕</button></div>' +
        '<div class="enq-corpo">' +
          '<div class="enq-palco"><canvas id="enq-cv" width="' + PW + '" height="' + PH + '" tabindex="0" role="img" aria-label="Foto da peça no quadro 4:5. Arraste para mover; dois dedos para aumentar e girar; setas movem, mais e menos dão zoom."></canvas></div>' +
          '<div class="enq-aviso" id="enq-aviso" role="status" hidden></div>' +
          '<p class="enq-dica enq-dica-gestos">Arraste com um dedo. Use dois dedos para aumentar, diminuir e girar.</p>' +
          '<div class="enq-acoes"><button type="button" data-enq="desfazer">Desfazer</button><button type="button" data-enq="todas" id="enq-todas" hidden>Aplicar a todas</button><button type="button" data-enq="voltar" id="enq-voltar" hidden>↩ Voltar à original</button></div>' +
          '<details class="enq-avancados" id="enq-ajustes"><summary>Ajustes e prévias</summary>' +
          '<div class="enq-prev-tit">Como vai ficar</div>' +
          '<div class="enq-prev"><figure><canvas id="enq-p-site" width="208" height="260" role="img" aria-label="Prévia no site"></canvas><figcaption>🛍️ Site<br>4:5</figcaption></figure><figure><canvas id="enq-p-feed" width="208" height="260" role="img" aria-label="Prévia no Feed e no Carrossel"></canvas><figcaption>📸 Feed e<br>Carrossel 4:5</figcaption></figure><figure><canvas id="enq-p-story" width="146" height="260" role="img" aria-label="Prévia no Story"></canvas><figcaption>📱 Story<br>9:16</figcaption></figure></div>' +
          '<div class="enq-modo" role="group" aria-label="Como a foto ocupa o quadro"><button type="button" data-enq="modo" data-v="cortar" aria-pressed="true">✂ Cortar (preencher)</button><button type="button" data-enq="modo" data-v="encaixar" aria-pressed="false">🖼️ Encaixar (inteira)</button></div>' +
          '<div class="enq-sl"><label for="enq-z">Zoom</label><input type="range" id="enq-z" min="100" max="500" step="1" value="100"><output id="enq-z-v" for="enq-z">100%</output></div>' +
          '<div class="enq-sl"><label for="enq-r">Girar</label><input type="range" id="enq-r" min="-180" max="180" step="1" value="0"><output id="enq-r-v" for="enq-r">0°</output></div>' +
          '<div class="enq-acoes"><button type="button" data-enq="g" data-v="-90">↺ 90°</button><button type="button" data-enq="g" data-v="90">↻ 90°</button><button type="button" data-enq="centro">Centralizar</button><button type="button" data-enq="zerar">Zerar</button></div>' +
          '<p class="enq-dica">O site, o Feed e o Carrossel usam o quadro 4:5. No Story a foto entra inteira sobre o próprio fundo desfocado (na aba Postagens você ainda pode cortar para preencher a tela).</p>' +
          '</details>' +
        '</div>' +
        '<div class="enq-rodape"><button type="button" class="enq-ok" data-enq="aplicar" id="enq-ok" disabled>✔ Usar esta foto</button><button type="button" class="btn-fechar" data-enq="fechar">Cancelar</button></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', clique);
    el.addEventListener('input', entrada);
    $('#enq-ajustes').addEventListener('toggle', function () { el.querySelector('.enq-corpo').scrollTop = 0; });
    ligarGestos($('#enq-cv'));
  }
  function aviso(txt) { var a = $('#enq-aviso'); if (!a) return; a.hidden = !txt; a.textContent = txt || ''; }
  function ajuste(st) { return { modo: st.modo, z: st.z, x: st.x, y: st.y, r: st.r }; }
  function guardarAntes(st) {
    if (!st || !st.img) return;
    var a = ajuste(st), h = st.historico;
    if (!h.length || JSON.stringify(h[h.length - 1]) !== JSON.stringify(a)) h.push(a);
    if (h.length > 60) h.shift();
  }
  function entrada(ev) {
    var st = estado; if (!st || !st.img) return;
    guardarAntes(st);
    if (ev.target.id === 'enq-z') { st.z = Number(ev.target.value) / 100; ajustarZoom(st); }
    else if (ev.target.id === 'enq-r') { st.r = Number(ev.target.value); ajustarZoom(st); }
    agendar();
  }
  function clique(ev) {
    var b = ev.target.closest && ev.target.closest('[data-enq]'); if (!b || !estado) return;
    var a = b.getAttribute('data-enq'), st = estado;
    if (a === 'fechar') return fechar();
    if (a === 'desfazer') { var anterior = st.historico.pop(); if (anterior) { Object.assign(st, anterior); agendar(); } return; }
    if (a === 'todas') return aplicarTodas();
    if (['modo', 'g', 'centro', 'zerar'].indexOf(a) !== -1) guardarAntes(st);
    if (a === 'modo') { var v = b.getAttribute('data-v'); if (v !== st.modo && st.img) { st.modo = v; st.z = 1; st.x = 0; st.y = 0; st.r = 0; } return agendar(); }
    if (!st.img) return;
    if (a === 'g') { st.r = ((st.r + Number(b.getAttribute('data-v')) + 540) % 360) - 180; ajustarZoom(st); }
    else if (a === 'centro') { st.x = 0; st.y = 0; ajustarZoom(st); }
    else if (a === 'zerar') { st.z = 1; st.x = 0; st.y = 0; st.r = 0; }
    else if (a === 'voltar') { var f = st.aoVoltar; fechar(true); if (f) f(); return; }
    else if (a === 'aplicar') return aplicar();
    agendar();
  }
  function aplicar() {
    var st = estado; if (!st || !st.img) return;
    var c = document.createElement('canvas'); c.width = FW; c.height = FH;
    try {
      pintarQuadro(c.getContext('2d'), FW, FH, st);
      var url = c.toDataURL('image/jpeg', 0.88), f = st.aoAplicar, a = ajuste(st);
      fechar(true); if (f) f(url, a);
    } catch (e) { aviso('Não consegui montar a foto enquadrada. Tente de novo ou use a foto como está.'); }
  }

  async function renderizar(src, a) {
    var img = await carregar(src), st = Object.assign({ img: img, modo: 'encaixar', z: 1, x: 0, y: 0, r: 0 }, a || {});
    ajustarZoom(st);
    var c = document.createElement('canvas'); c.width = FW; c.height = FH;
    pintarQuadro(c.getContext('2d'), FW, FH, st);
    return c.toDataURL('image/jpeg', 0.88);
  }
  async function aplicarTodas() {
    var st = estado;
    if (!st || !st.img || !st.aoAplicarTodas || st.ocupado) return;
    st.ocupado = true; $('#enq-todas').disabled = true;
    aviso('Preparando as fotos. Aguarde a confirmação.');
    try {
      var feito = await st.aoAplicarTodas(ajuste(st), function () { return estado === st && aberta; });
      if (estado === st && feito !== false) fechar(true);
    } catch (e) { if (estado === st) aviso('Não consegui ajustar todas as fotos. Nenhuma foto foi trocada. Confira as imagens e tente novamente.'); }
    finally { if (estado === st) { st.ocupado = false; $('#enq-todas').disabled = false; } }
  }

  /* ---------- gestos: 1 dedo/mouse move · 2 dedos zoom + giro · roda do mouse zoom · setas/+/-/[ ] no teclado ---------- */
  function ligarGestos(cv) {
    var ptrs = new Map(), g = null;
    function ini() {
      var st = estado, p = Array.from(ptrs.values());
      if (!st || !st.img || !p.length) { g = null; return; }
      if (p.length === 1) g = { t: 1, px: p[0].x, py: p[0].y, x: st.x, y: st.y };
      else { var d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1, an = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x); g = { t: 2, d: d, an: an, z: st.z, r: st.r, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2, x: st.x, y: st.y }; }
    }
    cv.addEventListener('pointerdown', function (ev) {
      if (!estado || !estado.img) return;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
      if (!ptrs.size) guardarAntes(estado);
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); ini(); ev.preventDefault(); cv.focus({ preventScroll: true });
    });
    cv.addEventListener('pointermove', function (ev) {
      if (!ptrs.has(ev.pointerId) || !g || !estado) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      var st = estado, r = cv.getBoundingClientRect(), p = Array.from(ptrs.values());
      if (g.t === 1 && p.length === 1) mover(st, g.x + (p[0].x - g.px) / r.width, g.y + (p[0].y - g.py) / r.height);
      else if (g.t === 2 && p.length >= 2) {
        var d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1, an = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
        st.z = g.z * d / g.d; st.r = ((g.r + (an - g.an) * 180 / Math.PI + 540) % 360) - 180; ajustarZoom(st);
        mover(st, g.x + ((p[0].x + p[1].x) / 2 - g.mx) / r.width, g.y + ((p[0].y + p[1].y) / 2 - g.my) / r.height);
      }
      agendar(); ev.preventDefault();
    });
    function fim(ev) { if (!ptrs.has(ev.pointerId)) return; ptrs.delete(ev.pointerId); ini(); }
    cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
    cv.addEventListener('wheel', function (ev) {
      var st = estado; if (!st || !st.img) return; ev.preventDefault();
      guardarAntes(st);
      st.z = st.z * Math.exp(-ev.deltaY * 0.0015); ajustarZoom(st); agendar();
    }, { passive: false });
    cv.addEventListener('keydown', function (ev) {
      var st = estado; if (!st || !st.img) return; guardarAntes(st); var k = ev.key, passo = ev.shiftKey ? 0.05 : 0.01, ok = true;
      if (k === 'ArrowLeft') mover(st, st.x - passo, st.y); else if (k === 'ArrowRight') mover(st, st.x + passo, st.y);
      else if (k === 'ArrowUp') mover(st, st.x, st.y - passo); else if (k === 'ArrowDown') mover(st, st.x, st.y + passo);
      else if (k === '+' || k === '=') { st.z *= 1.05; ajustarZoom(st); } else if (k === '-' || k === '_') { st.z /= 1.05; ajustarZoom(st); }
      else if (k === '[') { st.r = Math.max(-180, st.r - 1); ajustarZoom(st); } else if (k === ']') { st.r = Math.min(180, st.r + 1); ajustarZoom(st); }
      else ok = false;
      if (ok) { ev.preventDefault(); agendar(); }
    });
  }

  /* ---------- abrir / fechar ---------- */
  var aberta = false, trava = '';
  function abrir(op) {
    montar();
    $('#enq-ajustes').open = false;
    estado = { img: null, modo: 'encaixar', z: 1, x: 0, y: 0, r: 0, historico: [], aoAplicar: op.aoAplicar, aoAplicarTodas: op.aoAplicarTodas, aoVoltar: op.aoVoltar };
    Object.assign(estado, op.ajuste || {});
    $('#enq-todas').hidden = !op.aoAplicarTodas; $('#enq-todas').disabled = false;
    $('#enq-todas').textContent = 'Aplicar a todas (' + (op.quantidade || 0) + ')';
    var ok = $('#enq-ok'); ok.disabled = true; aviso('');
    $('#enq-voltar').hidden = !op.podeVoltar;
    el.classList.add('aberto'); aberta = true; trava = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    if (window.TKCamadas) TKCamadas.empilhar('enq', function () { sair(); });
    var cv = $('#enq-cv'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    aviso('Abrindo a foto…');
    var meu = estado;
    carregar(op.src).then(function (img) {
      if (estado !== meu) return;
      meu.img = img; aviso(''); ok.disabled = false; ajustarZoom(meu); agendar(); setTimeout(function () { try { cv.focus({ preventScroll: true }); } catch (e) { /* ok */ } }, 50);
    }).catch(function (e) {
      if (estado !== meu) return;
      aviso(e && e.message === 'cors'
        ? 'Não consegui abrir esta foto aqui (ela está num lugar que não deixa o navegador mexer nela). Tire a foto e suba de novo para poder enquadrar.'
        : 'Não consegui abrir esta foto. Tente de novo.');
    });
  }
  function sair() {
    if (!aberta) return; aberta = false;
    if (el) el.classList.remove('aberto');
    document.documentElement.style.overflow = trava || '';
    estado = null;
  }
  function fechar(aplicou) {
    if (window.TKCamadas && TKCamadas.aberta && TKCamadas.aberta('enq')) TKCamadas.desempilhar('enq'); else sair();
    if (aplicou) sair();
  }

  window.TKEnquadrar = { renderizar: renderizar, abrir: abrir, fechar: fechar, _estado: function () { return estado; } };
})();
