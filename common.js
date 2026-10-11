/**
 * TENKiTER Modas — Configuração e funções compartilhadas
 *
 * Usado por index.html (catálogo do cliente) e admin.html (painel do atendente).
 * Se algum dia precisar trocar a URL do Apps Script, o desconto à vista,
 * ou o número de WhatsApp da loja, mude AQUI, uma vez só.
 */

const API_URL_PADRAO = 'https://script.google.com/macros/s/AKfycbyWnKwT5-HB6rv-loxGUtumpWPlJsRZNYp06v5RC3wtiJDUaV9zCMJVRwOEScxwMase_Q/exec';
let API_URL = localStorage.getItem('tenkiter_api_url_override') || API_URL_PADRAO;

// Log de depuração opcional (liga/desliga pelo admin.html, botão "🪲 Log de Depuração").
// Aqui é só o padrão "não faz nada" -- o admin.html troca por uma versão de verdade que grava
// o que acontece; index.html nunca liga isso, então chamar continua seguro e sem custo lá.
if (typeof window.logDebug_ !== 'function') window.logDebug_ = function () {};

// Endereço público do catálogo (site que o cliente/atendente visita e onde os links compartilhados devem apontar).
// NUNCA use API_URL para montar um link a ser compartilhado — API_URL é só o backend de dados.
const SITE_URL = 'https://tenkitermodas.com.br/';

const DESCONTO_AVISTA = 0.10; // 10% de desconto no pagamento à vista

/** Endereço RÁPIDO da lista de peças: o Worker da Cloudflare (og-worker) responde em /lista.json. ATENÇÃO: medido em 10/10/2026, ainda não é mais rápido que o Apps Script (falta cache de borda, ex. KV); deixe vazio.
 *  Vazio = desligado (padrão): o catálogo busca direto no Apps Script, como sempre. Para ligar, publique o Worker novo e cole aqui,
 *  por exemplo 'https://tenkiter-og.distkrpconfeccoes.workers.dev/lista.json'. Se o Worker falhar, o catálogo cai no Apps Script sozinho. */
const LISTA_RAPIDA_URL = '';

/** Busca a lista pública de peças ({ ok, produtos: [...] }). Com LISTA_RAPIDA_URL ligada tenta ela primeiro (3,5 s) e cai no Apps Script se falhar. */
function buscarListaPublica() {
  const direto = () => fetch(API_URL + '?action=list').then(r => r.json());
  if (!LISTA_RAPIDA_URL) return direto();
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => { if (ctl) ctl.abort(); }, 3500);
  return fetch(LISTA_RAPIDA_URL, ctl ? { signal: ctl.signal } : undefined)
    .then(r => r.json())
    .then(j => { clearTimeout(t); if (!j || !Array.isArray(j.produtos)) throw new Error('lista inválida'); return j; })
    .catch(() => { clearTimeout(t); return direto(); });
}
const WHATSAPP_NUMERO = '5588993223998';

// Notificações push (OneSignal). App ID é público (não é segredo) — pegue em
// onesignal.com → seu app → Settings → Keys & IDs → "OneSignal App ID" e cole aqui.
// A REST API Key é SEGREDA e NUNCA vai aqui — ela fica só no Apps Script
// (Extensões > Propriedades do Script > ONESIGNAL_REST_API_KEY).
const ONESIGNAL_APP_ID = '535f6b0d-c866-43c2-b241-43bd7ab62fae';

/** Miniatura de uma foto (v3.1): mesma foto, mas já redimensionada no servidor de imagens -- 3 a 4 vezes menos bytes na lista.
 *  Só mexe em endereços que sabemos redimensionar (Google lh3 "/d/<id>" e Cloudinary "/upload/"); qualquer outro volta igual. */
function fotoMini(url, largura) {
  const u = String(url || '');
  const w = largura || 400;
  if (/^https:\/\/lh3\.googleusercontent\.com\/d\/[\w-]+$/.test(u)) return u + '=w' + w;
  if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?!w_|c_|f_|q_)/.test(u)) return u.replace('/upload/', '/upload/w_' + w + ',c_limit,f_auto,q_auto/');
  return u;
}

/** Link público da peça no SITE (nunca a API_URL). Com código: SITE_URL + 'p/<código>' -> Render faz Rewrite para o Worker
 *  da Cloudflare (og-worker/), que devolve as meta og:* (foto/nome/preço) e leva a pessoa a ?c=<código>. Sem código: ?id=.
 *  `foto` (opcional) = número da foto/vídeo ESCOLHIDO na galeria, contando de 1 (1 = capa; o vídeo é sempre o último). Com 2 ou mais o link
 *  ganha "?f=<n>": a miniatura no WhatsApp é essa foto e quem abrir o link já cai nela. Sem `foto` (ou 1) o link é o de sempre. */
function linkProduto(p, foto) {
  const cod = p && (p.Codigo || p.codigo);
  const n = Math.floor(Number(foto));
  const temFoto = n >= 2 && n <= 99;
  return cod
    ? (SITE_URL + 'p/' + encodeURIComponent(cod) + (temFoto ? '?f=' + n : ''))
    : (SITE_URL + '?id=' + encodeURIComponent(p.ID != null ? p.ID : p.id) + (temFoto ? '&f=' + n : ''));
}

function formatarReal(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

function estoqueInformado(p) {
  return p.Estoque !== '' && p.Estoque !== undefined && p.Estoque !== null;
}

function estaEsgotado(p) {
  return estoqueInformado(p) && Number(p.Estoque) <= 0;
}

function ehNovidade(p) {
  return p.Novidade === true || String(p.Novidade).toUpperCase() === 'TRUE';
}


/* ===================== v2: sessão única (portal + admin + catálogo) =====================
 * O login é o mesmo do portal de treinamento (WhatsApp + senha, cadastro único).
 * A sessão fica em localStorage 'tm_session' -- a mesma chave do portal -- então
 * entrar em um lugar vale nos outros. Guarda só um token, nunca a senha. */
const SESSAO_CHAVE = 'tm_session';

function normalizarWhats(w) {
  let d = String(w || '').replace(/\D/g, '');
  if (d.length >= 12 && d.slice(0, 2) === '55') d = d.slice(2);
  return d;
}

function getSessao() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSAO_CHAVE) || 'null');
    return s && s.whatsapp && s.sessao ? s : null;
  } catch (e) {
    return null;
  }
}

function salvarSessao(whatsapp, token) {
  try { localStorage.setItem(SESSAO_CHAVE, JSON.stringify({ whatsapp: whatsapp, sessao: token })); } catch (e) {}
  try { window.dispatchEvent(new Event('tk:sessao')); } catch (e) {}   // push.js liga/desliga o aparelho da conta
}

function limparSessao() {
  try { localStorage.removeItem(SESSAO_CHAVE); } catch (e) {}
  try { window.dispatchEvent(new Event('tk:sessao')); } catch (e) {}
}

/** POST simples ao backend; nunca lança (devolve { ok:false, semRede:true } sem internet). */
async function apiPost(corpo) {
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, erro: 'Sem conexão. Verifique a internet e tente de novo.', semRede: true };
  }
}

/** Pergunta a versão ao backend. null = sem rede; {} = backend antigo (sem contas). Lembra a resposta por 60 s
 *  (conta, pedidos e configuração perguntam na mesma abertura da página; uma ida ao servidor basta). */
let _versaoPromessa = null, _versaoQuando = 0;
async function versaoServidor() {
  if (_versaoPromessa && Date.now() - _versaoQuando < 60000) return _versaoPromessa;
  _versaoQuando = Date.now();
  _versaoPromessa = (async () => {
    try {
      const resp = await fetch(API_URL + '?action=versao');
      const j = await resp.json();
      return j && j.ok ? j : {};
    } catch (e) {
      _versaoPromessa = null;
      return null;
    }
  })();
  return _versaoPromessa;
}

async function entrarComSenha(whatsapp, senha) {
  const r = await apiPost({ action: 'login', whatsapp: normalizarWhats(whatsapp), senha: senha });
  if (r && r.ok && r.sessao && r.usuario) salvarSessao(r.usuario.whatsapp, r.sessao);
  return r;
}

/** Confere a sessão salva. Devolve o usuário ({name, permissoes...}), null se não há/expirou, ou { semRede:true }. */
async function conferirSessao() {
  const s = getSessao();
  if (!s) return null;
  const r = await apiPost({ action: 'sessao', whatsapp: s.whatsapp, sessao: s.sessao });
  if (r && r.ok && r.usuario) {
    if (r.sessao && r.sessao !== s.sessao) salvarSessao(r.usuario.whatsapp, r.sessao);
    return r.usuario;
  }
  if (r && r.semRede) return { semRede: true };
  if (r && (r.sessaoInvalida || r.inativa)) limparSessao();
  return null;
}

async function registrarClienteApi(nome, whatsapp, senha) {
  const r = await apiPost({ action: 'registrar_cliente', nome: nome, whatsapp: normalizarWhats(whatsapp), senha: senha });
  if (r && r.ok && r.sessao && r.usuario) salvarSessao(r.usuario.whatsapp, r.sessao);
  return r;
}

function temPermissao(usuario, chave) {
  return !!(usuario && Array.isArray(usuario.permissoes) && usuario.permissoes.indexOf(chave) !== -1);
}

/** Escapa texto vindo da planilha antes de colocar em HTML (nomes/descrições nunca viram código). */
function escaparHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** Atributo src="..." já escapado, para montar <img> dentro de modelos de texto (innerHTML).
 *  Escreva `<img ${atribSrc(url)} alt="">` e NUNCA `<img src="${url}">` dentro de um <script> de página HTML: o Chrome, ao ler a página aos pedaços
 *  (principalmente quando ela passa pelo service worker), às vezes "enxerga" esse <img> no texto do script e pede uma foto chamada
 *  `${...}` (404 no log, foto pedida à toa). Com `${atribSrc(...)}` o texto não parece mais um atributo src e o problema some. */
function atribSrc(url) { return 'src="' + escaparHtml(url) + '"'; }

/* ===================== Configurações (API_URL editável) ===================== */

function definirApiUrlPersonalizada(url) {
  if (url && url.trim()) {
    localStorage.setItem('tenkiter_api_url_override', url.trim());
    API_URL = url.trim();
  }
}

function restaurarApiUrlPadrao() {
  localStorage.removeItem('tenkiter_api_url_override');
  API_URL = API_URL_PADRAO;
}

/* ===================== Favoritos (localStorage, só no navegador do cliente) ===================== */

function getFavoritos() {
  try {
    return JSON.parse(localStorage.getItem('tenkiter_favoritos') || '[]');
  } catch (e) {
    return [];
  }
}

function ehFavorito(id) {
  return getFavoritos().includes(String(id));
}

function toggleFavorito(id) {
  const atuais = getFavoritos();
  const idStr = String(id);
  const idx = atuais.indexOf(idStr);
  if (idx >= 0) {
    atuais.splice(idx, 1);
  } else {
    atuais.push(idStr);
  }
  localStorage.setItem('tenkiter_favoritos', JSON.stringify(atuais));
  if (typeof salvarContaClienteDepois === 'function') salvarContaClienteDepois();
  return atuais.includes(idStr);
}

/* ===================== Sacola (carrinho local, combina em 1 mensagem de WhatsApp) ===================== */

function getSacola() {
  try {
    return JSON.parse(localStorage.getItem('tenkiter_sacola') || '[]');
  } catch (e) {
    return [];
  }
}

function salvarSacola(lista) {
  localStorage.setItem('tenkiter_sacola', JSON.stringify(lista));
  podarFotosDaSacola_(lista);
  if (typeof salvarContaClienteDepois === 'function') salvarContaClienteDepois();
}

/* Foto/vídeo ESCOLHIDO de cada peça da sacola (número de 1; 1 = capa). Fica só neste aparelho (não é dado pessoal) e serve para o link do pedido
 * levar à foto que a pessoa viu e para a miniatura na sacola. Quando a peça sai da sacola, o registro sai junto. */
const CHAVE_FOTO_SACOLA = 'tenkiter_sacola_foto_v1';
function lerFotosDaSacola_() {
  try { const o = JSON.parse(localStorage.getItem(CHAVE_FOTO_SACOLA) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
function fotoDaSacola(id) {
  const n = Math.floor(Number(lerFotosDaSacola_()[String(id)]));
  return n >= 2 && n <= 99 ? n : 1;
}
function guardarFotoDaSacola(id, n) {
  try {
    const o = lerFotosDaSacola_(); const k = String(id); const num = Math.floor(Number(n));
    if (num >= 2 && num <= 99) o[k] = num; else delete o[k];
    localStorage.setItem(CHAVE_FOTO_SACOLA, JSON.stringify(o));
  } catch (e) {}
}
function podarFotosDaSacola_(lista) {
  try {
    const o = lerFotosDaSacola_(); const ids = (lista || []).map(String); let mudou = false;
    Object.keys(o).forEach(k => { if (ids.indexOf(k) === -1) { delete o[k]; mudou = true; } });
    if (mudou) localStorage.setItem(CHAVE_FOTO_SACOLA, JSON.stringify(o));
  } catch (e) {}
}

/** Imagem (miniatura) da foto/vídeo `n` da peça (n de 1). Foto = ela mesma; vídeo da Cloudinary = um quadro dele (o quadro 0 vem preto);
 *  qualquer outro caso (número fora da galeria, vídeo do Drive) = a capa. */
function imagemDoSlide(p, n, largura) {
  const w = largura || 400;
  const fotos = [p.Foto_URL].concat(String(p.Fotos_Galeria || '').split(',').map(s => s.trim()).filter(Boolean));
  const i = Math.floor(Number(n)) - 1;
  if (i >= 0 && i < fotos.length && fotos[i]) return fotoMini(fotos[i], w);
  const v = String(p.Video_URL || '');
  if (i === fotos.length && /^https:\/\/res\.cloudinary\.com\/.+\/video\/upload\//.test(v)) return v.replace('/video/upload/', '/video/upload/so_30p,w_' + w + ',c_limit,f_jpg/').replace(/\.[A-Za-z0-9]+$/, '.jpg');
  return fotoMini(p.Foto_URL, w);
}

function estaNaSacola(id) {
  return getSacola().includes(String(id));
}

function adicionarNaSacola(id, foto) {
  const atuais = getSacola();
  const idStr = String(id);
  if (!atuais.includes(idStr)) {
    atuais.push(idStr);
    salvarSacola(atuais);
    guardarFotoDaSacola(idStr, foto); // foto/vídeo que a pessoa estava vendo ao pôr na sacola (1 ou vazio = capa)
  }
  return atuais;
}

function removerDaSacola(id) {
  const atuais = getSacola().filter(x => x !== String(id));
  salvarSacola(atuais);
  return atuais;
}

function limparSacola() {
  salvarSacola([]);
}


/* ===================== v2: favoritos e sacola na conta do cliente ===================== */

/** Une o que está neste aparelho com o que está salvo na conta (nada se perde) e grava o resultado nos dois lados. */
async function sincronizarContaCliente() {
  const s = getSessao();
  if (!s) return { ok: false };
  const r = await apiPost({ action: 'cliente_dados', whatsapp: s.whatsapp, sessao: s.sessao });
  if (!r || !r.ok) return { ok: false, sessaoInvalida: !!(r && (r.sessaoInvalida || r.exigeLogin)) };
  _contaSincronizada = true; // a partir daqui mudanças locais já podem ser gravadas na conta
  const uniao = (a, b) => Array.from(new Set((a || []).concat(b || []).map(String)));
  const favoritos = uniao(getFavoritos(), r.favoritos);
  const sacola = uniao(getSacola(), r.sacola);
  localStorage.setItem('tenkiter_favoritos', JSON.stringify(favoritos));
  salvarSacola(sacola);
  await apiPost({ action: 'cliente_salvar', whatsapp: s.whatsapp, sessao: s.sessao, favoritos: favoritos, sacola: sacola });
  return { ok: true, favoritos: favoritos, sacola: sacola };
}

let _contaSincronizada = false;
let _timerSalvarConta = null;
/** Agenda o envio de favoritos/sacola para a conta (junta várias mudanças seguidas). Sem login: não faz nada. */
function salvarContaClienteDepois() {
  if (!getSessao() || !_contaSincronizada) return; // antes da 1ª sincronização, gravar poderia apagar o que já está na conta
  clearTimeout(_timerSalvarConta);
  _timerSalvarConta = setTimeout(() => {
    const s = getSessao();
    if (!s) return;
    apiPost({ action: 'cliente_salvar', whatsapp: s.whatsapp, sessao: s.sessao, favoritos: getFavoritos(), sacola: getSacola() });
  }, 800);
}

/* ===================== Util: debounce ===================== */

/**
 * Agrupa chamadas seguidas numa só, disparando `fn` só depois que o
 * usuário parar de digitar/agir por `espera` ms. Usado na busca do
 * catálogo e do admin para não refiltrar/renderizar a cada tecla.
 */
function debounce(fn, espera) {
  let temporizador = null;
  return function (...args) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn.apply(this, args), espera);
  };
}

/* ===================== Cache local do catálogo (navegador do cliente) =====================
 * Guarda a última lista de produtos recebida do servidor no localStorage,
 * para a página mostrar algo instantaneamente na próxima visita (em vez de
 * tela em branco esperando a rede) enquanto busca a versão atualizada por
 * trás ("stale-while-revalidate"). Só é usado pelo catálogo público
 * (index.html) — o admin sempre busca fresco, pois é onde se edita. */
const CATALOGO_CACHE_CHAVE = 'tenkiter_catalogo_cache_v1';
const CATALOGO_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

function obterCatalogoCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATALOGO_CACHE_CHAVE) || 'null');
    if (!raw || !Array.isArray(raw.produtos)) return null;
    return raw;
  } catch (e) {
    return null;
  }
}

function salvarCatalogoCache(produtos) {
  try {
    localStorage.setItem(CATALOGO_CACHE_CHAVE, JSON.stringify({ produtos: produtos, salvoEm: Date.now() }));
  } catch (e) {
    // localStorage cheio/indisponível: sem cache local, mas a página continua funcionando normalmente.
  }
}

function catalogoCacheEstaFresco(raw) {
  return !!raw && typeof raw.salvoEm === 'number' && (Date.now() - raw.salvoEm) < CATALOGO_CACHE_TTL_MS;
}

/* ===================== Fila offline (retry de ações do admin quando a internet cai) ===================== */

function getFilaOffline() {
  try {
    return JSON.parse(localStorage.getItem('tenkiter_fila_offline') || '[]');
  } catch (e) {
    return [];
  }
}

function salvarFilaOffline(lista) {
  try {
    localStorage.setItem('tenkiter_fila_offline', JSON.stringify(lista));
    return true;
  } catch (e) {
    return false; // sem espaço no navegador (fotos grandes na fila)
  }
}

function enfileirarAcaoOffline(corpo) {
  const fila = getFilaOffline();
  fila.push({ corpo: corpo, criadoEm: new Date().toISOString() });
  if (!salvarFilaOffline(fila)) {
    fila.pop();
    window.logDebug_('fila offline: SEM ESPAÇO pra guardar a ação "' + (corpo && corpo.action) + '" -- avisei o usuário e descartei');
    if (typeof alert === 'function') alert('Sem internet e sem espaço para guardar esta ação (foto muito grande). Tente de novo quando a internet voltar.');
  } else {
    window.logDebug_('fila offline: guardou a ação "' + (corpo && corpo.action) + '" -- agora tem ' + fila.length + ' pendente(s)');
  }
  return fila.length;
}

/**
 * Envia uma ação POST ao backend. Se a rede falhar (offline, timeout, etc.),
 * guarda a ação numa fila local em vez de perder o que o atendente fez,
 * para reenviar depois com sincronizarFilaOffline().
 * Retorna { ok: true, resp } em caso de sucesso, ou { ok: false, enfileirado: true } se caiu na fila.
 */
async function enviarComFila(corpo) {
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    }).then(r => r.json());
    return { ok: true, resp: resp };
  } catch (e) {
    enfileirarAcaoOffline(corpo);
    return { ok: false, enfileirado: true };
  }
}

/**
 * Tenta reenviar tudo que está na fila offline, em ordem.
 * Para no primeiro erro de rede (mantém o resto na fila para tentar depois).
 * Retorna { enviados, restantes }.
 */
let _sincronizandoFila = false;
async function sincronizarFilaOffline() {
  if (_sincronizandoFila) return { enviados: 0, restantes: getFilaOffline().length, ocupado: true };
  _sincronizandoFila = true;
  try { return await _sincronizarFilaOffline(); } finally { _sincronizandoFila = false; }
}
function _donoDoToken(t) { const m = /^tk2\.(\d+)\./.exec(String(t || '')); return m ? m[1] : ''; }
async function _sincronizarFilaOffline() {
  const fila = getFilaOffline();
  window.logDebug_('fila offline: começando a sincronizar (' + fila.length + ' pendente(s))');
  let enviados = 0, recusadas = 0;
  while (fila.length > 0) {
    const item = fila[0];
    try {
      let resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item.corpo)
      }).then(r => r.json());
      const falhaDeAcesso = (r) => r && r.ok === false && (r.exigeLogin || r.sessaoInvalida || r.pinInvalido || r.inativa || r.bloqueado);
      const donoAntigo = _donoDoToken(item.corpo.pin), donoAtual = typeof credencialAdmin === 'function' ? _donoDoToken(credencialAdmin()) : '';
      // só reaproveita a credencial de agora se a ação era da MESMA pessoa (ou do PIN antigo): nunca troca o autor
      if (falhaDeAcesso(resp) && typeof credencialAdmin === 'function' && credencialAdmin() && item.corpo.pin !== credencialAdmin() && (!donoAntigo || donoAntigo === donoAtual)) {
        // login trocado/expirado desde que a ação entrou na fila: tenta 1 vez com a credencial atual
        item.corpo.pin = credencialAdmin();
        resp = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item.corpo)
        }).then(r => r.json());
      }
      if (falhaDeAcesso(resp)) { window.logDebug_('fila offline: sem acesso agora pra ação "' + item.corpo.action + '" -- mantendo na fila'); break; }
      if (resp && resp.ok === false) recusadas++; // o servidor recusou (ex.: sem permissão): não adianta reenviar
      window.logDebug_('fila offline: ação "' + item.corpo.action + '" enviada -- resp.ok=' + (resp && resp.ok));
      fila.shift();
      enviados++;
      salvarFilaOffline(fila);
    } catch (e) {
      window.logDebug_('fila offline: parou de sincronizar -- ' + ((e && e.message) || e));
      break;
    }
  }
  window.logDebug_('fila offline: sincronização terminou -- enviados=' + enviados + ' restantes=' + fila.length + ' recusadas=' + recusadas);
  return { enviados: enviados, restantes: fila.length, recusadas: recusadas };
}


/* ===================== v3.3: loja, WhatsApp fixo, pedidos, sinônimos e configuração pública ===================== */

/** Dados da loja (uma fonte só). O WhatsApp é SEMPRE o da loja (WHATSAPP_NUMERO) — não há número por atendente. */
const LOJA = {
  nome: 'TENKiTER Modas',
  endereco: 'Rua Dr. Moreira da Rocha, 759 — Crateús, CE',
  instagram: 'tenkitermodasceara',
  instagramUrl: 'https://instagram.com/tenkitermodasceara',
  mapaUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Rua Dr. Moreira da Rocha 759 Crateús CE')
};

/** Endereço completo e clicável do WhatsApp da loja (com mensagem pronta, se houver). */
function linkWhatsApp(texto) {
  return 'https://wa.me/' + WHATSAPP_NUMERO + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/** WhatsApp de um cliente (para a loja responder). Aceita com ou sem DDD do país. */
function linkWhatsAppCliente(numero, texto) {
  const d = normalizarWhats(numero);
  return 'https://wa.me/55' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/** Link para o cliente acompanhar o pedido — sempre no SITE (nunca na API_URL). */
function linkRastreio(codigo) {
  return SITE_URL + '?pedido=' + encodeURIComponent(codigo || '');
}

function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
/** (88) 99999-9999 — só para mostrar; nunca para enviar. */
function formatarTelefone(v) {
  const d = normalizarWhats(v);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return String(v || '');
}

/** Etapas do pedido, na ordem. 'pronto' muda de nome conforme retirada/entrega (pedidoRotulo). */
const PEDIDO_STATUS = [
  { id: 'novo', rotulo: 'Pedido recebido' },
  { id: 'em_atendimento', rotulo: 'Em atendimento' },
  { id: 'aguardando_pagamento', rotulo: 'Aguardando pagamento' },
  { id: 'separacao', rotulo: 'Separando as peças' },
  { id: 'pronto', rotulo: 'Pronto' },
  { id: 'concluido', rotulo: 'Concluído' },
  { id: 'cancelado', rotulo: 'Cancelado' }
];
function pedidoRotulo(status, entrega) {
  if (status === 'pronto') return entrega === 'entrega' ? 'Saiu para entrega' : 'Pronto para retirada na loja';
  const e = PEDIDO_STATUS.find(x => x.id === status);
  return e ? e.rotulo : String(status || '');
}

/** Mensagem pronta (do WhatsApp da loja para o cliente) para cada etapa — sempre com o link completo de acompanhamento. */
function mensagemStatusPedido(ped) {
  const nome = primeiroNome(ped.nome);
  const ola = nome ? 'Olá, ' + nome + '! ' : 'Olá! ';
  const cod = ped.codigo;
  const total = formatarReal(ped.total || 0);
  const corpo = {
    novo: ola + 'Recebemos o seu pedido ' + cod + ' na ' + LOJA.nome + '. Já vamos conferir as peças e te respondemos por aqui. 😊',
    em_atendimento: ola + 'Estamos cuidando do seu pedido ' + cod + '. Qualquer dúvida é só responder esta mensagem.',
    aguardando_pagamento: ola + 'O seu pedido ' + cod + ' está reservado e aguardando o pagamento. Total à vista: ' + total + '. Assim que pagar, é só nos avisar por aqui.',
    separacao: ola + 'Estamos separando as peças do seu pedido ' + cod + '. Em breve avisamos quando estiver pronto.',
    pronto: ped.entrega === 'entrega'
      ? ola + 'O seu pedido ' + cod + ' saiu para entrega. 🛵'
      : ola + 'O seu pedido ' + cod + ' está pronto para retirada na loja: ' + LOJA.endereco + '.',
    concluido: ola + 'Pedido ' + cod + ' concluído. Muito obrigado pela preferência! 💛',
    cancelado: ola + 'O pedido ' + cod + ' foi cancelado. Se quiser retomar ou escolher outras peças, é só chamar por aqui.'
  }[ped.status] || (ola + 'Sobre o seu pedido ' + cod + ':');
  return corpo + '\n\nAcompanhe o pedido: ' + linkRastreio(cod);
}

/** Sinônimos que a busca usa SÓ quando o termo digitado não achou nada (o painel pode acrescentar mais em "Integrações"). */
const SINONIMOS_PADRAO = [
  'camisa=camiseta,blusa,polo', 'camiseta=camisa,blusa,regata', 'blusa=camiseta,cropped,top', 'cropped=blusa,top',
  'calca=jeans,legging', 'jeans=calca', 'short=bermuda,shorts', 'shorts=short,bermuda', 'bermuda=short,shorts',
  'vestido=macaquinho,longo', 'macacao=macaquinho,jardineira', 'macaquinho=macacao,vestido',
  'biquini=maio,moda praia', 'maio=biquini', 'jaqueta=casaco,blazer', 'casaco=jaqueta,moletom', 'moletom=casaco,blusa de frio',
  'menina=infantil,feminino', 'menino=infantil,masculino', 'crianca=infantil', 'infantil=crianca,menina,menino', 'fantasia=infantil,festa'
];

/** Lê uma lista "a=b,c" e devolve { a:[b,c], ... } (sem acento, minúsculas). */
function montarSinonimos(listas) {
  const sem = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const mapa = {};
  (listas || []).forEach(linha => {
    const [chave, resto] = String(linha || '').split('=');
    const k = sem(chave); if (!k || !resto) return;
    const alvos = resto.split(',').map(sem).filter(Boolean);
    if (!alvos.length) return;
    mapa[k] = Array.from(new Set((mapa[k] || []).concat(alvos)));
  });
  return mapa;
}

/** Configuração pública (Pixel da Meta, sinônimos...). Vem do backend 3.1; backend antigo => {} e tudo segue igual.
 *  Nunca traz segredo: o token da API de Conversões fica só nas Propriedades do Script. Guardada 10 min no aparelho. */
const CONFIG_PUBLICA_CHAVE = 'tenkiter_config_v1';
async function configPublica() {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_PUBLICA_CHAVE) || 'null');
    if (c && c.api === API_URL && Date.now() - c.t < 10 * 60 * 1000) return c.d || {};
  } catch (e) {}
  try {
    const v = await versaoServidor();
    if (!v || !v.config) return {};
    const j = await fetch(API_URL + '?action=config').then(r => r.json());
    if (j && j.ok && j.config) {
      try { localStorage.setItem(CONFIG_PUBLICA_CHAVE, JSON.stringify({ api: API_URL, t: Date.now(), d: j.config })); } catch (e) {}
      return j.config;
    }
  } catch (e) {}
  return {};
}

/** Pedidos: o servidor guarda e recalcula os preços; o site só envia quais peças e os dados do cliente. */
async function criarPedidoApi(dados) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), 12000) : null;
  try {
    const resp = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: 'criarPedido' }, dados)), signal: ctl ? ctl.signal : undefined
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, erro: 'Sem conexão com o servidor.', semRede: true };
  } finally { if (t) clearTimeout(t); }
}
async function consultarPedidoApi(codigo, final4) {
  return apiPost({ action: 'consultarPedido', codigo: String(codigo || '').trim().toUpperCase(), final: soDigitos(final4).slice(-4) });
}

/* ====================================================================
 * Aparelho ANÔNIMO (v3.5): quantos instalaram o app, quantos têm aviso ativo, de onde as pessoas vêm.
 * O aparelho cria um código ALEATÓRIO (`tk_vid_v1`) e só conta o que ele é: abriu como app?, instalou?, aviso ativo?, interesses de aviso, de onde veio.
 * NUNCA nome, telefone, endereço ou o que a pessoa digitou. Quem entrou na conta manda só o TOKEN de sessão (nunca a senha); o servidor calcula o código
 * interno da conta (pushId) e a gestão passa a contar "avisos ativos por perfil/grupo". Sem o servidor 3.5 a chamada é simplesmente ignorada.
 * ==================================================================== */
const TKDisp = (function () {
  const K_ID = 'tk_vid_v1', K_ESTADO = 'tk_disp_estado_v1', K_ENV = 'tk_disp_env_v1', K_CONTA = 'tk_disp_conta_v1', S_FONTE = 'tk_fonte_v1', S_PING = 'tk_disp_ping_v1';
  const ESPERA_MIN = typeof window.TK_DISP_ESPERA_MS === 'number' ? window.TK_DISP_ESPERA_MS : 17000;   // o servidor ignora o MESMO aparelho repetido em menos de 15 s: juntamos tudo num envio só (os testes encurtam)
  const ATRASO = typeof window.TK_DISP_ATRASO_MS === 'number' ? window.TK_DISP_ATRASO_MS : 1500;          // espera juntar vários avisos (instalou + aviso ativo + conta) num envio só
  const RENOVAR = 6 * 3600 * 1000;   // sem mudança, avisa que o aparelho ainda existe no máximo de 6 em 6 horas
  let idMem = '', timer = null, ultimoEnvio = 0;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function lerJson(k) { try { const o = JSON.parse(lsGet(k) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

  function id() {
    if (idMem) return idMem;
    const g = lsGet(K_ID);
    if (g && /^[0-9a-f]{16,40}$/.test(g)) return (idMem = g);
    let hex = '';
    try { const a = new Uint8Array(12); crypto.getRandomValues(a); hex = Array.from(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    catch (e) { for (let i = 0; i < 24; i++) hex += Math.floor(Math.random() * 16).toString(16); }
    lsSet(K_ID, hex);
    return (idMem = hex);
  }
  function origem() {
    try { return (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) ? 'app' : 'site'; } catch (e) { return 'site'; }
  }
  function aparelho() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows|Macintosh|Linux|CrOS|X11/.test(ua)) return 'computador';
    return 'outro';
  }
  /** De onde a pessoa veio (uma vez por visita): endereço com ?utm_source=/?fonte=, a página anterior ou o navegador de dentro do Instagram/Facebook/TikTok. */
  function detectarFonte() {
    const ua = navigator.userAgent || '';
    let q; try { q = new URLSearchParams(location.search); } catch (e) { q = new URLSearchParams(''); }
    const marca = String(q.get('utm_source') || q.get('fonte') || '').toLowerCase() + ' ' + (q.has('igshid') ? 'instagram' : '') + ' ' + (q.has('fbclid') ? 'facebook' : '') + ' ' + (q.has('gclid') ? 'google' : '');
    let host = ''; try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch (e) {}
    const mesmoSite = !!host && host === location.hostname;
    const texto = marca + ' ' + (mesmoSite ? '' : host);
    const mapa = [['instagram', /instagram|(^|[^a-z])ig([^a-z]|$)/], ['whatsapp', /whatsapp|wa\.me|(^|[^a-z])wa([^a-z]|$)/], ['facebook', /facebook|fb\.com|(^|[^a-z])fb([^a-z]|$)/],
      ['tiktok', /tiktok|(^|[^a-z])tt([^a-z]|$)/], ['youtube', /youtube|youtu\.be/], ['google', /google/]];
    for (let i = 0; i < mapa.length; i++) if (mapa[i][1].test(texto)) return mapa[i][0];
    if (/Instagram/i.test(ua)) return 'instagram';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook';
    if (/TikTok|musical_ly/i.test(ua)) return 'tiktok';
    return (!host || mesmoSite) ? 'direto' : 'outro';
  }
  function fonte() {
    let f = ssGet(S_FONTE);
    if (!f) { f = detectarFonte(); ssSet(S_FONTE, f); }
    return f;
  }
  /** O que acompanha cada evento do catálogo (visualização, WhatsApp, visita). */
  function perfil() { return { visitante: id(), origem: origem(), dispositivo: aparelho(), fonte: fonte() }; }

  function conta() {
    const s = typeof getSessao === 'function' ? getSessao() : null;
    return s && /^tk[12]\./.test(String(s.sessao)) ? s : null;     // só token de sessão (nunca senha)
  }
  function assinatura(estado) {
    const s = conta();
    return JSON.stringify([origem(), aparelho(), estado.instalou === true, estado.pushAtivo === true ? 1 : 0,        // "nunca teve aviso" e "não disse ainda" valem o mesmo: não gasta um envio só para dizer "não"
      estado.novidades === true ? 1 : (estado.novidades === false ? 0 : -1), (estado.interesses || []).slice().sort().join(','), s ? String(s.sessao).slice(-8) : '']);
  }
  /** Conta o que mudou neste aparelho (instalou, aviso ativo, interesses, entrou/saiu da conta). Junta vários avisos num envio só e não repete o que já foi dito. */
  function registrar(extra) {
    try {
      const estado = lerJson(K_ESTADO);
      Object.keys(extra || {}).forEach(function (k) {
        if (k === 'instalou') { if (extra[k] === true) estado.instalou = true; }
        else if (k === 'pushAtivo' || k === 'novidades') { if (typeof extra[k] === 'boolean') estado[k] = extra[k]; }
        else if (k === 'interesses') { if (Array.isArray(extra[k])) estado.interesses = extra[k].map(String).slice(0, 12); }
      });
      lsSet(K_ESTADO, JSON.stringify(estado));
      const env = lerJson(K_ENV);
      if (env.sig === assinatura(estado) && Date.now() - (env.t || 0) < RENOVAR) return;      // nada mudou
      if (timer) return;
      timer = setTimeout(enviar, Math.max(ATRASO, ultimoEnvio + ESPERA_MIN - Date.now()));
    } catch (e) {}
  }
  function enviar() {
    timer = null;
    try {
      const estado = lerJson(K_ESTADO), sig = assinatura(estado), s = conta();
      const corpo = Object.assign({ action: 'dispositivo' }, perfil());
      if (estado.instalou === true) corpo.instalou = true;
      if (typeof estado.pushAtivo === 'boolean') corpo.pushAtivo = estado.pushAtivo;
      if (typeof estado.novidades === 'boolean') corpo.novidades = estado.novidades;
      if (Array.isArray(estado.interesses)) corpo.interesses = estado.interesses;
      if (s) { corpo.whatsapp = s.whatsapp; corpo.sessao = s.sessao; lsSet(K_CONTA, '1'); }
      else if (lsGet(K_CONTA) === '1') { corpo.logout = true; lsSet(K_CONTA, null); }       // saiu da conta: o servidor solta o aparelho da conta
      ultimoEnvio = Date.now();
      lsSet(K_ENV, JSON.stringify({ sig: sig, t: ultimoEnvio }));
      apiPost(corpo);
    } catch (e) {}
  }
  /** Uma vez por visita: "este aparelho existe e abriu o site/app". */
  function ping() {
    if (ssGet(S_PING)) return;
    ssSet(S_PING, '1');
    registrar({});
  }
  try {
    window.addEventListener('tk:sessao', function () { registrar({}); });
    window.addEventListener('storage', function (e) { if (e && e.key === SESSAO_CHAVE) registrar({}); });
  } catch (e) {}
  return { id: id, perfil: perfil, registrar: registrar, ping: ping, origem: origem, aparelho: aparelho, fonte: fonte };
})();
try { window.TKDisp = TKDisp; } catch (e) {}   // `const` no topo do arquivo não vira propriedade de window: push.js, pwa.js e index.html procuram por window.TKDisp
