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
      '.tkc-ov{position:fixed;inset:0;z-index:var(--z-dialogo-2,160);background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;padding:0}' +
      '.tkc-ov.aberto{display:flex}' +
      '.tkc-box{background:#fff;color:#111;width:100%;max-width:460px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:20px 18px 26px;font-family:inherit}' +
      '@media(min-width:600px){.tkc-ov{align-items:center}.tkc-box{border-radius:18px}}' +
      '.tkc-box h2{margin:0 0 6px;font-size:1.25rem}.tkc-box p{margin:0 0 12px;font-size:.95rem;line-height:1.4;color:#333}' +
      '.tkc-box label{display:block;font-weight:700;font-size:.9rem;margin:12px 0 4px;color:#111}.tkc-box label small{font-weight:400;color:#555}' +
      '.tkc-box input{width:100%;box-sizing:border-box;padding:13px 12px;border:1.5px solid #bbb;border-radius:10px;font-size:1rem;background:#fff;color:#111}' +
      '.tkc-box button{width:100%;box-sizing:border-box;min-height:48px;border:0;border-radius:10px;font-weight:800;font-size:1rem;cursor:pointer;margin-top:12px;padding:0 14px}' +
      '.tkc-pri{background:var(--laranja, #E67E22);color:#0d0d0d}.tkc-sec{background:#eee;color:#111}.tkc-zap{background:#1d8a46;color:#fff}' +
      '.tkc-erro{background:#fde8e8;color:#8a1111;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:.92rem;font-weight:600}' +
      '.tkc-ok{background:#e3f4e8;color:#14532d;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:.92rem;font-weight:600}' +
      '.tkc-exist{background:#fff8e6;border:2px solid var(--laranja, #E67E22);border-radius:12px;padding:12px;margin:10px 0;color:#111}' +
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
    var bE = el('button', { type: 'button', 'class': 'tkc-pri', text: 'Entrar' }); bE.style.background = 'var(--laranja, #E67E22)'; bE.style.color = '#0d0d0d';
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
      // O link wa.me pode ficar no histórico do navegador e em prévias.
      // A identificação é conferida em conversa privada pela gestão.
      var msg = 'Olá! Esqueci minha senha do site da TENKiTER Modas e preciso de ajuda para entrar.';
      return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
    }
    function telaGestao(nome, ident, motivo) {
      box.textContent = '';
      box.appendChild(el('h2', { id: 'tkc-t', text: 'Vamos resolver juntos' }));
      box.appendChild(el('p', { text: motivo }));
      var a = el('a', { href: zap(nome, ident), target: '_blank', rel: 'noopener' });
      var b = el('button', { type: 'button', 'class': 'tkc-zap', text: '💬 Chamar a gestão no WhatsApp' });
      a.appendChild(b); box.appendChild(a);
      box.appendChild(el('p', { text: 'Por segurança, confirme seus dados somente na conversa com a gestão. A mensagem pronta não inclui CPF, nascimento ou e-mail.' }));
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
      var nova = el('input', { type: 'password', id: 'tkc-nova', autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' });
      box.appendChild(el('label', { 'for': 'tkc-ident', text: 'Seu E-mail, WhatsApp ou CPF' })); box.appendChild(ident);
      box.appendChild(el('label', { 'for': 'tkc-cpf' }, [document.createTextNode('CPF '), el('small', { text: '(se você cadastrou)' })])); box.appendChild(cpf);
      box.appendChild(el('label', { 'for': 'tkc-nasc' }, [document.createTextNode('Data de nascimento '), el('small', { text: '(se você cadastrou)' })])); box.appendChild(nasc);
      box.appendChild(el('label', { 'for': 'tkc-nova', text: 'Senha nova' })); box.appendChild(nova);
      var msg = el('div', { id: 'tkc-msg', role: 'status' }); box.appendChild(msg);
      var zapCodigo = el('button', {type:'button','class':'tkc-sec',text:'Receber código no meu WhatsApp'});
      box.appendChild(zapCodigo);
      zapCodigo.addEventListener('click', async function () {
        if (!ident.value.trim()) return erro('Digite seu e-mail, WhatsApp ou CPF.');
        zapCodigo.disabled = true;
        try {
          var r = await o.chamar({action:'recuperar_whatsapp_iniciar',identificador:ident.value.trim()});
          if (!r || !r.ok || !r.desafio) return erro('Recuperação por WhatsApp indisponível agora. Use os dados cadastrados ou chame a gestão.');
          telaCodigo(r.desafio,r.mensagem);
        } catch(e) { erro('Sem conexão. Verifique a internet e tente de novo.'); }
        finally {zapCodigo.disabled=false;}
      });
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
        if (nova.value.length < 8) return erro('A senha nova precisa ter pelo menos 8 caracteres.');
        ok.disabled = true; var rot = ok.textContent; ok.textContent = 'Conferindo…'; msg.className = ''; msg.textContent = '';
        var r;
        try { r = await o.chamar({ action: 'recuperar_senha', identificador: ident.value.trim(), cpf: digitos(cpf.value), nascimento: nasc.value, novaSenha: nova.value }); } catch (e) { r = null; }
        ok.disabled = false; ok.textContent = rot;
        if (!r) return erro('Sem conexão. Verifique a internet e tente de novo.');
        if (r.ok && r.usuario && r.sessao) { fechar(); if (o.aoEntrar) o.aoEntrar(r); return; }
        if (r.ok) { msg.className = 'tkc-ok'; msg.textContent = 'Senha trocada! Agora é só entrar com a senha nova.'; return; }
        if (r.precisaGestao) return telaGestao(r.nome, ident.value.trim(), r.erro || 'A gestão troca a sua senha pelo WhatsApp.');
        erro(r.erro || 'Não consegui agora. Tente de novo.');
      });
      setTimeout(function () { (inicial ? cpf : ident).focus(); }, 60);
    }
    function telaCodigo(desafio,texto) {
      box.textContent='';
      box.appendChild(el('h2',{id:'tkc-t',text:'Código do WhatsApp'}));
      box.appendChild(el('p',{text:texto}));
      var codigo=el('input',{id:'tkc-codigo',autocomplete:'one-time-code',maxlength:'10'});
      var senha=el('input',{id:'tkc-senha-zap',type:'password',autocomplete:'new-password',minlength:'8',maxlength:'128'});
      box.appendChild(el('label',{'for':'tkc-codigo',text:'Código de 10 letras e números'}));box.appendChild(codigo);
      box.appendChild(el('label',{'for':'tkc-senha-zap',text:'Nova senha (mínimo 8 caracteres)'}));box.appendChild(senha);
      var aviso=el('p',{role:'status'});box.appendChild(aviso);
      var salvar=el('button',{type:'button','class':'tkc-pri',text:'Salvar nova senha'});box.appendChild(salvar);
      salvar.addEventListener('click',async function(){
        if(senha.value.length<8){aviso.textContent='Use pelo menos 8 caracteres.';return;}
        salvar.disabled=true;
        try {
          var r=await o.chamar({action:'recuperar_whatsapp_concluir',desafio:desafio,codigo:codigo.value,novaSenha:senha.value});
          aviso.textContent=r&&r.ok?'Senha alterada. Feche esta janela e entre com a nova senha.':r&&r.erro||'Não foi possível confirmar. Tente de novo.';
          if(r&&r.ok){codigo.value='';senha.value='';salvar.hidden=true;}
        }catch(e){aviso.textContent='Sem conexão agora.';}
        finally{salvar.disabled=false;}
      });
      var voltar=el('button',{type:'button','class':'tkc-sec',text:'Voltar'});voltar.addEventListener('click',function(){formulario('');});box.appendChild(voltar);
      var sair=el('button',{type:'button','class':'tkc-sec',text:'Fechar'});sair.addEventListener('click',fechar);box.appendChild(sair);
      codigo.focus();
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
      bt.disabled = true; var rot = bt.textContent; bt.textContent = 'Salvando…'; msg.textContent = '';
      var r; try { r = await o.salvar(inp.value); } catch (e) { r = null; }
      bt.disabled = false; bt.textContent = rot;
      if (r && r.ok) { f.remove(); if (o.aoSalvar) o.aoSalvar(r); return; }
      msg.textContent = (r && r.erro) || 'Não consegui salvar agora. Tente de novo.';
    });
    container.insertBefore(f, container.firstChild);
    return f;
  }

  /* ---------- v7.86.0 — Conta no canto superior direito (DONO: este arquivo) ----------
   * Um botão só nas telas da equipe (Gestão, Esteira, Currículos; RH, loja e candidatura usam o "Minha conta" que já têm): mostra quem está
   * entrado e abre "Trocar de conta" e "Sair". A sessão é uma só no aparelho (tm_session): sair ou trocar aqui vale para
   * todas as telas e abas; as outras percebem e se atualizam quando voltam para a frente. No app Android, avisa o app
   * (TKAndroid.sairConta) para sair também das Mensagens. A página pode:
   *   - pôr <span data-tk-conta-slot></span> onde o botão deve ficar (senão ele fica solto no canto superior direito);
   *   - definir window.TKContaLimpar() para apagar o que for só dela ao sair (sem perguntar nada);
   *   - chamar TKConta.nomeTopo('Nome') quando souber o nome (senão usa o nome guardado pela sessão rápida). */
  var CH_SESSAO = 'tm_session';
  var nomeDado = '', topoBt = null, topoJan = null, topoPresa = null;
  function sessaoTopo() { try { var s = JSON.parse(localStorage.getItem(CH_SESSAO) || 'null'); return s && s.whatsapp && s.sessao ? s : null; } catch (e) { return null; } }
  function quemTopo() { var s = sessaoTopo(); return s ? String(s.whatsapp) : ''; }
  function nomeTopoAtual() {
    if (nomeDado) return nomeDado;
    try { var u = window.TKUsuarioCache && TKUsuarioCache.ler(); if (u && u.nome) return u.nome; } catch (e) { /* segue */ }
    return '';
  }
  function telaDaLoja() { return /(^|\/)((index|curriculo)\.html)?$/.test(location.pathname); }   // loja e candidatura: só para a equipe
  function mostrarTopo() {
    if (!sessaoTopo() || window.top !== window.self || /[?&]embed=1/.test(location.search) || document.documentElement.getAttribute('data-tk-conta') === 'nao') return false;
    return !telaDaLoja();   // a loja e a candidatura já têm "Minha conta" no canto direito, com Trocar de conta e Sair
  }
  function cssTopo() {
    if (document.getElementById('tkc-topo-css')) return;
    var s = document.createElement('style'); s.id = 'tkc-topo-css';
    s.textContent = 'button.tkc-topo{width:auto!important;flex:0 0 auto;margin:0;display:inline-flex;align-items:center;gap:6px;min-height:44px;max-width:46vw;padding:0 12px 0 8px;border:1px solid #d8d2c8!important;border-radius:22px!important;background:#fff!important;color:#1a1a1a!important;font:600 .9rem/1.1 inherit;cursor:pointer;white-space:nowrap;box-shadow:none}' +
      '.tkc-topo.tkc-solto{position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:var(--z-sticky,20);box-shadow:0 1px 4px rgba(0,0,0,.12)}' +
      '.tkc-topo .tkc-av{flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:#1a1a1a;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800}' +
      '.tkc-topo .tkc-nm{overflow:hidden;text-overflow:ellipsis}' +
      '@media (max-width:430px){button.tkc-topo{padding:0 7px;gap:0;min-width:44px;justify-content:center}.tkc-topo .tkc-nm,.tkc-topo .tkc-seta{display:none}}' +
      '.tkc-menu{position:fixed;top:calc(env(safe-area-inset-top,0px) + 60px);right:8px;z-index:var(--z-dialogo,150);width:min(300px,calc(100vw - 16px));background:#fff;color:#1a1a1a;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:14px;display:flex;flex-direction:column;gap:10px}' +
      '.tkc-menu .tkc-cab{display:flex;align-items:flex-start;gap:10px;padding-right:48px;min-height:44px}.tkc-menu .tk-fechar{position:absolute;top:8px;right:8px}' +
      '.tkc-menu .tkc-quem b{display:block;font-size:1rem}.tkc-menu .tkc-quem small{color:#555;font-size:.85rem}' +
      '.tkc-menu .tkc-dica{margin:0;font-size:.85rem;color:#555}.tkc-menu button.tkc-acao{width:100%;min-height:48px}' +
      '.tkc-fundo{position:fixed;inset:0;z-index:calc(var(--z-dialogo,150) - 1);background:rgba(0,0,0,.18)}';
    document.head.appendChild(s);
  }
  function iniciais(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : ''; }
  function mascararWhats(w) { var d = String(w || '').replace(/\D/g, ''); return d.length >= 4 ? '(…) …' + d.slice(-4) : ''; }
  function pintarTopo() {
    if (!topoBt) return;
    var n = nomeTopoAtual(), prim = String(n || '').trim().split(/\s+/)[0] || 'Conta';
    topoBt.replaceChildren(el('span', { 'class': 'tkc-av', 'aria-hidden': 'true', text: iniciais(n) || '👤' }), el('span', { 'class': 'tkc-nm', text: prim }), el('span', { 'class': 'tkc-seta', 'aria-hidden': 'true', text: '▾' }));
    topoBt.setAttribute('aria-label', 'Conta' + (n ? ' de ' + n : '') + ': trocar de conta ou sair');
  }
  function montarTopo() {
    var deve = mostrarTopo();
    if (!deve) { if (topoBt) { topoBt.remove(); topoBt = null; } return; }
    cssTopo();
    if (!topoBt) {
      topoBt = el('button', { type: 'button', 'class': 'tkc-topo', id: 'tkc-topo', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
      topoBt.addEventListener('click', abrirMenuTopo);
      var slot = document.querySelector('[data-tk-conta-slot]');
      if (slot) slot.appendChild(topoBt); else { topoBt.classList.add('tkc-solto'); document.body.appendChild(topoBt); }
    }
    pintarTopo();
  }
  function fecharMenuTopo() { if (window.TKCamadas && TKCamadas.aberta('tkc-conta')) TKCamadas.desempilhar('tkc-conta'); else limparMenuTopo(); }
  function limparMenuTopo() {
    if (topoPresa) { topoPresa.soltar(); topoPresa = null; }
    if (topoJan) { topoJan.remove(); topoJan = null; }
    var f = document.querySelector('.tkc-fundo'); if (f) f.remove();
    if (topoBt) topoBt.setAttribute('aria-expanded', 'false');
  }
  function abrirMenuTopo() {
    if (topoJan) return;
    var n = nomeTopoAtual(), s = sessaoTopo();
    var fundo = el('div', { 'class': 'tkc-fundo' }); fundo.addEventListener('click', fecharMenuTopo);
    var jan = el('div', { 'class': 'tkc-menu', id: 'tkc-menu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tkc-menu-quem' });
    var fechar = el('button', { type: 'button', 'class': 'tk-fechar', 'aria-label': 'Fechar', text: '✕' }); fechar.addEventListener('click', fecharMenuTopo);
    var quem = el('div', { 'class': 'tkc-quem', id: 'tkc-menu-quem' }); quem.appendChild(el('b', { text: n || 'Conta conectada' })); if (s) quem.appendChild(el('small', { text: 'WhatsApp ' + mascararWhats(s.whatsapp) }));
    var cab = el('div', { 'class': 'tkc-cab' }); cab.appendChild(el('span', { 'class': 'tkc-av', 'aria-hidden': 'true', text: iniciais(n) || '👤' })); cab.appendChild(quem);
    var trocar = el('button', { type: 'button', 'class': 'tk-btn-sec tkc-acao', id: 'tkc-trocar', text: 'Trocar de conta' });
    var sair = el('button', { type: 'button', 'class': 'tk-btn-perigo tkc-acao', id: 'tkc-sair', text: 'Sair' });
    trocar.addEventListener('click', function () { if (window.confirm('Trocar de conta? Você sai desta conta em todas as telas deste aparelho (Gestão, Esteira, Mensagens…) e entra com outra.')) sairTopo(); });
    sair.addEventListener('click', function () { if (window.confirm('Sair da conta? Você sai em todas as telas deste aparelho (Gestão, Esteira, Mensagens…).')) sairTopo(); });
    jan.appendChild(fechar); jan.appendChild(cab); jan.appendChild(el('p', { 'class': 'tkc-dica', text: 'A conta vale para todas as telas deste aparelho.' })); jan.appendChild(trocar); jan.appendChild(sair);
    document.body.appendChild(fundo); document.body.appendChild(jan); topoJan = jan;
    topoBt.setAttribute('aria-expanded', 'true');
    if (window.TKCamadas) TKCamadas.empilhar('tkc-conta', limparMenuTopo);
    if (window.TKJanela) topoPresa = TKJanela.prender(jan, { fechar: fecharMenuTopo, camada: 'tkc-conta', foco: '#tkc-trocar' });
  }
  /** Sai da conta em todas as telas: a página limpa o que é dela, a sessão some, o app Android sai das Mensagens. */
  function sairTopo() {
    try { if (typeof window.TKContaLimpar === 'function') window.TKContaLimpar(); } catch (e) { /* segue */ }
    try { if (window.TKUsuarioCache) TKUsuarioCache.limpar(); } catch (e) { /* segue */ }
    try { localStorage.removeItem('tm_nav_perms'); } catch (e) { /* segue */ }
    try { if (typeof limparSessao === 'function') limparSessao(); else localStorage.removeItem(CH_SESSAO); } catch (e) { /* segue */ }
    try { if (window.TKAndroid && typeof TKAndroid.sairConta === 'function') TKAndroid.sairConta(); } catch (e) { /* segue */ }
    sabido = quemTopo();
    location.reload();
  }
  /* Outra tela ou aba entrou, saiu ou trocou de conta: esta se atualiza (na hora se está na frente; senão, quando voltar).
   * Troca só do token da mesma conta não recarrega. Nunca recarrega no meio de uma gravação (TKOcupado). */
  var sabido = quemTopo(), recarregarAo = false;
  function recarregarQuandoPuder() {
    if (document.hidden) { recarregarAo = true; return; }
    if (window.TKOcupado && TKOcupado.pendentes() > 0) { setTimeout(recarregarQuandoPuder, 1000); return; }
    location.reload();
  }
  function conferirOutraTela() {
    var agora = quemTopo(); if (agora === sabido) { montarTopo(); return; }
    var antes = sabido; sabido = agora;
    try { if (window.TKAviso && !document.hidden) TKAviso.info(!agora ? 'Você saiu da conta em outra tela. Atualizando…' : antes ? 'A conta foi trocada em outra tela. Atualizando…' : 'Você entrou em outra tela. Atualizando…'); } catch (e) { /* segue */ }
    setTimeout(recarregarQuandoPuder, document.hidden ? 0 : 1200);
  }
  try {
    window.addEventListener('storage', function (e) { if (!e || e.key === CH_SESSAO || e.key === null) conferirOutraTela(); });
    window.addEventListener('tk:sessao', function () { sabido = quemTopo(); montarTopo(); });   // mudou nesta mesma tela
    document.addEventListener('visibilitychange', function () { if (document.hidden) return; if (recarregarAo) { recarregarAo = false; recarregarQuandoPuder(); } else conferirOutraTela(); });
    window.addEventListener('pageshow', function (e) { if (e && e.persisted) conferirOutraTela(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTopo); else setTimeout(montarTopo, 0);
  } catch (e) { /* navegador sem eventos: segue sem o botão */ }
  function nomeTopo(n) { nomeDado = String(n || '').trim().slice(0, 80); montarTopo(); }

  window.TKConta = { ligarCpf: ligarCpf, cpfMask: cpfMask, cpfValido: cpfValido, emailValido: emailValido, nascMask: nascMask, nascValida: nascValida, abrirRecuperar: abrirRecuperar, avisoContaExiste: avisoContaExiste, precisaCpf: precisaCpf, faixaCpf: faixaCpf,
    nomeTopo: nomeTopo, atualizarTopo: montarTopo, sair: sairTopo };
})();
