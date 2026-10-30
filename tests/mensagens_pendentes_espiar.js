// Regressão: abrir uma conversa pendente não deve marcar como lida nem liberar resposta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codigo = fs.readFileSync(path.join(__dirname, '..', 'admin-mensagens.js'), 'utf8');
assert.match(codigo, /a === 'abrir'[\s\S]{0,400}abrirConversa\(Number\(b\.dataset\.id\), filaAtendimento_ === 'esperando'\)/);
assert.match(codigo, /if \(espiando \|\| cacheConversa\) return;/);
assert.match(codigo, /if \(espiando \|\| !podeFerramenta_\('responder'\)\) form\.hidden = true;/);
assert.match(codigo, /a === 'atender' && aberta/);
assert.match(codigo, /'Atender', 'atender'/);
console.log('Fila pendentes: abertura em modo Espiar e atendimento explícito preservados.');
