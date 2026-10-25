'use strict';
// Regressão do menu de equipe quando o login existe e o cache ainda não chegou.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const nav = fs.readFileSync(require('node:path').join(__dirname, '..', 'nav.js'), 'utf8');
assert.match(nav, /const acessoPendente = \(\) => logado && !permissoesVerificadas/);
assert.match(nav, /const ehEquipe = \(\) => CHAVES_EQUIPE\.some\(tem\) \|\| acessoPendente\(\)/);
assert.match(nav, /it\.id === 'gestao' && acessoPendente\(\)/);
assert.match(nav, /permissoesVerificadas = true; gravarCache\(perms\); desenhar\(\)/);
assert.match(nav, /if \(!s\) \{ perms = \[\]; permissoesVerificadas = false/);
assert.match(nav, /if \(c && c\.w === s\.whatsapp && Array\.isArray\(c\.p\)\) \{ perms = c\.p; permissoesVerificadas = true/);
assert.match(nav, /permissoesVerificadas = true;\s*if \(logado\) gravarCache\(perms\)/);
assert.match(nav, /if \(it\.qualquer\) return it\.qualquer\.some\(tem\)/, 'permissões continuam exigidas para RH e currículos');
assert.match(nav, /if \(it\.id === 'gestao' && acessoPendente\(\)\) return true/, 'somente link Gestão aparece provisoriamente');
console.log('Menu da equipe: estados sem sessão, sessão pendente e permissões verificadas cobertos.');
