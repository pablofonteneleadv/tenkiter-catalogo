// Verifica a fonte local da ficha e que filtros de preferência vêm dos helpers reais do catálogo.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root={Intl};root.window=root;root.TKTamanhos=require('../tamanhos-vinculados.js');root.TKTecido=require('../catalogo-tecido.js');
vm.runInNewContext(fs.readFileSync(require.resolve('../mensagens-ficha.js'),'utf8'),root);
const api=root.TKMensagensFicha;
assert.equal(api.cidades.length,185);assert.deepEqual(Array.from(api.cidades.slice(0,2)),['Crateús','Interior']);
assert.equal(new Set(api.cidades.slice(2).map(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())).size,183);
assert.match(api.cobertura,/parciais/i);assert(api.sugestoesBairrosCrateus.includes('Centro'));
const produtos=[
 {Status:'Ativo',Genero:'Feminino',Tamanhos:'M, Veste: 38, Etiqueta: G',Cores:'Azul, Preto',Descricao:'Tecido: Linho'},
 {Status:'Ativo',Genero:'Masculino',Tamanhos:'Veste: 40',Cores:'Verde',Descricao:'Linho na foto'},
 {Status:'Inativo',Genero:'Exemplo falso',Tamanhos:'XXL',Cores:'Rosa',Descricao:'Tecido: Seda'}
];
const op=api.opcoesCatalogo(produtos,root);
assert.deepEqual(Array.from(op.tamanhos),['38','40']);
assert.deepEqual(Array.from(op.generos),['Feminino','Masculino']);assert.deepEqual(Array.from(op.tecidos),['Linho']);
assert.deepEqual(Array.from(op.cores),['Azul','Preto','Verde']);
const legado=api.comoPerfil({cidade:'Crateús — Centro',tamanhos:'P · 36',preferencias:'gosta de vestidos'});
assert.equal(legado.cidade,'Crateús');assert.equal(legado.bairro,'Centro');assert.deepEqual(Array.from(legado.preferencias.tamanhos),['36','P']);
const salvo=api.comoPerfil({perfil:{cidade:'Interior',municipio:'Tamboril',localidade:'Comunidade X',preferencias:{tecidos:['Algodão']}}});
assert.equal(salvo.localidade,'Comunidade X');assert.deepEqual(Array.from(salvo.preferencias.tecidos),['Algodão']);
console.log('mensagens_ficha_ui: verificações aprovadas');
