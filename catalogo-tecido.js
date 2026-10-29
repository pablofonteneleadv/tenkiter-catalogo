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

  function lerBruto(produto) {
    if (!produto || typeof produto !== 'object') return '';
    if (Object.prototype.hasOwnProperty.call(produto, 'Tecido')) {
      return normalizarTecido(produto.Tecido);
    }
    var descricao = String(produto.Descricao == null ? '' : produto.Descricao);
    var achado = /^[\t ]*Tecido:[\t ]*([^\r\n]*)/im.exec(descricao);
    return achado ? normalizarTecido(achado[1]) : '';
  }

  var cadastro={versao:0,itens:[]}, carregando=null;
  var chave=function(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();};
  function resolver(v){var k=chave(v),it=cadastro.itens.find(function(x){return [x.nome].concat(x.apelidos||[]).some(function(a){return chave(a)===k;});});return it?it.nome:normalizarTecido(v);}
  function ler(p){return resolver(lerBruto(p));}
  function aplicar(c){if(!c||!Array.isArray(c.itens))return;var mudou=JSON.stringify(cadastro)!==JSON.stringify({versao:c.versao||0,itens:c.itens});cadastro={versao:c.versao||0,itens:c.itens};if(mudou&&root.dispatchEvent)root.dispatchEvent(new CustomEvent('tk:tecidos-atualizados'));}
  function endpoint(){return typeof INSTAGRAM_URL==='string'?INSTAGRAM_URL+'/catalogo/tecidos':'';}
  async function carregar(forcar){
    if(carregando&&!forcar)return carregando;
    if(!endpoint()||typeof fetch!=='function')return cadastro;
    carregando=(async function(){var r=await fetch(endpoint(),{signal:AbortSignal.timeout(8000)});var c=await r.json();if(!r.ok||!c.ok)throw new Error(c.erro||'Não foi possível carregar os tecidos.');aplicar(c);return cadastro;})();
    try{return await carregando;}catch(e){throw new Error('Não foi possível carregar os tecidos. Tente novamente.');}finally{carregando=null;}
  }
  function opcoes(produtos){var nomes=cadastro.itens.map(function(x){return x.nome;}).concat((produtos||[]).map(ler)).filter(Boolean);return [...new Set(nomes)].sort(function(a,b){return a.localeCompare(b,'pt-BR');});}
  async function salvar(de,nome){
    await carregar(true);
    var sess=typeof getSessao==='function'&&getSessao();if(!sess)throw new Error('Entre na sua conta de administrador.');
    var r;try{r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json','X-TK-Whats':sess.whatsapp,'X-TK-Sessao':sess.sessao},body:JSON.stringify({de:de||'',nome:nome,versao:cadastro.versao}),signal:AbortSignal.timeout(15000)});}catch(e){throw new Error('Sem conexão para salvar o tecido. Tente novamente.');}var c=await r.json().catch(function(){return {ok:false,erro:'Não foi possível ler a resposta. Tente novamente.'};});
    if(!r.ok||!c.ok)throw new Error(c.erro||'Não foi possível salvar o tecido.');aplicar(c);return cadastro;
  }
  function serializar(descricao, tecido) {
    var corpo = semDescricao(descricao)
      .replace(/(?:\r\n|\n|\r)+$/, '')
      .trim();
    var valor = resolver(normalizarTecido(tecido));
    if (!valor) return corpo;
    return (corpo ? corpo + '\n' : '') + 'Tecido: ' + valor;
  }

  var api = { ler: ler, semDescricao: semDescricao, serializar: serializar, resolver:resolver, carregar:carregar, salvar:salvar, opcoes:opcoes, aplicar:aplicar };
  root.TKTecido = api;
  if(root.document)carregar().catch(function(){/* cadastro continua utilizável com os nomes gravados nas peças */});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
