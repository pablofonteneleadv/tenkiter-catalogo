/* Seleção local de quadro: a capa entra no fluxo normal de fotos, sem alterar o vídeo. */
(function () {
  'use strict';
  let atual = null;
  function fechar() {
    if (window.TKCamadas && TKCamadas.aberta('capa-video')) TKCamadas.desempilhar('capa-video');
    else limpar();
  }
  function limpar() {
    if (!atual) return;
    const s = atual; atual = null;
    clearTimeout(s.timer);
    s.video.pause(); s.video.removeAttribute('src'); s.video.load();
    if (s.local) URL.revokeObjectURL(s.local);
    s.overlay.remove();
    if (s.foco && s.foco.isConnected) s.foco.focus();
  }
  function abrir(fonte, confirmar) {
    if (atual) fechar();
    const o = document.createElement('div'); o.className = 'overlay-sheet aberto'; o.id = 'overlay-capa-video';
    o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="capa-video-titulo"><div class="sheet-topo"><h2 id="capa-video-titulo">Escolher capa do vídeo</h2><button type="button" id="capa-video-fechar" aria-label="Fechar">✕</button></div><div class="gestao-corpo"><p>Reproduza para conferir. Pause ou mova a barra até o quadro desejado.</p><video id="capa-video-previa" controls playsinline preload="auto" style="width:100%;max-height:50vh;background:#111"></video><label for="capa-video-tempo">Quadro da capa</label><input id="capa-video-tempo" type="range" min="0" max="0" step="0.01" value="0" disabled style="width:100%"><p id="capa-video-aviso" role="status">Carregando vídeo…</p><button type="button" id="capa-video-usar" disabled>Usar quadro como foto de capa</button></div></div>';
    document.body.appendChild(o);
    const v = o.querySelector('video'), range = o.querySelector('input'), btn = o.querySelector('#capa-video-usar'), aviso = o.querySelector('#capa-video-aviso');
    const local = fonte instanceof Blob ? URL.createObjectURL(fonte) : null;
    const s = { overlay: o, video: v, local, foco: document.activeElement, carregado: false, buscando: false, gerando: false }; atual = s;
    s.timer = setTimeout(() => { if (atual === s && !s.carregado) aviso.textContent = 'O vídeo demorou para abrir. Feche e tente novamente com o arquivo do aparelho.'; }, 15000);
    v.crossOrigin = 'anonymous'; v.muted = true;
    function pronto() { btn.disabled = !s.carregado || s.buscando || s.gerando; }
    v.addEventListener('loadeddata', () => {
      if (atual !== s) return;
      clearTimeout(s.timer);
      if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth) { aviso.textContent = 'Não consegui ler a duração deste vídeo. Escolha outro arquivo.'; return; }
      s.carregado = true; range.max = String(Math.max(0, v.duration - 0.01)); range.disabled = false;
      aviso.textContent = 'A capa será uma nova foto. O vídeo e as fotos existentes serão preservados até salvar.'; pronto();
    });
    v.addEventListener('error', () => { s.carregado = false; range.disabled = true; pronto(); aviso.textContent = 'Não consegui abrir este vídeo. Para vídeos antigos, tente escolher o arquivo do aparelho.'; });
    v.addEventListener('seeking', () => { s.buscando = true; pronto(); });
    v.addEventListener('seeked', () => { s.buscando = false; pronto(); });
    v.addEventListener('timeupdate', () => { range.value = String(v.currentTime); });
    range.addEventListener('input', () => { v.pause(); v.currentTime = Number(range.value); });
    o.querySelector('#capa-video-fechar').addEventListener('click', fechar);
    o.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); return; }
      if (e.key !== 'Tab') return;
      const els = Array.from(o.querySelectorAll('button:not(:disabled),input:not(:disabled),video'));
      if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
    });
    btn.addEventListener('click', async () => {
      if (btn.disabled || atual !== s) return;
      s.gerando = true; v.pause(); pronto();
      try {
        const c = document.createElement('canvas'), scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.max(1, Math.round(v.videoWidth * scale)); c.height = Math.max(1, Math.round(v.videoHeight * scale));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.88);
        if (atual !== s) return;
        await confirmar(data);
        if (atual === s) fechar();
      } catch (e) {
        if (atual !== s) return;
        aviso.textContent = 'Não consegui usar este quadro. Confira o limite de fotos ou escolha o vídeo do aparelho e tente novamente.';
        s.gerando = false; pronto();
      }
    });
    if (window.TKCamadas) TKCamadas.empilhar('capa-video', limpar);
    v.src = local || String(fonte); v.load();
    o.querySelector('#capa-video-fechar').focus();
  }
  window.TKCapaVideo = { abrir, fechar };
})();
