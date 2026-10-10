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
const WHATSAPP_NUMERO = '5588993223998';

// Notificações push (OneSignal). App ID é público (não é segredo) — pegue em
// onesignal.com → seu app → Settings → Keys & IDs → "OneSignal App ID" e cole aqui.
// A REST API Key é SEGREDA e NUNCA vai aqui — ela fica só no Apps Script
// (Extensões > Propriedades do Script > ONESIGNAL_REST_API_KEY).
const ONESIGNAL_APP_ID = '535f6b0d-c866-43c2-b241-43bd7ab62fae';

/** Link público da peça no SITE (nunca a API_URL). ?c=<código> é curto; sem código usa ?id=. Um lugar só: se um dia
 *  existir uma rota com miniatura por produto, é só trocar aqui. */
function linkProduto(p) {
  const cod = p && (p.Codigo || p.codigo);
  return SITE_URL + (cod ? ('?c=' + encodeURIComponent(cod)) : ('?id=' + encodeURIComponent(p.ID != null ? p.ID : p.id)));
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
}

function limparSessao() {
  try { localStorage.removeItem(SESSAO_CHAVE); } catch (e) {}
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

/** Pergunta a versão ao backend. null = sem rede; {} = backend antigo (sem contas). */
async function versaoServidor() {
  try {
    const resp = await fetch(API_URL + '?action=versao');
    const j = await resp.json();
    return j && j.ok ? j : {};
  } catch (e) {
    return null;
  }
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
  if (typeof salvarContaClienteDepois === 'function') salvarContaClienteDepois();
}

function estaNaSacola(id) {
  return getSacola().includes(String(id));
}

function adicionarNaSacola(id) {
  const atuais = getSacola();
  const idStr = String(id);
  if (!atuais.includes(idStr)) {
    atuais.push(idStr);
    salvarSacola(atuais);
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
