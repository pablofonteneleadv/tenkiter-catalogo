#!/usr/bin/env node
'use strict';
/* Fidelidade manual: fundos do Doc e tamanho de fonte, sem regressão das caixas especiais.
 * Usa funções do site, sem rede, navegador, Drive ou dados reais.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','treinamentos.html'),'utf8');
const rich=fs.readFileSync(path.join(__dirname,'..','tm-verificado.js'),'utf8');
function trecho(t,a,b) { const i=t.indexOf(a),j=t.indexOf(b,i+a.length); assert.ok(i>=0&&j>i,'trecho '+a); return t.slice(i,j); }
const escapar=x=>String(x||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ctx={
  window:{TMV:{}}, esc:escapar,
  TMV:{preparar:bl=>bl.map(b=>b.text&&/^Dica:/.test(b.text)?{type:'aviso',kind:'tip',text:b.text}:b),
    renderBloco:b=>'<aside class="aviso aviso-tip">'+escapar(b.text)+'</aside>'},
  ricoHtml_:(t,r)=>r?'RICO:'+escapar(t):escapar(t),videoHtml_:()=>'<video></video>',
};
vm.createContext(ctx);
vm.runInContext(trecho(html,'function fundoDoc_(b)', '/** vídeo da lição'),ctx);
vm.runInContext(trecho(html,'function renderBlocks(blocks, chaveCap)', '/* ---------------- render: login'),ctx);
const blocks=[
  {type:'p',text:'COMO ESTUDAR',bold:true,bg:'#f8f1e8'},
  {type:'p',text:'Sem fundo',bold:false},
  {type:'p',text:'Dica: conferir foto',bg:'#f8f1e8'},
  {type:'bul',level:0,text:'Item com negrito',runs:[{t:'Item com negrito',b:1}],bg:'#ffffcc'},
  {type:'quote',text:'Importante',bg:'#e7f1fb'}
];
const out=ctx.renderBlocks(blocks,'teste');
assert.match(out, /background-color:#f8f1e8/);
assert.match(out, /class="p-bold fundo-doc"/);
assert.match(out, /<p class="">Sem fundo<\/p>/);
assert.match(out, /class="aviso aviso-tip"/);
assert.equal((out.match(/class="aviso aviso-tip"/g)||[]).length,1,'destaque especial mantido');
assert.match(out, /<li class="fundo-doc" style="background-color:#ffffcc/);
assert.match(out, /RICO:Item com negrito/);
assert.match(out, /<blockquote class="quote fundo-doc"/);
assert.equal(ctx.fundoDoc_({bg:'";color:red'}).sty,'','cores não confiáveis rejeitadas');
assert.match(html, /@media\(max-width:480px\)/);
assert.match(html, /manual-img-wrap\.lado-esq/);
const init=trecho(rich,'TMV.rico = function(texto, runs)', '/** Tira os primeiros');
const richCtx={
  TMV:{coresDoTema:()=>({l:'#ff0000',d:'#ffffff'})},
  HEX:/^#[0-9a-f]{6}$/i,
  E:escapar,
  quebras_:escapar,
};
vm.createContext(richCtx);
vm.runInContext(init,richCtx);
const font=richCtx.TMV.rico('Título', [{t:'Título',z:17}]);
assert.match(font, /font-size:22\.7px/);
assert.match(font, /<span style=/);
const norm=richCtx.TMV.rico('Normal', [{t:'Normal'}]);
assert.equal(norm,'Normal','texto sem estilo conserva aparência');
console.log('Fidelidade visual: fundo de parágrafo, lista rica, contraste, fonte, responsividade e destaques passaram.');
