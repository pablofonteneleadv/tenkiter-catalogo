/* TENKiTER — prepara áudio para o WhatsApp (v7.78).
 * O WhatsApp só toca mensagem de voz em OGG/Opus. Gravações do celular/navegador saem em M4A, WebM, 3GP etc.;
 * enviadas assim, chegam ao cliente como voz "0:00", sem som. Aqui o áudio é decodificado no aparelho, regravado
 * em Opus (WebCodecs) e empacotado em OGG. Não depende de servidor nem de serviço pago.
 * API: TKAudioOgg.suportado() · await TKAudioOgg.converter(blobOuFile) -> { blob, seg } (lança Error em português se falhar) */
(function (g) {
  'use strict';
  var TAXA = 48000, QUADRO = 960, PRE_SKIP = 312, BITRATE = 32000;

  var TABELA = (function () {
    var t = new Uint32Array(256), i, j, r;
    for (i = 0; i < 256; i++) { r = i << 24; for (j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1); t[i] = r >>> 0; }
    return t;
  })();
  /* CRC do OGG: polinômio 0x04c11db7, sem inversão de bits */
  function crc(u8) { var c = 0, i; for (i = 0; i < u8.length; i++) c = ((c << 8) ^ TABELA[((c >>> 24) ^ u8[i]) & 255]) >>> 0; return c >>> 0; }

  function texto(s) { var u = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function juntar(lista) {
    var n = 0, i, o, p = 0;
    for (i = 0; i < lista.length; i++) n += lista[i].length;
    o = new Uint8Array(n);
    for (i = 0; i < lista.length; i++) { o.set(lista[i], p); p += lista[i].length; }
    return o;
  }

  /* Uma página OGG com os pacotes dados (cada pacote ocupa segmentos de 255 bytes + resto). */
  function pagina(serie, seq, granule, tipo, pacotes) {
    var segs = [], i, k, n, corpo, cab, dv, pg, c;
    for (i = 0; i < pacotes.length; i++) {
      n = pacotes[i].length;
      for (k = n; k >= 255; k -= 255) segs.push(255);
      segs.push(k);
    }
    if (segs.length > 255) throw new Error('página OGG grande demais');
    corpo = juntar(pacotes);
    cab = new Uint8Array(27 + segs.length);
    dv = new DataView(cab.buffer);
    cab.set(texto('OggS'), 0);
    cab[4] = 0; cab[5] = tipo;
    dv.setUint32(6, granule % 4294967296, true); dv.setUint32(10, Math.floor(granule / 4294967296), true);
    dv.setUint32(14, serie, true); dv.setUint32(18, seq, true); dv.setUint32(22, 0, true);
    cab[26] = segs.length;
    for (i = 0; i < segs.length; i++) cab[27 + i] = segs[i];
    pg = juntar([cab, corpo]);
    c = crc(pg);
    new DataView(pg.buffer).setUint32(22, c, true);
    return pg;
  }

  /* pacotes: Uint8Array[] de Opus (20 ms cada); amostras: nº real de amostras (a 48 kHz) para cortar o fim certo. */
  function muxar(pacotes, amostras, opcoes) {
    opcoes = opcoes || {};
    var serie = (opcoes.serie != null ? opcoes.serie : (Math.random() * 4294967295) >>> 0) >>> 0, preSkip = opcoes.preSkip || PRE_SKIP;
    var cabeca = new Uint8Array(19), dv = new DataView(cabeca.buffer);
    cabeca.set(texto('OpusHead'), 0); cabeca[8] = 1; cabeca[9] = 1;
    dv.setUint16(10, preSkip, true); dv.setUint32(12, TAXA, true); dv.setInt16(16, 0, true); cabeca[18] = 0;
    var vendor = texto('TENKiTER'), tags = new Uint8Array(8 + 4 + vendor.length + 4), dt = new DataView(tags.buffer);
    tags.set(texto('OpusTags'), 0); dt.setUint32(8, vendor.length, true); tags.set(vendor, 12); dt.setUint32(12 + vendor.length, 0, true);
    var paginas = [pagina(serie, 0, 0, 2, [cabeca]), pagina(serie, 1, 0, 0, [tags])], seq = 2, i = 0, lote, total = pacotes.length, fim = preSkip + amostras, acumulado = 0, ultimo;
    while (i < total) {
      lote = pacotes.slice(i, i + 40); i += lote.length; acumulado += lote.length * QUADRO; ultimo = i >= total;
      paginas.push(pagina(serie, seq++, ultimo ? Math.min(preSkip + acumulado, fim > preSkip ? fim : preSkip + acumulado) : preSkip + acumulado, ultimo ? 4 : 0, lote));
    }
    return juntar(paginas);
  }

  function suportado() {
    return !!(g.AudioEncoder && g.AudioData && g.OfflineAudioContext && (g.AudioContext || g.webkitAudioContext));
  }

  async function decodificar(blob) {
    var Ctx = g.AudioContext || g.webkitAudioContext, ctx = new Ctx(), dados = await blob.arrayBuffer(), buf;
    try { buf = await ctx.decodeAudioData(dados); }
    finally { try { ctx.close(); } catch (e) { /* ok */ } }
    if (!buf || !buf.length || !buf.duration) throw new Error('vazio');
    var off = new g.OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * TAXA)), TAXA), fonte = off.createBufferSource();
    fonte.buffer = buf; fonte.connect(off.destination); fonte.start(0);
    var fim = await off.startRendering();
    return fim.getChannelData(0);
  }

  async function codificar(pcm) {
    var pacotes = [], erro = null, enc, cfg = { codec: 'opus', sampleRate: TAXA, numberOfChannels: 1, bitrate: BITRATE }, extra = { opus: { frameDuration: 20000, application: 'voip', format: 'opus' } }, suporte;
    try { suporte = await g.AudioEncoder.isConfigSupported(Object.assign({}, cfg, extra)); if (suporte && suporte.supported) cfg = suporte.config; else { suporte = await g.AudioEncoder.isConfigSupported(cfg); if (!suporte || !suporte.supported) throw new Error('sem opus'); cfg = suporte.config; } }
    catch (e) { throw new Error('sem opus'); }
    enc = new g.AudioEncoder({ output: function (c) { var u = new Uint8Array(c.byteLength); c.copyTo(u); pacotes.push(u); }, error: function (e) { erro = e; } });
    enc.configure(cfg);
    var i, n, d, t = 0;
    for (i = 0; i < pcm.length && !erro; i += QUADRO) {
      n = Math.min(QUADRO, pcm.length - i);
      d = new Float32Array(QUADRO); d.set(pcm.subarray(i, i + n));
      var ad = new g.AudioData({ format: 'f32', sampleRate: TAXA, numberOfFrames: QUADRO, numberOfChannels: 1, timestamp: Math.round(t * 1000000 / TAXA), data: d });
      enc.encode(ad); ad.close(); t += QUADRO;
      if (enc.encodeQueueSize > 50) await new Promise(function (r) { setTimeout(r, 0); });
    }
    await enc.flush(); try { enc.close(); } catch (e) { /* ok */ }
    if (erro || !pacotes.length) throw new Error('falha no codificador');
    return pacotes;
  }

  async function converter(arquivo) {
    if (!suportado()) throw new Error('Este navegador não consegue preparar o áudio para o WhatsApp. Use o Chrome atualizado ou o aplicativo da loja.');
    var pcm;
    try { pcm = await decodificar(arquivo); }
    catch (e) { throw new Error('Não consegui ler este áudio. Grave de novo ou escolha um arquivo MP3, M4A ou OGG.'); }
    var pacotes;
    try { pacotes = await codificar(pcm); }
    catch (e) { throw new Error('Este aparelho não conseguiu preparar o áudio para o WhatsApp. Tente pelo Chrome atualizado.'); }
    var bytes = muxar(pacotes, pcm.length);
    return { blob: new Blob([bytes], { type: 'audio/ogg' }), seg: pcm.length / TAXA };
  }

  g.TKAudioOgg = { suportado: suportado, converter: converter, muxar: muxar, crc: crc };
})(typeof window !== 'undefined' ? window : globalThis);
