/* esteira-fotos-revisao.js — v7.81.0 — "Revisar fotos" antes de adicionar ao produto.
 *
 * Pedido do Pablo (15/11/2026): escolher a foto não pode mandá-la direto para a fila. A pessoa precisa ver, enquadrar e decidir.
 * Carregado sob demanda pela Esteira (não pesa na abertura). Nada é enviado aqui: devolve as fotos revisadas a quem chamou.
 *
 *   const rev = TKRevisaoFotos({ el, bt, abrirFolha, abrirGaleria, impressao, enquadrar, linhaStatus });
 *   const r = await rev.abrir({ produto:{nome,codigo}, atuais:[urls]|Promise, pedido:['No pano'], arquivos:[File], max:8, modo:'caixa'? });
 *   r === null (cancelou) | { itens:[{ arquivo:Blob|File, hash }], capaIdx:-1|n }   // capaIdx = posição da nova capa na lista final
 *
 * Ferramentas por foto: capa, mover (‹ ›), girar 90°, enquadrar 4:5 (janela já usada no cadastro da Gestão) e tirar.
 * Fotos repetidas são avisadas e ficam de fora. O limite de 8 fotos por produto é respeitado já aqui.
 * modo:'caixa' (v7.82.0): revisão das fotos do envio para a caixa: sem produto, sem capa e sem "Como está hoje"; confirmar só devolve as fotos. */
(function () {
  'use strict';
  var LADO_MAX = 1600, QUALIDADE = 0.88, css = false;

  function estilo() {
    if (css) return; css = true;
    var s = document.createElement('style'); s.id = 'tk-rev-fotos-css';
    s.textContent =
      '.rev-resumo{display:grid;gap:4px;margin:0}.rev-resumo .muted{margin:0}' +
      '.rev-atuais summary{min-height:44px;display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;list-style:none}' +
      '.rev-atuais summary::-webkit-details-marker{display:none}.rev-atuais summary::after{content:"▾";margin-left:auto}.rev-atuais[open] summary::after{content:"▴"}' +
      '.rev-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}' +
      '.rev-card{display:grid;gap:8px;padding:8px;border:1px solid var(--linha);border-radius:12px;background:var(--branco)}' +
      '.rev-card.capa{border-color:var(--laranja);box-shadow:0 0 0 1px var(--laranja)}' +
      '.rev-quadro{position:relative;aspect-ratio:var(--tk-foto);border-radius:8px;overflow:hidden;background:var(--areia)}' +
      '.rev-quadro img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.rev-quadro .tk-selo-foto{position:absolute;left:8px;top:8px}' +
      '.rev-ferr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}' +
      '.rev-ferr button{padding:0;font-size:1.05rem}' +
      '.rev-capa{width:100%}' +
      '.rev-vazio{padding:16px;text-align:center}';
    document.head.append(s);
  }

  /** Gira a foto original em múltiplos de 90° e devolve um JPEG de até 1600 px (decodifica já reduzido para não pesar no celular). */
  async function girar(file, graus) {
    var bmp = null;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await new Promise(function (ok, no) { var u = URL.createObjectURL(file), i = new Image(); i.onload = function () { URL.revokeObjectURL(u); ok(i); }; i.onerror = function () { URL.revokeObjectURL(u); no(new Error('Não consegui abrir esta foto.')); }; i.src = u; }); }
    var w = bmp.width, h = bmp.height, esc = Math.min(1, LADO_MAX / Math.max(w, h)), tw = Math.round(w * esc), th = Math.round(h * esc);
    var lado = graus % 180 !== 0, c = document.createElement('canvas');
    c.width = lado ? th : tw; c.height = lado ? tw : th;
    var g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(graus * Math.PI / 180); g.drawImage(bmp, -tw / 2, -th / 2, tw, th);
    if (bmp.close) bmp.close();
    return new Promise(function (ok, no) { c.toBlob(function (b) { b ? ok(b) : no(new Error('Não consegui preparar a foto.')); }, 'image/jpeg', QUALIDADE); });
  }

  window.TKRevisaoFotos = function (api) {
    var el = api.el, bt = api.bt;

    function abrir(op) {
      estilo();
      return new Promise(function (resolve) {
        var caixa = op.modo === 'caixa';
        var itens = [], capaId = null, seq = 0, atuais = [], fim = false, confirmou = false, ocupado = 0;
        var atuaisPronto = caixa, max = op.max || 8, dica = null, grade = null, bOk = null, rodape = null, aviso = null, atualBox = null;
        var arq = el('input'); arq.type = 'file'; arq.accept = 'image/*'; arq.multiple = true; arq.hidden = true; arq.className = 'arq-foto';

        function vagas() { return Math.max(0, max - atuais.length - itens.length); }
        function dizer(t) { if (aviso) aviso.textContent = t || ''; }
        function soltar(i) { if (i.url) URL.revokeObjectURL(i.url); i.url = ''; }
        function terminar(r) { if (fim) return; fim = true; itens.forEach(soltar); resolve(r); }

        async function adicionar(arquivos) {
          var repetidas = 0, fora = 0, ruins = 0;
          for (var k = 0; k < arquivos.length; k++) {
            var f = arquivos[k];
            if (!/^image\//.test(f.type)) { ruins++; continue; }
            if (vagas() <= 0) { fora++; continue; }
            var hash = '';
            try { hash = (await api.impressao(f)) || ''; } catch (e) { hash = ''; }
            if (hash && itens.some(function (x) { return x.hash === hash; })) { repetidas++; continue; }
            itens.push({ id: ++seq, file: f, blob: null, rot: 0, hash: hash, url: URL.createObjectURL(f) });
          }
          dizer([
            repetidas ? (repetidas === 1 ? '1 foto repetida ficou de fora.' : repetidas + ' fotos repetidas ficaram de fora.') : '',
            fora ? (caixa ? 'Cada envio leva no máximo ' + max + ' fotos; envie as outras depois.' : 'Este produto aceita no máximo ' + max + ' fotos; algumas ficaram de fora.') : '',
            ruins ? 'Só fotos podem ser adicionadas.' : ''
          ].filter(Boolean).join(' '));
          pintar();
        }

        async function aplicarGiro(i) {
          if (ocupado) return; ocupado++; pintar();
          try {
            i.rot = (i.rot + 90) % 360;
            var b = await girar(i.base || i.file, i.rot);
            soltar(i); i.blob = b; i.url = URL.createObjectURL(b);
          } catch (e) { i.rot = (i.rot + 270) % 360; dizer(e.message || 'Não consegui girar esta foto.'); }
          ocupado--; pintar();
        }
        function enquadrarFoto(i) {
          if (!api.enquadrar) return;
          api.enquadrar({
            src: i.url, podeVoltar: false,
            aoAplicar: async function (dataUrl) {
              try { var b = await (await fetch(dataUrl)).blob(); soltar(i); i.blob = b; i.base = b; i.rot = 0; i.url = URL.createObjectURL(b); i.enq = true; }
              catch (e) { dizer('Não consegui aplicar o enquadramento. A foto continua como estava.'); }
              pintar();
            }
          });
        }
        function mover(i, d) { var p = itens.indexOf(i), q = p + d; if (q < 0 || q >= itens.length) return; itens.splice(p, 1); itens.splice(q, 0, i); pintar(); }
        function tirar(i) { var p = itens.indexOf(i); if (p < 0) return; soltar(i); itens.splice(p, 1); if (capaId === i.id) capaId = null; dizer(''); pintar(); }

        function botao(txt, rotulo, fn, desligado) {
          var b = el('button', 'bt', txt); b.type = 'button'; b.setAttribute('aria-label', rotulo); b.title = rotulo; b.disabled = !!desligado; b.onclick = fn; return b;
        }

        function pintar() {
          if (!grade) return;
          grade.replaceChildren();
          var semCapaAtual = atuaisPronto && atuais.length === 0;
          itens.forEach(function (i, k) {
            var ehCapa = caixa ? false : semCapaAtual ? k === 0 : capaId === i.id;
            var li = el('li', 'rev-card' + (ehCapa ? ' capa' : '')); li.dataset.foto = String(i.id);
            var q = el('div', 'rev-quadro'), img = el('img'); img.alt = 'Foto ' + (k + 1) + ' de ' + itens.length; img.src = i.url; img.decoding = 'async'; q.append(img);
            if (ehCapa) q.append(el('span', 'tk-selo-foto', 'Capa'));
            var f = el('div', 'rev-ferr');
            f.append(
              botao('↻', 'Girar a foto ' + (k + 1), function () { aplicarGiro(i); }, !!ocupado),
              botao('✂', 'Enquadrar a foto ' + (k + 1) + ' no formato do site', function () { enquadrarFoto(i); }, !!ocupado || !api.enquadrar),
              botao('‹', 'Mover a foto ' + (k + 1) + ' para antes', function () { mover(i, -1); }, k === 0),
              botao('›', 'Mover a foto ' + (k + 1) + ' para depois', function () { mover(i, 1); }, k === itens.length - 1)
            );
            var linha = el('div', 'rev-linha');
            var cap = el('button', 'bt rev-capa', ehCapa ? '★ É a capa' : '☆ Tornar capa'); cap.type = 'button'; cap.setAttribute('aria-pressed', String(ehCapa));
            cap.onclick = function () { capaId = ehCapa ? null : i.id; pintar(); };
            cap.hidden = semCapaAtual || caixa;
            var x = botao('Tirar', 'Tirar a foto ' + (k + 1) + ' desta lista', function () { tirar(i); });
            x.classList.add('discreto');
            linha.append(cap, x);
            li.append(q, f, linha); grade.append(li);
          });
          var n = itens.length;
          var verbo = caixa ? 'Usar' : 'Adicionar';
          bOk.textContent = n === 0 ? 'Escolha as fotos' : n === 1 ? verbo + ' 1 foto' : verbo + ' ' + n + ' fotos';
          bOk.disabled = n === 0 || !!ocupado;
          if (rodape) rodape.textContent = vagas() > 0 ? 'Cabem mais ' + vagas() + (vagas() === 1 ? ' foto' : ' fotos') + (caixa ? ' neste envio.' : ' neste produto.') : (caixa ? 'Este envio já está com o máximo de ' + max + ' fotos.' : 'Este produto já está com o máximo de ' + max + ' fotos.');
          if (dica) dica.hidden = n > 0;
        }

        function pintarAtuais() {
          if (!atualBox) return;
          atualBox.replaceChildren();
          if (caixa || !atuaisPronto) return;
          if (!atuais.length) { atualBox.append(el('p', 'muted', 'Este produto ainda não tem foto: a primeira da lista vira a capa (use ‹ › para escolher qual).')); return; }
          var d = el('details', 'rev-atuais'), s = el('summary', '', 'Como está hoje (' + atuais.length + (atuais.length === 1 ? ' foto' : ' fotos') + ')');
          var box = el('div', 'minis');
          atuais.forEach(function (u, k) {
            var m = el('div', 'mini'), b = el('button', 'foto-bt'); b.type = 'button'; b.setAttribute('aria-label', 'Ver a foto atual ' + (k + 1) + ' em tela cheia');
            var im = el('img', 'mini-img'); im.alt = ''; im.loading = 'lazy'; im.src = u; b.append(im);
            b.onclick = function () { if (api.abrirGaleria) api.abrirGaleria(atuais.map(function (url) { return { url: url, tipo: 'foto' }; }), k); };
            m.append(b); box.append(m);
          });
          d.append(s, box); atualBox.append(d);
        }

        api.abrirFolha('esteira-fotos-revisao', caixa ? 'Revisar fotos para a caixa' : 'Revisar fotos', function (ctx) {
          var corpo = ctx.corpo, pe = ctx.pe;
          var resumo = el('div', 'rev-resumo');
          var p = op.produto || {};
          if (p.nome) resumo.append(el('b', '', p.nome));
          if (p.codigo) resumo.append(el('small', 'muted', p.codigo));
          if (op.pedido && op.pedido.length) resumo.append(el('small', 'muted', 'Pedido: ' + op.pedido.join(' · ')));
          atualBox = el('div', 'rev-atuais-box');
          aviso = el('p', 'muted'); aviso.setAttribute('role', 'status');
          dica = el('p', 'muted rev-vazio', caixa ? 'Toque em “Escolher fotos” para abrir a câmera ou a galeria. As fotos só seguem quando você tocar em “Enviar fotos”.' : 'Toque em “Escolher fotos” para abrir a câmera ou a galeria. Nada é enviado antes de você confirmar.');
          grade = el('ul', 'rev-grade'); grade.setAttribute('aria-label', 'Fotos a adicionar');
          rodape = el('p', 'muted');
          var bMais = bt('Escolher fotos', '', function () { arq.click(); }); bMais.id = 'rev-escolher';
          arq.onchange = function () { var fs = Array.prototype.slice.call(arq.files || []); arq.value = ''; if (fs.length) adicionar(fs); };
          bOk = bt('Adicionar fotos', 'laranja', function () {
            if (!itens.length || ocupado) return;
            confirmou = true;
            var lista = itens.map(function (i) { return { arquivo: i.blob || i.file, hash: i.hash }; });
            var capaIdx = -1;
            if (capaId !== null) capaIdx = itens.findIndex(function (i) { return i.id === capaId; });
            ctx.fechar(); terminar({ itens: lista, capaIdx: capaIdx });
          });
          bOk.id = 'rev-confirmar'; bOk.disabled = true;
          var bCancela = bt('Cancelar', 'discreto', function () { ctx.tentar(); });
          corpo.append(resumo, atualBox, dica, grade, aviso, bMais, rodape, arq);
          pe.append(bOk, bCancela);
          pintarAtuais(); pintar();
          Promise.resolve(op.atuais).then(function (u) { atuais = (u || []).filter(Boolean); atuaisPronto = true; pintarAtuais(); pintar(); }).catch(function () { atuaisPronto = true; pintarAtuais(); pintar(); });
          if (op.arquivos && op.arquivos.length) adicionar(op.arquivos);
          return {
            sujo: function () { return !confirmou && itens.length > 0; },
            aoFechar: function () { if (!confirmou) terminar(null); }
          };
        });
      });
    }
    return { abrir: abrir };
  };
})();
