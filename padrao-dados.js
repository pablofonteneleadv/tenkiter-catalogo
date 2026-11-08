/* ====================================================================
 * TENKiTER — padrao-dados.js (v7.57.0) — regras de TEXTO e DADO que valem para o site inteiro, num lugar só.
 * Fica FORA do common.js (o aplicativo Android embute o common.js). Carregue DEPOIS do common.js.
 *   TKPadrao.erro(x, padrao)         frase em português para qualquer erro (resposta do servidor, Error, texto). Nunca JSON, nunca "HTTP 413".
 *   TKPadrao.fotos(p, aceita?)       lista de fotos de uma peça: capa + galeria, sem repetidas, só endereços http(s)
 *   TKPadrao.contarFotos(p)          quantas fotos a peça tem (mesma regra da lista acima)
 *   TKPadrao.telefone(v)             "(88) 99999-0000"; tira o 55 do Brasil; número de fora vira "+..."
 *   TKPadrao.dataHora(v, estilo)     data/hora no relógio de Fortaleza (UTC-3), seja qual for o fuso do aparelho
 *                                    estilos: 'curta' (07/11 14:30), 'completa' (07/11/2026 14:30), 'data' (07/11/2026), 'hora' (14:30)
 *   TKPadrao.descontoTxt()           "10%" a partir de DESCONTO_AVISTA (common.js)
 *   TKPadrao.plural(n, um, varios)   "1 peça" / "3 peças"
 * Para travar no CI: nenhuma tela deve montar essas coisas à mão (tests/padrao_dados.py confere).
 * ==================================================================== */
(function (root) {
  'use strict';
  var FUSO = 'America/Fortaleza';

  /** Frase de erro em português. Aceita a resposta do servidor ({erro}), um Error, um texto ou nada. */
  function erro(x, padrao) {
    var base = padrao || 'Não foi possível agora. Tente de novo.';
    var t = '';
    if (x && typeof x === 'object') {
      if (x.semRede) return 'Sem conexão agora. Tente de novo.';
      t = x.erro != null ? x.erro : (x.message != null ? x.message : '');
      if (t && typeof t === 'object') t = t.erro || t.message || '';
    } else if (x != null) t = x;
    t = String(t == null ? '' : t).trim();
    if (!t) return base;
    if (/failed to fetch|networkerror|load failed|network request failed|err_internet|the internet connection/i.test(t)) return 'Sem conexão agora. Tente de novo.';
    if (/payload too large|request entity too large|\b413\b/i.test(t)) return 'O arquivo é grande demais. Escolha um menor e tente de novo.';
    if (/timeout|timed out|\babort/i.test(t) && !/[áéíóúãõç]/i.test(t)) return 'Demorou demais para responder. Tente de novo.';
    // JSON, HTML, código HTTP ou texto técnico em inglês nunca aparecem para a pessoa
    if (/^[\s]*[\[{<]/.test(t) || /\bHTTP\s*\d{3}\b|^\d{3}$|\b[45]\d\d\b.*(error|erro)|exception|typeerror|syntaxerror|undefined|\bnull\b|stack|put failed|internal server/i.test(t)) return base;
    if (/^[\x00-\x7f]+$/.test(t) && /\b(failed|error|invalid|denied|forbidden|unauthorized|not found|bad request|unexpected)\b/i.test(t)) return base;
    return t;
  }

  /** Fotos da peça: capa + galeria, sem repetidas, só http(s) (ou o que `aceita` deixar passar). */
  function fotos(p, aceita) {
    var ok = typeof aceita === 'function' ? aceita : function (u) { return /^https?:\/\//i.test(u); };
    var v = [];
    [p && p.Foto_URL].concat(String((p && p.Fotos_Galeria) || '').split(',')).forEach(function (u) {
      u = String(u == null ? '' : u).trim();
      if (u && ok(u) && v.indexOf(u) === -1) v.push(u);
    });
    return v;
  }
  function contarFotos(p) { return fotos(p).length; }

  /** Telefone para a tela: nunca mostra o 55 cru. Usa formatarTelefone do common.js para números do Brasil. */
  function telefone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (!d) return '';
    if (/^\s*\+/.test(String(v)) && !/^\s*\+\s*55/.test(String(v))) return '+' + d;   // número de fora, escrito com +
    var br = d;
    if (/^55\d{10,11}$/.test(d)) br = d.slice(2);
    if (/^\d{10,11}$/.test(br)) {
      if (typeof formatarTelefone === 'function') return formatarTelefone(br);
      return br.length === 11 ? '(' + br.slice(0, 2) + ') ' + br.slice(2, 7) + '-' + br.slice(7) : '(' + br.slice(0, 2) + ') ' + br.slice(2, 6) + '-' + br.slice(6);
    }
    return d.length >= 12 ? '+' + d : d;
  }

  /** Data/hora no relógio de Fortaleza. Aceita ISO, "dd/mm/aaaa hh:mm", milissegundos ou Date. */
  function paraData(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{2}):(\d{2}))?/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], (+m[4] || 0) + 3, +m[5] || 0));   // texto da planilha já é horário de Fortaleza
    return new Date(s);
  }
  function dataHora(v, estilo) {
    var d = paraData(v);
    if (!d || isNaN(d.getTime())) return '';
    var op = { timeZone: FUSO };
    if (estilo === 'hora') Object.assign(op, { hour: '2-digit', minute: '2-digit' });
    else if (estilo === 'data') Object.assign(op, { day: '2-digit', month: '2-digit', year: 'numeric' });
    else if (estilo === 'completa') Object.assign(op, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    else Object.assign(op, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('pt-BR', op).replace(',', '');
  }

  function descontoTxt() { var d = typeof DESCONTO_AVISTA === 'number' ? DESCONTO_AVISTA : 0.1; return Math.round(d * 100) + '%'; }
  function plural(n, um, varios) { return n === 1 ? um : varios; }

  /** Troca o "10%" escrito no HTML pelo valor de DESCONTO_AVISTA (marque o trecho com data-desconto-avista). */
  function aplicarDesconto(raiz) {
    if (typeof document === 'undefined') return;
    var t = descontoTxt();
    Array.prototype.forEach.call((raiz || document).querySelectorAll('[data-desconto-avista]'), function (n) { n.textContent = t; });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { aplicarDesconto(); });
    else aplicarDesconto();
  }

  root.TKPadrao = { aplicarDesconto: aplicarDesconto, erro: erro, fotos: fotos, contarFotos: contarFotos, telefone: telefone, dataHora: dataHora, paraData: paraData, descontoTxt: descontoTxt, plural: plural, FUSO: FUSO };
})(typeof window !== 'undefined' ? window : globalThis);
