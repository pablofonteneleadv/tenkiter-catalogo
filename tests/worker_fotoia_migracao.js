// A deployed database may already carry the generic schema marker, but lack the new feature columns.
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const tmp=path.join(os.tmpdir(),'fotoia-upgrade-'+process.pid+'.mjs');
 fs.writeFileSync(tmp,fs.readFileSync(path.join(__dirname,'../instagram-worker/worker.js'),'utf8')+'\nexport {iniciar as iniciarTeste};');
 const W=await import(tmp), db=new DatabaseSync(':memory:'); let consultas=[];
 const DB={prepare(sql){let a=[];const q={bind(...x){a=x;return q},async run(){consultas.push(sql);let r=db.prepare(sql).run(...a);return{meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}},async first(){consultas.push(sql);return db.prepare(sql).get(...a)},async all(){consultas.push(sql);return{results:db.prepare(sql).all(...a)}}};return q}};
 db.exec("CREATE TABLE cfg(chave TEXT PRIMARY KEY,valor TEXT);INSERT INTO cfg VALUES('schema_ig_version','20261103-fotos-postadas-1');CREATE TABLE fotoia(id INTEGER PRIMARY KEY,status TEXT,fontes TEXT,refs TEXT DEFAULT '[]',plano TEXT DEFAULT '');INSERT INTO fotoia VALUES(7,'aprovada','[\"origem.jpg\"]','[]','{\"looks\":[]}')");
 const antes=db.prepare('SELECT * FROM fotoia').all();
 assert.throws(()=>db.prepare('SELECT id FROM fotoia WHERE request_id=?').get('fotoia-upgrade-001'),/no such column/);
 await W.iniciarTeste({DB});
 assert(db.prepare('PRAGMA table_info(fotoia)').all().some(c=>c.name==='request_id'));
 assert(db.prepare('PRAGMA index_list(fotoia)').all().some(c=>c.name==='ix_fotoia_request'&&c.unique===1));
 const depois=db.prepare('SELECT id,status,fontes,refs,plano FROM fotoia').all();assert.deepEqual(depois,antes);
 assert.equal(db.prepare('SELECT request_id FROM fotoia WHERE id=7').get().request_id,null);
 const n=consultas.length;await W.iniciarTeste({DB});assert.equal(consultas.length,n,'warm requests reuse completed initialization');
 await W.garantirEsquemaFotoIA_({DB});assert.equal(db.prepare('SELECT COUNT(*) n FROM fotoia').get().n,1);
 db.prepare('UPDATE fotoia SET request_id=? WHERE id=7').run('fotoia-upgrade-001');assert.equal(db.prepare('SELECT id FROM fotoia WHERE request_id=?').get('fotoia-upgrade-001').id,7);
 // A real database failure must not be confused with an existing column.
 const outra=new DatabaseSync(':memory:');outra.exec('CREATE TABLE fotoia(id INTEGER PRIMARY KEY)');
 const ruim={prepare(sql){return{async run(){if(sql.startsWith('ALTER'))throw Error('D1 indisponível');return{}},async all(){return{results:outra.prepare('PRAGMA table_info(fotoia)').all()}}}}};
 await assert.rejects(()=>W.garantirEsquemaFotoIA_({DB:ruim}),/D1 indisponível/);
 db.close();outra.close();fs.unlinkSync(tmp);console.log('FOTOIA MIGRACAO PASS: marcador antigo presente, coluna ausente, registros preservados, índice único, reentrada e falha de banco.');
})().catch(e=>{console.error(e);process.exitCode=1});
