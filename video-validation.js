/* TENKiTER — validação compartilhada de vídeos no navegador. Sem serviços externos. */
(function (global) {
  'use strict';
  const MIME_OK = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  function lerMetadados(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file), video = document.createElement('video');
      let terminou = false;
      const fim = (resultado) => {
        if (terminou) return;
        terminou = true; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); resolve(resultado);
      };
      video.preload = 'metadata';
      video.onloadedmetadata = () => fim({ ok: Number.isFinite(video.duration) && video.duration > 0, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => fim({ ok: false });
      video.src = url;
      try { video.load(); } catch (_) { fim({ ok: false }); }
      setTimeout(() => fim({ ok: false }), 10000);
    });
  }
  async function validar(file, options) {
    options = options || {};
    const maxMB = Number(options.maxMB) || 20, erros = [], mime = String(file && file.type || '').toLowerCase(), nome = String(file && file.name || 'vídeo');
    if (!file || (!mime.startsWith('video/') && !/\.(mp4|mov|webm)$/i.test(nome))) return { ok: false, erros: ['Selecione um arquivo de vídeo MP4, MOV ou WebM.'] };
    if (!MIME_OK.has(mime) && !/\.(mp4|mov|webm)$/i.test(nome)) return { ok: false, erros: ['Formato não reconhecido. Use MP4, MOV ou WebM.'] };
    if (file.size > maxMB * 1048576) erros.push('O arquivo tem ' + (file.size / 1048576).toFixed(1) + ' MB; o limite desta tela é ' + maxMB + ' MB.');
    if (!file.size) erros.push('O arquivo está vazio.');
    let meta = { ok: false };
    if (!erros.length) meta = await lerMetadados(file);
    if (!erros.length && !meta.ok) erros.push('Não consegui ler a duração e a resolução deste vídeo. Ele pode estar incompleto ou usar formato incompatível. Exporte novamente como MP4 e tente outra vez.');
    if (!erros.length && options.maxDurationSeconds && meta.duration > options.maxDurationSeconds) erros.push('O vídeo dura ' + Math.round(meta.duration) + ' segundos; o limite desta publicação é ' + options.maxDurationSeconds + ' segundos.');
    return erros.length ? { ok: false, erros, metadata: meta } : { ok: true, erros: [], metadata: meta };
  }
  global.TKVideoValidation = Object.freeze({ validar });
})(window);
