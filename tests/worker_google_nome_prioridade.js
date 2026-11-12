/* Contrato de nomes: Ficha TENKiTER > índice Google > nome histórico de conversa.
 * Prova o SQL real do Worker em SQLite local; sem API externa ou dados de clientes.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const src = fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js'), 'utf8');
const tmp = path.join(os.tmpdir(), 'tk_google_nome_prioridade_' + process.pid + '.mjs');
fs.writeFileSync(tmp, src + '\nexport {MSG_IDENTIDADE_SQL_, MSG_NOME_SQL_};\n');
(async () => {
  let db;
  try {
    const worker = await import(pathToFileURL(tmp).href);
    db = new DatabaseSync(':memory:');
    db.exec([
      'CREATE TABLE msg_conversa(id INTEGER PRIMARY KEY,canal TEXT,contato TEXT,pessoa TEXT,nome TEXT);',
      'CREATE TABLE msg_pessoa(id TEXT PRIMARY KEY,nome TEXT);',
      'CREATE TABLE msg_pessoa_alias(canal TEXT,contato TEXT,pessoa TEXT,PRIMARY KEY(canal,contato));',
      'CREATE TABLE msg_google_nome(chave TEXT PRIMARY KEY,nome TEXT,pessoa TEXT,em TEXT);'
    ].join('\n'));
    const conv = (id, canal, contato, pessoa, nome) =>
      db.prepare('INSERT INTO msg_conversa(id,canal,contato,pessoa,nome) VALUES(?,?,?,?,?)')
        .run(id, canal, contato, pessoa, nome);
    const alias = (canal, contato, pessoa) =>
      db.prepare('INSERT INTO msg_pessoa_alias(canal,contato,pessoa) VALUES(?,?,?)').run(canal, contato, pessoa);
    const pessoa = (id, nome) =>
      db.prepare('INSERT INTO msg_pessoa(id,nome) VALUES(?,?)').run(id, nome);
    const google = (chave, nome, pessoaId) =>
      db.prepare('INSERT INTO msg_google_nome(chave,nome,pessoa,em) VALUES(?,?,?,?)')
        .run(chave, nome, pessoaId, '2026-11-12T00:00:00Z');
    const query = db.prepare('SELECT ' + worker.MSG_IDENTIDADE_SQL_ +
      ' AS identidade,' + worker.MSG_NOME_SQL_ + ' AS nome FROM msg_conversa WHERE id=?');
    const visto = id => query.get(id);
    let ok=0;
    const prova = (nome, cond, info) => {
      assert.ok(cond, nome + ': ' + JSON.stringify(info || ''));
      ok++;
      console.log('PASS: ' + nome);
    };

    pessoa('cliente-manual', 'Nome salvo na Ficha');
    conv(1,'whatsapp1','5588000000001','5588000000001','Nome antigo do WhatsApp 1');
    conv(2,'whatsapp2','5588000000002','5588000000002','Nome antigo do WhatsApp 2');
    conv(3,'instagram','ig-ficticio','ig-ficticio','Nome antigo do Instagram');
    alias('whatsapp1','5588000000001','cliente-manual');
    alias('whatsapp2','5588000000002','cliente-manual');
    alias('instagram','ig-ficticio','cliente-manual');
    google('5588000000001','Nome antigo no Google 1','5588000000001');
    google('5588000000002','Nome antigo no Google 2','5588000000002');

    for(const [id,canal] of [[1,'WhatsApp 1'],[2,'WhatsApp 2'],[3,'Instagram']]) {
      const r=visto(id);
      prova('Ficha prevalece no ' + canal + ' com identidade vinculada',
        r.identidade === 'cliente-manual' && r.nome === 'Nome salvo na Ficha',r);
    }
    pessoa('5511990000000','Ficha direta');
    conv(4,'whatsapp1','5511990000000','5511990000000','Recebido do canal');
    google('5511990000000','Nome Google divergente','5511990000000');
    prova('Ficha direta prevalece mesmo sem alias',visto(4).nome==='Ficha direta',visto(4));

    conv(5,'whatsapp2','5588999000000','5588999000000','Nome do canal');
    google('5588999000000','Nome no Google sem ficha','5588999000000');
    prova('Sem Ficha, nome Google continua disponível',visto(5).nome==='Nome no Google sem ficha',visto(5));

    conv(6,'instagram','ig-sem-vinculo','ig-sem-vinculo','Nome recebido do Instagram');
    prova('Sem Ficha e Google, preserva nome recebido',
      visto(6).nome==='Nome recebido do Instagram',visto(6));

    db.prepare('UPDATE msg_pessoa SET nome=? WHERE id=?')
      .run('Nome atualizado na Ficha','cliente-manual');
    db.prepare('UPDATE msg_google_nome SET nome=?,em=? WHERE chave=?')
      .run('Índice Google ficou com nome antigo','2026-11-12T23:00:00Z','5588000000001');
    prova('Atualização posterior do índice Google não apaga nome da Ficha',
      visto(1).nome==='Nome atualizado na Ficha' && visto(2).nome==='Nome atualizado na Ficha' &&
      visto(3).nome==='Nome atualizado na Ficha',
      [visto(1),visto(2),visto(3)]);

    pessoa('cliente-distinto','Outra Ficha');
    db.prepare('UPDATE msg_pessoa_alias SET pessoa=? WHERE canal=? AND contato=?')
      .run('cliente-distinto','whatsapp2','5588000000002');
    prova('Mudança explícita de vínculo afeta apenas o canal modificado',
      visto(2).nome==='Outra Ficha' && visto(1).nome==='Nome atualizado na Ficha' &&
      visto(3).nome==='Nome atualizado na Ficha');

    prova('Índice Google preservado, não apagado para mascarar divergência',
      db.prepare('SELECT nome FROM msg_google_nome WHERE chave=?')
        .get('5588000000001').nome === 'Índice Google ficou com nome antigo');

    console.log('PASS ficha_google_prioridade:',ok,'verificações em SQLite local');
  } catch(e) {
    console.error('FAIL ficha_google_prioridade:',e);
    process.exitCode=1;
  } finally {
    if(db) db.close();
    fs.rmSync(tmp,{force:true});
  }
})();
