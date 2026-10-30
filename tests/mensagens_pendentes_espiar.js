// Regressão: abrir uma conversa pendente não deve marcar como lida nem liberar resposta.
// v7.40.35: a fila virou ABA — quem decide o modo Espiar é a aba (Pendentes), não mais a
// variável filaAtendimento_. O roteiro de testes garante o comportamento; este teste
// garante que o CÓDIGO não perca o portão de leitura.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codigo = fs.readFileSync(path.join(__dirname, '..', 'admin-mensagens.js'), 'utf8');

// 1) abrir em Pendentes entra em modo espiar (a aba manda)
assert.match(
  codigo,
  /a === 'abrir'[\s\S]{0,400}abrirConversa\(Number\(b\.dataset\.id\), abaAtiva_ === 'pendentes' \|\| filaAtendimento_ === 'esperando'\)/
);

// 2) espiando: nada de marcar lida nem tocar no cache
assert.match(codigo, /if \(espiando \|\| cacheConversa\) return;/);

// 3) espiando: o compositor fica oculto (não dá para responder sem Atender)
assert.match(codigo, /if \(espiando \|\| !podeFerramenta_\('responder'\)\) form\.hidden = true;/);

// 4) o aviso de espiar em Pendentes manda tocar em Atender
assert.match(codigo, /'Pendente: você está só espiando\. Para responder, toque em Atender\.'/);

// 5) Atender existe e MOVE a conversa (assume o responsável no backend)
assert.match(codigo, /a === 'atender' && aberta/);
assert.match(codigo, /async function atenderConversa_\(id\)/);
assert.match(codigo, /worker_\('\/msg\/dono', 'POST', \{ conversa: Number\(id\), assumir: true, atender: true \}\)/);
assert.match(codigo, /botao\('ms-btn prim', 'Atender', 'atender'\)/);

// 6) as quatro abas do fluxo, na ordem
assert.match(
  codigo,
  /const ABAS = \[\['atendimento', 'Em atendimento'\], \['pendentes', 'Pendentes'\], \['todos', 'Todos'\], \['encerrados', 'Encerrados'\]\]/
);

console.log('Abas do fluxo: abertura em modo Espiar em Pendentes e atendimento explícito preservados.');
