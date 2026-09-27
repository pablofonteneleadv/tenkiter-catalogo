/**
 * TENKiTER Modas — Configuração e funções compartilhadas
 *
 * Usado por index.html (catálogo do cliente) e admin.html (painel do atendente).
 * Se algum dia precisar trocar a URL do Apps Script, o desconto à vista,
 * ou o número de WhatsApp da loja, mude AQUI, uma vez só.
 */

const API_URL_PADRAO = 'https://script.google.com/macros/s/AKfycbyWnKwT5-HB6rv-loxGUtumpWPlJsRZNYp06v5RC3wtiJDUaV9zCMJVRwOEScxwMase_Q/exec';
let API_URL = localStorage.getItem('tenkiter_api_url_override') || API_URL_PADRAO;
const DESCONTO_AVISTA = 0.10; // 10% de desconto no pagamento à vista
const WHATSAPP_NUMERO = '5588993223998';

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

/* ===================== Fila offline (retry de ações do admin quando a internet cai) ===================== */

function getFilaOffline() {
  try {
    return JSON.parse(localStorage.getItem('tenkiter_fila_offline') || '[]');
  } catch (e) {
    return [];
  }
}

function salvarFilaOffline(lista) {
  localStorage.setItem('tenkiter_fila_offline', JSON.stringify(lista));
}

function enfileirarAcaoOffline(corpo) {
  const fila = getFilaOffline();
  fila.push({ corpo: corpo, criadoEm: new Date().toISOString() });
  salvarFilaOffline(fila);
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
async function sincronizarFilaOffline() {
  const fila = getFilaOffline();
  let enviados = 0;
  while (fila.length > 0) {
    const item = fila[0];
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item.corpo)
      }).then(r => r.json());
      fila.shift();
      enviados++;
      salvarFilaOffline(fila);
    } catch (e) {
      break;
    }
  }
  return { enviados: enviados, restantes: fila.length };
}
