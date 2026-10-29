/*
 * Compatibilidade com o Catálogo Apps Script 4.28:
 * o campo Tecido fica serializado como uma linha própria em Descricao,
 * formato que create/update já persistem sem publicar uma nova versão do backend.
 */
(function (root) {
  'use strict';

  var PREFIXO_TECIDO = /^[\t ]*Tecido:[\t ]*[^\r\n]*(?:\r\n|\n|\r|$)/gim;
  var ROTULO_TECIDO = /^[\t ]*Tecido[\t ]*:[\t ]*/i;

  function normalizarTecido(valor) {
    return String(valor == null ? '' : valor)
      .replace(/[\r\n\t\f\v]+/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, ' ')
      .replace(ROTULO_TECIDO, '')
      .trim()
      .slice(0, 100)
      .trim();
  }

  function semDescricao(texto) {
    return String(texto == null ? '' : texto)
      .replace(PREFIXO_TECIDO, '')
      .replace(/(?:\r\n|\n|\r)+$/, '');
  }

  function ler(produto) {
    if (!produto || typeof produto !== 'object') return '';
    if (Object.prototype.hasOwnProperty.call(produto, 'Tecido')) {
      return normalizarTecido(produto.Tecido);
    }
    var descricao = String(produto.Descricao == null ? '' : produto.Descricao);
    var achado = /^[\t ]*Tecido:[\t ]*([^\r\n]*)/im.exec(descricao);
    return achado ? normalizarTecido(achado[1]) : '';
  }

  function serializar(descricao, tecido) {
    var corpo = semDescricao(descricao)
      .replace(/(?:\r\n|\n|\r)+$/, '')
      .trim();
    var valor = normalizarTecido(tecido);
    if (!valor) return corpo;
    return (corpo ? corpo + '\n' : '') + 'Tecido: ' + valor;
  }

  var api = { ler: ler, semDescricao: semDescricao, serializar: serializar };
  root.TKTecido = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
