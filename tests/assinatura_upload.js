// Contrato frontend/Apps Script. Backend privado fornecido via BACKEND_CATALOGO.
'use strict';
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const file = process.env.BACKEND_CATALOGO;
if (!file) { console.error('Informe BACKEND_CATALOGO com o arquivo privado.'); process.exit(1); }
const source = fs.readFileSync(file, 'utf8');
const code = source.slice(source.indexOf('function assinarUploadVideo_(body)'), source.indexOf('\n/**', source.indexOf('function assinarUploadVideo_(body)')));
let sequence = 0;
const ctx = { jsonResponse_: x => x, cldCredenciais_: () => ({cloudName:'test',apiKey:'test',apiSecret:'test-secret'}),
  CLOUDINARY_PASTA:'test', cldHex_: b => Buffer.from(b).toString('hex'),
  Utilities:{getUuid:()=> 'uuid-'+(++sequence), DigestAlgorithm:{SHA_1:'sha1'}, computeDigest:(a,s)=>crypto.createHash(a).update(s).digest()} };
vm.createContext(ctx); vm.runInContext(code,ctx);
for (const b of [{}, {assinaturaVersao:2,tipoRecurso:'raw'}, {assinaturaVersao:1,tipoRecurso:'video'}]) assert.equal(ctx.assinarUploadVideo_(b).ok,false);
const html=fs.readFileSync(require('path').join(__dirname,'../admin.html'),'utf8');
for (const tipoRecurso of ['image','video']) {
  const r=ctx.assinarUploadVideo_({assinaturaVersao:2,tipoRecurso,public_id:'victim',allowed_formats:'exe',folder:'other'});
  assert.equal(r.ok,true); assert.equal(r.parametros.folder,'test'); assert.equal(r.parametros.overwrite,'false');
  assert(!r.parametros.allowed_formats.includes('exe')); assert.notEqual(r.parametros.public_id,'victim');
  const signed=Object.keys(r.parametros).sort().map(k=>k+'='+r.parametros[k]).join('&');
  assert.equal(r.signature,crypto.createHash('sha1').update(signed+'test-secret').digest('hex'));
  assert.notEqual(r.parametros.public_id,ctx.assinarUploadVideo_({assinaturaVersao:2,tipoRecurso}).parametros.public_id);
}
assert(html.includes("['allowed_formats', 'public_id', 'overwrite'].forEach"));
assert(html.includes('pedirAssinaturaVideo_(tipoRecurso).then'));
console.log('PASS: contrato restrito, assinatura, anti-sobrescrita, ID único e parâmetros do frontend.');
