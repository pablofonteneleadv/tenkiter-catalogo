/* Ordenação e facetas compartilhadas pelos seletores de produtos. */
(function(){'use strict';
const texto=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const tecido=p=>window.TKTecido?.ler(p)||p.Tecido||'';
const valores=(p,k)=>String(k==='Tecido'?tecido(p):p[k]||'').split(/[,;|]/).map(v=>v.trim()).filter(Boolean);
function ordenar(ps){const base=ps.slice().sort((a,b)=>(window.TKFotosNovas?.cadastroMs(b)||0)-(window.TKFotosNovas?.cadastroMs(a)||0));return window.TKFotosNovas?TKFotosNovas.ordenar(base):base;}
function casa(p,q){const t=texto([p.ID,p.Nome,p.Codigo,p.Categoria,p.Genero,p.Cores,p.Tamanhos,tecido(p)].join(' '));return texto(q).split(/\s+/).filter(Boolean).every(v=>t.includes(v));}
function filtros(host,produtos,mudar,opcoes={}){
 const d=document.createElement('details');d.style.cssText='border:1px solid #dedbd3;border-radius:12px';
 const s=document.createElement('summary');s.textContent=opcoes.precos?'Filtros · tamanho, categoria, cor, tecido e preço':'Filtros · tamanho, categoria, cor e tecido';s.style.cssText='padding:12px;cursor:pointer;min-height:44px;box-sizing:border-box;font-weight:600';d.append(s);
 const estilo='min-height:44px;min-width:0;max-width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbb8ae;border-radius:8px;background:#fff;color:#202020;font:inherit';
 const campo=rot=>{const l=document.createElement('label');l.style.cssText='display:grid;gap:4px;margin:8px';l.textContent=rot;return l;};
 const seletores=[];
 for(const [k,rot]of [['Tamanhos','Tamanho'],['Categoria','Categoria'],['Genero','Público'],['Cores','Cor ou estampa'],['Tecido','Tecido']]){
  const l=campo(rot),select=document.createElement('select');select.style.cssText=estilo;select.setAttribute('aria-label',rot);select.className=({'Categoria':'f-categoria','Genero':'f-genero'}[k]||'');select.append(new Option('Todos',''));
  [...new Set(produtos.flatMap(p=>valores(p,k)))].sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(v=>select.append(new Option(v,v)));select.onchange=mudar;l.append(select);d.append(l);seletores.push([k,select]);
 }
 const precos=[];let invalido=false;
 const numero=v=>{const t=String(v??'').trim();return t===''?null:Number(t.replace(/\s/g,'').replace(',','.'));};
 if(opcoes.precos){
  const aviso=document.createElement('p');aviso.setAttribute('role','status');aviso.style.cssText='margin:8px;color:var(--vermelho,#a32222)';
  for(const rot of ['Preço mínimo (R$)','Preço máximo (R$)']){const l=campo(rot),i=document.createElement('input');i.type='text';i.inputMode='decimal';i.placeholder='Sem limite';i.maxLength=12;i.style.cssText=estilo;i.setAttribute('aria-label',rot);l.append(i);d.append(l);precos.push(i);}
  const atualizar=()=>{const [mn,mx]=precos.map(i=>numero(i.value));invalido=[mn,mx].some(n=>n!==null&&(!Number.isFinite(n)||n<0))||(mn!==null&&mx!==null&&mn>mx);aviso.textContent=invalido?'Confira a faixa de preço: use valores positivos e mínimo menor ou igual ao máximo.':'';precos.forEach(i=>i.setAttribute('aria-invalid',String(invalido)));mudar();};
  precos.forEach(i=>i.oninput=atualizar);d.append(aviso);
 }
 host.append(d);
 return p=>{
  if(invalido||!seletores.every(([k,s])=>!s.value||valores(p,k).includes(s.value)))return false;
  if(!precos.length)return true;
  const [mn,mx]=precos.map(i=>numero(i.value));if(mn===null&&mx===null)return true;
  const valor=numero(p.Preco);return valor!==null&&Number.isFinite(valor)&&valor>0&&(mn===null||valor>=mn)&&(mx===null||valor<=mx);
 };
}
window.TKProdutosBusca={ordenar,casa,filtros,tecido};})();
