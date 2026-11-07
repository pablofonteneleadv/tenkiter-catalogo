/* TKMiniFoto — cópias reduzidas (480 e 240 px) de cada foto NOVA, gerada no próprio aparelho e guardada ao lado da original no Worker de mídia.
 * Por quê: a vitrine mostra a foto com ~190 px de largura, mas a original tem 1080 px (260–480 KB). Com a cópia (30–60 KB; a de 240 px tem ~10 KB) a página baixa ~8x menos.
 * Custo zero: o aparelho faz a conta (canvas); o Worker só guarda (POST /u?mini=<chave>). Se falhar, nada quebra: a vitrine usa a original.
 * Uso: TKMiniFoto.enviar(blobOuArquivoDaFoto, urlDevolvidaPeloWorker). Fica fora do common.js para não exigir APK novo a cada ajuste. */
(function () {
  var LARGURAS = [480, 240], MAX_BYTES = 150 * 1024;
  function ehR2(url) { return typeof url === 'string' && typeof MIDIA_URL !== 'undefined' && url.indexOf(MIDIA_URL + '/m/') === 0 && /\/[0-9]{6}\/[0-9a-f]{20}\.(jpg|png|webp)$/.test(url); }
  function sessao() { var s = typeof getSessao === 'function' ? getSessao() : null; return s && /^tk[123]\./.test(String(s.sessao)) ? s : null; }
  /** Reduz a foto para a largura pedida (JPG). Devolve null se não for possível (o envio da original não depende disto). */
  function gerar(blob, largura) {
    return new Promise(function (ok) {
      try {
        var u = URL.createObjectURL(blob), img = new Image();
        img.onerror = function () { URL.revokeObjectURL(u); ok(null); };
        img.onload = function () {
          try {
            var esc = Math.min(1, largura / img.width, (largura * 4 / 3) / img.height), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * esc)); c.height = Math.max(1, Math.round(img.height * esc));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
            var tenta = function (qs) {
              if (!qs.length) return ok(null);
              c.toBlob(function (b) { if (b && b.size <= MAX_BYTES) ok(b); else tenta(qs.slice(1)); }, 'image/jpeg', qs[0]);
            };
            tenta([0.74, 0.6, 0.45]);
          } catch (e) { ok(null); }
        };
        img.src = u;
      } catch (e) { ok(null); }
    });
  }
  /** Gera e envia as cópias (480 e 240 px). Nunca lança erro; devolve true se todas foram aceitas. */
  async function enviar(blob, urlFoto) {
    try {
      var s = sessao(); if (!s || !ehR2(urlFoto) || !blob) return false;
      var chave = urlFoto.slice((MIDIA_URL + '/m/').length), todas = true;
      for (var k = 0; k < LARGURAS.length; k++) {
        var mini = await gerar(blob, LARGURAS[k]); if (!mini) { todas = false; continue; }
        var r = await fetch(MIDIA_URL + '/u?mini=' + encodeURIComponent(chave) + '&w=' + LARGURAS[k], { method: 'POST', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao }, body: mini });
        var j = await r.json().catch(function () { return null; });
        try { window.logDebug_(j && j.ok ? '← cópia de ' + LARGURAS[k] + ' px enviada (' + Math.round(mini.size / 1024) + ' KB)' : '✗ cópia reduzida recusada: ' + (j && j.erro)); } catch (e) {}
        if (!(j && j.ok)) todas = false;
      }
      return todas;
    } catch (e) { return false; }
  }
  window.TKMiniFoto = { enviar: enviar, gerar: gerar, LARGURAS: LARGURAS };
})();
