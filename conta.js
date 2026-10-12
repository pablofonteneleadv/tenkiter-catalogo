/* ====================================================================
 * TENKiTER Modas — conta.js — peças compartilhadas de CONTA (login, CPF, recuperar senha)
 *
 *   TKConta.ligarCpf(input)                 máscara viva 000.000.000-00
 *   TKConta.cpfValido(v) / emailValido(v)
 *   TKConta.abrirRecuperar({ identificador, chamar, whatsLoja, aoEntrar })
 *        janela "Esqueci a senha": confirma com CPF e/ou data de nascimento e troca a senha;
 *        quando não dá (conta sem CPF/nascimento ou da equipe), abre o WhatsApp da loja com a mensagem pronta.
 *   TKConta.avisoContaExiste(container, { identificador, aoEntrar, aoRecuperar })
 *        cartão "Você já tem conta" com os botões Entrar e Esqueci a senha (em vez de só um erro).
 *   TKConta.precisaCpf(usuario) / TKConta.faixaCpf(container, { usuario, salvar, aoSalvar })
 *        faixa vermelha grande pedindo o CPF NA MESMA TELA (equipe de Estagiário em diante).
 *
 * `chamar(payload)` é fornecido pela página (cada uma fala com o seu backend) e devolve o JSON da resposta.
 * Nada daqui guarda CPF, senha ou nascimento no aparelho.
 * ==================================================================== */
(function () {
  'use strict';
  if (window.TKConta) return;

  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function cpfMask(v) {
    var d = digitos(v).slice(0, 11), o = d;
    if (d.length > 9) o = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    else if (d.length > 6) o = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    else if (d.length > 3) o = d.slice(0, 3) + '.' + d.slice(3);
    return o;
  }
  function cpfValido(v) {
    var c = digitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    var s = 0, i;
    for (i = 0; i < 9; i++) s += Number(c.charAt(i)) * (10 - i);
    if (((s * 10) % 11) % 10 !== Number(c.charAt(9))) return false;
    s = 0;
    for (i = 0; i < 10; i++) s += Number(c.charAt(i)) * (11 - i);
    return ((s * 10) % 11) % 10 === Number(c.charAt(10));
  }
  function emailValido(v) { v = String(v || '').trim(); return v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function nascMask(v) {
    var d = digitos(v).slice(0, 8);
    if (d.length > 4) return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
    if (d.length > 2) return d.slice(0, 2) + '/' + d.slice(2);
    return d;
  }
  function nascValida(v) {
    var m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return false;
    var dia = +m[1], mes = +m[2], ano = +m[3];
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && ano >= 1900 && ano <= new Date().getFullYear();
  }
  function ligarCpf(input) {
    if (!input || input.getAttribute('data-tkc-cpf')) return;
    input.setAttribute('data-tkc-cpf', '1'); input.setAttribute('inputmode', 'numeric'); input.setAttribute('maxlength', '14'); input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', function () { input.value = cpfMask(input.value); });
  }
  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }
  function css() {
    if (document.getElementById('tkconta-css')) return;
    var s = document.createElement('style'); s.id = 'tkconta-css';
    s.textContent =
      '.tkc-ov{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;padding:0}' +
      '.tkc-ov.aberto{display:flex}' +
      '.tkc-box{background:#fff;color:#111;width:100%;max-width:460px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:20px 18px 26px;font-family:inherit}' +
      '@media(min-width:600px){.tkc-ov{align-items:center}.tkc-box{border-radius:18px}}' +
      '.tkc-box h2{margin:0 0 6px;font-size:1.25rem}.tkc-box p{margin:0 0 12px;font-size:.95rem;line-height:1.4;color:#333}' +
      '.tkc-box label{display:block;font-weight:700;font-size:.9rem;margin:12px 0 4px;color:#111}.tkc-box label small{font-weight:400;color:#555}' +
      '.tkc-box input{width:100%;box-sizing:border-box;padding:13px 12px;border:1.5px solid #bbb;border-radius:10px;font-size:1rem;background:#fff;color:#111}' +
      '.tkc-box button{width:100%;box-sizing:border-box;min-height:48px;border:0;border-radius:10px;font-weight:800;font-size:1rem;cursor:pointer;margin-top:12px;padding:0 14px}' +
      '.tkc-pri{background:#E67E22;color:#0d0d0d}.tkc-sec{background:#eee;color:#111}.tkc-zap{background:#1d8a46;color:#fff}' +
      '.tkc-erro{background:#fde8e8;color:#8a1111;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:.92rem;font-weight:600}' +
      '.tkc-ok{background:#e3f4e8;color:#14532d;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:.92rem;font-weight:600}' +
      '.tkc-exist{background:#fff8e6;border:2px solid #E67E22;border-radius:12px;padding:12px;margin:10px 0;color:#111}' +
      '.tkc-exist b{display:block;margin-bottom:6px}.tkc-exist .tkc-linha{display:flex;gap:8px;flex-wrap:wrap}.tkc-exist button{flex:1 1 140px;width:auto;margin-top:6px;min-height:46px;border:0;border-radius:10px;font-weight:800;font-size:.95rem;cursor:pointer}' +
      '.tkc-faixa{background:#b3151b;color:#fff;border-radius:14px;padding:16px;margin:0 0 14px;box-shadow:0 2px 10px rgba(179,21,27,.35)}' +
      '.tkc-faixa strong{display:block;font-size:1.15rem;margin-bottom:6px}.tkc-faixa p{margin:0 0 10px;font-size:.95rem;line-height:1.4;color:#fff}' +
      '.tkc-faixa input{width:100%;box-sizing:border-box;padding:13px 12px;border:0;border-radius:10px;font-size:1.05rem;color:#111;background:#fff}' +
      '.tkc-faixa button{width:100%;min-height:48px;margin-top:10px;border:0;border-radius:10px;background:#fff;color:#8a1111;font-weight:900;font-size:1rem;cursor:pointer}' +
      '.tkc-faixa .tkc-msg{margin-top:8px;font-weight:700}';
    document.head.appendChild(s);
  }

  /* ---------- "Já existe uma conta" ---------- */
  function avisoContaExiste(container, o) {
    css(); o = o || {};
    var antigo = container.querySelector('.tkc-exist'); if (antigo) antigo.remove();
    var caixa = el('div', { 'class': 'tkc-exist', role: 'alert' });
    caixa.appendChild(el('b', { text: 'Você já tem cadastro com esse dado 😊' }));
    caixa.appendChild(el('div', { text: 'Não precisa criar outra conta: é só entrar. Se não lembra a senha, a gente recupera em 1 minuto.' }));
    var linha = el('div', { 'class': 'tkc-linha' });
    var bE = el('button', { type: 'button', 'class': 'tkc-pri', text: 'Entrar' }); bE.style.background = '#E67E22'; bE.style.color = '#0d0d0d';
    var bR = el('button', { type: 'button', text: 'Esqueci a senha' }); bR.style.background = '#111'; bR.style.color = '#fff';
    bE.addEventListener('click', function () { if (o.aoEntrar) o.aoEntrar(); });
    bR.addEventListener('click', function () { if (o.aoRecuperar) o.aoRecuperar(); });
    linha.appendChild(bE); linha.appendChild(bR); caixa.appendChild(linha);
    container.insertBefore(caixa, container.firstChild);
    try { caixa.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    return caixa;
  }

  /* ---------- Recuperar senha ---------- */
  function abrirRecuperar(o) {
    css(); o = o || {};
    var ov = document.getElementById('tkc-recuperar');
    if (ov) ov.remove();
    ov = el('div', { 'class': 'tkc-ov', id: 'tkc-recuperar' });
    var box = el('div', { 'class': 'tkc-box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tkc-t' });
    ov.appendChild(box); document.body.appendChild(ov);
    function sumir() { ov.classList.remove('aberto'); setTimeout(function () { ov.remove(); }, 50); }
    function fechar() { if (window.TKCamadas && TKCamadas.aberta('tkc-recuperar')) TKCamadas.desempilhar('tkc-recuperar'); else sumir(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) fechar(); });

    function zap(nome, ident) {
      var num = digitos(o.whatsLoja || (typeof WHATSAPP_NUMERO !== 'undefined' ? WHATSAPP_NUMERO : ''));
      if (num && num.length <= 11) num = '55' + num;
      var msg = 'Olá! Esqueci minha senha do site da TENKiTER Modas e preciso de ajuda para entrar.' + (nome ? '\nMeu nome: ' + nome : '') + (ident ? '\nMeu WhatsApp/e-mail/CPF de cadastro: ' + ident : '');
      return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
    }
    function telaGestao(nome, ident, motivo) {
      box.textContent = '';
      box.appendChild(el('h2', { id: 'tkc-t', text: 'Vamos resolver juntos' }));
      box.appendChild(el('p', { text: motivo }));
      var a = el('a', { href: zap(nome, ident), target: '_blank', rel: 'noopener' });
      var b = el('button', { type: 'button', 'class': 'tkc-zap', text: '💬 Chamar a gestão no WhatsApp' });
      a.appendChild(b); box.appendChild(a);
      box.appendChild(el('p', { text: 'Depois que entrar, cadastre o seu CPF em "Meu perfil": assim da próxima vez você mesmo(a) recupera a senha, sem esperar ninguém.', style: 'margin-top:14px;font-size:.85rem;color:#555' }));
      var f = el('button', { type: 'button', 'class': 'tkc-sec btn-fechar', text: 'Fechar' }); f.addEventListener('click', fechar); box.appendChild(f);
    }
    function formulario(inicial) {
      box.textContent = '';
      box.appendChild(el('h2', { id: 'tkc-t', text: 'Esqueci minha senha' }));
      box.appendChild(el('p', { text: 'Sem problema! Confirme que é você com o que cadastrou e escolha uma senha nova. Já entra direto.' }));
      var ident = el('input', { type: 'text', id: 'tkc-ident', autocomplete: 'username', placeholder: 'E-mail, WhatsApp ou CPF', value: inicial || '' });
      var cpf = el('input', { type: 'text', id: 'tkc-cpf', placeholder: '000.000.000-00' }); ligarCpf(cpf);
      var nasc = el('input', { type: 'text', id: 'tkc-nasc', inputmode: 'numeric', maxlength: '10', placeholder: 'dd/mm/aaaa' });
      nasc.addEventListener('input', function () { nasc.value = nascMask(nasc.value); });
      var nova = el('input', { type: 'password', id: 'tkc-nova', autocomplete: 'new-password', placeholder: 'Mínimo 4 caracteres' });
      box.appendChild(el('label', { 'for': 'tkc-ident', text: 'Seu E-mail, WhatsApp ou CPF' })); box.appendChild(ident);
      box.appendChild(el('label', { 'for': 'tkc-cpf' }, [document.createTextNode('CPF '), el('small', { text: '(se você cadastrou)' })])); box.appendChild(cpf);
      box.appendChild(el('label', { 'for': 'tkc-nasc' }, [document.createTextNode('Data de nascimento '), el('small', { text: '(se você cadastrou)' })])); box.appendChild(nasc);
      box.appendChild(el('label', { 'for': 'tkc-nova', text: 'Senha nova' })); box.appendChild(nova);
      var msg = el('div', { id: 'tkc-msg', role: 'status' }); box.appendChild(msg);
      var ok = el('button', { type: 'button', 'class': 'tkc-pri', text: 'Trocar a senha e entrar' }); box.appendChild(ok);
      var naoSei = el('button', { type: 'button', 'class': 'tkc-sec', text: 'Não lembro o que cadastrei — chamar a gestão' });
      naoSei.addEventListener('click', function () { telaGestao('', ident.value.trim(), 'A gestão confirma quem você é pelo WhatsApp e troca a sua senha na hora.'); });
      box.appendChild(naoSei);
      var fe = el('button', { type: 'button', 'class': 'tkc-sec btn-fechar', text: 'Cancelar' }); fe.addEventListener('click', fechar); box.appendChild(fe);
      function erro(t) { msg.className = 'tkc-erro'; msg.textContent = t; }
      ok.addEventListener('click', async function () {
        if (!ident.value.trim()) return erro('Digite o seu e-mail, WhatsApp ou CPF.');
        if (cpf.value && !cpfValido(cpf.value)) return erro('CPF inválido. Confira os 11 números.');
        if (nasc.value && !nascValida(nasc.value)) return erro('Data de nascimento inválida. Use dd/mm/aaaa.');
        if (nova.value.length < 4) return erro('A senha nova precisa ter pelo menos 4 caracteres.');
        ok.disabled = true; var rot = ok.textContent; ok.textContent = 'Conferindo...'; msg.className = ''; msg.textContent = '';
        var r;
        try { r = await o.chamar({ action: 'recuperar_senha', identificador: ident.value.trim(), cpf: digitos(cpf.value), nascimento: nasc.value, novaSenha: nova.value }); } catch (e) { r = null; }
        ok.disabled = false; ok.textContent = rot;
        if (!r) return erro('Sem conexão agora. Verifique a internet e tente de novo.');
        if (r.ok && r.usuario && r.sessao) { fechar(); if (o.aoEntrar) o.aoEntrar(r); return; }
        if (r.ok) { msg.className = 'tkc-ok'; msg.textContent = 'Senha trocada! Agora é só entrar com a senha nova.'; return; }
        if (r.precisaGestao) return telaGestao(r.nome, ident.value.trim(), r.erro || 'A gestão troca a sua senha pelo WhatsApp.');
        erro(r.erro || 'Não consegui agora. Tente de novo.');
      });
      setTimeout(function () { (inicial ? cpf : ident).focus(); }, 60);
    }
    formulario(o.identificador || '');
    ov.classList.add('aberto');
    if (window.TKCamadas) TKCamadas.empilhar('tkc-recuperar', sumir);
  }

  /* ---------- Faixa vermelha do CPF (equipe) ---------- */
  var PERMS_EQUIPE = ['catalogo_admin', 'catalogo_cadastrar', 'catalogo_excluir', 'equipe_relatorio', 'gerir_manuais', 'dados_pessoais', 'gerir_acessos'];
  function precisaCpf(u) {
    if (!u || u.semRede) return false;
    if (u.cpf && cpfValido(u.cpf)) return false;
    var p = Array.isArray(u.permissoes) ? u.permissoes : [];
    return (Number(u.level) || 0) >= 2 || PERMS_EQUIPE.some(function (k) { return p.indexOf(k) !== -1; });
  }
  function faixaCpf(container, o) {
    css(); o = o || {};
    var velho = container.querySelector('.tkc-faixa'); if (velho) velho.remove();
    if (!precisaCpf(o.usuario)) return null;
    var f = el('div', { 'class': 'tkc-faixa', role: 'alert' });
    f.appendChild(el('strong', { text: '⚠️ Falta o seu CPF — é obrigatório para a equipe' }));
    f.appendChild(el('p', { text: 'Digite o seu CPF aqui mesmo e toque em Salvar. Leva 10 segundos e você não precisa ir em nenhuma outra tela.' }));
    var inp = el('input', { type: 'text', placeholder: '000.000.000-00', 'aria-label': 'Seu CPF' }); ligarCpf(inp);
    var bt = el('button', { type: 'button', text: 'Salvar meu CPF' });
    var msg = el('div', { 'class': 'tkc-msg', role: 'status' });
    f.appendChild(inp); f.appendChild(bt); f.appendChild(msg);
    bt.addEventListener('click', async function () {
      if (!cpfValido(inp.value)) { msg.textContent = 'CPF inválido. Confira os 11 números.'; return; }
      bt.disabled = true; var rot = bt.textContent; bt.textContent = 'Salvando...'; msg.textContent = '';
      var r; try { r = await o.salvar(inp.value); } catch (e) { r = null; }
      bt.disabled = false; bt.textContent = rot;
      if (r && r.ok) { f.remove(); if (o.aoSalvar) o.aoSalvar(r); return; }
      msg.textContent = (r && r.erro) || 'Não consegui salvar agora. Tente de novo.';
    });
    container.insertBefore(f, container.firstChild);
    return f;
  }

  window.TKConta = { ligarCpf: ligarCpf, cpfMask: cpfMask, cpfValido: cpfValido, emailValido: emailValido, nascMask: nascMask, nascValida: nascValida, abrirRecuperar: abrirRecuperar, avisoContaExiste: avisoContaExiste, precisaCpf: precisaCpf, faixaCpf: faixaCpf };
})();
