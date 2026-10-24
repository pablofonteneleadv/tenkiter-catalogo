/* TENKiTER — tamanho da etiqueta separado da idade/numeração que veste.
 * Compatível com produtos antigos: não exige nova coluna nem migração na planilha.
 * Uso no navegador: window.TKTamanhos. Uso em testes: require('./tamanhos-vinculados.js').
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TKTamanhos = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const ETIQUETAS = new Set(['PP', 'P', 'M', 'G', 'GG', 'G1', 'G2', 'G3', 'ÚNICO', 'UNICO']);
  const PADRAO = /^(?:Consultar tamanhos disponíveis)$/i;

  function unico(itens) {
    return Array.from(new Set(itens.map(v => String(v).trim()).filter(Boolean)));
  }
  function ler(valor) {
    const dados = { etiqueta: '', idades: [], numeros: [], antigos: [] };
    String(valor || '').split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
      const m = tag.match(/^(Etiqueta|Idade|Veste):\s*(.+)$/i);
      if (!m) {
        if (!PADRAO.test(tag)) dados.antigos.push(tag);
      } else if (/^etiqueta$/i.test(m[1])) {
        dados.etiqueta = m[2].trim();
      } else if (/^idade$/i.test(m[1])) {
        dados.idades.push(m[2].trim());
      } else {
        dados.numeros.push(m[2].trim());
      }
    });
    dados.idades = unico(dados.idades);
    dados.numeros = unico(dados.numeros);
    dados.antigos = unico(dados.antigos);
    return dados;
  }
  function gravar(anterior, etiqueta, faixas, infantil) {
    const d = ler(anterior);
    const letra = String(etiqueta || '').trim();
    const vinculando = Boolean(letra || d.etiqueta);
    const antigos = vinculando
      ? d.antigos.filter(t => !ETIQUETAS.has(t.toLocaleUpperCase('pt-BR')))
      : d.antigos;
    const prefixo = infantil ? 'Idade: ' : 'Veste: ';
    return unico([
      ...antigos,
      ...(letra ? [letra, 'Etiqueta: ' + letra] : []),
      ...unico(Array.from(faixas || [])).map(v => prefixo + v)
    ]).join(', ');
  }
  function cliente(valor, genero) {
    const d = ler(valor);
    if (d.idades.length) return { tipo: 'idade', titulo: 'Idades', valores: d.idades };
    if (d.numeros.length) return { tipo: 'numero', titulo: 'Numerações', valores: d.numeros };
    const publicoInfantil = /(?:Infantil|Baby)(?:\s+|,)/i.test(String(genero || ''));
    const valores = unico(d.antigos.length ? d.antigos : (d.etiqueta ? [d.etiqueta] : []))
      .filter(t => !publicoInfantil || !ETIQUETAS.has(t.toLocaleUpperCase('pt-BR')));
    return { tipo: 'legado', titulo: 'Tamanhos', valores };
  }
  return Object.freeze({ ler, gravar, cliente });
});
