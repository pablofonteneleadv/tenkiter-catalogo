/**
 * TENKiTER Modas — Configuração e funções compartilhadas
 *
 * Usado por index.html (catálogo do cliente) e admin.html (painel do atendente).
 * Se algum dia precisar trocar a URL do Apps Script, o desconto à vista,
 * ou o número de WhatsApp da loja, mude AQUI, uma vez só.
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbyWnKwT5-HB6rv-loxGUtumpWPlJsRZNYp06v5RC3wtiJDUaV9zCMJVRwOEScxwMase_Q/exec';
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
