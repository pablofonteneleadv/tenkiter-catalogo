/* ====================================================================
 * TENKiTER — foto-cliente.js (v4.7) — "Já usou uma peça nossa? Mande sua foto!"
 *  Bloco que aparece na conta do cliente (index.html, janela "Minha conta"): escolher a foto, observação opcional e enviar. Fica ligada ao cadastro (WhatsApp/nome da conta)
 *  e vai para a aba "Fotos de clientes" do painel de Postagens — a loja só usa em Story, com a marca "ElaUsaTM", e só depois de escolher.
 *  Pede o mínimo: foto + autorização. Observação e Instagram são opcionais. A foto é reduzida no próprio aparelho (máx. 1280 px, JPEG) antes de enviar.
 *  Fala com o Worker `tenkiter-ig` (INSTAGRAM_URL, common.js) com o login do cliente (token tk1./tk2., nunca a senha).
 * ==================================================================== */
(function () {
  'use strict';
  const MAX_LADO = 1280, MAX_BYTES = 2.4 * 1048576;
  function el(tag, props, filhos) { const e = document.createElement(tag); Object.keys(props || {}).forEach((k) => { if (k === 'text') e.textContent = props[k]; else e[k] = props[k]; }); (filhos || []).forEach((f) => e.appendChild(f)); return e; }
  function sessao() { const s = typeof getSessao === 'function' ? getSessao() : null; return s && /^tk[123]\./.test(String(s.sessao)) ? s : null; }
  function reduzir(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          const r = Math.min(1, MAX_LADO / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          let q = 0.86;
          const tentar = () => c.toBlob((b) => { if (!b) { URL.revokeObjectURL(url); rej(new Error('Não consegui preparar a foto.')); return; } if (b.size > MAX_BYTES && q > 0.5) { q -= 0.12; tentar(); return; } URL.revokeObjectURL(url); res(b); }, 'image/jpeg', q);
          tentar();
        } catch (e) { URL.revokeObjectURL(url); rej(new Error('Não consegui preparar a foto.')); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não consegui abrir essa foto. Tente outra (JPG, PNG ou WEBP).')); };
      img.src = url;
    });
  }
  /* v7.57.0: chave de operação guardada no aparelho. Recarregar a página ou tocar de novo depois de um "sem confirmação" reusa a mesma chave
   * (mesma foto, mesma conta) e o servidor não registra a foto duas vezes. Sai daqui quando o servidor confirma. */
  const OP_KEY = 'tk_fc_op_v1', OP_VALE_MS = 24 * 3600 * 1000;
  function opDaFoto(s, assinatura) {
    const sig = [String(s && s.whatsapp || '').replace(/\D/g, ''), assinatura].join('|');
    try { const o = JSON.parse(localStorage.getItem(OP_KEY) || 'null'); if (o && o.sig === sig && /^[A-Za-z0-9_-]{8,64}$/.test(String(o.op)) && Date.now() - (o.em || 0) < OP_VALE_MS) return o.op; } catch (e) {}
    const op = 'fc-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
    try { localStorage.setItem(OP_KEY, JSON.stringify({ sig: sig, op: op, em: Date.now() })); } catch (e) {}
    return op;
  }
  function opConfirmada() { try { localStorage.removeItem(OP_KEY); } catch (e) {} }
  function frase(x, padrao) { return window.TKPadrao ? TKPadrao.erro(x, padrao) : (x && x.erro && !/^[\s]*[\[{<]/.test(String(x.erro)) ? String(x.erro) : padrao); }
  function bloco() {
    const caixa = el('div', { className: 'conta-opc', id: 'foto-cli' });
    caixa.appendChild(el('h3', { text: '📸 Já usou uma peça nossa? Mande sua foto!', style: 'margin:0 0 4px;font-size:1rem' }));
    caixa.appendChild(el('p', { className: 'conta-opc-txt', text: 'Sua foto pode aparecer nos Stories da loja 🧡 É só escolher e enviar.' }));
    const rotulo = el('label', { htmlFor: 'foto-cli-arq', text: 'Escolher foto', style: 'display:block;font-weight:700;font-size:0.85rem;margin:6px 0 4px' });
    const arq = el('input', { type: 'file', id: 'foto-cli-arq', accept: 'image/jpeg,image/png,image/webp,image/*' });
    const previa = el('img', { alt: 'Sua foto escolhida', style: 'display:none;max-width:100%;max-height:220px;border-radius:10px;margin:8px 0;object-fit:contain' });
    const obs = el('input', { type: 'text', id: 'foto-cli-obs', maxLength: 300, placeholder: 'Observação (opcional)', autocomplete: 'off' });
    const ig = el('input', { type: 'text', id: 'foto-cli-ig', maxLength: 40, placeholder: 'Seu Instagram (opcional) — @usuario', autocomplete: 'off', autocapitalize: 'none' });
    const aut = el('input', { type: 'checkbox', id: 'foto-cli-ok' });
    const autL = el('label', { htmlFor: 'foto-cli-ok', style: 'display:flex;gap:8px;align-items:flex-start;font-size:0.82rem;margin:8px 0;line-height:1.3' }, [aut, el('span', { text: 'Autorizo a TENKiTER Modas a publicar esta foto nos Stories.' })]);
    const msg = el('div', { className: 'conta-erro', id: 'foto-cli-msg', role: 'status', 'aria-live': 'polite' });
    const env = el('button', { type: 'button', className: 'conta-principal', id: 'foto-cli-enviar', text: 'Enviar foto' });
    let blobPronto = null, assinaturaArq = '';
    arq.addEventListener('change', async () => {
      msg.textContent = ''; msg.style.color = ''; blobPronto = null; previa.style.display = 'none';
      const f = arq.files && arq.files[0]; if (!f) return;
      assinaturaArq = [f.name, f.size].join(':');
      try { blobPronto = await reduzir(f); previa.src = URL.createObjectURL(blobPronto); previa.style.display = 'block'; }
      catch (e) { msg.textContent = e.message; arq.value = ''; }
    });
    env.addEventListener('click', async () => {
      msg.style.color = ''; const s = sessao();
      if (!s) { msg.textContent = 'Entre de novo na sua conta para enviar a foto.'; return; }
      if (!blobPronto) { msg.textContent = 'Escolha a foto primeiro.'; return; }
      if (!aut.checked) { msg.textContent = 'Marque a autorização para usarmos a foto nos Stories.'; return; }
      env.disabled = true; env.textContent = 'Enviando…';
      try {
        const q = '?aceito=1&op=' + encodeURIComponent(opDaFoto(s, assinaturaArq)) + '&obs=' + encodeURIComponent(obs.value.trim()) + '&ig=' + encodeURIComponent(ig.value.trim());
        const r = await fetch(INSTAGRAM_URL + '/cliente/foto' + q, { method: 'POST', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'image/jpeg' }, body: blobPronto });
        let j = null; try { j = await r.json(); } catch (e) { j = null; }
        if (r.ok && j && j.ok) { msg.style.color = '#1b5e20'; msg.textContent = 'Recebemos! Muito obrigada 🧡 Se a gente usar, você aparece nos nossos Stories.'; arq.value = ''; obs.value = ''; previa.style.display = 'none'; blobPronto = null; aut.checked = false; opConfirmada(); }
        else msg.textContent = frase(j, 'Não consegui enviar a foto agora. Tente de novo em instantes.');
      } catch (e) { msg.textContent = 'Sem confirmação de que a foto chegou. Toque em Enviar foto de novo: ela não é registrada duas vezes.'; }
      env.disabled = false; env.textContent = 'Enviar foto';
    });
    [rotulo, arq, previa, obs, ig, autL, msg, env].forEach((n) => caixa.appendChild(n));
    return caixa;
  }
  window.TKFotoCliente = { bloco: bloco };
})();
