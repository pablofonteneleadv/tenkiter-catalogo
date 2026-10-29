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
  function etiquetasDaEntrada(etiquetas) {
    return unico(Array.isArray(etiquetas) || etiquetas instanceof Set ? Array.from(etiquetas) : String(etiquetas || '').split('/').map(v => v.trim()));
  }
  function gravar(anterior, etiquetas, faixas, infantil) {
    const d = ler(anterior);
    const letras = etiquetasDaEntrada(etiquetas);
    const vinculando = Boolean(letras.length || d.etiqueta);
    const antigos = vinculando
      ? d.antigos.filter(t => !ETIQUETAS.has(t.toLocaleUpperCase('pt-BR')) && !/^Juv\\d+$/i.test(t))
      : d.antigos;
    const prefixo = infantil ? 'Idade: ' : 'Veste: ';
    return unico([
      ...antigos,
      ...letras,
      ...(letras.length ? ['Etiqueta: ' + letras.join('/')] : []),
      ...unico(Array.from(faixas || [])).map(v => prefixo + v)
    ]).join(', ');
  }
  function resumir(valores, tipo) {
    const nums = unico(valores).map(v => {
      const txt = String(v).trim();
      const ano = txt.match(/^(\d+)\s+anos?$/i);
      if (tipo === 'idade') return ano ? Number(ano[1]) : null;
      return /^\\d+$/.test(txt) ? Number(txt) : null;
    });
    if (!nums.length || nums.some(n => n === null)) return unico(valores).join('/');
    const ordenados = [...new Set(nums)].sort((a,b)=>a-b);
    const incremento = tipo === 'idade' ? 1 : 2;
    const continuo = ordenados.every((n,i)=> i===0 || n-ordenados[i-1]===incremento);
    return continuo && ordenados.length>1
      ? ordenados[0] + (tipo==='idade'?' a ':' ao ') + ordenados.at(-1) + (tipo==='idade'?' anos':'')
      : ordenados.join('/') + (tipo==='idade'?' anos':'');
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
  return Object.freeze({ ler, gravar, cliente, resumir, etiquetasDaEntrada });
});
