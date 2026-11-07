/* Acessos compartilhados: planilha simulada, sem conexões reais. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
// Reutiliza o mesmo dublê de Apps Script da regressão de acessos, antes dos cenários.
const harness=fs.readFileSync(path.join(__dirname,'backend_func.js'),'utf8').split("console.log('\\n[vários perfis]');")[0];
const cenarios=String.raw`
run('exigirPerm_=function(){return {ok:true,usuario:{name:"Admin Um",whatsapp:"85991047615"}}};');
function call(data){ctx.__data=data;run('memoriaPessoasLimpar_()');return JSON.parse(run('acModelosAcao_(__data,__data.excluir===true)').getContent());}
function model(nome){return run('acModelosLista_()').modelos.find(x=>x.nome===nome);}
function rev(){return run('acPerfis_().revisao');}
let r=call({nome:'Fotografia',desc:'Equipe de imagens',permissoes:['cliente','catalogo_admin','esteira','postador'],revisao:0});
ok(r.ok&&model('Fotografia').permissoes.esteira,'cria acesso com ferramentas de áreas distintas',r);
definir('85993333333',['Fotografia'],EU);
ok(permsDe('85993333333').esteira,'atribuir o acesso concede Esteira');
ctx.__q=EU;run('acessosDefinirPermissaoSemTrava_("85993333333","postador",false,__q)');
r=call({original:'Fotografia',nome:'Produção',desc:'Rodízio',permissoes:['cliente','catalogo_admin','esteira','postador','fotoia'],revisao:rev()});
ok(r.ok&&perfilDe('85993333333').perfil.includes('Produção')&&!perfilDe('85993333333').perfil.includes('Fotografia'),'renomear atualiza vínculos sem apagar pessoas',r);
ok(permsDe('85993333333').fotoia&&!permsDe('85993333333').postador,'herda ferramenta nova e preserva exceção individual negativa');
ok(!model('Fotografia')&&model('Produção'),'nome anterior não reaparece');
r=call({original:'Produção',nome:'Produção',permissoes:['cliente'],revisao:rev()});
ok(r.ok&&!permsDe('85993333333').esteira,'revogar no acesso revoga em quem o usa');
r=call({original:'Produção',nome:'Produção',permissoes:['cliente','esteira'],revisao:0});
ok(!r.ok&&r.conflito&&!permsDe('85993333333').esteira,'revisão antiga não sobrescreve outra sessão');
r=call({original:'Produção',excluir:true,revisao:rev()});
ok(!r.ok&&model('Produção'),'exclusão com pessoas exige substituto');
r=call({original:'Produção',excluir:true,substituirPor:'Admin total',revisao:rev()});
ok(!r.ok,'excluir acesso não pode promover pessoas a Admin total');
r=call({original:'Produção',excluir:true,substituirPor:'Cliente',revisao:rev()});
ok(r.ok&&perfilDe('85993333333').perfil==='Cliente'&&!model('Produção'),'exclusão troca vínculos e retira definição',r);
r=call({original:'Cliente',nome:'Outra coisa',permissoes:['cliente'],revisao:rev()});ok(!r.ok,'Cliente é protegido');
r=call({original:'Admin total',excluir:true,revisao:rev()});ok(!r.ok,'Admin total é protegido');
r=call({nome:'Escalada',permissoes:['cliente','gerir_acessos'],revisao:rev()});ok(!r.ok,'modelo personalizado não concede administração total');
r=call({nome:'Inválido',permissoes:['cliente','msg_responder'],revisao:rev()});ok(!r.ok,'ferramenta exige acesso ao Mensageiro');
r=call({nome:'=IMPORTXML()',permissoes:['cliente'],revisao:rev()});ok(!r.ok,'recusa fórmula no nome');
ok(!model('Admin total').permissoes.esteira,'Admin total não entra no rodízio por ser administrador');
definir('85993333333',['Esteira'],EU);
run('var __realVerificar=acVerificar_;acVerificar_=function(){return {ok:true,usuario:{permissoes:["gerir_acessos"]}}};');
let equipe=run('acEsteiraEquipe_({whatsapp:"85991047615",sessao:"fake"})');
ok(equipe.ok&&equipe.equipe.length===1&&equipe.equipe[0].whats==='85993333333','rodízio recebe somente pessoas com Esteira ativa',equipe);
if(run('AC_PERMISSOES.some(function(p){return p.chave==="esteira_arquivar_fotos"})')){
  ok(!permsDe('85993333333').esteira_arquivar_fotos,'arquivar fotos próprias não é concedido por padrão');
  r=call({nome:'Arquivo inválido',permissoes:['cliente','esteira_arquivar_fotos'],revisao:rev()});ok(!r.ok,'arquivar exige acesso à Esteira');
  r=call({nome:'Fotos com arquivo',permissoes:['cliente','esteira','esteira_arquivar_fotos'],revisao:rev()});ok(r.ok,'permissão de arquivo pode ser definida no modelo');
  definir('85993333333',['Fotos com arquivo'],EU);ok(permsDe('85993333333').esteira_arquivar_fotos,'modelo concede arquivo próprio explicitamente');
  equipe=run('acEsteiraEquipe_({whatsapp:"85991047615",sessao:"fake"})');ok(equipe.equipe[0].arquivarFotos===1,'equipe transporta permissão de arquivo');
  definir('85993333333',['Esteira'],EU);ok(!permsDe('85993333333').esteira_arquivar_fotos,'retirar modelo revoga arquivo sem retirar Esteira');
}
aba.d[3][4]='Inativo';run('memoriaPessoasLimpar_()');
equipe=run('acEsteiraEquipe_({whatsapp:"85991047615",sessao:"fake"})');ok(equipe.equipe.length===0,'pessoa inativa sai do rodízio');
run('exigirPerm_=function(){return {ok:false,erro:"Sem permissão"}};');
r=call({nome:'Intruso',permissoes:['cliente'],revisao:rev()});ok(!r.ok&&!model('Intruso'),'servidor impede edição sem gerir_acessos');
console.log('FALHAS='+falhas.length);process.exit(falhas.length?1:0);
`;
vm.runInThisContext('(function(require,__dirname){'+harness.replace(/^#![^\n]*\n/,'')+cenarios+'})',{filename:__filename})(require,__dirname);
