// Worker `tenkiter-ig` — IMPORTADOR DO INSTAGRAM: tudo que a loja posta vira RASCUNHO de produto para o Pablo aceitar. Só LÊ o Instagram (nunca posta).
//
//  • Cron a cada 30 min (e o botão "Buscar agora") consulta feed, carrossel, Reel e Story e copia cada mídia NA HORA para o R2 (a URL do Instagram expira; Story some em 24 h).
//  • Idempotente: a chave única é o id da mídia do Instagram. Rodar duas vezes nunca duplica.
//  • Agrupa: carrossel = 1 rascunho com todas as fotos/vídeos; Reel/foto = 1 rascunho; Story entra em "Sem identificação".
//  • Sugestões SEM IA (Fase 1): preço e tamanhos lidos da legenda, e "provável duplicado" quando a legenda traz o código TK-####.
//  • Nada entra no catálogo sem o aceite: o painel abre o cadastro normal já preenchido (mesmo caminho de sempre: código TK, categoria, SEO).
//  • As mídias ficam no MESMO bucket do Worker `tenkiter-midia` (mesmo padrão de nome), então o catálogo já sabe exibi-las. Respeita o mesmo teto de armazenamento.
// Auth das rotas: a mesma do painel (ação `sessao` do Apps Script) e SÓ Admin total (`gerir_acessos`). O token do Instagram fica no D1, nunca volta à tela nem aos logs.
// Bindings: DB (D1), MIDIA (R2), CACHE (KV), API_URL, MIDIA_URL, [IG_BASE], [LIMITE_BYTES], [ORIGENS].

/* ==========================================================================
 * v1.3 -- CANAL "AMBOS" PUBLICA NOS DOIS (16/10/2026)
 *
 *  SINTOMA: escolhendo "Ambos", a peça ia só para o Instagram (o WhatsApp nunca era chamado).
 *  CORRECAO: em "ambos" o Status do WhatsApp é enviado ANTES do Instagram. Se o WhatsApp falhar, a peça
 *  vai para erro e o Instagram não é publicado. Se já foi enviada ao WhatsApp numa tentativa anterior,
 *  não é reenviada (marcador zap:<requestId> em ig_id; requestId estável = idempotente na Wafly).
 *  Também: o limite diário do Instagram passa a contar as peças em "ambos".
 *
 * v1.2 (base) -- CANAL DE POSTAGEM: O CAMPO `canal` PASSA A SER RESPEITADO (16/10/2026)
 *
 *  SINTOMA: escolhendo "somente WhatsApp" no seletor da tela de Postagens, a
 *  peca era publicada no INSTAGRAM -- tanto na fila quanto na publicacao real.
 *
 *  CAUSA RAIZ: este Worker (e so ele) e quem publica. O campo `canal` chegava
 *  no corpo do POST /post, mas NAO existia em lugar nenhum do Worker: nao havia
 *  coluna na tabela `postagem`, nao era lido em validarPostagem(), nao era
 *  gravado no INSERT e o processador da fila (avancarPostagem) nem sabia que o
 *  campo existia -- publicava no Instagram sempre. O commit do frontend
 *  (feat/postagem-multicanal-wafly, "sem deploy") entregou o seletor e o campo
 *  no payload, mas nunca publicou este Worker.
 *
 *  CORRECAO: coluna `canal` na tabela (+migracao para o banco que ja existe),
 *  normalizacao/validacao do valor, gravacao no INSERT e leitura de volta pelo
 *  processador. Com canal que NAO usa Instagram, as chamadas ao Graph sao
 *  PULADAS e a peca vai para o Status do WhatsApp pela ponte waflyStatusRemoto
 *  (backend + modulo Wafly), com requestId estavel = idempotente.
 * ========================================================================== */

/* ==========================================================================
 * v1.1 -- SESSAO COMPARTILHADA E 401 x 403 (16/10/2026)
 *
 *  - Este Worker passa a aceitar o token `tk3`, o MESMO emitido pelo Apps
 *    Script. Antes o teste era /^tk[12]\./ e o `tk3` era recusado ANTES de
 *    qualquer consulta ao backend -- o painel do Instagram mostrava
 *    "Sem conexao agora. Tente de novo." mesmo com o Worker no ar e o CORS
 *    correto. Era exatamente o sintoma relatado pela loja.
 *  - 401 x 403 separados: sem cabecalho X-TK-Whats/X-TK-Sessao (ou token que o
 *    backend nao reconhece) = 401 "Entre na sua conta"; sessao valida porem sem
 *    a permissao exigida = 403 "Sem permissao". Antes os dois viravam 401 e a
 *    tela nao sabia distinguir "faca login" de "voce nao tem permissao".
 *  - Backend fora do ar nao vira mais 401 (que mandava a pessoa relogar por
 *    nada): vira 503 "Nao consegui confirmar sua sessao agora".
 * ========================================================================== */

/* Origens que podem falar com este Worker (CORS). O painel (admin.html) e servido
 * de mais de um endereco: o site de producao, o endereco direto do Render e a
 * copia do repositorio no GitHub Pages. Se a origem de onde o painel abriu nao
 * estiver aqui, o navegador bloqueia a resposta e a tela mostra
 * "Sem conexao agora. Tente de novo." — foi uma regressao real. */
const ORIGENS_PADRAO = ['https://tenkitermodas.com.br', 'https://www.tenkitermodas.com.br', 'https://tenkiter-catalogo.onrender.com', 'https://pablofonteneleadv.github.io'];
const UA = 'Mozilla/5.0 (compatible; tenkiter-ig/1.1)';
const IG_BASE_PADRAO = 'https://graph.instagram.com/v23.0';
const CAMPOS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';
const MAX_PAGINAS = 8;                    // páginas do feed lidas por chamada da importação total (limite de subrequisições)
const MAX_POR_CICLO = 10;                 // mídias copiadas por execução (limite de subrequisições); o resto fica para o próximo ciclo
const MAX_BYTES_MIDIA = 60 * 1024 * 1024;
const LIMITE_PADRAO = 9.5 * 1024 * 1024 * 1024;
const GRUPOS = ['pendente', 'sem_id', 'duplicado', 'nao_produto'];

const DDL = [
  `CREATE TABLE IF NOT EXISTS ig_midia (id TEXT PRIMARY KEY, tipo TEXT, produto_tipo TEXT, legenda TEXT, permalink TEXT, publicado_em TEXT, pai_id TEXT, chave TEXT, chave_mini TEXT, bytes INTEGER DEFAULT 0, status TEXT DEFAULT 'nova', expirou_em TEXT, criado_em TEXT)`,
  `CREATE TABLE IF NOT EXISTS rascunho (id INTEGER PRIMARY KEY AUTOINCREMENT, grupo TEXT NOT NULL DEFAULT 'pendente', status TEXT NOT NULL DEFAULT 'pendente', origem TEXT, legenda TEXT, permalink TEXT, publicado_em TEXT, preco_sug TEXT, tamanhos_sug TEXT, codigo_dup TEXT, produto_id TEXT, descartado_em TEXT, criado_em TEXT, atualizado_em TEXT)`,
  `CREATE TABLE IF NOT EXISTS rascunho_midia (rascunho_id INTEGER NOT NULL, midia_id TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0, capa INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (rascunho_id, midia_id))`,
  `CREATE TABLE IF NOT EXISTS exec_log (id INTEGER PRIMARY KEY AUTOINCREMENT, inicio TEXT, fim TEXT, novas INTEGER DEFAULT 0, erro TEXT, origem TEXT)`,
  `CREATE TABLE IF NOT EXISTS cfg (chave TEXT PRIMARY KEY, valor TEXT)`,
  `CREATE TABLE IF NOT EXISTS postagem (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, modo TEXT NOT NULL DEFAULT 'auto', legenda TEXT DEFAULT '', midias TEXT NOT NULL DEFAULT '[]', produto TEXT DEFAULT '', template TEXT DEFAULT '', link TEXT DEFAULT '', agendado_em TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'agendado', containers TEXT DEFAULT '', inicio_proc TEXT DEFAULT '', tentativas INTEGER DEFAULT 0, erro TEXT DEFAULT '', ig_id TEXT DEFAULT '', permalink TEXT DEFAULT '', criado_por TEXT DEFAULT '', criado_em TEXT, atualizado_em TEXT, publicado_em TEXT DEFAULT '', grupo TEXT DEFAULT '', canal TEXT NOT NULL DEFAULT 'instagram')`,
  `CREATE TABLE IF NOT EXISTS foto_cliente (id INTEGER PRIMARY KEY AUTOINCREMENT, origem TEXT NOT NULL DEFAULT 'cliente', url TEXT NOT NULL, chave TEXT, whats TEXT DEFAULT '', nome TEXT DEFAULT '', instagram TEXT DEFAULT '', obs TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'nova', vinculo TEXT DEFAULT '', criado_por TEXT DEFAULT '', criado_em TEXT, usada_em TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS fotoia (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'fila', nome TEXT DEFAULT '', produto TEXT DEFAULT '', extra TEXT DEFAULT '', fontes TEXT NOT NULL DEFAULT '[]', resultado TEXT DEFAULT '', modelo TEXT DEFAULT '', bytes INTEGER DEFAULT 0, tent INTEGER DEFAULT 0, prox_em TEXT DEFAULT '', erro TEXT DEFAULT '', criado_por TEXT DEFAULT '', criado_em TEXT, atualizado_em TEXT, pronto_em TEXT)`,
  `CREATE TABLE IF NOT EXISTS postagem_grupo_recibo (postagem_id INTEGER NOT NULL, ordem INTEGER NOT NULL, estado TEXT NOT NULL, mensagem_id TEXT DEFAULT '', atualizado_em TEXT, PRIMARY KEY (postagem_id, ordem))`,
  `CREATE INDEX IF NOT EXISTS ix_fotoia ON fotoia (status, prox_em)`,
  `CREATE INDEX IF NOT EXISTS ix_fc ON foto_cliente (status, id)`,
  `CREATE INDEX IF NOT EXISTS ix_post ON postagem (status, agendado_em)`,
  `CREATE INDEX IF NOT EXISTS ix_rasc ON rascunho (status, grupo, publicado_em)`,
  `CREATE INDEX IF NOT EXISTS ix_rm ON rascunho_midia (midia_id)`,
  `CREATE TABLE IF NOT EXISTS msg_conversa (id INTEGER PRIMARY KEY AUTOINCREMENT, canal TEXT NOT NULL, contato TEXT NOT NULL, nome TEXT DEFAULT '', grupo INTEGER NOT NULL DEFAULT 0, ultima_em TEXT DEFAULT '', previa TEXT DEFAULT '', total INTEGER NOT NULL DEFAULT 0, criado_em TEXT, UNIQUE (canal, contato))`,
  `CREATE TABLE IF NOT EXISTS msg_mensagem (id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER NOT NULL, canal TEXT NOT NULL, ext_id TEXT NOT NULL, direcao TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'texto', texto TEXT DEFAULT '', enviada_em TEXT DEFAULT '', gravada_em TEXT, UNIQUE (canal, ext_id))`,
  `CREATE INDEX IF NOT EXISTS ix_msg_conv ON msg_mensagem (conversa_id, enviada_em)`,
  `CREATE INDEX IF NOT EXISTS ix_msgc_ult ON msg_conversa (canal, ultima_em)`
];
/* colunas acrescentadas depois (v3.7: leitura das fotos por IA) */
const COLUNAS_NOVAS = ["ia_status TEXT DEFAULT ''", "ia_json TEXT DEFAULT ''", "ia_tent INTEGER DEFAULT 0", "ia_em TEXT DEFAULT ''", "preco_foto TEXT DEFAULT ''"];
const inicializacoes_ = new WeakMap();
const ESQUEMA_ = '20261031-fila-midia-1';
async function iniciar(env) {
  if (inicializacoes_.has(env.DB)) return inicializacoes_.get(env.DB);
  const promessa = (async()=>{
    let versao;
    try { versao = await cfgGet(env,'schema_ig_version'); }
    catch(e) { if (!/no such table/i.test(String(e))) throw e; }
    if (versao === ESQUEMA_) return;
    await migrarEsquema_(env);
    const postCols=new Set((await env.DB.prepare('PRAGMA table_info(postagem)').all()).results.map(c=>c.name));
    for(const [nome,tipo] of [['serie',"TEXT NOT NULL DEFAULT ''"],['parte','INTEGER NOT NULL DEFAULT 0'],['partes','INTEGER NOT NULL DEFAULT 0'],['origem_midia',"TEXT NOT NULL DEFAULT ''"],['intervalo_ms','INTEGER NOT NULL DEFAULT 0']])if(!postCols.has(nome))await env.DB.prepare('ALTER TABLE postagem ADD COLUMN '+nome+' '+tipo).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_post_serie ON postagem(serie,parte)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_post_publicado ON postagem(status,publicado_em)').run();
    // Acrescenta a ficha estruturada sem regravar nem apagar os campos antigos.
    const fichaCols = new Set((await env.DB.prepare('PRAGMA table_info(msg_ficha)').all()).results.map(c => c.name));
    if (!fichaCols.has('perfil_json')) {
      try { await env.DB.prepare("ALTER TABLE msg_ficha ADD COLUMN perfil_json TEXT NOT NULL DEFAULT '{}'").run(); }
      catch (e) { if (!/duplicate column/i.test(String(e))) throw e; }
    }
    const agendaCols=new Set((await env.DB.prepare('PRAGMA table_info(msg_agenda)').all()).results.map(c=>c.name));
    for(const [nome,tipo] of [['anexo',"TEXT NOT NULL DEFAULT ''"],['anexo_nome',"TEXT NOT NULL DEFAULT ''"],['anexo_mime',"TEXT NOT NULL DEFAULT ''"],['tipo',"TEXT NOT NULL DEFAULT 'manual'"],['acompanhamento','INTEGER NOT NULL DEFAULT 0'],['auth_ref',"TEXT NOT NULL DEFAULT ''"],['processando_em',"TEXT NOT NULL DEFAULT ''"],['tentativas','INTEGER NOT NULL DEFAULT 0'],['chave',"TEXT NOT NULL DEFAULT ''"]]){
      if(!agendaCols.has(nome)){try{await env.DB.prepare('ALTER TABLE msg_agenda ADD COLUMN '+nome+' '+tipo).run();}catch(e){if(!/duplicate column/i.test(String(e)))throw e;}}
    }
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_acompanhamento (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT NOT NULL UNIQUE, conversa_id INTEGER NOT NULL, alvo TEXT NOT NULL, entrada_ref INTEGER NOT NULL, etapa TEXT NOT NULL DEFAULT 'lembrete', status TEXT NOT NULL DEFAULT 'ativo', quando TEXT NOT NULL, autor TEXT NOT NULL, whats TEXT NOT NULL, auth_ref TEXT NOT NULL, texto_lembrete TEXT NOT NULL, texto_final TEXT NOT NULL DEFAULT '', lembrete_em TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, erro TEXT NOT NULL DEFAULT '')").run();
    await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ix_acomp_ativo ON msg_acompanhamento(conversa_id) WHERE status='ativo'").run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_acomp_alvo ON msg_acompanhamento(alvo,status)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_agenda_acomp ON msg_agenda(acompanhamento,status)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_agenda_quando ON msg_agenda(quando,id)').run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_agenda_autorizacao(ref TEXT PRIMARY KEY,proxima TEXT NOT NULL,limite TEXT NOT NULL,criado_em TEXT NOT NULL,estado TEXT NOT NULL DEFAULT 'ativo')").run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_agenda_auth_proxima ON msg_agenda_autorizacao(estado,proxima)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_agenda_auth_ref ON msg_agenda(auth_ref,status)').run();
    await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ix_agenda_chave ON msg_agenda(chave) WHERE chave<>''").run();
    /* v7.40.33 — presença aproximada e atividade registrada (retomado do checkpoint #305).
       Tabelas aditivas: não alteram nem apagam mensagens, conversas ou tarefas existentes. */
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_presenca(usuario TEXT PRIMARY KEY,nome TEXT NOT NULL,em TEXT NOT NULL,conversa_id INTEGER NOT NULL DEFAULT 0)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_atividade(id INTEGER PRIMARY KEY AUTOINCREMENT,chave TEXT NOT NULL UNIQUE,usuario TEXT NOT NULL,nome TEXT NOT NULL,acao TEXT NOT NULL,conversa_id INTEGER NOT NULL DEFAULT 0,em TEXT NOT NULL)").run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_atividade_em ON msg_atividade(em,id)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_atividade_usuario ON msg_atividade(usuario,em)').run();
    for (const [t,cols] of [['msg_ficha',['perfil_json']],['msg_nota',['excluida_em','excluida_por']],['msg_conversa',['pessoa','atualizada_em','encerrada_em']],['msg_mensagem',['ctx_chave','autor_lid']]]) {
      const existentes = new Set((await env.DB.prepare('PRAGMA table_info('+t+')').all()).results.map(c=>c.name));
      if (!cols.every(c=>existentes.has(c))) throw new Error('Esquema de Mensagens incompleto. Tente novamente.');
    }
    await cfgSet(env,'schema_ig_version',ESQUEMA_);
  })();
  inicializacoes_.set(env.DB,promessa);
  try { await promessa; } catch(e) { inicializacoes_.delete(env.DB); throw e; }
}
async function migrarEsquema_(env) {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  try { await env.DB.prepare("ALTER TABLE postagem ADD COLUMN canal TEXT DEFAULT ''").run(); } catch (e) { /* ja existe */ }
  try { await env.DB.prepare('ALTER TABLE postagem ADD COLUMN seq INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* já existe */ }
  try { await env.DB.prepare('ALTER TABLE postagem ADD COLUMN urgente INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* já existe */ }
  try { await env.DB.prepare('ALTER TABLE postagem ADD COLUMN repostado_de INTEGER').run(); } catch (e) { /* já existe */ }
  /* Mensagens v2: lidas/não lidas, quem falta responder, estado de entrega e quem enviou pelo painel. */
  for (const [t, col] of [['msg_conversa', "dono TEXT DEFAULT ''"], ['msg_conversa', "reaberta_em TEXT DEFAULT ''"], ['msg_conversa', "atendido_em TEXT DEFAULT ''"], ['msg_conversa', 'nao_lidas INTEGER NOT NULL DEFAULT 0'], ['msg_conversa', "ult_dir TEXT DEFAULT ''"], ['msg_conversa', "ult_entrada_em TEXT DEFAULT ''"], ['msg_conversa', "ult_saida_em TEXT DEFAULT ''"], ['msg_conversa', "atualizada_em TEXT DEFAULT ''"], ['msg_mensagem', "status TEXT DEFAULT ''"], ['msg_mensagem', "status_em TEXT DEFAULT ''"], ['msg_mensagem', "por TEXT DEFAULT ''"], ['msg_mensagem', "midia_chave TEXT DEFAULT ''"], ['msg_mensagem', "midia_mime TEXT DEFAULT ''"], ['msg_mensagem', 'midia_seg INTEGER NOT NULL DEFAULT 0'], ['msg_mensagem', "midia_url TEXT DEFAULT ''"], ['msg_mensagem', "ctx_tipo TEXT DEFAULT ''"], ['msg_mensagem', "ctx_ref TEXT DEFAULT ''"], ['msg_mensagem', 'ctx_post INTEGER NOT NULL DEFAULT 0'], ['msg_mensagem', 'ctx_aprox INTEGER NOT NULL DEFAULT 0'], ['msg_mensagem', "ctx_chave TEXT DEFAULT ''"], ['msg_mensagem', "ctx_autor TEXT DEFAULT ''"], ['msg_mensagem', "ctx_trecho TEXT DEFAULT ''"], ['msg_mensagem', "autor_nome TEXT DEFAULT ''"], ['msg_mensagem', "autor_fone TEXT DEFAULT ''"], ['msg_mensagem', "autor_lid TEXT DEFAULT ''"], ['msg_conversa', "pessoa TEXT DEFAULT ''"], ['msg_conversa', "encerrada_em TEXT DEFAULT ''"], ['msg_conversa', "encerrada_motivo TEXT DEFAULT ''"]]) { try { await env.DB.prepare('ALTER TABLE ' + t + ' ADD COLUMN ' + col).run(); } catch (e) { /* já existe */ } }
  /* v2.13: histórico de encerramentos (motivo, quando e por quem): base das métricas e, depois, do termômetro de cada cliente */
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_status_ref (canal TEXT NOT NULL,ext_id TEXT NOT NULL,chave TEXT NOT NULL,mime TEXT NOT NULL,em TEXT NOT NULL,PRIMARY KEY(canal,ext_id))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_google_nome (chave TEXT PRIMARY KEY,nome TEXT NOT NULL,pessoa TEXT NOT NULL,em TEXT NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_pessoa (id TEXT PRIMARY KEY,nome TEXT NOT NULL,whatsapp TEXT DEFAULT '',segundo TEXT DEFAULT '',em TEXT NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_pessoa_alias (canal TEXT NOT NULL,contato TEXT NOT NULL,pessoa TEXT NOT NULL,PRIMARY KEY(canal,contato))").run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_pessoa_alias ON msg_pessoa_alias(pessoa)').run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_contatos_tmp (r TEXT PRIMARY KEY, n TEXT DEFAULT '', f TEXT DEFAULT '[]', m TEXT DEFAULT '[]')").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_zernio_conv (contato TEXT PRIMARY KEY, conversa TEXT NOT NULL, em TEXT NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_contatos_plano (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, dados TEXT NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_contatos_fila (chave TEXT PRIMARY KEY, fone TEXT NOT NULL, nome TEXT DEFAULT '', canal TEXT DEFAULT '', em TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendente', tentativas INTEGER DEFAULT 0, erro TEXT DEFAULT '', r TEXT DEFAULT '')").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_encerramento (id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER NOT NULL, canal TEXT NOT NULL, pessoa TEXT DEFAULT '', contato TEXT DEFAULT '', motivo TEXT NOT NULL, em TEXT NOT NULL, por TEXT DEFAULT '')").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_nota (id INTEGER PRIMARY KEY AUTOINCREMENT, alvo TEXT NOT NULL, texto TEXT NOT NULL, autor TEXT DEFAULT '', em TEXT NOT NULL)").run();   // v7.40.3: notas internas (o cliente nunca vê)
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msg_nota_alvo ON msg_nota (alvo, em)').run();
    for(const col of ["excluida_em TEXT NOT NULL DEFAULT ''","excluida_por TEXT NOT NULL DEFAULT ''"]){try{await env.DB.prepare('ALTER TABLE msg_nota ADD COLUMN '+col).run();}catch(e){if(!/duplicate column/i.test(String(e)))throw e;}}
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_etiqueta (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cor TEXT NOT NULL DEFAULT 'cinza', ordem INTEGER NOT NULL DEFAULT 0, venda INTEGER NOT NULL DEFAULT 0, arquivada INTEGER NOT NULL DEFAULT 0)").run();   // v7.40.4: etiquetas
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS msg_alvo_etiqueta (alvo TEXT NOT NULL, etiqueta_id INTEGER NOT NULL, em TEXT NOT NULL, PRIMARY KEY (alvo, etiqueta_id))').run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_auto_envio (conversa_id INTEGER NOT NULL, tipo TEXT NOT NULL, periodo TEXT NOT NULL, em TEXT NOT NULL, res TEXT DEFAULT '', PRIMARY KEY (conversa_id, tipo, periodo))").run();   // v7.40.9: respostas automáticas já enviadas (não repetir)
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_agenda (id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER NOT NULL, texto TEXT NOT NULL, quando TEXT NOT NULL, autor TEXT DEFAULT '', whats TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pendente', erro TEXT DEFAULT '', criado_em TEXT NOT NULL, enviado_em TEXT DEFAULT '')").run();   // v7.40.13: mensagens agendadas
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msg_agenda_st ON msg_agenda (status, quando)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msg_agenda_conv ON msg_agenda (conversa_id, status)').run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_ficha (alvo TEXT PRIMARY KEY, tamanhos TEXT DEFAULT '', preferencias TEXT DEFAULT '', cidade TEXT DEFAULT '', atualizado_em TEXT, autor TEXT, perfil_json TEXT NOT NULL DEFAULT '{}')").run();   // ficha estruturada; campos legados preservados
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msgenc_conv ON msg_encerramento (conversa_id, em)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msgenc_pessoa ON msg_encerramento (pessoa)').run();
  } catch (e) { /* tenta de novo na próxima vez */ }
  /* v2.11: mesma pessoa nos dois WhatsApp (chave = número sem o 9º dígito) e o nome do próprio WhatsApp que tinha ido parar nas conversas */
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msgc_pessoa ON msg_conversa (pessoa)').run();
    await env.DB.prepare("UPDATE msg_conversa SET pessoa=" + MSG_PESSOA_SQL_ + " WHERE pessoa='' AND grupo=0 AND canal IN ('whatsapp1','whatsapp2') AND contato<>'' AND contato NOT GLOB '*[^0-9]*'").run();
    for (const c of ['whatsapp1', 'whatsapp2']) { const proprio = await cfgGet(env, 'msg_nome_proprio_' + c); if (proprio) await env.DB.prepare("UPDATE msg_conversa SET nome='' WHERE canal=? AND grupo=0 AND lower(nome)=lower(?)").bind(c, proprio).run(); }
  } catch (e) { /* tenta de novo na próxima vez */ }
  try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msgc_atu ON msg_conversa (atualizada_em)').run(); await env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_msgm_st ON msg_mensagem (conversa_id, status_em)').run(); } catch (e) { /* tenta de novo depois */ }
  try {
    if (!(await cfgGet(env, 'mig_msg_v2'))) {
      await env.DB.batch([
        env.DB.prepare("UPDATE msg_mensagem SET status='enviada' WHERE direcao='saida' AND COALESCE(status,'')=''"),
        env.DB.prepare("UPDATE msg_conversa SET ult_dir=COALESCE((SELECT m.direcao FROM msg_mensagem m WHERE m.conversa_id=msg_conversa.id ORDER BY m.enviada_em DESC, m.id DESC LIMIT 1),''), ult_entrada_em=COALESCE((SELECT MAX(m.enviada_em) FROM msg_mensagem m WHERE m.conversa_id=msg_conversa.id AND m.direcao='entrada'),''), ult_saida_em=COALESCE((SELECT MAX(m.enviada_em) FROM msg_mensagem m WHERE m.conversa_id=msg_conversa.id AND m.direcao='saida'),''), atualizada_em=CASE WHEN COALESCE(ultima_em,'')<>'' THEN ultima_em ELSE COALESCE(criado_em,'') END, nao_lidas=0")
      ]);
      await cfgSet(env, 'mig_msg_v2', '1');
    }
  } catch (e) { /* tenta de novo na próxima vez */ }
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ix_post_repostado_de ON postagem(repostado_de)').run();
  for (const col of COLUNAS_NOVAS) { try { await env.DB.prepare('ALTER TABLE rascunho ADD COLUMN ' + col).run(); } catch (e) { /* já existe */ } }
  try { await env.DB.prepare("ALTER TABLE fotoia ADD COLUMN refs TEXT DEFAULT '[]'").run(); } catch (e) { /* já existe */ }
  try { await env.DB.prepare("ALTER TABLE fotoia ADD COLUMN plano TEXT DEFAULT ''").run(); } catch (e) { /* já existe */ }
  try {   // v3.7: preço sempre calculado (o escrito é o à vista). Corrige os rascunhos antigos cujo preço da legenda foi gravado como se fosse o cheio.
    if (!(await cfgGet(env, 'mig_preco_v2'))) {
      const velhos = (await env.DB.prepare("SELECT id, preco_sug FROM rascunho WHERE COALESCE(preco_foto,'')='' AND COALESCE(preco_sug,'')!='' AND status IN ('pendente','descartado')").all()).results || [];
      const ups = velhos.map((x) => { const p = precoDasFotos(x.preco_sug); return p ? env.DB.prepare('UPDATE rascunho SET preco_sug=?, preco_foto=? WHERE id=?').bind(p.cheio, p.avista, x.id) : null; }).filter(Boolean);
      for (let k = 0; k < ups.length; k += 50) await env.DB.batch(ups.slice(k, k + 50));
      await cfgSet(env, 'mig_preco_v2', '1');
    }
  } catch (e) { /* tenta de novo na próxima vez */ }
}

/* ---------- utilidades ---------- */
const agora = () => new Date().toISOString();
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ('0' + b.toString(16)).slice(-2)).join('');
function resp(corpo, status, h) { const x = new Headers(h || {}); x.set('Content-Type', 'application/json; charset=utf-8'); x.set('Cache-Control', 'no-store'); return new Response(JSON.stringify(corpo), { status: status || 200, headers: x }); }
function cors(env, req) {
  const o = req.headers.get('Origin') || '';
  const lista = (env.ORIGENS ? String(env.ORIGENS).split(',') : ORIGENS_PADRAO).map((s) => s.trim());
  const h = new Headers();
  if (lista.indexOf(o) !== -1) { h.set('Access-Control-Allow-Origin', o); h.set('Vary', 'Origin'); }
  return h;
}
async function sha(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(d), (b) => ('0' + b.toString(16)).slice(-2)).join(''); }
async function cfgGet(env, k) { const r = await env.DB.prepare('SELECT valor FROM cfg WHERE chave=?').bind(k).first(); return r ? r.valor : null; }
async function cfgSet(env, k, v) { if (v === null || v === undefined) await env.DB.prepare('DELETE FROM cfg WHERE chave=?').bind(k).run(); else await env.DB.prepare('INSERT INTO cfg (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').bind(k, String(v)).run(); }

/** Sessão válida + permissões (pergunta ao Apps Script; resultado 2 min no cache da borda). */
async function permissoes(env, req) {
  const whats = (req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(0, 20);
  const sessao = (req.headers.get('X-TK-Sessao') || '').slice(0, 400);
  if (!whats || !/^tk[123]\./.test(sessao)) return 'sem_sessao';
  const chave = new Request('https://sessao.invalid/v4/' + (await sha(whats + '|' + sessao)));
  const cache = caches.default, g = await cache.match(chave);
  if (g) { const v = await g.json(); v.permissoes.msgPerfis = v.perfis; v.permissoes.msgNome = v.nome || ''; return v.permissoes; }
  let lista = null, perfis = [], nome = '';
  try {
    const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'sessao', whatsapp: whats, sessao: sessao }) });
    const j = await r.json();
    if (j && j.ok && j.usuario && Array.isArray(j.usuario.permissoes)) { lista = j.usuario.permissoes; nome = String(j.usuario.nome || j.usuario.name || '').trim().slice(0,120); perfis = Array.isArray(j.usuario.perfis) ? j.usuario.perfis : String(j.usuario.perfil || '').split(','); }
  } catch (e) { return 'indisponivel'; }         // backend fora do ar != "faca login"
  if (lista) await cache.put(chave, new Response(JSON.stringify({ permissoes: lista, perfis, nome }), { headers: { 'Cache-Control': 'max-age=120' } }));
  if (lista) { lista.msgPerfis = perfis; lista.msgNome = nome; }
  return lista || 'sem_sessao';                  // sessao que o backend nao reconhece
}

// Acessos adicionais são privados no Worker; não alteram os perfis do cadastro.
const MSG_FERRAMENTAS_ = { acessar:'Acessar Mensagens', responder:'Responder e encerrar atendimentos', produtos:'Selecionar produtos no atendimento', arquivos:'Baixar arquivos recebidos', contatos:'Editar cadastro e canais', etiquetas:'Alterar etapa da venda', notas:'Ver e editar notas da equipe', agenda:'Agendar mensagens', respostas:'Usar e editar respostas rápidas', funil:'Ver e mover o funil', metricas:'Ver métricas', exportar:'Exportar e consultar exclusões', configuracoes:'Configurar conexões e automações' };
const msgPerfil_ = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,100);
const msgTelefone_ = s => foneNormal_(s).chave || String(s || '').replace(/\D/g,'').slice(0,20);
async function msgRegras_(env) { const raw = await cfgGet(env,'msg_acessos_v1'); return raw ? JSON.parse(raw) : { perfis:{}, pessoas:{} }; }
function msgDireitos_(perms, whats, regras) {
  const admin = perms.includes('gerir_acessos');
  const perfis = (perms.msgPerfis || []).map(msgPerfil_);
  const cat1 = perfis.includes('equipecatalogo1') || (!perfis.filter(Boolean).length && perms.includes('catalogo_admin') && perms.includes('painel_simples'));
  const pessoa = (regras.pessoas || {})[msgTelefone_(whats)] || {};
  const direitos = {};
  for (const k of Object.keys(MSG_FERRAMENTAS_)) {
    let v = cat1 && !['funil','metricas','exportar','configuracoes'].includes(k);
    const definidos = perfis.map(n => (regras.perfis || {})[n]).filter(r => r && typeof r[k] === 'boolean');
    if (definidos.length) v = definidos.some(r => r[k]);
    if (typeof pessoa[k] === 'boolean') v = pessoa[k];
    direitos[k] = admin || v;
  }
  if (!direitos.acessar) for (const k of Object.keys(direitos)) direitos[k] = false;
  return direitos;
}
function msgRecurso_(p, req, url) {
  if (['/msg/video-preparar','/msg/enviar','/msg/anexo','/msg/dono','/msg/encerrar'].includes(p)) return 'responder';
  if (p === '/msg/midia') return url.searchParams.get('baixar') === '1' ? 'arquivos' : 'acessar';
  if (/^\/msg\/(pessoa|ficha)(\/|$)/.test(p)) return 'contatos';
  if (/^\/msg\/(etiquetas|rotular)$/.test(p)) return 'etiquetas';
  if (p === '/msg/notas/log') return 'exportar';
  if (p === '/msg/notas') return 'notas';
  if (/^\/msg\/agend/.test(p)) return 'agenda';
  if (p === '/msg/acompanhamento') return 'agenda';
  if (p === '/msg/iniciar') return 'responder';
  if (p === '/msg/equipe') return 'metricas';
  if (p === '/msg/presenca') return 'acessar';
  if (/^\/msg\/funil/.test(p)) return 'funil';
  if (p === '/msg/metricas') return 'metricas';
  if (p === '/msg/exportar') return 'exportar';
  if (['/msg/resumo','/msg/conversas','/msg/mensagens','/msg/novidades','/msg/lida','/msg/contagem','/msg/stories','/msg/mobile/subscription','/msg/config','/msg/tempo-real/ticket'].includes(p)) return 'acessar';
  return 'configuracoes';
}
function msgFiltrarDados_(dados, direitos) {
  if (!dados || typeof dados !== 'object') return dados;
  if (Array.isArray(dados)) return dados.map(x => msgFiltrarDados_(x,direitos));
  const out = {};
  for (const [k,v] of Object.entries(dados)) {
    if ((!direitos.notas && ['notas','exclusoes'].includes(k)) || (!direitos.agenda && ['agendadas','acompanhamento'].includes(k)) || (!direitos.etiquetas && k === 'etiquetas') || (!direitos.respostas && k === 'respostas')) continue;
    if (!direitos.configuracoes && ['ultimaLeitura','webhook','diagnostico','urlInstagram'].includes(k)) continue;
    out[k] = msgFiltrarDados_(v,direitos);
  }
  return out;
}

/* ---------- sugestões a partir da legenda (sem IA) ---------- */
export function precoDaLegenda(t) {
  const m = /(?:R\$|\$)\s*(\d{1,4}(?:[.,]\d{1,2})?)/i.exec(String(t || ''));
  if (!m) return '';
  const n = Number(m[1].replace(',', '.'));
  return n > 0 && n < 100000 ? n.toFixed(2) : '';
}
const TAM = '(?:PP|P|M|G|GG|XG|XGG|EG|EGG|U)';
export function tamanhosDaLegenda(t) {
  const m = new RegExp('(?<![A-Za-zÀ-ú])' + TAM + '(?:\\s*(?:,|/|-|e)\\s*' + TAM + ')+(?![A-Za-zÀ-ú])', 'i').exec(String(t || ''));
  return m ? m[0].toUpperCase().split(/\s*(?:,|\/|-|E)\s*/).filter(Boolean).join(', ') : '';
}
export function codigoDaLegenda(t) { const m = /\bTK-\d{3,6}\b/i.exec(String(t || '')); return m ? m[0].toUpperCase() : ''; }
function origemDe(m, story) {
  if (story) return 'story';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carrossel';
  if (m.media_product_type === 'REELS') return 'reel';
  return 'feed';
}

/* ---------- R2 (mesmo bucket e mesmo padrão de nome do Worker tenkiter-midia) ---------- */
function limite(env) { const n = Number(env.LIMITE_BYTES); return n > 0 ? n : LIMITE_PADRAO; }
async function lerUso(env) { const v = await env.CACHE.get('uso', 'json'); return v && typeof v.bytes === 'number' ? v : { bytes: 0, arquivos: 0 }; }
async function copiarMidia(env, url, aaaamm, chaveFixa) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('o Instagram não entregou a mídia (HTTP ' + r.status + ')');
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  const ext = ct.indexOf('video') === 0 ? 'mp4' : ct.indexOf('png') !== -1 ? 'png' : ct.indexOf('webp') !== -1 ? 'webp' : 'jpg';
  let tam = Number(r.headers.get('content-length')) || 0, corpo = r.body;
  if (tam > MAX_BYTES_MIDIA) throw new Error('mídia grande demais (' + Math.round(tam / 1048576) + ' MB)');
  if (!tam) { const b = await r.arrayBuffer(); tam = b.byteLength; if (tam > MAX_BYTES_MIDIA) throw new Error('mídia grande demais'); corpo = b; }
  const uso = await lerUso(env);
  if (uso.bytes + tam > limite(env)) throw new Error('armazenamento cheio (limite de segurança para não gerar cobrança)');
  const chave = chaveFixa ? chaveFixa.replace(/\.[a-z0-9]+$/, '.' + ext) : aaaamm + '/' + hex(10) + '.' + ext;
  await env.MIDIA.put(chave, corpo, { httpMetadata: { contentType: ct || (ext === 'mp4' ? 'video/mp4' : 'image/jpeg'), cacheControl: 'public, max-age=31536000, immutable' } });
  uso.bytes += tam; uso.arquivos += 1;
  await env.CACHE.put('uso', JSON.stringify(uso));
  return { chave: chave, bytes: tam };
}

/* ---------- Instagram ---------- */
function igBase(env) { return String(env.IG_BASE || IG_BASE_PADRAO).replace(/\/$/, ''); }
async function graph(env, token, caminho) {
  const u = igBase(env) + caminho + (caminho.indexOf('?') === -1 ? '?' : '&') + 'access_token=' + encodeURIComponent(token);
  let r, j = null;
  try { r = await fetch(u, { headers: { 'User-Agent': UA } }); j = await r.json(); } catch (e) { throw new Error('não consegui falar com o Instagram'); }
  if (!r.ok || (j && j.error)) throw new Error('Instagram: ' + ((j && j.error && j.error.message) || ('HTTP ' + r.status)).replace(/access_token=[^&\s]+/g, 'access_token=***'));
  return j;
}
async function renovarToken(env, token) {
  const exp = Number(await cfgGet(env, 'ig_token_exp')) || 0;
  if (exp && exp - Date.now() > 20 * 86400000) return token;
  try {
    const r = await fetch(igBase(env).replace(/\/v[\d.]+$/, '') + '/refresh_access_token?grant_type=ig_refresh_token&access_token=' + encodeURIComponent(token), { headers: { 'User-Agent': UA } });
    const j = await r.json();
    if (j && j.access_token) { await cfgSet(env, 'ig_token', j.access_token); await cfgSet(env, 'ig_token_exp', Date.now() + (Number(j.expires_in) || 5184000) * 1000); return j.access_token; }
  } catch (e) { /* tenta de novo no próximo ciclo */ }
  return token;
}

/** Um ciclo: lê feed + stories, copia o que é novo (até MAX_POR_CICLO mídias), cria rascunhos. Nunca lança. */
export async function ciclo(env, origem, opcoes) {
  await iniciar(env);
  const inicio = agora();
  let novas = 0, erro = '', puladas = 0, fim = false;
  try {
    let token = await cfgGet(env, 'ig_token');
    if (!token) { erro = 'Instagram ainda não conectado.'; return { ok: false, erro: erro }; }
    token = await renovarToken(env, token);
    const todos = !!(opcoes && opcoes.todos);
    const desde = (opcoes && (opcoes.ultimos || todos)) ? '' : (await cfgGet(env, 'ig_desde') || '');
    const ultimos = Math.min(50, Number(opcoes && opcoes.ultimos) || 0);
    let orcamento = MAX_POR_CICLO;
    /** Copia o que é novo de uma lista. 'ok' = acabou a lista; 'parou' = acabou o orçamento (volta nesta mesma página); 'erro' = falha que para tudo. */
    const processar = async (itens) => {
      const vistos = {};
      const ids = itens.map((x) => x.m.id);
      if (ids.length) {
        const q = await env.DB.prepare('SELECT id FROM ig_midia WHERE id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all();
        (q.results || []).forEach((r) => { vistos[r.id] = true; });
      }
      const fila = itens.filter((x) => !vistos[x.m.id] && (x.story || !desde || String(x.m.timestamp || '') >= desde)).sort((a, b) => String(a.m.timestamp).localeCompare(String(b.m.timestamp)));
      for (const it of fila) {
        const m = it.m, filhos = m.media_type === 'CAROUSEL_ALBUM' && m.children && Array.isArray(m.children.data) ? m.children.data : [m];
        if (filhos.length > orcamento) return 'parou';                        // não cabe neste ciclo: fica para o próximo (nada é gravado pela metade)
        const aaaamm = String(m.timestamp || agora()).slice(0, 7).replace('-', '');
        const copias = [];
        try {
          for (const f of filhos) {
            const ehVideo = f.media_type === 'VIDEO';
            const url = f.media_url || (ehVideo ? '' : f.thumbnail_url);
            if (!url) throw new Error('mídia sem endereço (conta sem permissão?)');
            const c = await copiarMidia(env, url, aaaamm);
            let mini = '';
            if (ehVideo && (f.thumbnail_url || m.thumbnail_url)) { try { mini = (await copiarMidia(env, f.thumbnail_url || m.thumbnail_url, aaaamm, c.chave.replace(/\.[a-z0-9]+$/, '.jpg'))).chave; } catch (e) { mini = ''; } }
            copias.push({ f: f, c: c, mini: mini, ehVideo: ehVideo });
            orcamento--;
          }
        } catch (e) {
          const txt = String((e && e.message) || e).slice(0, 300);
          for (const c of copias) { try { await env.MIDIA.delete(c.c.chave); if (c.mini) await env.MIDIA.delete(c.mini); } catch (x) { /* ignora */ } }
          if (todos && txt.indexOf('armazenamento cheio') === -1) { puladas++; continue; }   // importação total: um post ruim não trava os outros
          erro = txt;                                                // não registra: tenta de novo no próximo ciclo
          if (todos) return 'erro';
          continue;
        }
        const legenda = String(m.caption || '').slice(0, 2200), cod = codigoDaLegenda(legenda);
        const grupo = it.story ? 'sem_id' : (cod ? 'duplicado' : 'pendente');
        const pl = precoDasFotos(precoDaLegenda(legenda));   // o preço escrito na legenda também é o À VISTA: sempre passa pelo cálculo
        const rr = await env.DB.prepare('INSERT INTO rascunho (grupo, status, origem, legenda, permalink, publicado_em, preco_sug, preco_foto, tamanhos_sug, codigo_dup, criado_em, atualizado_em) VALUES (?, \'pendente\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(grupo, origemDe(m, it.story), legenda, m.permalink || '', m.timestamp || inicio, pl ? pl.cheio : '', pl ? pl.avista : '', tamanhosDaLegenda(legenda), cod, inicio, inicio).run();
        const rid = rr.meta.last_row_id;
        const exp = it.story ? new Date(new Date(m.timestamp || Date.now()).getTime() + 86400000).toISOString() : '';
        const lote = [env.DB.prepare('INSERT OR IGNORE INTO ig_midia (id, tipo, produto_tipo, legenda, permalink, publicado_em, pai_id, chave, chave_mini, bytes, status, expirou_em, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'em_rascunho\', ?, ?)')
          .bind(m.id, 'GRUPO', m.media_product_type || '', legenda, m.permalink || '', m.timestamp || '', '', '', '', 0, exp, inicio)];
        copias.forEach((x, i) => {
          const idMidia = x.f.id === m.id && copias.length === 1 ? m.id + '#1' : x.f.id;
          lote.push(env.DB.prepare('INSERT OR IGNORE INTO ig_midia (id, tipo, produto_tipo, legenda, permalink, publicado_em, pai_id, chave, chave_mini, bytes, status, expirou_em, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'em_rascunho\', ?, ?)')
            .bind(idMidia, x.ehVideo ? 'VIDEO' : 'IMAGE', m.media_product_type || '', '', m.permalink || '', m.timestamp || '', m.id, x.c.chave, x.mini, x.c.bytes, exp, inicio));
          lote.push(env.DB.prepare('INSERT OR IGNORE INTO rascunho_midia (rascunho_id, midia_id, ordem, capa) VALUES (?, ?, ?, ?)').bind(rid, idMidia, i, i === 0 ? 1 : 0));
        });
        await env.DB.batch(lote);
        novas++;
      }
      return 'ok';
    };
    /** Stories no ar agora (somem em 24 h). Nunca derruba o ciclo, mas GUARDA o resultado/erro para o painel mostrar (antes falhava em silêncio). */
    const buscarStories = async () => {
      let lista = [], msg = '';
      try { const st = await graph(env, token, '/me/stories?fields=' + encodeURIComponent(CAMPOS) + '&limit=50'); lista = (st.data || []).map((m) => ({ m: m, story: true })); }
      catch (e) { msg = String((e && e.message) || e).slice(0, 250); }
      try { await cfgSet(env, 'ig_story_info', JSON.stringify({ em: agora(), no_ar: lista.length, erro: msg })); } catch (e) { /* conforto */ }
      return lista;
    };
    if (!todos) {
      const itens = [];
      const feed = await graph(env, token, '/me/media?fields=' + encodeURIComponent(CAMPOS) + '&limit=' + (ultimos || 25));
      (feed.data || []).forEach((m) => itens.push({ m: m, story: false }));
      (await buscarStories()).forEach((x) => itens.push(x));
      await processar(itens);
    } else {
      /* a importação total também traz os Stories que ainda estão no ar (o histórico do feed não inclui Story) */
      if (!(await cfgGet(env, 'ig_hist_depois'))) { const rs = await processar(await buscarStories()); if (rs === 'erro') return { ok: false, erro: erro, novas: novas, puladas: puladas, fim: false }; }
      /* Importação de TODO o histórico: anda página por página (cursor guardado no servidor — se fechar a tela ou der erro, continua de onde parou). */
      let depois = await cfgGet(env, 'ig_hist_depois') || '';
      for (let pg = 0; pg < MAX_PAGINAS && orcamento > 0; pg++) {
        const pag = await graph(env, token, '/me/media?fields=' + encodeURIComponent(CAMPOS) + '&limit=25' + (depois ? '&after=' + encodeURIComponent(depois) : ''));
        const r = await processar((pag.data || []).map((m) => ({ m: m, story: false })));
        if (r !== 'ok') break;                                     // mesma página na próxima chamada
        const prox = pag.paging && pag.paging.next && pag.paging.cursors && pag.paging.cursors.after;
        if (!prox) { fim = true; await cfgSet(env, 'ig_hist_depois', null); await cfgSet(env, 'ig_hist_fim', agora()); break; }
        depois = prox; await cfgSet(env, 'ig_hist_depois', depois);
      }
    }
  } catch (e) {
    erro = String((e && e.message) || e).slice(0, 300);
  } finally {
    try {
      await env.DB.prepare('INSERT INTO exec_log (inicio, fim, novas, erro, origem) VALUES (?, ?, ?, ?, ?)').bind(inicio, agora(), novas, erro, origem || 'cron').run();
      const falhas = erro && erro !== 'Instagram ainda não conectado.' ? (Number(await cfgGet(env, 'falhas')) || 0) + 1 : 0;
      await cfgSet(env, 'falhas', falhas);
      await env.DB.prepare('DELETE FROM exec_log WHERE id NOT IN (SELECT id FROM exec_log ORDER BY id DESC LIMIT 200)').run();
    } catch (e) { /* log é só conforto */ }
  }
  return { ok: !erro, novas: novas, erro: erro, puladas: puladas, fim: fim };
}

/* ---------- IA: lê as FOTOS do post (nome, preço escrito, categoria, cores...) ---------- */
const MODELOS_IA = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
const MAX_FOTOS_IA = 4, MAX_BYTES_FOTO_IA = 3 * 1024 * 1024, DESCONTO_AVISTA = 0.10;
const COND_IA_PENDENTE = "status='pendente' AND grupo != 'nao_produto' AND (ia_status IN ('', 'pendente') OR (ia_status='erro' AND ia_tent < 2) OR (ia_status='lendo' AND ia_em < ?))";

/** O preço escrito (na foto OU na legenda) é SEMPRE o À VISTA (com 10% de desconto) — o cálculo vale para qualquer origem. ",99" no fim = arredonda para cima
 *  (69,99 → 70,00). O catálogo guarda o preço CHEIO e o site mostra à vista = cheio × 0,90 arredondado em centavos. Então o cheio é o MENOR valor em centavos
 *  cujo à vista, formatado do mesmo jeito que o site formata, dá EXATAMENTE o preço escrito (70,00 → 77,78 → à vista 70,00; testado de R$ 1 a R$ 3.000). */
export function precoDasFotos(v) {
  if (/^\s*-/.test(String(v == null ? '' : v))) return null;
  let n = Number(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!isFinite(n) || n <= 0 || n > 100000) return null;
  n = Math.round(n * 100) / 100;
  if (Math.round((n - Math.floor(n)) * 100) === 99) n = Math.floor(n) + 1;
  const alvo = n.toFixed(2);
  const mostra = (c) => (c / 100 * (1 - DESCONTO_AVISTA)).toFixed(2);   // igual ao site: Number(Preco) * (1 - DESCONTO_AVISTA)
  let c = Math.ceil(n / (1 - DESCONTO_AVISTA) * 100) - 3;
  for (let i = 0; i < 12 && c > 0; i++, c++) if (mostra(c) === alvo) return { avista: alvo, cheio: (c / 100).toFixed(2) };
  return { avista: alvo, cheio: (Math.ceil(n / (1 - DESCONTO_AVISTA) * 100 - 1e-6) / 100).toFixed(2) };
}
function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function listasDaLoja(env) {
  const c = await env.CACHE.get('ia_listas', 'json'); if (c) return c;
  const base = String(env.API_URL || '').trim(); let categorias = [], generos = [];
  try {
    const [a, g] = await Promise.all([fetch(base + '?action=categorias', { headers: { 'User-Agent': UA } }).then((r) => r.json()), fetch(base + '?action=generos', { headers: { 'User-Agent': UA } }).then((r) => r.json())]);
    categorias = (a.categorias || []).map(String).slice(0, 100); generos = (g.generos || []).map(String).slice(0, 20);
  } catch (e) { /* sem listas: a IA devolve só nome/cores/descrição */ }
  if (categorias.length || generos.length) await env.CACHE.put('ia_listas', JSON.stringify({ categorias: categorias, generos: generos }), { expirationTtl: 600 });
  return { categorias: categorias, generos: generos };
}
async function fotosDoRascunho(env, rid) {
  const q = await env.DB.prepare('SELECT m.tipo, m.chave, m.chave_mini FROM rascunho_midia rm JOIN ig_midia m ON m.id = rm.midia_id WHERE rm.rascunho_id=? ORDER BY rm.capa DESC, rm.ordem').bind(rid).all();
  const partes = [];
  for (const x of (q.results || [])) {
    if (partes.length >= MAX_FOTOS_IA) break;
    const chave = x.tipo === 'VIDEO' ? x.chave_mini : x.chave; if (!chave) continue;
    try {
      const o = await env.MIDIA.get(chave); if (!o) continue;
      const buf = await o.arrayBuffer(); if (buf.byteLength > MAX_BYTES_FOTO_IA) continue;
      partes.push({ inline_data: { mime_type: /\.png$/.test(chave) ? 'image/png' : /\.webp$/.test(chave) ? 'image/webp' : 'image/jpeg', data: b64(buf) } });
    } catch (e) { /* foto que não deu para ler é ignorada */ }
  }
  return partes;
}
/** Cota grátis é POR MODELO: 429 = passa ao próximo modelo e deixa o esgotado "de molho" no KV até o Google liberar ("retry in 21h26m"). */
async function modelosEsgotados(env) { try { return (await env.CACHE.get('ia_esgotados', 'json')) || {}; } catch (e) { return {}; } }
async function marcarEsgotado(env, modelo, msg) {
  try {
    const m = /retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(String(msg || ''));
    let seg = 3600; if (m) seg = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Math.ceil(Number(m[3] || 0));
    if (!m && /limit:\s*0\b/i.test(String(msg || ''))) seg = 6 * 3600;           // cota 0 = o plano da chave não inclui esse modelo: não adianta tentar de hora em hora
    seg = Math.max(600, Math.min(seg, 86400));
    const mapa = await modelosEsgotados(env), agora = Date.now();
    Object.keys(mapa).forEach((k) => { if (mapa[k] <= agora) delete mapa[k]; });
    mapa[modelo] = agora + seg * 1000;
    await env.CACHE.put('ia_esgotados', JSON.stringify(mapa), { expirationTtl: 86400 });
  } catch (e) { /* sem KV: só não lembra */ }
}
async function chamarGemini(env, chave, payload) {
  let ultimo = '', quota = 0, falhas = 0;
  const esg = await modelosEsgotados(env), agora = Date.now();
  let fila = MODELOS_IA.filter((m) => !(esg[m] && esg[m] > agora));
  if (!fila.length) fila = MODELOS_IA.slice();      // todos de molho: tenta de novo (a cota pode ter voltado)
  for (const modelo of fila) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(payload) });
      let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
      if (r.status === 200) {
        const partes = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const texto = partes.map((x) => x.text || '').join('').replace(/```json/gi, '').replace(/```/g, '').trim();
        if (texto) return { ok: true, texto: texto, modelo: modelo };
        ultimo = 'resposta vazia'; if (++falhas >= 3) break; continue;
      }
      const msg = ((j.error && j.error.message) || ('HTTP ' + r.status));
      ultimo = msg.replace(/key=[^&\s]+/g, 'key=***').slice(0, 160);
      if (r.status === 429 || /quota/i.test(msg)) { quota++; await marcarEsgotado(env, modelo, msg); continue; }
      if (r.status === 404) continue;
      if (r.status === 400 || r.status === 401 || r.status === 403) break;
      if (++falhas >= 3) break;
    } catch (e) { ultimo = 'sem conexão com a IA'; if (++falhas >= 3) break; }
  }
  if (quota && quota >= fila.length) return { ok: false, erro: 'A cota gratuita da IA acabou em todos os modelos por agora (volta sozinha em até 24 h).', espera: true };
  return { ok: false, erro: 'Erro da IA: ' + ultimo };
}
const soValidos = (arr, lista) => { const m = {}; lista.forEach((x) => { m[String(x).toLowerCase()] = x; }); const out = []; (Array.isArray(arr) ? arr : []).forEach((v) => { const k = m[String(v).trim().toLowerCase()]; if (k && out.indexOf(k) === -1) out.push(k); }); return out; };
/** Lê as fotos de UM rascunho e guarda a sugestão. Nunca lança. Devolve {ok, espera?, erro?}. */
export async function analisarRascunho(env, id) {
  const chave = await cfgGet(env, 'gemini_key');
  if (!chave) return { ok: false, erro: 'IA não ligada.', semChave: true };
  const r = await env.DB.prepare('SELECT * FROM rascunho WHERE id=?').bind(id).first(); if (!r) return { ok: false, erro: 'Rascunho não existe.' };
  const falhar = async (txt, conta) => { await env.DB.prepare("UPDATE rascunho SET ia_status='erro', ia_tent=ia_tent+?, ia_json=? WHERE id=?").bind(conta ? 1 : 0, JSON.stringify({ erro: txt }), id).run(); return { ok: false, erro: txt }; };
  try {
    const partes = await fotosDoRascunho(env, id);
    if (!partes.length) return await falhar('Sem foto legível para a IA.', true);
    const listas = await listasDaLoja(env);
    const prompt = 'Você cadastra roupas no catálogo de uma loja de moda brasileira (TENKiTER Modas). Abaixo estão as FOTOS de UMA publicação do Instagram da loja ' +
      '(a 1ª é a capa; ângulos diferentes da mesma peça ou da mesma coleção) e a LEGENDA. LEIA também todo texto escrito nas imagens (nome da peça, preço, tamanhos, "Alfaiataria Premium" etc.). ' +
      'Responda SOMENTE em JSON válido, sem markdown, exatamente neste formato: ' +
      '{"produto": true, "nome": "", "preco": null, "generos": [], "categorias": [], "cores": [], "tamanhos": [], "descricao": ""}\n' +
      'Regras:\n- produto: false se NÃO for uma peça à venda (aviso, promoção geral, frase motivacional, bastidores).\n' +
      '- nome: curto e claro, como "Vestido Alfaiataria Premium Vermelho" (máx. 60 caracteres); use o nome escrito na imagem quando houver.\n' +
      '- preco: SOMENTE se houver um valor em reais ESCRITO nas imagens ou na legenda (número, ex.: 69.99), copiado EXATAMENTE como está escrito (não calcule nada). Se houver dois valores (ex.: um riscado e outro promocional), devolva o MENOR (o que vale). Se não houver, null. NUNCA invente.\n' +
      '- generos: escolha SOMENTE entre ' + JSON.stringify(listas.generos) + ' (vazio se nenhum servir).\n' +
      '- categorias: escolha SOMENTE entre ' + JSON.stringify(listas.categorias) + ' (vazio se nenhuma servir).\n' +
      '- cores: cores que você VÊ na peça (em português). Se o post mostra várias cores da mesma peça, liste todas.\n' +
      '- tamanhos: SOMENTE se estiverem escritos (ex.: ["P","M","G"]); senão [].\n' +
      '- descricao: 1 a 2 frases só com o que é visível (modelagem, detalhes). NÃO invente tecido, marca nem composição.\n\nLEGENDA:\n' + String(r.legenda || '').slice(0, 1200);
    const g = await chamarGemini(env, chave, { contents: [{ parts: [{ text: prompt }].concat(partes) }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } });
    if (!g.ok) { const f = await falhar(g.erro, !g.espera); f.espera = !!g.espera; return f; }
    let j; try { j = JSON.parse(g.texto); } catch (e) { const m = /\{[\s\S]*\}/.exec(g.texto); try { j = m ? JSON.parse(m[0]) : null; } catch (e2) { j = null; } }
    if (!j || typeof j !== 'object') return await falhar('A IA devolveu algo que não deu para ler.', true);
    const preco = precoDasFotos(j.preco);
    const ia = { produto: j.produto !== false, nome: String(j.nome || '').replace(/\s+/g, ' ').trim().slice(0, 60), generos: soValidos(j.generos, listas.generos), categorias: soValidos(j.categorias, listas.categorias),
      cores: (Array.isArray(j.cores) ? j.cores : []).map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 8), tamanhos: (Array.isArray(j.tamanhos) ? j.tamanhos : []).map((x) => String(x).trim().toUpperCase().slice(0, 6)).filter(Boolean).slice(0, 10),
      descricao: String(j.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 400) };
    await env.DB.prepare("UPDATE rascunho SET ia_status='ok', ia_json=?, ia_tent=0, preco_foto=CASE WHEN ? != '' THEN ? ELSE preco_foto END, preco_sug=CASE WHEN ? != '' THEN ? ELSE preco_sug END, tamanhos_sug=CASE WHEN tamanhos_sug='' AND ? != '' THEN ? ELSE tamanhos_sug END, atualizado_em=? WHERE id=?")
      .bind(JSON.stringify(ia), preco ? preco.avista : '', preco ? preco.avista : '', preco ? preco.cheio : '', preco ? preco.cheio : '', ia.tamanhos.join(', '), ia.tamanhos.join(', '), agora(), id).run();
    return { ok: true };
  } catch (e) { return await falhar('Falha ao ler as fotos.', true); }
}
/** Lê até `max` rascunhos que ainda não foram lidos (de 1 em 1, para respeitar o limite de uso da IA). */
export async function analisarPendentes(env, max) {
  if (!(await cfgGet(env, 'gemini_key'))) return { feitas: 0, restantes: 0, semChave: true };
  const velho = new Date(Date.now() - 300000).toISOString();
  let feitas = 0, espera = false, erro = '';
  for (let i = 0; i < max; i++) {
    const q = await env.DB.prepare('SELECT id FROM rascunho WHERE ' + COND_IA_PENDENTE + ' ORDER BY id DESC LIMIT 1').bind(velho).first(); if (!q) break;
    const c = await env.DB.prepare("UPDATE rascunho SET ia_status='lendo', ia_em=? WHERE id=? AND (" + "ia_status IN ('', 'pendente', 'erro') OR (ia_status='lendo' AND ia_em < ?))").bind(agora(), q.id, velho).run();
    if (!c.meta.changes) continue;
    const r = await analisarRascunho(env, q.id);
    if (r.ok) feitas++; else { erro = r.erro || ''; if (r.espera) { espera = true; break; } }
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rascunho WHERE ' + COND_IA_PENDENTE).bind(velho).first();
  return { feitas: feitas, restantes: n ? n.n : 0, espera: espera, erro: erro };
}

/* ---------- leitura para a tela ---------- */
function urlMidia(env, chave) { return chave ? String(env.MIDIA_URL || '').replace(/\/$/, '') + '/m/' + chave : ''; }
function iaDe(r) { if (r.ia_status !== 'ok') return null; try { return JSON.parse(r.ia_json || 'null'); } catch (e) { return null; } }
async function carregarRascunhos(env, linhas) {
  if (!linhas.length) return [];
  const ids = linhas.map((r) => r.id);
  const q = await env.DB.prepare('SELECT rm.rascunho_id, rm.ordem, rm.capa, m.id AS midia, m.tipo, m.chave, m.chave_mini, m.expirou_em FROM rascunho_midia rm JOIN ig_midia m ON m.id = rm.midia_id WHERE rm.rascunho_id IN (' + ids.map(() => '?').join(',') + ') ORDER BY rm.rascunho_id, rm.ordem').bind(...ids).all();
  const por = {};
  (q.results || []).forEach((x) => { (por[x.rascunho_id] = por[x.rascunho_id] || []).push({ id: x.midia, tipo: x.tipo === 'VIDEO' ? 'video' : 'foto', url: urlMidia(env, x.chave), mini: x.tipo === 'VIDEO' ? urlMidia(env, x.chave_mini) : urlMidia(env, x.chave), capa: !!x.capa, ordem: x.ordem }); });
  return linhas.map((r) => ({ id: r.id, grupo: r.grupo, status: r.status, origem: r.origem, legenda: r.legenda, permalink: r.permalink, publicadoEm: r.publicado_em, precoSug: r.preco_sug, tamanhosSug: r.tamanhos_sug, codigoDup: r.codigo_dup, produtoId: r.produto_id, precoFoto: r.preco_foto || '', iaStatus: r.ia_status || '', ia: iaDe(r), midias: por[r.id] || [] }));
}
async function contagens(env) {
  const q = await env.DB.prepare("SELECT status, grupo, COUNT(*) AS n FROM rascunho GROUP BY status, grupo").all();
  const c = { pendente: 0, sem_id: 0, duplicado: 0, nao_produto: 0, descartado: 0, aceito: 0 };
  (q.results || []).forEach((r) => { if (r.status === 'pendente') c[r.grupo] = (c[r.grupo] || 0) + r.n; else c[r.status] = (c[r.status] || 0) + r.n; });
  return c;
}

/* ---------- ações sobre rascunhos ---------- */
async function rascunhoDe(env, id) { return env.DB.prepare('SELECT * FROM rascunho WHERE id=?').bind(Number(id) || 0).first(); }
async function tocar(env, id) { await env.DB.prepare('UPDATE rascunho SET atualizado_em=? WHERE id=?').bind(agora(), id).run(); }
async function novoRascunhoAvulso(env, origem, legenda, permalink, publicado, grupo) {
  const t = agora();
  const r = await env.DB.prepare("INSERT INTO rascunho (grupo, status, origem, legenda, permalink, publicado_em, criado_em, atualizado_em) VALUES (?, 'pendente', ?, ?, ?, ?, ?, ?)").bind(grupo || 'sem_id', origem, legenda || '', permalink || '', publicado || t, t, t).run();
  return r.meta.last_row_id;
}
async function proximaOrdem(env, rid) { const r = await env.DB.prepare('SELECT COALESCE(MAX(ordem), -1) + 1 AS n FROM rascunho_midia WHERE rascunho_id=?').bind(rid).first(); return r ? r.n : 0; }
async function garantirCapa(env, rid) {
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM rascunho_midia WHERE rascunho_id=? AND capa=1').bind(rid).first();
  if (c && c.n === 0) { const p = await env.DB.prepare('SELECT midia_id FROM rascunho_midia WHERE rascunho_id=? ORDER BY ordem LIMIT 1').bind(rid).first(); if (p) await env.DB.prepare('UPDATE rascunho_midia SET capa=1 WHERE rascunho_id=? AND midia_id=?').bind(rid, p.midia_id).run(); }
}
async function esvaziouDescarta(env, rid) {
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM rascunho_midia WHERE rascunho_id=?').bind(rid).first();
  if (c && c.n === 0) await env.DB.prepare("UPDATE rascunho SET status='descartado', descartado_em=?, atualizado_em=? WHERE id=?").bind(agora(), agora(), rid).run();
}
async function acao(env, b) {
  const id = Number(b.id) || 0;
  const r = id ? await rascunhoDe(env, id) : null;
  const precisa = () => { if (!r) throw Object.assign(new Error('Rascunho não encontrado.'), { codigo: 404 }); };
  switch (b.acao) {
    case 'descartar': precisa(); await env.DB.prepare("UPDATE rascunho SET status='descartado', descartado_em=?, atualizado_em=? WHERE id=?").bind(agora(), agora(), id).run(); return {};
    case 'restaurar': precisa(); await env.DB.prepare("UPDATE rascunho SET status='pendente', descartado_em=NULL, atualizado_em=? WHERE id=?").bind(agora(), id).run(); return {};
    case 'grupo': precisa(); if (GRUPOS.indexOf(b.grupo) === -1) throw Object.assign(new Error('Grupo inválido.'), { codigo: 400 }); await env.DB.prepare("UPDATE rascunho SET grupo=?, status='pendente', atualizado_em=? WHERE id=?").bind(b.grupo, agora(), id).run(); return {};
    case 'aceitado': {
      precisa();
      await env.DB.prepare("UPDATE rascunho SET status='aceito', produto_id=?, atualizado_em=? WHERE id=?").bind(String(b.produtoId || '').slice(0, 60), agora(), id).run();
      await env.DB.prepare("UPDATE ig_midia SET status='publicada' WHERE id IN (SELECT midia_id FROM rascunho_midia WHERE rascunho_id=?)").bind(id).run();
      return {};
    }
    case 'capa': precisa(); await env.DB.prepare('UPDATE rascunho_midia SET capa=CASE WHEN midia_id=? THEN 1 ELSE 0 END WHERE rascunho_id=?').bind(String(b.midia), id).run(); await tocar(env, id); return {};
    case 'ordem': {
      precisa();
      const lista = (await env.DB.prepare('SELECT midia_id FROM rascunho_midia WHERE rascunho_id=? ORDER BY ordem, midia_id').bind(id).all()).results.map((x) => x.midia_id);
      const i = lista.indexOf(String(b.midia)); if (i === -1) throw Object.assign(new Error('Mídia não está neste rascunho.'), { codigo: 404 });
      const j = i + (Number(b.delta) < 0 ? -1 : 1); if (j < 0 || j >= lista.length) return {};
      const t = lista[i]; lista[i] = lista[j]; lista[j] = t;
      await env.DB.batch(lista.map((m, k) => env.DB.prepare('UPDATE rascunho_midia SET ordem=? WHERE rascunho_id=? AND midia_id=?').bind(k, id, m)));
      await tocar(env, id); return {};
    }
    case 'removerMidia': {                                           // a mídia volta para "Sem identificação" (nunca se perde)
      precisa();
      const m = await env.DB.prepare('SELECT 1 AS x FROM rascunho_midia WHERE rascunho_id=? AND midia_id=?').bind(id, String(b.midia)).first();
      if (!m) throw Object.assign(new Error('Mídia não está neste rascunho.'), { codigo: 404 });
      await env.DB.prepare('DELETE FROM rascunho_midia WHERE rascunho_id=? AND midia_id=?').bind(id, String(b.midia)).run();
      const novo = await novoRascunhoAvulso(env, 'avulsa', '', r.permalink, r.publicado_em, 'sem_id');
      await env.DB.prepare('INSERT INTO rascunho_midia (rascunho_id, midia_id, ordem, capa) VALUES (?, ?, 0, 1)').bind(novo, String(b.midia)).run();
      await garantirCapa(env, id); await esvaziouDescarta(env, id); await tocar(env, id); return { novoId: novo };
    }
    case 'separar': {                                                // tira as mídias escolhidas para um produto novo
      precisa();
      const ms = (Array.isArray(b.midias) ? b.midias : []).map(String);
      const todas = (await env.DB.prepare('SELECT midia_id FROM rascunho_midia WHERE rascunho_id=? ORDER BY ordem').bind(id).all()).results.map((x) => x.midia_id);
      const sel = ms.filter((m) => todas.indexOf(m) !== -1);
      if (!sel.length) throw Object.assign(new Error('Escolha ao menos uma mídia.'), { codigo: 400 });
      if (sel.length >= todas.length) throw Object.assign(new Error('Deixe ao menos uma mídia no produto de origem.'), { codigo: 400 });
      const novo = await novoRascunhoAvulso(env, r.origem, r.legenda, r.permalink, r.publicado_em, 'pendente');
      await env.DB.batch(sel.map((m, k) => env.DB.prepare('INSERT INTO rascunho_midia (rascunho_id, midia_id, ordem, capa) VALUES (?, ?, ?, ?)').bind(novo, m, k, k === 0 ? 1 : 0))
        .concat(sel.map((m) => env.DB.prepare('DELETE FROM rascunho_midia WHERE rascunho_id=? AND midia_id=?').bind(id, m))));
      await env.DB.prepare("UPDATE rascunho SET ia_status='', ia_tent=0 WHERE id=?").bind(id).run();
      await garantirCapa(env, id); await tocar(env, id); return { novoId: novo };
    }
    case 'mover': {                                                  // leva UMA mídia para outro rascunho
      const alvo = await rascunhoDe(env, b.para); const de = await env.DB.prepare('SELECT rascunho_id FROM rascunho_midia WHERE midia_id=? AND rascunho_id=?').bind(String(b.midia), id).first();
      if (!alvo || !de || Number(b.para) === id) throw Object.assign(new Error('Não deu para mover.'), { codigo: 400 });
      await env.DB.prepare('DELETE FROM rascunho_midia WHERE rascunho_id=? AND midia_id=?').bind(id, String(b.midia)).run();
      await env.DB.prepare('INSERT OR REPLACE INTO rascunho_midia (rascunho_id, midia_id, ordem, capa) VALUES (?, ?, ?, 0)').bind(alvo.id, String(b.midia), await proximaOrdem(env, alvo.id)).run();
      await garantirCapa(env, alvo.id); await garantirCapa(env, id); await esvaziouDescarta(env, id); await tocar(env, alvo.id); return {};
    }
    case 'juntar': {                                                 // junta o rascunho `de` dentro de `para`
      const de = r, para = await rascunhoDe(env, b.para);
      if (!de || !para || de.id === para.id) throw Object.assign(new Error('Não deu para juntar.'), { codigo: 400 });
      const ms = (await env.DB.prepare('SELECT midia_id FROM rascunho_midia WHERE rascunho_id=? ORDER BY ordem').bind(de.id).all()).results;
      let ordem = await proximaOrdem(env, para.id);
      await env.DB.batch(ms.map((x) => env.DB.prepare('INSERT OR REPLACE INTO rascunho_midia (rascunho_id, midia_id, ordem, capa) VALUES (?, ?, ?, 0)').bind(para.id, x.midia_id, ordem++))
        .concat([env.DB.prepare('DELETE FROM rascunho_midia WHERE rascunho_id=?').bind(de.id), env.DB.prepare("UPDATE rascunho SET status='descartado', descartado_em=?, atualizado_em=? WHERE id=?").bind(agora(), agora(), de.id),
          env.DB.prepare("UPDATE rascunho SET legenda=CASE WHEN legenda='' THEN ? ELSE legenda END, preco_sug=CASE WHEN preco_sug='' THEN ? ELSE preco_sug END, preco_foto=CASE WHEN COALESCE(preco_foto,'')='' THEN ? ELSE preco_foto END, tamanhos_sug=CASE WHEN tamanhos_sug='' THEN ? ELSE tamanhos_sug END, grupo=CASE WHEN grupo='sem_id' THEN 'pendente' ELSE grupo END, ia_status='', ia_tent=0, atualizado_em=? WHERE id=?").bind(de.legenda || '', de.preco_sug || '', de.preco_foto || '', de.tamanhos_sug || '', agora(), para.id)]));
      await garantirCapa(env, para.id); return {};
    }
    case 'lerIA': {                                                  // "ler as fotos de novo" (um rascunho)
      const rr = await analisarRascunho(env, id);
      if (!rr.ok) throw Object.assign(new Error(rr.semChave ? 'A IA ainda não foi ligada (cole a chave em ⚙️ Instagram).' : rr.erro || 'A IA não conseguiu agora.'), { codigo: rr.semChave ? 409 : 502 });
      return {};
    }
    default: throw Object.assign(new Error('Ação desconhecida.'), { codigo: 400 });
  }
}

async function iaStatus(env) {
  const k = await cfgGet(env, 'gemini_key'); if (!k) return { ligada: false, pendentes: 0 };
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rascunho WHERE ' + COND_IA_PENDENTE).bind(new Date(Date.now() - 300000).toISOString()).first();
  return { ligada: true, fim: k.slice(-4), pendentes: n ? n.n : 0 };
}
async function status(env) {
  const c = await contagens(env);
  const ult = await env.DB.prepare('SELECT inicio, fim, novas, erro, origem FROM exec_log ORDER BY id DESC LIMIT 1').first();
  const ontem = new Date(Date.now() - 86400000).toISOString();
  const n = await env.DB.prepare('SELECT COALESCE(SUM(novas),0) AS n FROM exec_log WHERE inicio >= ?').bind(ontem).first();
  const exp = Number(await cfgGet(env, 'ig_token_exp')) || 0, tem = !!(await cfgGet(env, 'ig_token')), falhas = Number(await cfgGet(env, 'falhas')) || 0;
  const dias = exp ? Math.floor((exp - Date.now()) / 86400000) : null;
  const alertas = [];
  if (tem && falhas >= 3) alertas.push('A busca no Instagram falhou ' + falhas + ' vezes seguidas' + (ult && ult.erro ? ': ' + ult.erro : '.'));
  let si = null; try { si = JSON.parse(await cfgGet(env, 'ig_story_info') || 'null'); } catch (e) { si = null; }
  if (tem && si && si.erro) alertas.push('Não consegui ler os Stories do Instagram: ' + si.erro);
  if (tem && dias !== null && dias < 10) alertas.push('O acesso ao Instagram vence em ' + Math.max(0, dias) + ' dia(s). Conecte de novo.');
  return { ok: true, conectado: tem, usuario: await cfgGet(env, 'ig_usuario') || '', venceEmDias: dias, desde: await cfgGet(env, 'ig_desde') || '', contagens: c, ultimoCiclo: ult || null, novasDesdeOntem: n ? n.n : 0, falhasSeguidas: falhas, alertas: alertas, usoR2: await lerUso(env), limiteR2: limite(env), stories: si, ia: await iaStatus(env), historico: { completo: !!(await cfgGet(env, 'ig_hist_fim')), emAndamento: !!(await cfgGet(env, 'ig_hist_depois')) } };
}

/* ===================== POSTAGENS: publicar no Instagram (Feed, Carrossel, Reels, Story) =====================
 * A API do Instagram NÃO agenda: a agenda é NOSSA (tabela `postagem` + cron por minuto). Máquina de estados, sem esperar vídeo dentro de uma execução:
 *   agendado → processando (containers criados no Instagram; cada minuto confere `status_code`) → publicado | erro | cancelado
 *   Story COM LINK: a API não aceita figurinha de link → `modo:'manual'`: na hora vira `manual_pendente` e o funcionário termina no Instagram (→ `manual_feito`).
 * Permissão das rotas: Admin total OU `catalogo_cadastrar` (a equipe que cadastra peças também posta). O token fica no D1 e nunca volta à tela. */
const TIPOS_POST = ['feed', 'carrossel', 'reels', 'story'];
/* ---------- CANAIS DE POSTAGEM (v1.2) ----------
 * Contrato: canal = 'instagram' (padrao) | 'whatsapp' | 'ambos', identico ao de common.js no frontend.
 * O canal precisa ser GRAVADO junto com a peca e LIDO de volta pelo processador da fila. Era
 * exatamente isso que faltava: o campo chegava no POST, era descartado no INSERT e a fila publicava
 * sempre no Instagram -- mesmo com "somente WhatsApp" escolhido na tela. */
const CANAIS_POSTAGEM = ['instagram', 'whatsapp', 'ambos', 'grupo', 'whatsapp2'];   // whatsapp2 = Status do WhatsApp 2 (provedor Wame)
const CANAL_POSTAGEM_PADRAO = 'instagram';
function normalizarCanal_(v) { const c = String(v == null ? '' : v).trim().toLowerCase(); return CANAIS_POSTAGEM.indexOf(c) === -1 ? CANAL_POSTAGEM_PADRAO : c; }
function canalUsaInstagram_(c) { const x = normalizarCanal_(c); return x === 'instagram' || x === 'ambos'; }
function canalUsaWhatsApp_(c) { const x = normalizarCanal_(c); return x === 'whatsapp' || x === 'ambos'; }
const MAX_POSTS_24H = 90;                 // o Instagram deixa ~100 publicações por API a cada 24 h; paramos antes
const MAX_ESPERA_VIDEO_MS = 20 * 60 * 1000;
const MAX_TENT = 3;
class ErroIG extends Error { constructor(e, http) { super((e && e.message) || ('HTTP ' + http)); this.code = e && e.code; this.sub = e && e.error_subcode; this.http = http; } }
async function graphPost(env, token, caminho, params) {
  const corpo = new URLSearchParams();
  Object.keys(params || {}).forEach((k) => { if (params[k] !== undefined && params[k] !== null && params[k] !== '') corpo.set(k, String(params[k])); });
  corpo.set('access_token', token);                                   // o token vai no corpo, nunca no endereço
  let r, j = null;
  try { r = await fetch(igBase(env) + caminho, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo }); j = await r.json(); } catch (e) { throw new ErroIG({ message: 'não consegui falar com o Instagram' }, 0); }
  if (!r.ok || (j && j.error)) throw new ErroIG(j && j.error, r.status);
  return j;
}
/** Frase para a pessoa + se vale tentar de novo. Nunca devolve JSON nem o token. */
export function fraseErroIG(e) {
  const code = e && e.code, sub = e && e.sub, msg = String((e && e.message) || '').replace(/access_token=[^&\s]+/g, 'access_token=***');
  if (code === 190) return { frase: 'O token do Instagram venceu ou foi recusado. Gere outro e conecte de novo.', fatal: true };
  if (code === 10 || code === 200 || /permission/i.test(msg)) return { frase: 'O token não tem a permissão de publicar (instagram_business_content_publish). Gere outro token marcando essa permissão.', fatal: true };
  if (code === 4 || code === 17 || code === 32 || code === 613 || sub === 2207051) return { frase: 'O Instagram pediu para esperar (limite de publicações). Tento de novo mais tarde.', espera: true };
  if (sub === 2207026 || sub === 2207052 || sub === 2207003 || /download|fetch|unsupported|format|ratio|aspect/i.test(msg)) return { frase: 'O Instagram não aceitou a mídia (precisa ser JPEG ou MP4 público, dentro das proporções). ' + msg.slice(0, 140) };
  return { frase: 'Instagram: ' + (msg || 'erro desconhecido').slice(0, 200) };
}
function parametrosContainer(p, m, filho) {
  const cap = p.legenda || '';
  if (filho) return m.tipo === 'video' ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: 'true' } : { image_url: m.url, is_carousel_item: 'true' };
  if (p.tipo === 'feed') return { image_url: m.url, caption: cap };
  if (p.tipo === 'reels') return { media_type: 'REELS', video_url: m.url, caption: cap, share_to_feed: 'true' };
  if (p.tipo === 'story') return m.tipo === 'video' ? { media_type: 'STORIES', video_url: m.url } : { media_type: 'STORIES', image_url: m.url };
  return {};
}
async function statusContainer(env, token, id) {
  const j = await graph(env, token, '/' + encodeURIComponent(id) + '?fields=status_code');
  return String((j && j.status_code) || 'FINISHED').toUpperCase();         // sem o campo = tratamos como pronto
}
async function gravarContainers(env, id, c) { await env.DB.prepare('UPDATE postagem SET containers=?, atualizado_em=? WHERE id=?').bind(JSON.stringify(c), agora(), id).run(); }
/**
 * v1.2: publica no Status do WhatsApp pelo backend (Apps Script + modulo Wafly). O Worker nao tem
 * sessao de usuario, entao a ponte e autenticada por um SEGREDO COMPARTILHADO (WORKER_TOKEN),
 * declarado nas variaveis do Worker e nas Propriedades do Script do backend.
 * Idempotente: o `requestId` e estavel (deriva do id da postagem), entao repetir NAO republica.
 */
/* v1.3: envio ao Status do WhatsApp SEM gravar o desfecho da postagem (usado também no canal "ambos"). */
async function enviarWhatsAppSo_(env, p, slot) {
  slot = slot === 2 ? 2 : 1;
  const direto = await cfgWafly_(env, slot);
  if (direto) return await enviarWaflyDireto_(env, p, slot, direto);          // v2.1: credenciais cadastradas na Gestão (D1)
  if (slot === 2) return { ok: false, erro: 'O Wafly 2 ainda não está cadastrado em Conexões.' };
  const base = String(env.API_URL || '').trim();           // Wafly 1 sem cadastro na Gestão: ponte do Apps Script (caminho de sempre)
  if (!base) return { ok: false, erro: 'Falta o endereco do backend (API_URL) para enviar ao WhatsApp.' };
  let m = []; try { m = JSON.parse(p.midias || '[]'); } catch (e) { m = []; }
  const primeira = m[0] || {};
  const requestId = 'tkpost-' + String(p.id).padStart(12, '0');
  let j = null;
  try {
    const r = await fetch(base, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'waflyStatusRemoto', token: String(env.WORKER_TOKEN || ''), requestId: requestId, tipo: primeira.tipo === 'video' ? 'video' : 'image', url: String(primeira.url || ''), legenda: String(p.legenda || '') }) });
    j = await r.json();
  } catch (e) { return { ok: false, erro: 'Sem conexao com o servidor do WhatsApp agora. Tento de novo.' }; }
  if (j && j.ok) return { ok: true, requestId: String(j.requestId || requestId) };
  /* v1.9: 409 "resultado ainda não confirmado" / timeout da Wafly NÃO é erro: a postagem fica "aguardando confirmação"
   * e o cron consulta o MESMO requestId (nunca reenvia a mídia nem cria outro requestId). */
  if (j && j.pendente) return { ok: false, pendente: true, requestId: String(j.requestId || requestId), erro: String(j.erro || '') };
  return { ok: false, erro: String((j && j.erro) || 'O WhatsApp recusou o envio.') };
}
const ZAP_ESPERA_MAX_MS = 30 * 60000;       // depois disso vira "não confirmou" (continua dando para Consultar resultado)
const ZAP_CONSULTA_GAP_MS = 2 * 60000;      // o cron consulta a Wafly a cada ~2 min (nunca passa de 10)
const FRASE_AGUARDA_ZAP = 'Aguardando a confirmação do WhatsApp. Não precisa fazer nada: o sistema confere sozinho a cada poucos minutos, sem reenviar.';
/** Só CONSULTA o recibo daquele requestId pelo backend (não baixa nem envia mídia). { estado:'aceito'|'desconhecido'|'falha' } */
async function consultarWhatsApp_(env, requestId) {
  const direto = await cfgWafly_(env, slotDoRequestId_(requestId));
  if (direto) return await consultarWaflyDireto_(direto, requestId);
  const base = String(env.API_URL || '').trim();
  if (!base) return { estado: 'falha', erro: 'Falta o endereco do backend (API_URL).' };
  try {
    const r = await fetch(base, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'waflyStatusRemoto', token: String(env.WORKER_TOKEN || ''), requestId: requestId, consultar: true }) });
    const j = await r.json();
    if (j && j.ok && String(j.estado || '').toLowerCase() === 'accepted' && j.confirmado) return { estado: 'aceito' };
    if (j && j.ok) return { estado: 'desconhecido' };
    return { estado: 'falha', erro: String((j && j.erro) || '') };
  } catch (e) { return { estado: 'falha', erro: 'Sem conexao com o servidor agora.' }; }
}
/** Deixa a postagem "aguardando confirmação" (status 'processando' + marcador zapq:). */
async function marcarAguardaZap_(env, p, requestId) {
  await env.DB.prepare("UPDATE postagem SET status='processando', ig_id=?, inicio_proc=?, erro=?, atualizado_em=? WHERE id=?").bind('zapq:' + requestId, agora(), FRASE_AGUARDA_ZAP, agora(), p.id).run();
  return { ok: true, aguardando: true };
}
/** Resolve uma postagem com marcador zapq:. Devolve 'aceito' (segue o fluxo), 'esperando' ou 'falhou'. `forcar` ignora o intervalo entre consultas (botão). */
async function resolverZapPendente_(env, p, forcar) {
  const requestId = String(p.ig_id || '').slice(5);
  const desde = Date.parse(p.inicio_proc || p.atualizado_em || agora()) || Date.now();
  if (!forcar && Date.now() - (Date.parse(p.atualizado_em || '') || 0) < ZAP_CONSULTA_GAP_MS) return 'esperando';
  const c = await consultarWhatsApp_(env, requestId);
  if (c.estado === 'aceito') {
    p.ig_id = 'zap:' + requestId;
    const gravou = await env.DB.prepare("UPDATE postagem SET ig_id=?, erro='', atualizado_em=? WHERE id=? AND status IN ('erro','processando')").bind(p.ig_id, agora(), p.id).run();
    if (!gravou.meta || gravou.meta.changes !== 1) return 'encerrado';
    if (!canalUsaInstagram_(p.canal)) {                                  // só WhatsApp: confirmado = publicado (nada é reenviado)
      await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, permalink='', erro='', publicado_em=?, atualizado_em=? WHERE id=? AND status IN ('erro','processando')").bind(requestId, agora(), agora(), p.id).run();
      p.status = 'publicado';
    } else if (p.status === 'erro') { await env.DB.prepare("UPDATE postagem SET status='processando', inicio_proc=? WHERE id=? AND status IN ('erro','processando')").bind(agora(), p.id).run(); p.status = 'processando'; }
    return 'aceito';
  }
  if (Date.now() - desde > ZAP_ESPERA_MAX_MS) {
    await env.DB.prepare("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=? AND status IN ('erro','processando')").bind('WhatsApp: a Wafly ainda não confirmou depois de 30 min. Toque em “Consultar resultado” (não reenvia).', agora(), p.id).run();
    return 'falhou';
  }
  await env.DB.prepare("UPDATE postagem SET atualizado_em=? WHERE id=? AND status IN ('erro','processando')").bind(agora(), p.id).run();
  return 'esperando';
}
async function enviarWhatsApp_(env, p) {
  const r = await enviarWhatsAppSo_(env, p);
  if (r.pendente) return await marcarAguardaZap_(env, p, r.requestId);
  if (!r.ok) return marcarErroPost_(env, p, r.erro);
  await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, permalink='', erro='', publicado_em=?, atualizado_em=? WHERE id=?").bind(r.requestId, agora(), agora(), p.id).run();
  return { ok: true, canal: 'whatsapp' };
}

/* ==========================================================================
 * v2.1 -- WAFLY 1 e WAFLY 2 CADASTRADOS NA GESTÃO (Conexões) -- sem editar o Apps Script
 *
 *  Cada instância guarda { instance, token, clientToken } na tabela `cfg` (D1): chaves `wafly_1` e `wafly_2`.
 *  Nada disso volta ao navegador (a tela só vê "configurada", o código da instância e o resultado do teste).
 *  - Wafly 1 (canal whatsapp/ambos): se cadastrado aqui, o Worker fala direto com a Wafly; se não, continua pela ponte do Apps Script.
 *  - Wafly 2 (canal whatsapp2): se cadastrado aqui, assume o Status 2; senão vale o Wame (se houver) como antes.
 *  Mesma regra de segurança do Status 1: requestId estável por postagem (a Wafly não republica), 409/timeout/5xx = "aguardando
 *  confirmação" (só consulta o MESMO requestId), nunca reenvia sozinho. O prefixo do requestId diz de qual instância é o recibo.
 * ========================================================================== */
const WAFLY_BASE_ = 'https://wafly.com.br/api-bridge-whats';
const WAFLY_SLOTS_ = { 1: { chave: 'wafly_1', prefixo: 'tkpost-', nome: 'WhatsApp Status 1' }, 2: { chave: 'wafly_2', prefixo: 'tkpost2-', nome: 'WhatsApp Status 2' } };
function validarWafly_(c) {
  if (!c || typeof c !== 'object') return null;
  const instance = String(c.instance || '').trim(), token = String(c.token || '').trim(), clientToken = String(c.clientToken || '').trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(instance) || !/^[A-Za-z0-9._-]{6,200}$/.test(token) || !/^[A-Za-z0-9._-]{6,200}$/.test(clientToken)) return null;
  return { instance: instance, token: token, clientToken: clientToken };
}
async function cfgWafly_(env, slot) {
  try { const v = await cfgGet(env, WAFLY_SLOTS_[slot === 2 ? 2 : 1].chave); return v ? validarWafly_(JSON.parse(v)) : null; } catch (e) { return null; }
}
function slotDoRequestId_(rid) { return String(rid || '').indexOf('tkpost2-') === 0 ? 2 : 1; }
function waflyUrl_(cfg, caminho) { return WAFLY_BASE_ + '/instances/' + encodeURIComponent(cfg.instance) + '/token/' + encodeURIComponent(cfg.token) + caminho; }
function bytesParaBase64_(buf) {
  const u = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin);
}
// Lê mvhd sem decodificar o vídeo. Percorre somente caixas MP4 válidas e limitadas ao buffer.
export function duracaoMp4Status_(buf) {
  const v = new DataView(buf), tipo = p => String.fromCharCode(v.getUint8(p),v.getUint8(p+1),v.getUint8(p+2),v.getUint8(p+3));
  function caixas(inicio, fim, nivel) {
    if (nivel > 2) return null;
    for (let p = inicio; p + 8 <= fim;) {
      let n = v.getUint32(p), cab = 8;
      if (n === 1) { if (p + 16 > fim) return null; n = Number(v.getBigUint64(p + 8)); cab = 16; }
      if (n === 0) n = fim - p;
      if (!Number.isSafeInteger(n) || n < cab || p + n > fim) return null;
      const t = tipo(p + 4), q = p + cab;
      if (t === 'moov') { const d = caixas(q, p+n, nivel+1); if (d !== null) return d; }
      if (t === 'mvhd' && q + 4 <= p+n) {
        const versao = v.getUint8(q), offset = versao === 1 ? 20 : 12;
        if (versao > 1 || q + offset + (versao === 1 ? 12 : 8) > p+n) return null;
        const escala = v.getUint32(q+offset), duracao = versao === 1 ? Number(v.getBigUint64(q+offset+4)) : v.getUint32(q+offset+4);
        return escala > 0 && duracao > 0 && Number.isSafeInteger(duracao) ? duracao / escala : null;
      }
      p += n;
    }
    return null;
  }
  return caixas(0, buf.byteLength, 0);
}
async function enviarWaflyDireto_(env, p, slot, cfg) {
  const info = WAFLY_SLOTS_[slot];
  let m = []; try { m = JSON.parse(p.midias || '[]'); } catch (e) { m = []; }
  const primeira = m[0] || {};
  const requestId = info.prefixo + String(p.id).padStart(12, '0');
  const url = String(primeira.url || '');
  if (!/^https:\/\//i.test(url)) return { ok: false, erro: 'Mídia inválida para o ' + info.nome + ' (precisa ser https).' };
  let conteudo;
  try {
    // Mídia do próprio bucket: lê direto do R2. Um Worker não consegue buscar outro Worker da mesma conta pelo endereço público (volta 404), e era isso que derrubava o Status 2.
    let buf = null;
    const pref = String(env.MIDIA_URL || '').replace(/\/$/, '') + '/m/';
    if (url.startsWith(pref)) {
      const chave = url.slice(pref.length).split('?')[0];
      if (/^[A-Za-z0-9/_.-]+$/.test(chave) && !chave.includes('..')) { const obj = await env.MIDIA.get(chave); if (obj) buf = await obj.arrayBuffer(); }
    }
    if (!buf) {
      const rm = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
      if (!rm.ok) return { ok: false, erro: 'Não consegui baixar a mídia (HTTP ' + rm.status + ').' };
      buf = await rm.arrayBuffer();
    }
    const video = primeira.tipo === 'video', limite = (video ? 10 : 5) * 1048576;
    const duracao = video ? duracaoMp4Status_(buf) : null;
    const problemas = [];
    if (buf.byteLength > limite) problemas.push('arquivo com ' + (buf.byteLength / 1048576).toFixed(2).replace('.', ',') + ' MB (máximo ' + (video ? 10 : 5) + ' MB)');
    if (duracao !== null && duracao > 30) problemas.push('vídeo com ' + duracao.toFixed(1).replace('.', ',') + ' segundos (máximo 30)');
    if (problemas.length) return { ok: false, erro: info.nome + ': ' + problemas.join('; ') + '. ' + (video ? 'Divida em partes de até 30 segundos e 10 MB e crie novas publicações. Grupo e Instagram têm limites próprios.' : 'Reduza a imagem e crie uma nova publicação.') };
    conteudo = bytesParaBase64_(buf);
  } catch (e) { return { ok: false, erro: 'Não consegui baixar a mídia agora. Tento de novo.' }; }
  const corpo = { requestId: requestId, type: primeira.tipo === 'video' ? 'video' : 'image', content: conteudo, audienceMode: 'contacts' };
  if (p.legenda) corpo.caption = String(p.legenda).slice(0, 1024);
  let r, j = null;
  try {
    r = await fetch(waflyUrl_(cfg, '/status-publication'), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(60000), headers: { 'Client-Token': cfg.clientToken, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    try { j = await r.json(); } catch (e) { j = null; }
  } catch (e) { return { ok: false, pendente: true, requestId: requestId, erro: 'A resposta da Wafly foi interrompida.' }; }
  if (r.ok && !(j && j.error)) return { ok: true, requestId: requestId };
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'A Wafly recusou as credenciais do ' + info.nome + '. Confira a instância e os tokens em Conexões.' };
  if (r.status === 422) return { ok: false, erro: info.nome + ': vídeo ou imagem recusado pela Wafly (HTTP 422). Para Status, use MP4 de até 30 segundos e 10 MB, ou JPEG/PNG de até 5 MB. Corrija a mídia e crie uma nova publicação; repetir o mesmo ID não corrige o arquivo.' };
  if (r.status === 402) return { ok: false, erro: 'A assinatura da Wafly do ' + info.nome + ' está inadimplente ou o período de teste acabou.' };
  if (r.status === 409 || r.status === 408 || r.status === 429 || r.status >= 500) return { ok: false, pendente: true, requestId: requestId, erro: 'A Wafly respondeu HTTP ' + r.status + '.' };
  return { ok: false, erro: 'A Wafly recusou a publicação do ' + info.nome + ' (HTTP ' + r.status + ').' };
}
async function consultarWaflyDireto_(cfg, requestId) {
  try {
    const r = await fetch(waflyUrl_(cfg, '/status-publication/requests/' + encodeURIComponent(requestId)), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Client-Token': cfg.clientToken } });
    const j = await r.json().catch(() => null);
    if (r.ok && j && String(j.state || '').toLowerCase() === 'accepted' && j.serverAcknowledged) return { estado: 'aceito' };
    if (r.ok) return { estado: 'desconhecido' };
    return { estado: 'falha', erro: 'A Wafly respondeu HTTP ' + r.status + '.' };
  } catch (e) { return { estado: 'falha', erro: 'Sem conexao com a Wafly agora.' }; }
}
/** Teste somente de leitura: sessão e capacidade de Status. Nunca envia nada. */
async function testarWafly_(env, slot) {
  const cfg = await cfgWafly_(env, slot);
  if (!cfg) return { ok: false, erro: slot === 1 ? 'O Wafly 1 ainda usa o Apps Script. Cadastre as credenciais aqui para testar.' : 'Cadastre o Wafly 2 antes de testar.' };
  const out = { ok: true, verificadoEm: agora(), itens: [] };
  for (const [nome, caminho] of [['Sessão do WhatsApp', '/status'], ['Publicar Status', '/status-publication']]) {
    try {
      const r = await fetch(waflyUrl_(cfg, caminho), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'Client-Token': cfg.clientToken } });
      const j = await r.json().catch(() => null);
      let ok = r.ok, texto;
      if (r.status === 401 || r.status === 403) texto = 'credenciais recusadas';
      else if (!r.ok) texto = 'HTTP ' + r.status;
      else if (caminho === '/status') { ok = !!(j && (j.value === 'CONNECTED' || j.connected === true)); texto = ok ? 'conectada' : 'não está conectada (leia o QR na Wafly)'; }
      else { ok = !!(j && j.supported !== false && j.connected !== false); texto = ok ? 'disponível' : 'indisponível agora'; }
      out.itens.push({ nome: nome, ok: ok, texto: texto });
      if (!ok) out.ok = false;
    } catch (e) { out.itens.push({ nome: nome, ok: false, texto: 'sem resposta' }); out.ok = false; }
  }
  try { await cfgSet(env, 'wafly_ultimo_teste_' + slot, JSON.stringify({ em: out.verificadoEm, ok: out.ok })); } catch (e) { /* diagnóstico */ }
  return out;
}
/** Status 2: Wafly 2 (Gestão) tem prioridade; sem ele, o Wame de antes. { ok, provedor, motivo } */
async function status2Info_(env) {
  if (await cfgWafly_(env, 2)) return { ok: true, provedor: 'wafly', motivo: '' };
  if (!(await cfgWameStatus_(env))) return { ok: false, provedor: null, motivo: 'falta cadastrar o Wafly 2 em Conexões' };
  const motivo = await motivoWame_(env);
  return { ok: !motivo, provedor: 'wame', motivo: motivo };
}
/** Envio do canal whatsapp2 pelo Wafly 2 (mesma máquina de espera do Status 1). Postagem com recibo antigo do Wame segue no Wame: nunca duplica. */
async function enviarStatusWafly2_(env, p) {
  if (await env.DB.prepare('SELECT 1 FROM postagem_grupo_recibo WHERE postagem_id=?').bind(p.id).first()) return enviarStatusWame_(env, p);
  if (String(p.ig_id || '').indexOf('zapq:') === 0) {
    const rz = await resolverZapPendente_(env, p, false);
    return rz === 'aceito' ? { ok: true, canal: 'whatsapp2' } : undefined;
  }
  const r = await enviarWhatsAppSo_(env, p, 2);
  if (r.pendente) return await marcarAguardaZap_(env, p, r.requestId);
  if (!r.ok) return marcarErroPost_(env, p, r.erro);
  await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, permalink='', erro='', publicado_em=?, atualizado_em=? WHERE id=?").bind(r.requestId, agora(), agora(), p.id).run();
  return { ok: true, canal: 'whatsapp2' };
}
/** Marca a postagem com a frase do erro (o painel mostra e oferece "Tentar de novo"). Nunca lanca. */
async function marcarErroPost_(env, p, frase) {
  try { await env.DB.prepare("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=?").bind(String(frase || '').slice(0, 300), agora(), p.id).run(); } catch (e) { /* o proximo minuto tenta de novo */ }
  return { ok: false, erro: frase };
}
/** Destino privado e fixo: nunca aceitar telefone/credenciais vindos do navegador. */
function cfgGrupoClientes_(env) {
  try {
    const c = JSON.parse(env.WAFLY_GRUPO_CLIENTES || '{}');
    return c.instance && c.token && c.clientToken && /^\d+-group$/.test(c.phone) ? c : null;
  } catch (e) { return null; }
}
/** Sonda somente de leitura. Nunca envia mensagens nem grava dados de clientes. */
async function diagnosticarGrupoClientes_(env) {
  const cfg = cfgGrupoClientes_(env);
  if (!cfg) return { verificadoEm: agora(), configurado: false };
  const base = 'https://wafly.com.br/api-bridge-whats/instances/' + encodeURIComponent(cfg.instance) + '/token/' + encodeURIComponent(cfg.token);
  const out = { verificadoEm: agora(), configurado: true };
  for (const [nome, caminho] of [['sessao', '/status'], ['grupo', '/group-metadata/' + encodeURIComponent(cfg.phone)], ['chat', '/chats/' + encodeURIComponent(cfg.phone)]]) {
    try {
      const r = await fetch(base + caminho, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'Client-Token': cfg.clientToken } });
      const j = await respostaGrupo_(r);
      out[nome] = { http: r.status };
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        out[nome].campos = Object.keys(j).filter(k => /^[a-zA-Z][a-zA-Z0-9_]{0,35}$/.test(k)).slice(0, 15);
        out[nome].valorTipo = typeof j.value;
        if (nome === 'sessao') {
          if (typeof j.connected === 'boolean') out[nome].conectado = j.connected;
          if (typeof j.smartphoneConnected === 'boolean') out[nome].celularConectado = j.smartphoneConnected;
        }
        if (nome === 'grupo') {
          if (typeof j.adminOnlyMessage === 'boolean') out[nome].soAdministradores = j.adminOnlyMessage;
          if (Array.isArray(j.participants)) out[nome].participantes = j.participants.length;
        }
        if (nome === 'chat' && Number.isFinite(Number(j.lastMessageTime))) out[nome].ultimaMensagemEm = Number(j.lastMessageTime);
      }
      if (nome === 'sessao' && j && typeof j.value === 'string') out[nome].estado = /^[A-Z_]{1,30}$/.test(j.value) ? j.value : 'DESCONHECIDO';
      if (nome === 'grupo') out[nome].encontrado = r.ok && !!j && j.value !== false && !j.error;
    } catch (e) { out[nome] = { erro: 'SEM_RESPOSTA' }; }
  }
  return out;
}
async function respostaGrupo_(r) {
  if (!r.body) return null;
  const reader = r.body.getReader(); let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { return null; } finally { reader.releaseLock(); }
}
/** A Wafly aceita base64 e URL. Validamos os bytes no R2, mas enviamos a URL
 * HTTPS pública: base64 aumenta o corpo em ~33% e fez o proxy da Wafly encerrar
 * requisições de mídia com HTTP 524 antes de devolver o messageId. */
async function conteudoGrupo_(env, m) {
  const url = String(m.url || '');
  const prefixo = String(env.MIDIA_URL || '').replace(/\/$/, '') + '/m/';
  if (!url.startsWith(prefixo)) return url;
  const chave = url.slice(prefixo.length);
  if (!/^[a-z0-9/_-]+\.(?:jpg|jpeg|png|webp|mp4)$/.test(chave) || chave.includes('..')) return url;
  const obj = await env.MIDIA.get(chave);
  if (!obj) throw new Error('MIDIA_AUSENTE');
  if (!Number.isFinite(obj.size)) throw new Error('VIDEO_TAMANHO_DESCONHECIDO');
  // Evita mudar silenciosamente para envio por URL: nesse caminho a Wafly pode falhar ao buscar o vídeo.
  // Rejeição antes de criar recibo, sem qualquer envio à Wafly.
  if (chave.endsWith('.mp4') && obj.size > 12 * 1024 * 1024) throw new Error('VIDEO_GRANDE_GRUPO');
  if (obj.size > 12 * 1024 * 1024) return url;
  const bytes = await obj.arrayBuffer();
  // Celulares podem gravar MP4 em HEVC/H.265. O endpoint send-video da Wafly
  // não promete conversão, ao contrário do endpoint de Status. Recusamos antes
  // de criar recibo ou chamar a API: uma falha depois do envio fica incerta.
  if (chave.endsWith('.mp4') && /hvc1|hev1/.test(new TextDecoder().decode(bytes))) throw new Error('VIDEO_HEVC');
  return url;
}
/** Valida antes de aceitar qualquer entrada ou retorno à fila do grupo. */
async function erroVideoGrupo_(env, midias) {
  for (const m of midias || []) if (m.tipo === 'video') {
    try { await conteudoGrupo_(env, m); }
    catch (e) { return e && e.message === 'VIDEO_HEVC' ? 'Este vídeo usa H.265/HEVC. Para o Grupo clientes, envie um MP4 H.264/AAC em uma nova postagem.' : 'Não consegui validar o vídeo do Grupo clientes. Envie-o novamente antes de agendar.'; }
  }
  return '';
}
/** Recibo durável por mídia: nunca repetir um envio cujo resultado ficou incerto.
 * O messageId da API é reply, NÃO é chave de idempotência. Não o usamos como tal. */
/** Resposta inconclusiva: não significa que a Wafly deixou de entregar. Nunca repetir automaticamente. */
async function aguardarConfirmacaoGrupo_(env, p, detalhe) {
  const aviso = 'Grupo clientes: aguardando confirmação da entrega. ' + detalhe + ' Confira no WhatsApp; não reenviamos automaticamente.';
  await env.DB.prepare("UPDATE postagem SET status='processando', erro=?, atualizado_em=? WHERE id=?").bind(aviso.slice(0, 300), agora(), p.id).run();
  return { ok: true, aguardando: true };
}
const GRUPO_ESPERA_MAX_MS = 10 * 60000;
async function enviarGrupoClientes_(env, p) {
  const cfg = cfgGrupoClientes_(env);
  if (!cfg) return marcarErroPost_(env, p, 'O Grupo clientes ainda não está configurado. Avise o gestor.');
  const midias = JSON.parse(p.midias || '[]');
  for (let i = 0; i < midias.length; i++) {
    const antigo = await env.DB.prepare('SELECT estado, atualizado_em FROM postagem_grupo_recibo WHERE postagem_id=? AND ordem=?').bind(p.id, i).first();
    if (antigo && antigo.estado === 'aceito') continue;
    // O cron seguinte pode rodar enquanto a Wafly ainda processa o vídeo.
    // Não transformar uma requisição em andamento em erro só porque já existe recibo.
    if (antigo && antigo.estado === 'enviando' && p.status === 'processando') {
      const desde = Date.parse(antigo.atualizado_em || p.inicio_proc || p.atualizado_em || '') || Date.now();
      if (Date.now() - desde <= GRUPO_ESPERA_MAX_MS) return { ok: true, aguardando: true };
      await env.DB.prepare("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=? AND status='processando'")
        .bind('Grupo clientes: a Wafly não confirmou em 10 min. Confira o grupo; depois escolha “Repostar com novo ID” ou “Descartar”.', agora(), p.id).run();
      return { ok: false, erro: 'Tempo de confirmação do Grupo clientes esgotado.' };
    }
    if (antigo) return marcarErroPost_(env, p, 'Grupo clientes: envio sem confirmação. Confira na Wafly antes de qualquer novo envio; não reenviamos para evitar duplicação.');
    let conteudo;
    try { conteudo = await conteudoGrupo_(env, midias[i]); }
    catch (e) { return marcarErroPost_(env, p, e && e.message === 'VIDEO_HEVC' ? 'Grupo clientes: este MP4 usa H.265/HEVC. Converta para MP4 H.264/AAC e crie uma nova postagem; nada foi enviado à Wafly.' : e && e.message === 'VIDEO_GRANDE_GRUPO' ? 'Grupo clientes: vídeo acima de 12 MiB. Comprima para até 12 MiB e crie nova postagem; nada foi enviado à Wafly.' : 'Grupo clientes: não consegui ler a mídia. Confira o arquivo e tente novamente.'); }
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO postagem_grupo_recibo (postagem_id, ordem, estado, atualizado_em) VALUES (?,?,'enviando',?)").bind(p.id, i, agora()).run();
    if (!claim.meta || claim.meta.changes !== 1) return;
    await env.DB.prepare("UPDATE postagem SET status='processando', inicio_proc=?, atualizado_em=? WHERE id=? AND status='agendado'").bind(agora(), agora(), p.id).run();
    p.status = 'processando';
    const video = midias[i].tipo === 'video';
    const payload = { phone: cfg.phone, caption: String(p.legenda || '') };
    payload[video ? 'video' : 'image'] = conteudo;
    let r, j;
    try {
      r = await fetch('https://wafly.com.br/api-bridge-whats/instances/' + encodeURIComponent(cfg.instance) + '/token/' + encodeURIComponent(cfg.token) + (video ? '/send-video' : '/send-image'), {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(45000),
        headers: { 'Client-Token': cfg.clientToken, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      j = await respostaGrupo_(r);
    } catch (e) { return aguardarConfirmacaoGrupo_(env, p, 'A resposta da Wafly foi interrompida.'); }
    const respostaInfo = { postagemId: p.id, ordem: i, em: agora(), http: r.status,
      campos: j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).filter(k => /^[a-zA-Z][a-zA-Z0-9_]{0,35}$/.test(k)).slice(0, 15) : [],
      valor: j && typeof j.value === 'boolean' ? j.value : null, idPresente: !!(j && j.messageId) };
    try { await cfgSet(env, 'grupo_ultimo_envio', JSON.stringify(respostaInfo)); } catch (e) { /* diagnóstico não bloqueia recibo */ }
    if (!r.ok || !j || j.value === false || j.error || !j.messageId) {
      // Só rejeições explícitas 4xx (exceto timeout/conflito/limite) permitem tentativa manual posterior.
      const rejeitado = r.status >= 400 && r.status < 500 && ![408, 409, 429].includes(r.status);
      if (rejeitado) await env.DB.prepare("UPDATE postagem_grupo_recibo SET estado='recusado', atualizado_em=? WHERE postagem_id=? AND ordem=?").bind(agora(), p.id, i).run();
      return rejeitado ? marcarErroPost_(env, p, 'Grupo clientes: a Wafly recusou a publicação (HTTP ' + r.status + '). Confira conexão e permissão antes de tentar novamente.') : aguardarConfirmacaoGrupo_(env, p, 'A Wafly respondeu HTTP ' + r.status + '.');
    }
    await env.DB.prepare("UPDATE postagem_grupo_recibo SET estado='aceito', mensagem_id=?, atualizado_em=? WHERE postagem_id=? AND ordem=?").bind(String(j.messageId).slice(0, 200), agora(), p.id, i).run();
  }
  await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, erro='', publicado_em=?, atualizado_em=? WHERE id=?").bind('grupo:' + p.id, agora(), agora(), p.id).run();
  return { ok: true, canal: 'grupo' };
}

/* ==========================================================================
 * v2.0 -- STATUS DO WHATSAPP 2 (provedor Wame) (25/10/2026)
 *
 *  Canal `whatsapp2`: publica no Status do segundo WhatsApp da loja pela API da Wame
 *  (https://wame.api.br/docs/api): POST {base}/{key}/status/image e /status/video com { url, caption }.
 *  A chave da instância vai no caminho da URL (a Wame não usa cabeçalho de autenticação).
 *
 *  Segredo privado WAME_STATUS_2 = JSON {"key":"…"} (opcional "base"). Nunca vem do navegador, nunca volta à tela, nunca vai ao Git.
 *  Sem o segredo o destino fica "não configurado" e o painel avisa em português.
 *
 *  A Wame NÃO documenta idempotência nem o formato da resposta dos endpoints de status. Por isso o envio segue a regra do Grupo clientes:
 *   - recibo durável por mídia (postagem_grupo_recibo) ANTES de chamar a API;
 *   - resposta inconclusiva (rede, 5xx, 408/409/429) = "aguardando confirmação": NUNCA reenvia sozinho;
 *   - 4xx explícito = recusado (a pessoa pode tentar de novo depois de conferir);
 *   - 2xx sem erro declarado = aceito. Só guardamos os NOMES dos campos da resposta (diagnóstico), nunca o conteúdo.
 * ========================================================================== */
const WAME_SERVIDORES = ['server.wame.api.br', 'us.api-wa.me', 'server.api-wa.me'];
const WAME_BASES_OK = /^https:\/\/(?:server\.wame\.api\.br|us\.api-wa\.me|server\.api-wa\.me)$/;
function validarConfigWame_(bruto) {
  try {
    const c = JSON.parse(bruto || '{}'), key = String(c.key || '').trim();
    if (!/^[A-Za-z0-9._-]{8,200}$/.test(key)) return null;
    const base = String(c.base || 'https://server.wame.api.br').replace(/\/+$/, '');
    return WAME_BASES_OK.test(base) ? { key: key, base: base } : null;
  } catch (e) { return null; }
}
/** A chave e o servidor cadastrados na Gestão (D1) valem primeiro; o segredo do Worker é o reserva. */
async function cfgWameStatus_(env) {
  let guardada = null, servidor = null;
  try { guardada = await cfgGet(env, 'wame_status_2'); servidor = await cfgGet(env, 'wame_status_2_servidor'); } catch (e) { /* sem D1: cai no segredo */ }
  const base = servidor && WAME_SERVIDORES.includes(servidor) ? 'https://' + servidor : undefined;
  if (guardada) return validarConfigWame_(JSON.stringify({ key: guardada, base: base }));
  const sec = validarConfigWame_(env.WAME_STATUS_2);
  return sec && base ? { key: sec.key, base: base } : sec;
}
/** Quando a Wame recusa o Status por falta de plano, guardamos o aviso para a tela não pré-marcar o destino. Só aviso: nunca impede o envio. */
async function bloqueioWame_(env) {
  try { const v = await cfgGet(env, 'wame_plano_bloqueio'); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
async function motivoWame_(env) {
  if (!(await cfgWameStatus_(env))) return 'falta cadastrar a chave do Wame em Conexões';
  const b = await bloqueioWame_(env);
  return b ? 'o plano atual do Wame não inclui postar Status' + (b.plano ? ' (é preciso o plano ' + b.plano + ')' : '') : '';
}
/** Teste de conexão (somente leitura): GET /{chave}/instance em cada servidor permitido, começando pelo configurado. */
async function testarWame_(env) {
  const cfg = await cfgWameStatus_(env);
  if (!cfg) return { ok: false, erro: 'Cadastre a chave do Wame antes de testar.' };
  const hosts = [cfg.base.replace('https://', '')].concat(WAME_SERVIDORES.filter((h) => 'https://' + h !== cfg.base));
  const res = [];
  for (const h of hosts) {
    let r, j = null;
    try {
      r = await fetch('https://' + h + '/' + encodeURIComponent(cfg.key) + '/instance', { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': UA } });
      j = await respostaGrupo_(r);
    } catch (e) { res.push({ servidor: h, http: 0, texto: 'não respondeu' }); continue; }
    const o = j && typeof j === 'object' && !Array.isArray(j) ? j : {}, inner = o.instance && typeof o.instance === 'object' ? o.instance : {};
    const achar = (nomes) => { for (const src of [o, inner]) for (const n of nomes) if (typeof src[n] === 'boolean') return src[n]; return null; };
    const conectado = achar(['phoneConnected', 'connected', 'isConnected']);
    const estado = textoWame_(o.state || inner.state || o.connection || inner.connection || (typeof o.status === 'string' ? o.status : '') || (typeof inner.status === 'string' ? inner.status : ''), cfg.key);
    let texto;
    if (r.status === 403) texto = erroRecusaWame_(403, j, cfg.key);
    else if (r.status === 401 || r.status === 404) texto = 'este servidor não reconhece a chave';
    else if (!r.ok) texto = 'respondeu HTTP ' + r.status;
    else texto = conectado === true ? 'conectado' : conectado === false ? 'responde, mas o WhatsApp está desconectado' : estado ? 'responde (estado: ' + estado + ')' : 'responde, mas não informou o estado';
    res.push({ servidor: h, http: r.status, conectado: r.ok ? conectado : null, texto: texto, campos: Object.keys(o).filter((k) => /^[a-zA-Z][a-zA-Z0-9_]{0,35}$/.test(k)).slice(0, 15) });
    if (r.ok) break;
  }
  const bom = res.find((x) => x.http >= 200 && x.http < 300);
  try { await cfgSet(env, 'wame_ultimo_teste', JSON.stringify({ em: agora(), res: res })); } catch (e) { /* diagnóstico não bloqueia */ }
  const bloqueio = await bloqueioWame_(env);
  return { ok: true, bloqueioStatus: bloqueio ? 'O último envio de Status foi recusado: o plano atual do Wame não inclui postar Status' + (bloqueio.plano ? ' (é preciso o plano ' + bloqueio.plano + ')' : '') + '. A conexão em si está normal.' : '', servidorAtual: cfg.base.replace('https://', ''), resultados: res, encontrado: bom ? bom.servidor : null, conectado: bom ? bom.conectado : null };
}
/** Canais com recibo por mídia (nunca reenviar quando o resultado ficou incerto). */
function canalComRecibo_(c) { return c === 'grupo' || c === 'whatsapp2'; }
function nomeCanalRecibo_(c) { return c === 'whatsapp2' ? 'WhatsApp Status 2' : 'Grupo clientes'; }
/** O corpo da resposta da Wame é desconhecido: "erro" = campo de erro explícito ou sucesso explicitamente falso. */
function respostaWameComErro_(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  return !!(j.error || j.erro || j.success === false || j.ok === false || j.value === false || String(j.status || '').toLowerCase() === 'error');
}
function idMensagemWame_(j) {
  const c = j && typeof j === 'object' ? [j.messageId, j.id, j.key && j.key.id, j.data && j.data.key && j.data.key.id, j.data && j.data.id, j.message && j.message.key && j.message.key.id] : [];
  const x = c.find((v) => typeof v === 'string' && v);
  return x ? String(x).slice(0, 200) : '';
}
async function aguardarConfirmacaoWame_(env, p, detalhe) {
  const aviso = 'WhatsApp Status 2: aguardando confirmação da entrega. ' + detalhe + ' Confira no WhatsApp; não reenviamos automaticamente.';
  await env.DB.prepare("UPDATE postagem SET status='processando', erro=?, atualizado_em=? WHERE id=?").bind(aviso.slice(0, 300), agora(), p.id).run();
  return { ok: true, aguardando: true };
}
/** Texto curto e seguro vindo da Wame (nunca a chave), para mostrar ao gestor em português. */
function textoWame_(v, key) {
  let t = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (key) t = t.split(key).join('…');
  return t.slice(0, 140);
}
/** 403 com campos de plano = a instância do Wame não tem o recurso "status" no plano contratado. */
function erroRecusaWame_(status, j, key) {
  const o = j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  const plano = textoWame_(o.requiredPlanName || o.requiredPlan, key), recurso = textoWame_(o.feature, key), msg = textoWame_(o.message, key);
  if (plano) return 'WhatsApp Status 2: o plano atual do Wame não inclui' + (recurso ? ' o recurso “' + recurso + '”' : ' esse recurso') + '. É preciso o plano ' + plano + '. Troque o plano no painel do Wame e use “Tentar de novo”.';
  return 'WhatsApp Status 2: a Wame recusou a publicação (HTTP ' + status + ')' + (msg ? ': ' + msg : '') + '. Confira o plano e se o WhatsApp 2 está conectado; depois use “Tentar de novo”.';
}
async function enviarStatusWame_(env, p) {
  const cfg = await cfgWameStatus_(env);
  if (!cfg) return marcarErroPost_(env, p, 'O WhatsApp Status 2 ainda não está configurado. Avise o gestor.');
  let midias = []; try { midias = JSON.parse(p.midias || '[]'); } catch (e) { midias = []; }
  if (!midias.length) return marcarErroPost_(env, p, 'WhatsApp Status 2: a postagem não tem foto nem vídeo.');
  for (let i = 0; i < midias.length; i++) {
    const antigo = await env.DB.prepare('SELECT estado, atualizado_em FROM postagem_grupo_recibo WHERE postagem_id=? AND ordem=?').bind(p.id, i).first();
    if (antigo && antigo.estado === 'aceito') continue;
    if (antigo && antigo.estado === 'enviando' && p.status === 'processando') {
      const desde = Date.parse(antigo.atualizado_em || p.inicio_proc || p.atualizado_em || '') || Date.now();
      if (Date.now() - desde <= GRUPO_ESPERA_MAX_MS) return { ok: true, aguardando: true };
      await env.DB.prepare("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=? AND status='processando'")
        .bind('WhatsApp Status 2: sem confirmação em 10 min. Confira o Status no WhatsApp; depois escolha “Repostar com novo ID” ou “Descartar”.', agora(), p.id).run();
      return { ok: false, erro: 'Tempo de confirmação do WhatsApp Status 2 esgotado.' };
    }
    if (antigo) return marcarErroPost_(env, p, 'WhatsApp Status 2: envio sem confirmação. Confira o Status no WhatsApp antes de qualquer novo envio; não reenviamos para evitar duplicação.');
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO postagem_grupo_recibo (postagem_id, ordem, estado, atualizado_em) VALUES (?,?,'enviando',?)").bind(p.id, i, agora()).run();
    if (!claim.meta || claim.meta.changes !== 1) return;
    await env.DB.prepare("UPDATE postagem SET status='processando', inicio_proc=?, atualizado_em=? WHERE id=? AND status='agendado'").bind(agora(), agora(), p.id).run();
    p.status = 'processando';
    const video = midias[i].tipo === 'video';
    let r, j;
    try {
      r = await fetch(cfg.base + '/' + encodeURIComponent(cfg.key) + (video ? '/status/video' : '/status/image'), {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ url: String(midias[i].url || ''), caption: String(p.legenda || '') })
      });
      j = await respostaGrupo_(r);
    } catch (e) { return aguardarConfirmacaoWame_(env, p, 'A resposta da Wame foi interrompida.'); }
    try {
      await cfgSet(env, 'wame_ultimo_envio', JSON.stringify({ postagemId: p.id, ordem: i, em: agora(), http: r.status,
        campos: j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).filter((k) => /^[a-zA-Z][a-zA-Z0-9_]{0,35}$/.test(k)).slice(0, 15) : [], idPresente: !!idMensagemWame_(j),
        motivo: textoWame_(j && j.reason, cfg.key), recurso: textoWame_(j && j.feature, cfg.key), plano: textoWame_(j && (j.requiredPlanName || j.requiredPlan), cfg.key) }));
    } catch (e) { /* diagnóstico não bloqueia o recibo */ }
    if (!r.ok || respostaWameComErro_(j)) {
      const rejeitado = r.status >= 400 && r.status < 500 && ![408, 409, 429].includes(r.status);
      if (rejeitado) await env.DB.prepare("UPDATE postagem_grupo_recibo SET estado='recusado', atualizado_em=? WHERE postagem_id=? AND ordem=?").bind(agora(), p.id, i).run();
      if (rejeitado && r.status === 403 && j && typeof j === 'object' && (j.requiredPlan || j.requiredPlanName || j.reason === 'permission_denied')) {
        try { await cfgSet(env, 'wame_plano_bloqueio', JSON.stringify({ em: agora(), plano: textoWame_(j.requiredPlanName || j.requiredPlan, cfg.key), recurso: textoWame_(j.feature, cfg.key) })); } catch (e) { /* aviso não bloqueia */ }
      }
      if (rejeitado) return marcarErroPost_(env, p, erroRecusaWame_(r.status, j, cfg.key));
      if (r.ok) return aguardarConfirmacaoWame_(env, p, 'A Wame respondeu com aviso de erro.');
      return aguardarConfirmacaoWame_(env, p, 'A Wame respondeu HTTP ' + r.status + '.');
    }
    await env.DB.prepare("UPDATE postagem_grupo_recibo SET estado='aceito', mensagem_id=?, atualizado_em=? WHERE postagem_id=? AND ordem=?").bind(idMensagemWame_(j), agora(), p.id, i).run();
    try { await cfgSet(env, 'wame_plano_bloqueio', null); } catch (e) { /* aviso */ }
  }
  await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, erro='', publicado_em=?, atualizado_em=? WHERE id=?").bind('wame:' + p.id, agora(), agora(), p.id).run();
  return { ok: true, canal: 'whatsapp2' };
}

async function avancarPostagem(env, token, p) {
  if (p.canal === 'grupo') return enviarGrupoClientes_(env, p);
  if (p.canal === 'whatsapp2') return (String(p.ig_id || '').indexOf('zapq:') === 0 || await cfgWafly_(env, 2)) ? enviarStatusWafly2_(env, p) : enviarStatusWame_(env, p);
  const m = JSON.parse(p.midias || '[]');
  /* v1.9: aguardando a confirmação da Wafly (409/timeout). Só consulta; "aceito" publica (WhatsApp) ou segue para o Instagram (ambos). */
  if (String(p.ig_id || '').indexOf('zapq:') === 0) {
    const rz = await resolverZapPendente_(env, p, false);
    if (rz !== 'aceito') return;
    if (!canalUsaInstagram_(p.canal)) return { ok: true, canal: 'whatsapp' };
  }
  /* v1.2: O CANAL MANDA. Quando o canal nao inclui o Instagram, as chamadas ao Graph nem sao feitas
   * -- a peca vai para o Status do WhatsApp pelo backend. Antes o campo era ignorado por completo e
   * tudo caia no caminho do Instagram. */
  if (!canalUsaInstagram_(p.canal)) return await enviarWhatsApp_(env, p);
  /* v1.3 (canal "ambos"): o WhatsApp vai ANTES do Instagram. Se o WhatsApp falhar, a peça fica em erro
   * e o Instagram não é publicado (o lojista tenta de novo). Se já foi enviado ao WhatsApp numa tentativa
   * anterior, não reenvia: o requestId é estável, então a Wafly não republica. */
  const zapJaEnviado = String(p.ig_id || '').indexOf('zap:') === 0;
  if (canalUsaWhatsApp_(p.canal) && !zapJaEnviado) {
    const z = await enviarWhatsAppSo_(env, p);
    if (z.pendente) return await marcarAguardaZap_(env, p, z.requestId);
    if (!z.ok) return await marcarErroPost_(env, p, 'WhatsApp: ' + z.erro);
    await env.DB.prepare("UPDATE postagem SET ig_id=?, atualizado_em=? WHERE id=?").bind('zap:' + z.requestId, agora(), p.id).run();
  }
  if (p.status === 'agendado') {
    const r = await env.DB.prepare("UPDATE postagem SET status='processando', inicio_proc=?, atualizado_em=? WHERE id=? AND status='agendado'").bind(agora(), agora(), p.id).run();
    if (!r.meta || r.meta.changes !== 1) return;                         // outra execução pegou
    p.inicio_proc = agora();
  }
  let c = {}; try { c = JSON.parse(p.containers || '{}') || {}; } catch (e) { c = {}; }
  if (p.tipo === 'carrossel') {
    if (!c.filhos) { c.filhos = []; for (const x of m) c.filhos.push((await graphPost(env, token, '/me/media', parametrosContainer(p, x, true))).id); await gravarContainers(env, p.id, c); }
    if (!c.principal) {
      const sts = []; for (const id of c.filhos) sts.push(await statusContainer(env, token, id));
      if (sts.some((x) => x === 'ERROR' || x === 'EXPIRED')) throw new ErroIG({ message: 'o Instagram não conseguiu processar uma das mídias do carrossel', code: 0, error_subcode: 2207052 }, 0);
      if (sts.some((x) => x !== 'FINISHED')) return esperar(env, p);
      c.principal = (await graphPost(env, token, '/me/media', { media_type: 'CAROUSEL', children: c.filhos.join(','), caption: p.legenda || '' })).id; await gravarContainers(env, p.id, c);
    }
  } else if (!c.principal) {
    c.principal = (await graphPost(env, token, '/me/media', parametrosContainer(p, m[0], false))).id; await gravarContainers(env, p.id, c);
  }
  const st = await statusContainer(env, token, c.principal);
  if (st === 'ERROR' || st === 'EXPIRED') throw new ErroIG({ message: 'o Instagram não conseguiu processar a mídia', code: 0, error_subcode: 2207052 }, 0);
  if (st !== 'FINISHED' && st !== 'PUBLISHED') return esperar(env, p);
  const pub = await graphPost(env, token, '/me/media_publish', { creation_id: c.principal });
  let permalink = ''; try { permalink = (await graph(env, token, '/' + encodeURIComponent(pub.id) + '?fields=permalink')).permalink || ''; } catch (e) { /* o link é conforto */ }
  await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, permalink=?, erro='', publicado_em=?, atualizado_em=? WHERE id=?").bind(String(pub.id || ''), permalink, agora(), agora(), p.id).run();
}
async function esperar(env, p) {
  if (Date.now() - Date.parse(p.inicio_proc || agora()) > MAX_ESPERA_VIDEO_MS) throw new ErroIG({ message: 'o vídeo demorou demais para ser processado', code: 0, error_subcode: 2207052 }, 0);
}
async function falhaPostagem(env, p, e) {
  const f = fraseErroIG(e);
  if (f.espera) { await env.DB.prepare("UPDATE postagem SET status='agendado', agendado_em=?, containers='', erro=?, atualizado_em=? WHERE id=?").bind(new Date(Date.now() + 30 * 60000).toISOString(), f.frase, agora(), p.id).run(); return; }
  const tent = (Number(p.tentativas) || 0) + 1;
  if (f.fatal || tent >= MAX_TENT) { await env.DB.prepare("UPDATE postagem SET status='erro', tentativas=?, erro=?, containers='', atualizado_em=? WHERE id=?").bind(tent, f.frase, agora(), p.id).run(); return; }
  await env.DB.prepare("UPDATE postagem SET status='agendado', agendado_em=?, tentativas=?, containers='', erro=?, atualizado_em=? WHERE id=?").bind(new Date(Date.now() + 5 * 60000).toISOString(), tent, f.frase, agora(), p.id).run();
}
/** Chamado a cada minuto pelo cron (e logo ao criar "agora"). Nunca lança. */
async function dispararPostagens_(env){
  if(env.POSTAGENS_SEQUENCIA)return env.POSTAGENS_SEQUENCIA.get(env.POSTAGENS_SEQUENCIA.idFromName('loja')).acordar();
  return processarPostagens(env); // ambiente de testes/versão anterior, cron continua disponível
}
export async function processarPostagens(env) {
  try {
    await iniciar(env);
    // Após uma falha de grupo, registrar a saúde da instância e do destino sem
    // repetir a postagem. A sondagem é limitada a uma vez a cada cinco minutos.
    if (cfgGrupoClientes_(env)) {
      const ultimo = Number(await cfgGet(env, 'grupo_saude_ms')) || 0;
      if (Date.now() - ultimo > 300000) {
        const falha = await env.DB.prepare("SELECT id FROM postagem WHERE canal='grupo' AND status='erro' AND atualizado_em>? LIMIT 1").bind(new Date(Date.now() - 3600000).toISOString()).first();
        if (falha) {
          await cfgSet(env, 'grupo_saude_ms', Date.now());
          await cfgSet(env, 'grupo_saude', JSON.stringify(await diagnosticarGrupoClientes_(env)));
        }
      }
    }
    const t = agora();
    await env.DB.prepare("UPDATE postagem SET status='manual_pendente', atualizado_em=? WHERE modo='manual' AND status='agendado' AND agendado_em<=?").bind(t, t).run();
    const lin = (await env.DB.prepare("SELECT * FROM postagem WHERE modo='auto' AND ((status='agendado' AND agendado_em<=?) OR status='processando') ORDER BY CASE WHEN serie<>'' AND (status='processando' OR (parte>1 AND EXISTS(SELECT 1 FROM postagem ant WHERE ant.serie=postagem.serie AND ant.parte=postagem.parte-1 AND ant.status IN ('publicado','manual_feito')))) THEN 0 WHEN serie<>'' AND parte>1 THEN 2 ELSE 1 END, agendado_em, id LIMIT 40").bind(t).all()).results || [];
    if (!lin.length) return { feitas: 0 };
    const cfgP = await lerCfgPost(env);
    /* v1.2: o token do Instagram só é exigido quando ALGUMA postagem vencida vai para o Instagram.
     * Antes ele era exigido para a fila inteira: com "somente WhatsApp" escolhido, sem token do
     * Instagram a peça virava erro e o WhatsApp nunca era chamado. */
    const precisaIg = lin.some((p) => canalUsaInstagram_(p.canal));
    let token = '';
    if (precisaIg) { token = await cfgGet(env, 'ig_token'); if (token) token = await renovarToken(env, token); }
    const desde = new Date(Date.now() - 86400000).toISOString();
    const usados = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE status='publicado' AND COALESCE(canal,'instagram') IN ('instagram','ambos') AND publicado_em>=?").bind(desde).first()) || {}).n) || 0;
    /* v1.6: além do teto do Instagram, cada canal (Story, Status do WhatsApp, Reels, Carrossel, Feed) tem o SEU limite nas últimas 24 h. "Ambos" conta nos dois. */
    const porCanal = {}; for (const b of CANAIS_FILA) porCanal[b] = await contarUsados24h_(env, b, desde);
    const ativas=(await env.DB.prepare("SELECT s.serie,s.tipo,s.canal FROM postagem s WHERE s.serie<>'' AND s.parte=1 AND s.status IN ('publicado','processando','manual_feito','erro') AND EXISTS(SELECT 1 FROM postagem q WHERE q.serie=s.serie AND q.status IN ('agendado','processando','erro','manual_pendente')) ORDER BY s.agendado_em,s.id").all()).results||[];
    const recentes=(await env.DB.prepare("SELECT id,serie,origem_midia,tipo,canal,publicado_em FROM postagem WHERE status IN ('publicado','manual_feito') AND publicado_em>? ORDER BY publicado_em DESC LIMIT 1000").bind(new Date(Date.now()-86400000).toISOString()).all()).results||[];
    const estados=new Map(lin.filter(p=>p.serie).map(p=>[p.serie+':'+p.parte,p])),anteriores=lin.filter(p=>p.serie&&p.parte>1);
    if(anteriores.length){const rs=(await env.DB.prepare('SELECT serie,parte,status,publicado_em FROM postagem WHERE '+anteriores.map(()=>'(serie=? AND parte=?)').join(' OR ')).bind(...anteriores.flatMap(p=>[p.serie,p.parte-1])).all()).results||[];for(const r of rs)estados.set(r.serie+':'+r.parte,r);}
    let feitas = 0, novas = usados, tentadas = 0;
    for (const p of lin) {
      if (tentadas >= 4) break;                                       // no máximo 4 por minuto; as que esperam o limite do canal não ocupam essas vagas
      let anterior=null;
      if(p.serie&&p.parte>1){
        anterior=estados.get(p.serie+':'+(p.parte-1));
        if(!anterior||!['publicado','manual_feito'].includes(anterior.status))continue;
        if(!cfgP.partesRapidas&&Date.parse(anterior.publicado_em)+Math.max(...bucketsDoPost(p.tipo,p.canal).map(b=>gapDoTipoMs(cfgP,b)))>Date.now())continue;
      }
      const minha=ativas.findIndex(s=>s.serie===p.serie);
      if(ativas.some((s,i)=>s.serie!==p.serie&&(minha<0||i<minha)&&bucketsDoPost(s.tipo,s.canal).some(b=>bucketsDoPost(p.tipo,p.canal).includes(b))))continue;
      if (p.status === 'agendado' && !(anterior&&cfgP.partesRapidas) && !p.urgente && cfgP.pausaAtiva && foraDaPausa(cfgP, Date.now()) > Date.now()) {          // agendada antes da regra: não sai na pausa, vai para o primeiro horário livre depois dela
        tentadas++;try { const r = ajustarHorario(cfgP, p.tipo, Date.now(), await ocupadosDoTipo_(env, p.tipo, p.id, gapDoTipoMs(cfgP, p.tipo))); await env.DB.prepare('UPDATE postagem SET agendado_em=?, atualizado_em=? WHERE id=?').bind(new Date(r.t).toISOString(), agora(), p.id).run(); } catch (e) { /* tenta de novo no próximo minuto */ }
        continue;
      }
      if(p.status==='agendado'&&!(anterior&&cfgP.partesRapidas)&&!(p.urgente&&cfgP.agoraIgnora)){
        let liberar=0;for(const r of recentes)if((p.serie||r.serie)&&r.id!==p.id&&!(p.serie&&r.serie===p.serie)&&!(p.origem_midia&&r.origem_midia===p.origem_midia))for(const b of bucketsDoPost(p.tipo,p.canal))if(bucketsDoPost(r.tipo,r.canal).includes(b))liberar=Math.max(liberar,Date.parse(r.publicado_em)+Math.max(gapDoTipoMs(cfgP,b),Number(p.intervalo_ms)||0));
        if(liberar>Date.now()){tentadas++;await env.DB.prepare('UPDATE postagem SET agendado_em=?,atualizado_em=? WHERE id=?').bind(new Date(foraDaPausa(cfgP,liberar)).toISOString(),agora(),p.id).run();continue;}
      }
      const usaIg = canalUsaInstagram_(p.canal);
      if (usaIg && !token) { await env.DB.prepare("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=?").bind('O Instagram não está conectado. Conecte o token e use "Tentar de novo".', agora(), p.id).run(); continue; }
      if (p.status === 'agendado') {
        const bs = bucketsDoPost(p.tipo, p.canal);
        if (usaIg && novas >= (cfgP.max24h || MAX_POSTS_24H)) continue;                                  // teto do Instagram: fica agendada até abrir vaga
        if (bs.some((b) => porCanal[b] >= limiteDoTipo(cfgP, b))) continue;                              // limite do canal (ex.: Story): fica agendada até abrir vaga
        if (usaIg) novas++;
        bs.forEach((b) => { porCanal[b]++; });
      }
      tentadas++;
      try { await avancarPostagem(env, token, p); feitas++; } catch (e) { try { await falhaPostagem(env, p, e); } catch (e2) { /* próximo minuto tenta de novo */ } }
      const atual=await env.DB.prepare('SELECT status,publicado_em FROM postagem WHERE id=?').bind(p.id).first();
      if(atual?.status==='publicado')recentes.push({...p,...atual});
      if(p.serie){
        if(atual){estados.set(p.serie+':'+p.parte,atual);if(p.parte===1&&!ativas.some(s=>s.serie===p.serie))ativas.push({serie:p.serie,tipo:p.tipo,canal:p.canal});if(atual.status==='publicado'){if(p.parte===p.partes){const i=ativas.findIndex(s=>s.serie===p.serie);if(i>=0)ativas.splice(i,1);}}}
      }
    }
    const rapidas=cfgP.partesRapidas&&(await env.DB.prepare("SELECT 1 FROM postagem p WHERE p.serie<>'' AND p.status IN ('agendado','processando') AND p.agendado_em<=? AND NOT EXISTS(SELECT 1 FROM postagem e WHERE e.serie=p.serie AND e.status IN ('erro','cancelado','manual_pendente')) LIMIT 1").bind(agora()).first());
    return { feitas: feitas,continuar:tentadas>0&&!!rapidas };
  } catch (e) { return { feitas: 0, erro: true }; }
}
/** Quantas postagens deste canal já saíram nas últimas 24 h (Story, Feed… do Instagram; ou "status" do WhatsApp). */
async function contarUsados24h_(env, bucket, desde) {
  const doCanal = bucket === 'grupo' ? "canal='grupo'" : bucket === 'status2' ? "canal='whatsapp2'" : bucket === 'status' ? "canal IN ('whatsapp','ambos')" : "tipo=? AND (canal IS NULL OR canal='' OR canal IN ('instagram','ambos'))";
  const bind = bucket === 'status' || bucket === 'grupo' || bucket === 'status2' ? [desde] : [bucket, desde];
  return Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE status='publicado' AND " + doCanal + ' AND publicado_em>=?').bind(...bind).first()) || {}).n) || 0;
}
function httpsUrl(u) { try { const x = new URL(String(u)); return x.protocol === 'https:' && String(u).length <= 600; } catch (e) { return false; } }
/** Valida e normaliza o pedido de UMA postagem. Devolve { erro } ou { v }. */
/** Intervalo "humano" entre postagens em sequência (para não parecer robô): Story depois de Story = 1 a 3 min; o resto, 3 a 9 min. */
export function intervaloHumanoMs(tipoAnterior, tipo, sorteio) {
  const r = typeof sorteio === 'function' ? sorteio : Math.random, curto = tipoAnterior === 'story' && tipo === 'story';
  const min = curto ? 1 : 3, max = curto ? 3 : 9;
  return Math.round((min + r() * (max - min)) * 60000);
}

/* ==========================================================================
 * v1.4 -- REGRAS DA FILA (18/10/2026): pausa da madrugada, intervalo mínimo POR TIPO, encaixes e reorganização
 *
 *  Pedido do Pablo: só o gestor (Admin total) mexe nas regras de segurança (pausa, intervalos); quem tem permissão de postar
 *  só muda horário, sobe/desce e encaixa -- e o SERVIDOR garante as regras em qualquer caso:
 *   - nunca duas postagens do MESMO tipo (Story, Feed, Carrossel, Reels) no mesmo horário: sempre há o intervalo mínimo daquele tipo
 *     (tipos diferentes podem coincidir);
 *   - nada sai dentro da pausa (padrão 22:00-06:30, horário de Fortaleza, editável); passou da pausa vai para o fim dela;
 *   - "Agora mesmo" é a exceção (urgência): ignora pausa e intervalo (o gestor pode desligar isso);
 *   - "Na sequência" = primeiro horário livre da fila DAQUELE tipo (os buracos entre as postagens agendadas também contam).
 *  Funções puras e exportadas (testadas em tests/worker_ig.js); a pausa também vale na hora de publicar (cron), para o que foi agendado antes da regra.
 * ========================================================================== */
const FUSO_MIN = -180;                       // Fortaleza = UTC-3, sem horário de verão
export const TIPOS_FILA = ['story', 'feed', 'carrossel', 'reels'];
/* v1.6 (18/10/2026) -- "canais de contagem": cada um tem o SEU limite de 24 h e o SEU intervalo aleatório (mín.–máx.).
 * Story, Feed, Carrossel e Reels são do Instagram; "status" é o Status do WhatsApp. Postagem "ambos" conta nos DOIS (o tipo dela + status). */
export const CANAIS_FILA = ['story', 'status', 'feed', 'carrossel', 'reels', 'grupo', 'status2'];
export const CANAL_FILA_PADRAO = {
  story: { max24h: 40, gapMin: 120, gapMax: 300 },        // 2 a 5 min (exemplo do Pablo)
  status: { max24h: 40, gapMin: 120, gapMax: 300 },
  grupo: { max24h: 40, gapMin: 120, gapMax: 300 },
  status2: { max24h: 40, gapMin: 120, gapMax: 300 },
  feed: { max24h: 20, gapMin: 300, gapMax: 600 },
  carrossel: { max24h: 20, gapMin: 300, gapMax: 600 },
  reels: { max24h: 10, gapMin: 600, gapMax: 1200 },
};
export const CFG_POST_PADRAO = { pausaAtiva: true, pausaDe: '22:00', pausaAte: '06:30', max24h: 90, agoraIgnora: true, partesRapidas: true, canais: CANAL_FILA_PADRAO };
/** Em quais "canais de contagem" uma postagem entra: o tipo dela (se vai ao Instagram) e/ou "status" (se vai ao WhatsApp). */
export function bucketsDoPost(tipo, canal) {
  const out = [];
  if (canal === 'grupo') return ['grupo'];
  if (canal === 'whatsapp2') return ['status2'];
  if (canalUsaInstagram_(canal) && TIPOS_FILA.indexOf(tipo) !== -1) out.push(tipo);
  if (canalUsaWhatsApp_(canal)) out.push('status');
  return out;
}
function hmParaMin_(s, padrao) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? '' : s).trim()); if (!m) return padrao; const h = +m[1], n = +m[2]; return h > 23 || n > 59 ? padrao : h * 60 + n; }
function minParaHm_(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
const LEGADO_GAP_ = { story: 'gapStory', feed: 'gapFeed', carrossel: 'gapCarrossel', reels: 'gapReels' };
export function normalizarCfgPost(c) {
  const d = CFG_POST_PADRAO, x = c && typeof c === 'object' ? c : {};
  const num = (v, a, b, p) => { if (v === '' || v === null || v === undefined) return p; const n = Number(v); return isFinite(n) ? Math.min(b, Math.max(a, Math.round(n))) : p; };
  const hm = (v, p) => minParaHm_(hmParaMin_(v, hmParaMin_(p, 0)));
  const canais = {};
  CANAIS_FILA.forEach((b) => {
    const dp = CANAL_FILA_PADRAO[b], src = x.canais && typeof x.canais === 'object' && x.canais[b] && typeof x.canais[b] === 'object' ? x.canais[b] : {};
    const legado = LEGADO_GAP_[b] && x[LEGADO_GAP_[b]] !== undefined ? x[LEGADO_GAP_[b]] : undefined;      // painel antigo mandava só o intervalo mínimo (gapStory…)
    const mn = num(legado !== undefined ? legado : src.gapMin, 10, 7200, dp.gapMin);
    let mx = num(src.gapMax, 10, 7200, Math.max(dp.gapMax, mn));
    if (mx < mn) mx = mn;                                                                                 // o máximo nunca fica abaixo do mínimo
    canais[b] = { max24h: num(src.max24h, 1, 100, dp.max24h), gapMin: mn, gapMax: mx };
  });
  return {
    pausaAtiva: x.pausaAtiva === undefined ? d.pausaAtiva : !!x.pausaAtiva, pausaDe: hm(x.pausaDe, d.pausaDe), pausaAte: hm(x.pausaAte, d.pausaAte),
    max24h: num(x.max24h, 1, 100, d.max24h), agoraIgnora: x.agoraIgnora === undefined ? d.agoraIgnora : !!x.agoraIgnora, canais: canais, partesRapidas:x.partesRapidas===undefined?true:!!x.partesRapidas,
  };
}
/** Junta o que o gestor mandou (pode ser só um canal) com o que já estava salvo, canal por canal. */
export function mesclarCfgPost(atual, novo) {
  const a = atual && typeof atual === 'object' ? atual : {}, n = novo && typeof novo === 'object' ? novo : {};
  const canais = {};
  CANAIS_FILA.forEach((b) => { canais[b] = Object.assign({}, a.canais && a.canais[b], n.canais && typeof n.canais === 'object' ? n.canais[b] : null); });
  const m = Object.assign({}, a, n, { canais: canais });
  CANAIS_FILA.forEach((b) => { if (LEGADO_GAP_[b] && n[LEGADO_GAP_[b]] === undefined) delete m[LEGADO_GAP_[b]]; });
  return normalizarCfgPost(m);
}
/** Intervalo MÍNIMO (a garantia) do canal, em ms. */
export function gapDoTipoMs(cfg, tipo) { const c = cfg && cfg.canais && cfg.canais[tipo]; return (Number(c && c.gapMin) || (CANAL_FILA_PADRAO[tipo] || {}).gapMin || 300) * 1000; }
/** Intervalo MÁXIMO do canal, em ms (o sorteio da "Na sequência" fica entre o mínimo e este). */
export function gapMaxDoTipoMs(cfg, tipo) { const c = cfg && cfg.canais && cfg.canais[tipo]; return Math.max(gapDoTipoMs(cfg, tipo), (Number(c && c.gapMax) || 0) * 1000); }
export function limiteDoTipo(cfg, tipo) { const c = cfg && cfg.canais && cfg.canais[tipo]; return Number(c && c.max24h) || (CANAL_FILA_PADRAO[tipo] || {}).max24h || 20; }
/** Se `ms` cai dentro da pausa, devolve o instante em que ela termina; senão devolve o próprio `ms`. */
export function foraDaPausa(cfg, ms) {
  if (!cfg || !cfg.pausaAtiva) return ms;
  const de = hmParaMin_(cfg.pausaDe, 1320), ate = hmParaMin_(cfg.pausaAte, 390);
  if (de === ate) return ms;
  const d = new Date(ms + FUSO_MIN * 60000), loc = d.getUTCHours() * 60 + d.getUTCMinutes();
  const dentro = de < ate ? (loc >= de && loc < ate) : (loc >= de || loc < ate);
  if (!dentro) return ms;
  const meiaNoite = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - FUSO_MIN * 60000;      // 00:00 local daquele dia, em UTC
  let fim = meiaNoite + ate * 60000;
  if (fim <= ms) fim += 86400000;
  return fim;
}
/** Empurra `desejadoMs` para frente até respeitar a pausa e o intervalo mínimo do tipo em relação a `ocupadosMs` (horários das outras postagens do mesmo tipo). */
export function ajustarHorario(cfg, tipo, desejadoMs, ocupadosMs, opts) {
  if (opts && opts.ignorarRegras) return { t: desejadoMs, ajustado: false, motivo: '' };
  const gap = gapDoTipoMs(cfg, tipo), ord = (ocupadosMs || []).filter((x) => isFinite(x)).sort((a, b) => a - b);
  let t = desejadoMs, motivo = '';
  for (let i = 0; i < 2000; i++) {
    const p = foraDaPausa(cfg, t);
    if (p !== t) { t = p; motivo = motivo || 'pausa'; continue; }
    const c = ord.find((o) => Math.abs(o - t) < gap);
    if (c === undefined) break;
    t = c + gap; motivo = motivo || 'intervalo';
  }
  return { t: t, ajustado: t !== desejadoMs, motivo: motivo };
}
/** Igual a `ajustarHorario`, mas para uma postagem que entra em VÁRIOS canais de contagem (ex.: Story + Status do WhatsApp): o horário só vale quando serve para todos. */
export function ajustarHorarioMulti(cfg, buckets, desejadoMs, ocupMap, opts) {
  if (opts && opts.ignorarRegras) return { t: desejadoMs, ajustado: false, motivo: '' };
  let t = desejadoMs, motivo = '';
  for (let i = 0; i < 50; i++) {
    let mudou = false;
    for (const b of buckets || []) { const r = ajustarHorario(cfg, b, t, (ocupMap && ocupMap[b]) || []); if (r.t !== t) { t = r.t; motivo = motivo || r.motivo; mudou = true; } }
    if (!mudou) break;
  }
  return { t: t, ajustado: t !== desejadoMs, motivo: motivo };
}
/** "Na sequência": primeiro horário livre a partir de `desdeMs`, respeitando pausa e intervalo mínimo; depois o intervalo da postagem anterior é SORTEADO entre o mínimo e o máximo do canal (para não parecer robô). */
export function proximoLivreMulti(cfg, buckets, ocupMap, desdeMs, sorteio) {
  const r = typeof sorteio === 'function' ? sorteio : Math.random;
  let a = ajustarHorarioMulti(cfg, buckets, desdeMs, ocupMap), alvo = a.t;
  for (const b of buckets || []) {
    const mn = gapDoTipoMs(cfg, b), mx = gapMaxDoTipoMs(cfg, b);
    if (mx <= mn) continue;
    const ant = ((ocupMap && ocupMap[b]) || []).filter((x) => isFinite(x) && x <= a.t).sort((p, q) => p - q).pop();
    if (ant === undefined) continue;
    const sorteado = ant + mn + Math.round(r() * (mx - mn));
    if (sorteado > alvo) alvo = sorteado;
  }
  if (alvo > a.t) { const m = a.motivo; a = ajustarHorarioMulti(cfg, buckets, alvo, ocupMap); a.motivo = m || a.motivo; }
  return a;
}
/** v1.7 (18/10/2026): intervalo ESCOLHIDO pela pessoa entre as postagens de uma série ("de 10 em 10 minutos"), em ms; 0 = usar o sorteio do gestor. Vale de 1 min a 24 h. */
export function intervaloEditorialMs_(cfg,buckets,pedido,sorteio=Math.random){
  return Math.max(0,...buckets.map(b=>pedido?Math.max(pedido,gapDoTipoMs(cfg,b)):gapDoTipoMs(cfg,b)+Math.round(sorteio()*(gapMaxDoTipoMs(cfg,b)-gapDoTipoMs(cfg,b)))));
}
export function intervaloPedidoMs_(v) { const n = Math.round(Number(v)); return isFinite(n) && n >= 1 ? Math.min(1440, n) * 60000 : 0; }
/** Próximo horário da série: anterior + o intervalo escolhido (nunca menos que o mínimo de nenhum canal do post), respeitando pausa e o que já está na fila. */
export function intervaloEscolhido_(cfg, buckets, ocupMap, anteriorMs, intervaloMs) {
  let gap = intervaloMs; (buckets || []).forEach((b) => { gap = Math.max(gap, gapDoTipoMs(cfg, b)); });
  return ajustarHorarioMulti(cfg, buckets, anteriorMs + gap, ocupMap).t;
}
export function proximoLivre(cfg, tipo, ocupadosMs, desdeMs, sorteio) { return proximoLivreMulti(cfg, [tipo], { [tipo]: ocupadosMs }, desdeMs, sorteio); }
async function lerCfgPost(env) { let j = null; try { j = JSON.parse((await cfgGet(env, 'po_cfg')) || 'null'); } catch (e) { j = null; } return normalizarCfgPost(j); }
/** Horários já ocupados num canal de contagem (Story, Feed…, ou "status" do WhatsApp). `janelaMs` = quanto tempo para trás ainda importa. */
async function ocupadosDoTipo_(env, bucket, excluirId, janelaMs, semAgendadas, excluirSerie) {
  const desde = new Date(Date.now() - janelaMs - 60000).toISOString();
  const doCanal = bucket === 'grupo' ? "canal='grupo'" : bucket === 'status2' ? "canal='whatsapp2'" : bucket === 'status' ? "canal IN ('whatsapp','ambos')" : "tipo=? AND (canal IS NULL OR canal='' OR canal IN ('instagram','ambos'))";
  const bind = bucket === 'status' || bucket === 'grupo' || bucket === 'status2' ? [excluirId || 0, desde] : [bucket, excluirId || 0, desde];
  const q = (await env.DB.prepare('SELECT agendado_em, publicado_em, status FROM postagem WHERE ' + doCanal + " AND id!=?"+(excluirSerie?" AND COALESCE(serie,'')<>?":'')+" AND (status IN ('processando','manual_pendente'" + (semAgendadas ? '' : ",'agendado'") + ") OR (status IN ('publicado','manual_feito') AND publicado_em>=?))").bind(...(excluirSerie?[...bind.slice(0,-1),excluirSerie,bind.at(-1)]:bind)).all()).results || [];
  return q.map((r) => Date.parse(r.status === 'publicado' || r.status === 'manual_feito' ? r.publicado_em : r.agendado_em)).filter((x) => isFinite(x));
}
/** Ocupados de VÁRIOS canais de uma vez: { story: [...], status: [...] }. */
async function ocupadosMulti_(env, cfg, buckets, excluirId, semAgendadas) {
  const o = {}; for (const b of buckets) o[b] = await ocupadosDoTipo_(env, b, excluirId, gapMaxDoTipoMs(cfg, b), semAgendadas); return o;
}
export function validarPostagem(b) {
  const tipo = String((b && b.tipo) || '');
  if (TIPOS_POST.indexOf(tipo) === -1) return { erro: 'Escolha o tipo: Feed, Carrossel, Reels ou Story.' };
  const midias = Array.isArray(b.midias) ? b.midias.map((x) => ({ url: String((x && x.url) || ''), tipo: x && x.tipo === 'video' ? 'video' : 'imagem' })) : [];
  if (midias.some((x) => !httpsUrl(x.url))) return { erro: 'Uma das mídias não tem endereço válido (https).' };
  if (tipo === 'feed' && !(midias.length === 1 && midias[0].tipo === 'imagem')) return { erro: 'Feed leva exatamente 1 foto.' };
  if (tipo === 'carrossel' && (midias.length < 2 || midias.length > 10)) return { erro: 'Carrossel leva de 2 a 10 fotos/vídeos.' };
  if (tipo === 'reels' && !(midias.length === 1 && midias[0].tipo === 'video')) return { erro: 'Reels leva exatamente 1 vídeo.' };
  if (tipo === 'story' && midias.length !== 1) return { erro: 'Cada Story leva 1 foto ou 1 vídeo (para várias, crie um por foto).' };
  const legenda = String(b.legenda || '').slice(0, 2200);
  const modo = b.modo === 'manual' ? 'manual' : 'auto';
  if (modo === 'manual' && tipo !== 'story') return { erro: 'O modo manual (com link) só existe para Story.' };
  const link = String(b.link || '').trim();
  if (link && !httpsUrl(link)) return { erro: 'O link do Story precisa começar com https://.' };
  let quando = agora();
  const sequencia = b.quando === 'sequencia';
  const urgente = !sequencia && (!b.quando || b.quando === 'agora');
  if (b.quando && b.quando !== 'agora' && !sequencia) {
    const t = Date.parse(b.quando);
    if (!isFinite(t)) return { erro: 'A data e hora não são válidas.' };
    if (t - Date.now() > 60 * 86400000) return { erro: 'Dá para agendar até 60 dias à frente.' };
    if (t > Date.now()) quando = new Date(t).toISOString();
  }
  return { v: { tipo: tipo, modo: modo, legenda: legenda, midias: midias, link: link, quando: quando, agora: !sequencia && quando <= agora(), urgente: urgente, sequencia: sequencia, produto: String(b.produto || '').slice(0, 40), template: String(b.template || '').slice(0, 30), grupo: String(b.grupo || '').slice(0, 40), canal: normalizarCanal_(b.canal) } };
}
function progressoPostagem_(r) {
  const aguardando = String(r.ig_id || '').startsWith('zapq:');
  const fase = aguardando && r.status === 'processando' ? 'confirmacao' : ({agendado:'fila', processando:'processando', publicado:'confirmado', erro:'falha', manual_pendente:'manual', manual_feito:'confirmado'})[r.status];
  const p = { fase: fase || '', desde: r.inicio_proc || r.atualizado_em || r.criado_em || '' };
  if (aguardando && r.status === 'processando') {
    const inicio = Date.parse(r.inicio_proc || ''), ultima = Date.parse(r.atualizado_em || '');
    if (Number.isFinite(inicio)) p.limiteEm = new Date(inicio + ZAP_ESPERA_MAX_MS).toISOString();
    if (Number.isFinite(ultima) && (!Number.isFinite(inicio) || ultima + ZAP_CONSULTA_GAP_MS <= inicio + ZAP_ESPERA_MAX_MS)) p.proximaConsultaEm = new Date(ultima + ZAP_CONSULTA_GAP_MS).toISOString();
  }
  return p;
}
function linhaPostagem(r) {
  let m = []; try { m = JSON.parse(r.midias || '[]'); } catch (e) { m = []; }
  return { id: r.id, origemMidia:r.origem_midia||'', intervaloMs:Number(r.intervalo_ms)||0, serie:r.serie?{id:r.serie,ordem:r.parte,total:r.partes}:null, repostadoDe: r.repostado_de || null, tipo: r.tipo, modo: r.modo, legenda: r.legenda, midias: m, produto: r.produto, template: r.template, link: r.link, agendadoEm: r.agendado_em, status: r.status, tentativas: r.tentativas, erro: r.erro, progresso: progressoPostagem_(r), aguardaZap: String(r.ig_id || '').indexOf('zapq:') === 0, grupoEnvioIncerto: !!r.grupo_envio_incerto, grupoMidiaIncompativel: normalizarCanal_(r.canal) === 'grupo' && /H\.265\/HEVC/.test(String(r.erro || '')), permalink: r.permalink, criadoPor: r.criado_por, criadoEm: r.criado_em, publicadoEm: r.publicado_em, grupo: r.grupo, canal: normalizarCanal_(r.canal) };
}

/* ====================================================================
 * FOTOS DE CLIENTES ("Ela usa TM"): o cliente (logado) manda uma foto usando a peça; o funcionário também anexa a que recebeu pelo WhatsApp.
 * As fotos ficam numa aba ao lado da fila e só servem para Story com o template "Ela usa". Tudo no R2 (mesma trava de custo) + D1.
 * ==================================================================== */
const FOTO_MAX = 2.5 * 1024 * 1024, FOTOS_POR_DIA_CLIENTE = 5, FOTOS_NOVAS_CLIENTE = 30, FOTOS_POR_DIA_TOTAL = 300;
export function extensaoImagem(b) {      // confere os BYTES (JPEG/PNG/WEBP); HEIC e o resto são recusados
  const u = new Uint8Array(b);
  if (u.length > 12 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'jpg';
  if (u.length > 12 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'png';
  if (u.length > 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return 'webp';
  return null;
}
export function instagramLimpo(t) { const x = String(t || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase(); return /^[a-z0-9._]{1,30}$/.test(x) ? x : ''; }
const soDigitos = (t, n) => String(t || '').replace(/\D/g, '').slice(0, n || 15);
async function infoSessao(env, req) {       // {perms, nome} da sessão (qualquer conta: cliente, aluno, equipe); 2 min de cache
  const whats = soDigitos(req.headers.get('X-TK-Whats'), 20), sessao = (req.headers.get('X-TK-Sessao') || '').slice(0, 400);
  if (!whats || !/^tk[123]\./.test(sessao)) return null;
  const chave = new Request('https://sessaoinfo.invalid/' + (await sha(whats + '|' + sessao))), cache = caches.default, g = await cache.match(chave);
  if (g) return g.json();
  let info = null;
  try {
    const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'sessao', whatsapp: whats, sessao: sessao }) });
    const j = await r.json();
    if (j && j.ok && j.usuario) info = { perms: Array.isArray(j.usuario.permissoes) ? j.usuario.permissoes : [], nome: String(j.usuario.nome || '').slice(0, 80), whats: soDigitos(j.usuario.whatsapp || whats, 15) };
  } catch (e) { return null; }
  if (info) await cache.put(chave, new Response(JSON.stringify(info), { headers: { 'Cache-Control': 'max-age=120' } }));
  return info;
}
async function guardarFoto(env, req, limiteBytes) {      // lê o corpo, confere tamanho/bytes, trava de armazenamento e grava no R2
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return { erro: 'Nenhuma foto recebida.' };
  if (buf.byteLength > (limiteBytes || FOTO_MAX)) return { erro: 'A foto passa de 2,5 MB. Tente uma menor.' };
  const ext = extensaoImagem(buf); if (!ext) return { erro: 'Formato não aceito. Use foto JPG, PNG ou WEBP (no iPhone: escolha "Mais compatível" ou tire um print).' };
  const uso = await lerUso(env); if (uso.bytes + buf.byteLength > limite(env)) return { erro: 'O armazenamento de fotos está cheio no momento. Avise a loja.', cheio: true };
  const d = new Date(), aaaamm = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0'), chave = aaaamm + '/' + hex(10) + '.' + ext;
  await env.MIDIA.put(chave, buf, { httpMetadata: { contentType: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext, cacheControl: 'public, max-age=31536000, immutable' } });
  uso.bytes += buf.byteLength; uso.arquivos += 1; await env.CACHE.put('uso', JSON.stringify(uso));
  return { chave: chave, url: String(env.MIDIA_URL || '').replace(/\/$/, '') + '/m/' + chave };
}
async function contaPorWhats(env, req, alvo) {   // pergunta ao Apps Script (backend 4.4) se o WhatsApp já tem conta; falha = sem vínculo (nunca derruba o envio)
  try {
    const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'contaPorWhats', whatsapp: soDigitos(req.headers.get('X-TK-Whats'), 20), sessao: (req.headers.get('X-TK-Sessao') || '').slice(0, 400), alvo: alvo }) });
    const j = await r.json(); return j && j.ok ? j : null;
  } catch (e) { return null; }
}
function linhaFoto(r) { return { id: r.id, origem: r.origem, url: r.url, whats: r.whats, nome: r.nome, instagram: r.instagram, obs: r.obs, status: r.status, vinculo: r.vinculo, criadoPor: r.criado_por, criadoEm: r.criado_em, usadaEm: r.usada_em }; }
export async function rotasFotosCliente(env, req, url, J) {     // /cliente/foto (qualquer conta logada)
  if (url.pathname !== '/cliente/foto' || req.method !== 'POST') return null;
  const info = await infoSessao(env, req); if (!info) return J({ ok: false, erro: 'Entre na sua conta para enviar a foto.' }, 401);
  await iniciar(env);
  const whats = info.whats, desde = new Date(Date.now() - 86400000).toISOString();
  const dia = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM foto_cliente WHERE whats=? AND origem='cliente' AND criado_em>?").bind(whats, desde).first()) || {}).n) || 0;
  if (dia >= FOTOS_POR_DIA_CLIENTE) return J({ ok: false, erro: 'Você já enviou ' + FOTOS_POR_DIA_CLIENTE + ' fotos hoje. Amanhã dá para mandar mais. 🧡' }, 429);
  const novas = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM foto_cliente WHERE whats=? AND origem='cliente' AND status='nova'").bind(whats).first()) || {}).n) || 0;
  if (novas >= FOTOS_NOVAS_CLIENTE) return J({ ok: false, erro: 'Você já tem muitas fotos esperando a nossa análise. Obrigado!' }, 429);
  const total = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM foto_cliente WHERE origem='cliente' AND criado_em>?").bind(desde).first()) || {}).n) || 0;
  if (total >= FOTOS_POR_DIA_TOTAL) return J({ ok: false, erro: 'Recebemos muitas fotos hoje. Tente de novo amanhã.' }, 429);
  if (url.searchParams.get('aceito') !== '1') return J({ ok: false, erro: 'Marque que autoriza a loja a usar a foto nos Stories.' }, 400);
  const g = await guardarFoto(env, req); if (g.erro) return J({ ok: false, erro: g.erro }, g.cheio ? 507 : 400);
  const obs = String(url.searchParams.get('obs') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300), ig = instagramLimpo(url.searchParams.get('ig'));
  const r = await env.DB.prepare("INSERT INTO foto_cliente (origem, url, chave, whats, nome, instagram, obs, status, vinculo, criado_por, criado_em) VALUES ('cliente',?,?,?,?,?,?, 'nova','conta',?,?)").bind(g.url, g.chave, whats, info.nome, ig, obs, info.nome, agora()).run();
  return J({ ok: true, id: r.meta && r.meta.last_row_id });
}
export async function rotasFotos(env, ctx, req, url, J, perms) {       // /fotos* (equipe: gerir_acessos ou catalogo_cadastrar)
  const p = url.pathname;
  if (p === '/fotos/visuais') {     // configuração dos visuais de Postagens (nomes, CTA, visuais próprios, tipos): igual em todos os aparelhos e para todos que têm acesso
    const vAtual = async () => Number(await cfgGet(env, 'po_visuais_v')) || 0;
    if (req.method === 'GET') { const v = await cfgGet(env, 'po_visuais'); let d = null; try { d = v ? JSON.parse(v) : null; } catch (e) {} return J({ ok: true, dados: d, v: await vAtual() }); }
    if (req.method === 'POST') {
      let b = {}; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
      const dados = b.dados && typeof b.dados === 'object' && !Array.isArray(b.dados) ? b.dados : {};
      const gestor = (perms || []).indexOf('gerir_acessos') !== -1;
      let ignorouBiblioteca = false;
      if (!gestor) {     // v1.9 (Pablo, 18/10/2026): a BIBLIOTECA de elementos fixos (PNGs que valem para todos) só o Admin total muda; quem posta só USA. Aqui o servidor descarta qualquer mudança vinda de outra pessoa.
        const vv = await cfgGet(env, 'po_visuais'); let dd = null; try { dd = vv ? JSON.parse(vv) : null; } catch (e) {}
        const libServidor = dd && typeof dd === 'object' ? dd.tk_po_elementos_v1 : undefined;
        if (JSON.stringify(dados.tk_po_elementos_v1) !== JSON.stringify(libServidor)) ignorouBiblioteca = true;
        if (libServidor === undefined) delete dados.tk_po_elementos_v1; else dados.tk_po_elementos_v1 = libServidor;
      }
      const txt = JSON.stringify(dados);
      if (txt.length > 200000) return J({ ok: false, erro: 'Configuração grande demais.' }, 400);
      const atual = await vAtual();
      if (b.base != null && Number(b.base) !== atual) {      // outra pessoa salvou antes: devolve o que está no servidor para o aparelho juntar
        const v = await cfgGet(env, 'po_visuais'); let d = null; try { d = v ? JSON.parse(v) : null; } catch (e) {}
        return J({ ok: false, conflito: true, dados: d, v: atual });
      }
      await cfgSet(env, 'po_visuais', txt); await cfgSet(env, 'po_visuais_v', String(atual + 1)); return J({ ok: true, v: atual + 1, biblioteca: gestor, ignorouBiblioteca });
    }
  }
  if (p === '/fotos' && req.method === 'GET') {
    const st = url.searchParams.get('status') || 'nova', lim = Math.min(100, Number(url.searchParams.get('limite')) || 60);
    const q = (await (st === 'todas' ? env.DB.prepare('SELECT * FROM foto_cliente ORDER BY id DESC LIMIT ?').bind(lim) : env.DB.prepare('SELECT * FROM foto_cliente WHERE status=? ORDER BY id DESC LIMIT ?').bind(st, lim)).all()).results || [];
    const c = (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM foto_cliente GROUP BY status').all()).results || []; const conta = {}; c.forEach((x) => { conta[x.status] = x.n; });
    return J({ ok: true, fotos: q.map(linhaFoto), contagens: conta });
  }
  if (p === '/fotos/nova' && req.method === 'POST') {          // a equipe anexa a foto que recebeu pelo WhatsApp (1 por pedido)
    const whats = soDigitos(url.searchParams.get('whats'), 15), ig = instagramLimpo(url.searchParams.get('ig'));
    if (whats && whats.length < 10) return J({ ok: false, erro: 'WhatsApp incompleto: coloque com DDD (ex.: 88 99999-9999).' }, 400);
    if (!whats && !ig) return J({ ok: false, erro: 'Informe o WhatsApp ou o Instagram de quem mandou a foto (pelo menos um).' }, 400);
    const g = await guardarFoto(env, req); if (g.erro) return J({ ok: false, erro: g.erro }, g.cheio ? 507 : 400);
    let nome = '', vinculo = 'nenhum', w = whats, i = ig;
    if (w) {
      const c = await contaPorWhats(env, req, w);
      if (c && c.existe) { nome = String(c.nome || ''); vinculo = 'conta'; }
      else { const h = await env.DB.prepare("SELECT nome, instagram FROM foto_cliente WHERE whats=? AND (nome!='' OR instagram!='') ORDER BY id DESC LIMIT 1").bind(w).first(); if (h) { nome = h.nome || ''; if (!i) i = h.instagram || ''; vinculo = 'historico'; } }
      if (!i) { const h2 = await env.DB.prepare("SELECT instagram FROM foto_cliente WHERE whats=? AND instagram!='' ORDER BY id DESC LIMIT 1").bind(w).first(); if (h2) i = h2.instagram; }
    } else {
      const h = await env.DB.prepare("SELECT whats, nome FROM foto_cliente WHERE instagram=? AND (whats!='' OR nome!='') ORDER BY (whats!='') DESC, id DESC LIMIT 1").bind(i).first();
      if (h) { w = h.whats || ''; nome = h.nome || ''; vinculo = 'historico'; }
    }
    const obs = String(url.searchParams.get('obs') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300), por = String(url.searchParams.get('por') || '').slice(0, 60);
    const r = await env.DB.prepare("INSERT INTO foto_cliente (origem, url, chave, whats, nome, instagram, obs, status, vinculo, criado_por, criado_em) VALUES ('equipe',?,?,?,?,?,?, 'nova',?,?,?)").bind(g.url, g.chave, w, nome, i, obs, vinculo, por, agora()).run();
    return J({ ok: true, id: r.meta && r.meta.last_row_id, vinculo: vinculo, nome: nome, whats: w, instagram: i });
  }
  if (p === '/fotos/acao' && req.method === 'POST') {
    let b = {}; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
    const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter((n) => n > 0).slice(0, 50), acao = String(b.acao || '');
    const novo = { usada: 'usada', descartar: 'descartada', restaurar: 'nova' }[acao]; if (!novo || !ids.length) return J({ ok: false, erro: 'Ação inválida.' }, 400);
    for (const id of ids) await env.DB.prepare('UPDATE foto_cliente SET status=?, usada_em=? WHERE id=?').bind(novo, novo === 'usada' ? agora() : '', id).run();
    return J({ ok: true, n: ids.length });
  }
  return null;
}
async function uso24hPorCanal_(env) {
  const o = {}, desde = new Date(Date.now() - 86400000).toISOString();
  try { for (const b of CANAIS_FILA) o[b] = await contarUsados24h_(env, b, desde); } catch (e) { /* o painel só deixa de mostrar o uso */ }
  return o;
}
async function validarSeriesPost_(env,req,lista,vs){
  const dono=await sha(req.headers.get('X-TK-Whats')||''),grupos=new Map(),jobs=new Map();
  for(let i=0;i<lista.length;i++){
    const x=lista[i],v=vs[i],ref=x.serie;if(!ref)continue;
    if(v.tipo!=='story'||v.midias.length!==1||v.midias[0].tipo!=='video'||!Number.isSafeInteger(ref.ordem)||!Number.isSafeInteger(ref.total))throw Error('Partes de vídeo exigem Stories completos e em ordem.');
    let job=jobs.get(ref.preparo);
    if(!job){job=await env.DB.prepare("SELECT * FROM video_preparo WHERE id=? AND dono=? AND perfil='postagens-partes' AND estado='pronto'").bind(String(ref.preparo||''),dono).first();if(!job||job.criado<Date.now()-86400000)throw Error('Prepare novamente o original para usar todas as partes.');jobs.set(ref.preparo,job);}
    const plano=planoPartes(job.duracao,job.inicio),pt=await env.DB.prepare('SELECT * FROM video_parte WHERE preparo=? AND ordem=?').bind(job.id,ref.ordem).first();
    if(!pt||ref.total!==plano.length||pt.total!==ref.total)throw Error('A sequência não corresponde ao vídeo preparado.');
    const u=new URL(v.midias[0].url),base=new URL(env.MIDIA_URL),chave=u.pathname.startsWith('/m/')?decodeURIComponent(u.pathname.slice(3)):'';
    if(u.origin!==base.origin||!/^((t\/)?[0-9]{6}\/)[a-f0-9]{20}\.mp4$/.test(chave))throw Error('Uma parte não tem mídia válida da preparação.');
    const obj=await env.MIDIA.get(chave);if(!obj||obj.size>9961472)throw Error('Uma parte não está disponível.');
    const bytes=await corpoLimitadoVideo_(new Response(obj.body),9961472),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==pt.hash)throw Error('Uma parte mudou. Prepare novamente o vídeo original.');
    const k=job.id+':'+v.canal;let g=grupos.get(k);if(!g){g={id:crypto.randomUUID(),refs:[],total:ref.total};grupos.set(k,g);}
    if(g.refs.length&&ref.ordem!==g.refs.at(-1).parte+1)throw Error('Mantenha todas as partes na ordem original.');
    v.serie=g.id;v.parte=ref.ordem;v.partes=ref.total;g.refs.push(v);
  }
  for(const g of grupos.values())if(g.refs.length!==g.total||g.refs[0].parte!==1)throw Error('Inclua todas as partes do mesmo vídeo, na ordem original.');
}
async function reagendarVideoOriginal_(env,ctx,linha,quando,J){
  const ps=(await env.DB.prepare('SELECT * FROM postagem WHERE serie=? ORDER BY parte').bind(linha.serie).all()).results||[];
  if(linha.parte!==1||ps.length!==linha.partes||ps.some((x,i)=>x.parte!==i+1||!['agendado','erro'].includes(x.status)))return J({ok:false,erro:'Este vídeo já começou ou contém partes indisponíveis. As partes confirmadas não serão repetidas; consulte ou tente novamente apenas a parte com erro.'},409);
  if(ps.some(x=>String(x.ig_id||'').startsWith('zapq:'))||await env.DB.prepare("SELECT 1 FROM postagem_grupo_recibo r JOIN postagem p ON p.id=r.postagem_id WHERE p.serie=? AND r.estado='enviando'").bind(linha.serie).first())return J({ok:false,erro:'Há envio aguardando confirmação. Consulte o resultado antes de alterar o vídeo.'},409);
  const v=validarPostagem({...linhaPostagem(linha),quando});if(v.erro)return J({ok:false,erro:v.erro},400);
  const cfg=await lerCfgPost(env),bs=bucketsDoPost(linha.tipo,linha.canal),ocup={};
  for(const b of bs)ocup[b]=await ocupadosDoTipo_(env,b,0,gapMaxDoTipoMs(cfg,b),false,linha.serie);
  const urgente=v.v.urgente;let ajuste;
  if(urgente&&cfg.agoraIgnora)ajuste={t:Date.now(),ajustado:false};
  else if(v.v.sequencia)ajuste=proximoLivreMulti(cfg,bs,ocup,Date.now()+60000);
  else ajuste=ajustarHorarioMulti(cfg,bs,Math.max(Date.parse(v.v.quando),Date.now()),ocup);
  const em=new Date(ajuste.t).toISOString();
  const r=await env.DB.prepare("UPDATE postagem SET status='agendado',agendado_em=?,tentativas=0,erro='',containers='',urgente=?,atualizado_em=? WHERE serie=? AND status IN ('agendado','erro') AND NOT EXISTS(SELECT 1 FROM postagem q WHERE q.serie=? AND q.status NOT IN ('agendado','erro'))").bind(em,urgente?1:0,agora(),linha.serie,linha.serie).run();
  if(r.meta?.changes!==ps.length)return J({ok:false,erro:'O vídeo mudou enquanto você ajustava. Atualize a fila para conferir.'},409);
  if(ajuste.t<=Date.now()+1000&&ctx?.waitUntil)ctx.waitUntil(dispararPostagens_(env));
  return J({ok:true,quando:em,partes:ps.length,ajustado:!!ajuste.ajustado,motivo:ajuste.motivo||''});
}
async function rotasPostagem(env, ctx, req, url, J, perms) {
  const p = url.pathname;
  if (p === '/posts' && req.method === 'GET') {
    const lim = Math.min(250, Number(url.searchParams.get('limite')) || 60);
    const q = (await env.DB.prepare("SELECT postagem.*, EXISTS(SELECT 1 FROM postagem_grupo_recibo g WHERE g.postagem_id=postagem.id AND g.estado='enviando') AS grupo_envio_incerto FROM postagem WHERE status!='cancelado' ORDER BY CASE WHEN status IN ('agendado','processando','manual_pendente','erro','convertendo','transcodificando') THEN 0 ELSE 1 END, CASE WHEN status IN ('agendado','processando','manual_pendente','erro','convertendo','transcodificando') THEN agendado_em END ASC, publicado_em DESC, id DESC LIMIT ?").bind(lim).all()).results || [];
    const c = (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM postagem GROUP BY status").all()).results || [];
    const conta = {}; c.forEach((x) => { conta[x.status] = x.n; });
    return J({ ok: true, posts: q.map(linhaPostagem), contagens: conta, conectado: !!(await cfgGet(env, 'ig_token')), usuario: (await cfgGet(env, 'ig_usuario')) || '', grupoClientesDisponivel: !!cfgGrupoClientes_(env), status2Disponivel: (await status2Info_(env)).ok, status2Motivo: (await status2Info_(env)).motivo, regras: 1, config: await lerCfgPost(env), uso24h: await uso24hPorCanal_(env), podeRegras: (perms || []).indexOf('gerir_acessos') !== -1 });
  }
  let b = {}; if (req.method === 'POST') { try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); } }
  if (p === '/post' && req.method === 'POST') {
    const originais = Array.isArray(b.posts) ? b.posts : [b];
    if (!originais.length || originais.length > 60 || originais.some((x) => !x || typeof x !== 'object' || Array.isArray(x))) return J({ ok: false, erro: 'Envie de uma a sessenta postagens por vez.' }, 400);
    if (originais.some((x) => x.grupoClientes === true || x.canal === 'grupo') && !cfgGrupoClientes_(env)) return J({ ok: false, erro: 'O Grupo clientes ainda não está configurado. Avise o gestor.' }, 409);
    if (originais.some((x) => x.status2 === true || x.canal === 'whatsapp2') && !(await cfgWafly_(env, 2)) && !(await cfgWameStatus_(env))) return J({ ok: false, erro: 'O WhatsApp Status 2 ainda não está configurado. Avise o gestor.' }, 409);
    const fontes=new Map();
    const lista = originais.flatMap((x,indice) => {
      const chave=x.serie?'video:'+String(x.serie.preparo):'midia:'+indice;
      if(!fontes.has(chave))fontes.set(chave,crypto.randomUUID());
      // Story com figurinha de link exige Instagram manual. O Status continua
      // automático e precisa de um recibo próprio para nunca ser reenviado
      // quando alguém concluir a etapa manual do Instagram.
      const destinos = x.canal === 'ambos' && x.modo === 'manual'
        ? [Object.assign({}, x, { canal: 'instagram', grupoClientes: false }),
          Object.assign({}, x, { canal: 'whatsapp', modo: 'auto', link: '', grupoClientes: false })]
        : [x];
      if (x.grupoClientes === true && x.canal !== 'grupo') destinos.push(Object.assign({}, x, { canal: 'grupo', modo: 'auto', link: '', grupoClientes: false, status2: false }));
      if (x.status2 === true && x.canal !== 'whatsapp2') destinos.push(Object.assign({}, x, { canal: 'whatsapp2', modo: 'auto', link: '', grupoClientes: false, status2: false }));
      return destinos.map(d=>Object.assign({},d,{origemMidia:fontes.get(chave)}));
    });
    const pend = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE status IN ('agendado','processando','manual_pendente')").first()) || {}).n) || 0;
    if (pend + lista.length > 200) return J({ ok: false, erro: 'Há postagens demais na fila (200). Espere algumas saírem.' }, 429);
    const vs = []; for (const x of lista) { const r = validarPostagem(x); if (r.erro) return J({ ok: false, erro: r.erro }, 400); vs.push(r.v); }
    // Agendamento importante não pode esperar até a hora marcada para descobrir
    // que o MP4 do grupo usa HEVC e será recusado pela ponte de mensagens.
    for (const v of vs) if (v.canal === 'grupo') { const erro = await erroVideoGrupo_(env, v.midias); if (erro) return J({ ok: false, erro }, 400); }
    if (!(await cfgGet(env, 'ig_token')) && vs.some((v) => v.modo === 'auto' && canalUsaInstagram_(v.canal))) return J({ ok: false, erro: 'O Instagram ainda não está conectado (Produtos para aceitar → Conectar).' }, 409);
    const ids = [], inserts = [], quandos = [], por = String(b.por || '').slice(0, 60);
    const cfg = await lerCfgPost(env), ocup = {}, cursores = {}, ajustes = [], inicioSeries={}, intervaloMs = intervaloPedidoMs_(b.intervalo);
    try{await validarSeriesPost_(env,req,lista,vs);}catch(e){return J({ok:false,erro:e.message},400);}
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i], bs = bucketsDoPost(v.tipo, v.canal), ck = bs.join('+');
      const continuacao=!!(v.serie&&v.parte>1);
      const editorial=continuacao?0:intervaloEditorialMs_(cfg,bs,intervaloMs);
      for (const b of bs) if (!ocup[b]) ocup[b] = await ocupadosDoTipo_(env, b, 0, gapMaxDoTipoMs(cfg, b));
      let t;
      if(v.serie&&v.parte>1)t=inicioSeries[v.serie];
      else if (v.urgente && cfg.agoraIgnora) t = Date.now();                                  // urgência: sai já, sem pausa nem intervalo
      else if (v.sequencia && cursores[ck] != null) t = intervaloEscolhido_(cfg, bs, ocup, cursores[ck], editorial);   // v1.7: a pessoa escolheu "de X em X minutos" (nunca abaixo do mínimo do canal)
      else if (v.sequencia) t = proximoLivreMulti(cfg, bs, ocup, cursores[ck] == null ? Date.now() + 60000 : cursores[ck]).t;       // intervalo SORTEADO entre o mín. e o máx. do canal
      else {
        const pedido = Math.max(Date.parse(v.quando), Date.now()), aj = ajustarHorarioMulti(cfg, bs, pedido, ocup);
        t = aj.t; if (aj.ajustado) ajustes.push({ i: i, tipo: v.tipo, de: new Date(pedido).toISOString(), para: new Date(t).toISOString(), motivo: aj.motivo });
      }
      if(v.serie&&v.parte===1)inicioSeries[v.serie]=t;
      cursores[ck] = t; bs.forEach((b) => ocup[b].push(t)); v.quando = new Date(t).toISOString(); v.agora = t <= Date.now() + 1000;
      quandos.push(v.quando);


      inserts.push(env.DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, produto, template, link, agendado_em, status, criado_por, criado_em, atualizado_em, grupo, seq, canal, urgente, serie, parte, partes, origem_midia, intervalo_ms) VALUES (?,?,?,?,?,?,?,?, 'agendado', ?,?,?,?,?,?,?,?,?,?,?,?)").bind(v.tipo, v.modo, v.legenda, JSON.stringify(v.midias), v.produto, v.template, v.link, v.quando, por, agora(), agora(), v.grupo, v.sequencia ? 1 : 0, v.canal, v.urgente ? 1 : 0,v.serie||'',v.parte||0,v.partes||0,lista[i].origemMidia,editorial));
    }
    // Todos os destinos entram juntos ou nenhum: uma falha não deixa metade do pedido na fila.
    const criadas = await env.DB.batch(inserts);
    criadas.forEach((r) => ids.push(r.meta && r.meta.last_row_id));
    if (vs.some((v) => v.agora) && ctx && ctx.waitUntil) ctx.waitUntil(dispararPostagens_(env));
    return J({ ok: true, ids: ids, quandos: quandos, ajustes: ajustes, postagensOriginais: originais.length, gruposClientes: originais.filter((x) => x.grupoClientes === true && x.canal !== 'grupo').length, status2: originais.filter((x) => x.status2 === true && x.canal !== 'whatsapp2').length });
  }
  if (p === '/post/config' && req.method === 'GET') return J({ ok: true, config: await lerCfgPost(env), padrao: CFG_POST_PADRAO, podeEditar: (perms || []).indexOf('gerir_acessos') !== -1 });
  if (p === '/post/config' && req.method === 'POST') {
    if ((perms || []).indexOf('gerir_acessos') === -1) return J({ ok: false, erro: 'Só o gestor (Admin total) muda as regras da fila.' }, 403);
    const nova = mesclarCfgPost(await lerCfgPost(env), b && b.config);
    await cfgSet(env, 'po_cfg', JSON.stringify(nova));
    return J({ ok: true, config: nova });
  }
  if (p === '/post/reorganizar' && req.method === 'POST') {
    /* Ajusta as postagens JÁ agendadas às regras atuais (depois de o gestor mudar a pausa ou os intervalos). `simular:true` só conta. */
    if ((perms || []).indexOf('gerir_acessos') === -1) return J({ ok: false, erro: 'Só o gestor (Admin total) reorganiza a fila.' }, 403);
    const cfg = await lerCfgPost(env), limite = Date.now() + 60000;
    let mudaram = 0; const detalhes = [], ocup = {};
    for (const b of CANAIS_FILA) ocup[b] = await ocupadosDoTipo_(env, b, 0, gapMaxDoTipoMs(cfg, b), true);
    const lst = (await env.DB.prepare("SELECT id, tipo, canal, agendado_em FROM postagem WHERE status='agendado' AND urgente=0 AND serie='' ORDER BY agendado_em, id").all()).results || [];
    for (const x of lst) {                                                   // em ordem de horário; uma postagem "ambos" é ajustada para servir aos dois canais de uma vez
      const bs = bucketsDoPost(x.tipo, x.canal), atual = Date.parse(x.agendado_em);
      if (!isFinite(atual) || atual <= limite) { if (isFinite(atual)) bs.forEach((b) => ocup[b].push(atual)); continue; }     // o que já vai sair em instantes não se mexe
      const r = ajustarHorarioMulti(cfg, bs, atual, ocup); bs.forEach((b) => ocup[b].push(r.t));
      if (r.t !== atual) { mudaram++; detalhes.push({ id: x.id, tipo: x.tipo, de: x.agendado_em, para: new Date(r.t).toISOString() }); if (!(b && b.simular)) await env.DB.prepare('UPDATE postagem SET agendado_em=?, atualizado_em=? WHERE id=?').bind(new Date(r.t).toISOString(), agora(), x.id).run(); }
    }
    return J({ ok: true, mudaram: mudaram, simulado: !!(b && b.simular), detalhes: detalhes.slice(0, 30) });
  }
  const id = Number(b.id) || 0;
  const linha = id ? await env.DB.prepare('SELECT * FROM postagem WHERE id=?').bind(id).first() : null;
  if (p.indexOf('/post/') === 0 && req.method === 'POST') {
    if (!linha) return J({ ok: false, erro: 'Postagem não encontrada.' }, 404);
    if(linha.serie&&(p==='/post/proximo'||p==='/post/reagendar'&&linha.parte===1))return reagendarVideoOriginal_(env,ctx,linha,p==='/post/proximo'?'sequencia':b.quando,J);
    if(linha.serie&&['/post/mover','/post/repostar'].includes(p))return J({ok:false,erro:'Para mudar o horário de uma sequência, descarte as partes pendentes e agende novamente o vídeo completo. Partes publicadas não serão repetidas.'},409);

    if (p === '/post/repostar') {
      // Uma cópia por origem: duplo toque/repetição de rede retorna a mesma postagem.
      const existente = await env.DB.prepare('SELECT id,agendado_em FROM postagem WHERE repostado_de=?').bind(id).first();
      if (existente) return J({ ok: true, id: existente.id, quando: existente.agendado_em, existente: true });
      if (linha.status !== 'erro') return J({ ok: false, erro: 'Só postagens com erro podem ser repostadas.' }, 409);
      if (b.confirmarRisco !== true) return J({ ok: false, erro: 'Confirme que o envio antigo pode já ter sido publicado antes de repostar.' }, 409);
      const v = validarPostagem(Object.assign({}, linhaPostagem(linha), { quando: 'sequencia' }));
      if (v.erro) return J({ ok: false, erro: v.erro }, 400);
      if (linha.canal === 'grupo' && !cfgGrupoClientes_(env)) return J({ ok: false, erro: 'O Grupo clientes ainda não está configurado.' }, 409);
      if (linha.canal === 'whatsapp2' && !(await cfgWafly_(env, 2)) && !(await cfgWameStatus_(env))) return J({ ok: false, erro: 'O WhatsApp Status 2 ainda não está configurado.' }, 409);
      if (linha.canal === 'grupo') { const erro = await erroVideoGrupo_(env, v.v.midias); if (erro) return J({ ok: false, erro }, 400); }
      const pend = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE status IN ('agendado','processando','manual_pendente')").first()) || {}).n) || 0;
      if (pend >= 200) return J({ ok: false, erro: 'A fila está cheia. Espere algumas postagens saírem.' }, 429);
      const cfg = await lerCfgPost(env), bs = bucketsDoPost(linha.tipo, linha.canal);
      const ajuste = proximoLivreMulti(cfg, bs, await ocupadosMulti_(env, cfg, bs, id), Date.now() + 60000);
      const quando = new Date(ajuste.t).toISOString(), em = agora();
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO postagem (tipo,modo,legenda,midias,produto,template,link,agendado_em,status,criado_por,criado_em,atualizado_em,grupo,seq,canal,urgente,repostado_de) SELECT tipo,modo,legenda,midias,produto,template,link,?,'agendado',?,?,?,grupo,1,canal,0,id FROM postagem WHERE id=? AND status='erro'").bind(quando, String(b.por || 'Repostagem').slice(0,60), em, em, id),
        env.DB.prepare("UPDATE postagem SET status='cancelado',atualizado_em=? WHERE id=? AND status='erro' AND EXISTS (SELECT 1 FROM postagem WHERE repostado_de=?)").bind(em,id,id)
      ]);
      const nova = await env.DB.prepare('SELECT id,agendado_em FROM postagem WHERE repostado_de=?').bind(id).first();
      if (!nova) return J({ ok: false, erro: 'Essa postagem mudou durante a operação. Atualize a fila.' }, 409);
      return J({ ok: true, id: nova.id, quando: nova.agendado_em });
    }
    if (p === '/post/consultar') {                                       // v1.9: só consulta o resultado do WhatsApp (nunca reenvia)
      if (String(linha.ig_id || '').indexOf('zapq:') !== 0 || ['processando', 'erro'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem não está aguardando confirmação do WhatsApp.' }, 409);
      const rz = await resolverZapPendente_(env, linha, true);
      if (rz === 'aceito' && ctx && ctx.waitUntil) ctx.waitUntil(dispararPostagens_(env));
      return J({ ok: true, resultado: rz });
    }
    if (p === '/post/cancelar') {
      if (['agendado', 'erro', 'manual_pendente'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem já está sendo enviada ou foi publicada; não dá mais para cancelar.' }, 409);
      if(linha.serie){await env.DB.prepare("UPDATE postagem SET status='cancelado',atualizado_em=? WHERE serie=? AND status IN ('agendado','erro','manual_pendente')").bind(agora(),linha.serie).run();return J({ok:true});}
      const cancelou = await env.DB.prepare("UPDATE postagem SET status='cancelado', atualizado_em=? WHERE id=? AND status IN ('agendado','erro','manual_pendente')").bind(agora(), id).run();
      if (!cancelou.meta || cancelou.meta.changes !== 1) return J({ ok: false, erro: 'A postagem mudou durante a operação. Atualize a fila.' }, 409);
      return J({ ok: true });
    }
    if (p === '/post/converter-grupo') {
      return J({ok:false,erro:'Abra o original em Nova postagem e use Preparar vídeo. A preparação agora preserva a fila e nunca libera envio sozinha.'},409);
    }
    if (p === '/post/reagendar') {
      if(linha.serie&&linha.status!=='erro')return J({ok:false,erro:'A sequência já está agendada. Para trocar o horário, descarte as partes pendentes e prepare novamente o original.'},409);
      if (['agendado', 'erro', 'manual_pendente'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem não pode ser reagendada.' }, 409);
      if (canalComRecibo_(linha.canal) && await env.DB.prepare("SELECT 1 FROM postagem_grupo_recibo WHERE postagem_id=? AND estado='enviando'").bind(id).first()) return J({ ok: false, erro: 'O envio ao ' + (linha.canal === 'whatsapp2' ? 'WhatsApp Status 2' : 'grupo') + ' ficou sem confirmação. Confira no WhatsApp; depois use “Repostar com novo ID” ou “Descartar”.' }, 409);
      const r = validarPostagem(Object.assign({}, linhaPostagem(linha), { quando: b.quando }));
      if (r.erro) return J({ ok: false, erro: r.erro }, 400);
      if (linha.canal === 'grupo') { const erro = await erroVideoGrupo_(env, r.v.midias); if (erro) return J({ ok: false, erro }, 400); }
      if (canalComRecibo_(linha.canal)) await env.DB.prepare("DELETE FROM postagem_grupo_recibo WHERE postagem_id=? AND estado='recusado'").bind(id).run();
      const cfg = await lerCfgPost(env), bs = bucketsDoPost(linha.tipo, linha.canal);
      let t = Date.parse(r.v.quando), aj = { ajustado: false, motivo: '' };
      if (r.v.urgente && cfg.agoraIgnora) t = Date.now();
      else { aj = ajustarHorarioMulti(cfg, bs, Math.max(t, Date.now()), await ocupadosMulti_(env, cfg, bs, id)); t = aj.t; }
      await env.DB.prepare("UPDATE postagem SET status='agendado', agendado_em=?, tentativas=0, erro='', containers='', urgente=?, atualizado_em=? WHERE id=?").bind(new Date(t).toISOString(), r.v.urgente ? 1 : 0, agora(), id).run();
      if (t <= Date.now() + 1000 && ctx && ctx.waitUntil) ctx.waitUntil(dispararPostagens_(env));
      return J({ ok: true, quando: new Date(t).toISOString(), ajustado: aj.ajustado, motivo: aj.motivo });
    }
    if (p === '/post/proximo') {
      /* "Mandar para o próximo horário livre" da fila do tipo (respeita pausa e intervalo). */
      if (['agendado', 'erro', 'manual_pendente'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem não pode ser reagendada.' }, 409);
      if (canalComRecibo_(linha.canal) && await env.DB.prepare("SELECT 1 FROM postagem_grupo_recibo WHERE postagem_id=? AND estado='enviando'").bind(id).first()) return J({ ok: false, erro: 'O envio ao ' + (linha.canal === 'whatsapp2' ? 'WhatsApp Status 2' : 'grupo') + ' ficou sem confirmação. Confira no WhatsApp; depois use “Repostar com novo ID” ou “Descartar”.' }, 409);
      if (linha.canal === 'grupo') { const erro = await erroVideoGrupo_(env, JSON.parse(linha.midias || '[]')); if (erro) return J({ ok: false, erro }, 400); }
      if (canalComRecibo_(linha.canal)) await env.DB.prepare("DELETE FROM postagem_grupo_recibo WHERE postagem_id=? AND estado='recusado'").bind(id).run();
      const cfg = await lerCfgPost(env), bs = bucketsDoPost(linha.tipo, linha.canal);
      const r = proximoLivreMulti(cfg, bs, await ocupadosMulti_(env, cfg, bs, id), Date.now() + 60000);
      await env.DB.prepare("UPDATE postagem SET status='agendado', agendado_em=?, tentativas=0, erro='', containers='', urgente=0, atualizado_em=? WHERE id=?").bind(new Date(r.t).toISOString(), agora(), id).run();
      return J({ ok: true, quando: new Date(r.t).toISOString() });
    }
    if (p === '/post/mover') {
      /* Muda a ORDEM na fila do mesmo tipo trocando os horários (os horários já respeitam as regras, então a nova ordem também respeita). */
      if (linha.status !== 'agendado') return J({ ok: false, erro: 'Só dá para mudar a ordem de postagens agendadas.' }, 409);
      if (normalizarCanal_(linha.canal) === 'ambos') return J({ ok: false, erro: 'Esta postagem vai para o Instagram e para o Status do WhatsApp: mude o horário em “🕐 Horário” ou “⏭ Próximo livre”.' }, 409);
      /* só troca horários entre postagens do MESMO canal (sem as "ambos"): o conjunto de horários da fila não muda, então os intervalos continuam valendo. */
      const lst = (linha.canal === 'grupo'
        ? (await env.DB.prepare("SELECT id, agendado_em FROM postagem WHERE canal='grupo' AND status='agendado' ORDER BY agendado_em, id").all())
        : linha.canal === 'whatsapp2'
        ? (await env.DB.prepare("SELECT id, agendado_em FROM postagem WHERE canal='whatsapp2' AND status='agendado' ORDER BY agendado_em, id").all())
        : normalizarCanal_(linha.canal) === 'whatsapp'
        ? (await env.DB.prepare("SELECT id, agendado_em FROM postagem WHERE canal='whatsapp' AND status='agendado' ORDER BY agendado_em, id").all())
        : (await env.DB.prepare("SELECT id, agendado_em FROM postagem WHERE tipo=? AND (canal IS NULL OR canal='' OR canal='instagram') AND status='agendado' ORDER BY agendado_em, id").bind(linha.tipo).all())).results || [];
      const i = lst.findIndex((x) => x.id === id), n = lst.length, alvo = { subir: i - 1, descer: i + 1, primeiro: 0, ultimo: n - 1 }[String(b.dir || '')];
      if (alvo === undefined) return J({ ok: false, erro: 'Direção inválida.' }, 400);
      if (i < 0 || alvo < 0 || alvo >= n || alvo === i) return J({ ok: false, erro: 'Já está na ponta da fila.' }, 409);
      if((await env.DB.prepare("SELECT 1 FROM postagem WHERE serie<>'' AND canal=? AND status='agendado' AND agendado_em BETWEEN ? AND ? LIMIT 1").bind(linha.canal,lst[Math.min(i,alvo)].agendado_em,lst[Math.max(i,alvo)].agendado_em).first()))return J({ok:false,erro:'Uma sequência de vídeo ocupa este trecho da fila. Escolha outro horário para esta postagem.'},409);
      const tempos = lst.map((x) => x.agendado_em), ordem = lst.map((x) => x.id); ordem.splice(i, 1); ordem.splice(alvo, 0, id);
      for (let k = 0; k < ordem.length; k++) if (lst[k].id !== ordem[k]) await env.DB.prepare('UPDATE postagem SET agendado_em=?, atualizado_em=? WHERE id=?').bind(tempos[k], agora(), ordem[k]).run();
      return J({ ok: true, ordem: ordem });
    }
    if (p === '/post/feito') {
      if(linha.serie&&linha.parte>1){const ant=await env.DB.prepare('SELECT status FROM postagem WHERE serie=? AND parte=?').bind(linha.serie,linha.parte-1).first();if(!ant||!['publicado','manual_feito'].includes(ant.status))return J({ok:false,erro:'Conclua a parte anterior primeiro.'},409);}
      if (linha.status !== 'manual_pendente') return J({ ok: false, erro: 'Essa postagem não está esperando você.' }, 409);
      await env.DB.prepare("UPDATE postagem SET status='manual_feito', publicado_em=?, atualizado_em=? WHERE id=?").bind(agora(), agora(), id).run(); return J({ ok: true });
    }
  }
  return null;
}

/** Apaga do R2 as mídias temporárias (prefixo t/) com mais de 5 dias, menos as que ainda são usadas por postagem na fila. Roda 1x por dia. */
const TEMP_DIAS = 5;
export async function limparTemporarios(env, agoraMs) {
  const hoje = new Date(agoraMs || Date.now()).toISOString().slice(0, 10);
  if (!agoraMs && (await env.CACHE.get('limpeza_temp')) === hoje) return { pulou: true };
  const corte = (agoraMs || Date.now()) - TEMP_DIAS * 86400000;
  const emUso = await env.DB.prepare("SELECT midias FROM postagem WHERE status IN ('agendado','processando','manual_pendente')").all();
  const texto = (emUso.results || []).map((r) => r.midias || '').join('\n');
  let apagados = 0, bytes = 0, cursor, voltas = 0;
  do {
    const l = await env.MIDIA.list({ prefix: 't/', cursor: cursor, limit: 500 });
    for (const o of l.objects || []) {
      if (new Date(o.uploaded).getTime() > corte) continue;
      if (texto.indexOf(o.key) !== -1) continue;
      await env.MIDIA.delete(o.key); apagados++; bytes += o.size || 0;
    }
    cursor = l.truncated ? l.cursor : null; voltas++;
  } while (cursor && voltas < 20);
  if (bytes) { const u = await lerUso(env); u.bytes = Math.max(0, u.bytes - bytes); u.arquivos = Math.max(0, u.arquivos - apagados); await env.CACHE.put('uso', JSON.stringify(u)); }
  if (!agoraMs) await env.CACHE.put('limpeza_temp', hoje, { expirationTtl: 172800 });
  return { apagados: apagados, bytes: bytes };
}
/* ==========================================================================
 * v1.5 -- FOTOS COM IA (Gemini): capas de campanha feitas a partir das fotos reais da peça (18/10/2026)
 *
 *  Pedido do Pablo: "de graça, respeitando os limites do plano; quando fica sem crédito entra na fila e faz quando tiver cota, igual à descrição
 *  automática das fotos do Instagram"; instrução editável pelo gestor (a de partida é a SKILL dele).
 *   - Cada pedido vira uma linha da fila (`fotoia`, status fila → gerando → pronta → aprovada | descartada | erro). O cron (1 min) pega UMA por vez.
 *   - Cota acabou (429 / "quota" / "limit: 0"): NADA é perdido nem gasto — o pedido volta para a fila com horário para tentar de novo
 *     (o modelo esgotado fica de molho no KV, igual à leitura das fotos; a lista de modelos é tentada em ordem, cada um tem a SUA cota).
 *   - Trava própria contra gasto: limite de imagens por dia (padrão 20, gestor muda); passou = espera o dia seguinte (Fortaleza).
 *   - A chave é a MESMA da leitura das fotos (`gemini_key`, nunca volta ao navegador). Imagem pronta vai ao R2 (mesmo contador de custo).
 *   - Dois jeitos de falar com o Google (a documentação atual descreve a Interactions API; generateContent é o clássico): `modo` auto tenta
 *     um e depois o outro. A resposta é lida "no escuro" (procura a imagem em qualquer lugar do JSON), porque o formato cru não está documentado.
 * ========================================================================== */
export const INSTRUCAO_FOTOIA_PADRAO = `# SKILL: TENKiTER Modas – Capa de Campanha com Looks (grupo de modelos diferentes)

## 🎯 Objetivo
Você é o motor visual da **TENKiTER Modas** (moda de Crateús-CE: alegre, popular e sofisticada ao mesmo tempo). Receba as fotos reais das peças e gere **UMA única imagem de campanha**: um grupo de pessoas DIFERENTES, cada uma vestindo UM look do pedido, como num editorial de moda feito em estúdio. A lista exata de looks, o perfil de cada pessoa, o destino da imagem (Status, Reels ou capa de carrossel) vêm no final, em "DADOS DESTE PEDIDO". Você faz SÓ a arte das pessoas com as roupas: textos, setas, emojis e logotipo são colocados depois, pela loja, no editor de visuais.

## 📋 Regras de ouro (inegociáveis)

1. **UM MODELO POR LOOK.** Se o pedido tem N looks, a imagem tem **EXATAMENTE N pessoas** (nem mais, nem menos), lado a lado, todas inteiras, da cabeça aos pés (calçados à vista), com cada peça totalmente visível. Nunca misture peças de looks diferentes na mesma pessoa e nunca junte vários looks em uma pessoa só. Se enviei 4 fotos, são 4 pessoas com 4 looks.

2. **FIDELIDADE ABSOLUTA ÀS PEÇAS (proibido inventar).** Cada pessoa veste exatamente as peças indicadas para ela: mesmo corte, comprimento, caimento, tecido, cor, estampa, brilho, textura, bordados, gola, alças, barra, cintura, elástico, transparência. Copie o caimento real (solto, justo, evasê, franzido, cintura alta…). Proibido recolorir, simplificar, trocar ou redesenhar uma peça. Proibido acrescentar roupa que não foi enviada (blusa, casaco, cinto, bolsa, lenço); só calçado discreto e neutro que combine, e acessórios mínimos.

3. **NÃO RESPEITE A MODELO DAS FOTOS.** As fotos de referência podem mostrar uma modelo ou manequim: use SÓ a roupa. O rosto, o corpo, a pele e o cabelo da pessoa da foto NÃO podem aparecer. Cada pessoa da imagem é uma pessoa nova, claramente DIFERENTE das outras em idade, tom de pele, cabelo, altura e manequim (os perfis estão no pedido). A mesma peça em corpos diferentes: respeite o caimento real em cada corpo, sem afinar nem retocar ninguém.

4. **ALEGRIA E MOVIMENTO (zero seriedade).** Sorrisos largos e gargalhadas naturais, braços dados ou entrelaçados nos ombros e cintura, abraços leves, olhares entre elas, caminhando ou girando de leve. Proibido manequim rígido, pose de catálogo, rosto sério, neutro ou triste.

5. **CENÁRIO MINIMALISTA.** Estúdio contemporâneo com paredes de concreto polido / cimento queimado em bege-areia e cinza quente, piso liso de microcimento, softbox grande no alto com luz suave e quente, sem objetos nem poluição visual. Fotografia editorial realista: câmera na altura dos olhos, lente ~50 mm, foco nítido nas roupas, pele natural, cores fiéis às peças.

6. **COMPOSIÇÃO.** O grupo ocupa o terço central da altura, com respiro livre em cima e embaixo (as "zonas livres" do destino ficam sem rostos e sem peças). Ninguém cortado pelas bordas; a pessoa mais alta não encosta no topo.

7. **NADA ESCRITO, NADA DESENHADO POR CIMA.** A imagem não leva texto, letras, números, logotipo, marca d'água, seta, emoji, adesivo, ícone nem moldura — só as pessoas e o cenário. Parede e chão ficam lisos (sem manchas, riscos ou sombras que pareçam letras). Setas, chamadas e emojis a loja coloca depois; deixe as áreas livres do destino realmente limpas para isso.

## ⚙️ Como executar
1. Leia a lista de looks e associe cada foto de referência à pessoa que a veste (a foto marcada como "de cima" fornece só a peça de cima; a "de baixo", só a de baixo; a "look inteiro" fornece a roupa toda).
2. Monte o grupo na ordem da lista, da esquerda para a direita.
3. Confira antes de responder: número de pessoas = número de looks; nenhuma peça inventada; nenhuma pessoa parecida com a das fotos de referência; todos sorrindo; ninguém cortado.`;
export const INSTRUCAO_CF_PADRAO = `Professional editorial fashion photograph for a Brazilian clothing store, vertical {formato}. A group of {n} different {quem} (different ages, skin tones, hair and body types) standing close together, laughing happily, arms around each other's shoulders, walking slightly, full body from head to toe with shoes visible, in a minimalist warm beige concrete studio with soft overhead light and a smooth concrete floor. Eye-level camera, 50mm lens, realistic natural skin, sharp focus.
{looks}
Copy each garment EXACTLY from its reference image: same cut, length, fall, fabric, color, print and details. Do NOT copy the face, body, skin or hair of any person shown in the reference images. Exactly {n} people, no extra people, no extra garments. Keep the top and bottom of the frame calm and empty.
{extra}`;
export const CF_MODELO_PADRAO = '@cf/black-forest-labs/flux-2-klein-4b';
export const CFG_FOTOIA_PADRAO = { v: 2, ligado: true, instrucao: INSTRUCAO_FOTOIA_PADRAO, modelos: ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'], modo: 'auto', formato: '9:16', tamanho: '1K', limiteDia: 20,
  provedores: ['gemini', 'cloudflare'], cfModelo: CF_MODELO_PADRAO, instrucaoCf: INSTRUCAO_CF_PADRAO };
const FORMATOS_FOTOIA = ['9:16', '4:5', '1:1', '3:4', '16:9'], MODOS_FOTOIA = ['auto', 'interactions', 'generateContent'], PROVEDORES_FOTOIA = ['gemini', 'cloudflare'];
const FOTOIA_MAX_FONTE = 1600 * 1024, FOTOIA_MAX_REF = 300 * 1024, FOTOIA_MAX_RESULTADO = 8 * 1024 * 1024, FOTOIA_MAX_FOTOS = 6, FOTOIA_CF_MAX_REF = 4, FOTOIA_MAX_FILA = 40;
export function normalizarCfgFotoIA(c) {
  const d = CFG_FOTOIA_PADRAO, x = c && typeof c === 'object' ? c : {};
  const antiga = !(Number(x.v) >= 2);          // configuração gravada antes da v1.8 (um modelo só): as instruções voltam ao padrão novo (um modelo por look); o resto (modelos, limite, motor) é mantido
  const instr = !antiga && typeof x.instrucao === 'string' && x.instrucao.trim() ? x.instrucao.replace(/\r/g, '').slice(0, 12000) : d.instrucao;
  const instrCf = !antiga && typeof x.instrucaoCf === 'string' && x.instrucaoCf.trim() ? x.instrucaoCf.replace(/\r/g, '').slice(0, 3000) : d.instrucaoCf;
  let mods = (Array.isArray(x.modelos) ? x.modelos : String(x.modelos || '').split(/[\n,]+/)).map((m) => String(m).trim()).filter((m) => /^[A-Za-z0-9._\-]{3,70}$/.test(m));
  mods = mods.filter((m, i) => mods.indexOf(m) === i).slice(0, 8); if (!mods.length) mods = d.modelos.slice();
  let provs = (Array.isArray(x.provedores) ? x.provedores : []).map((m) => String(m).trim()).filter((m, i, a) => PROVEDORES_FOTOIA.indexOf(m) !== -1 && a.indexOf(m) === i);
  if (!provs.length) provs = d.provedores.slice();
  const cfm = String(x.cfModelo || '').trim(), lim = Number(x.limiteDia);
  return { v: 2, ligado: x.ligado === undefined ? d.ligado : !!x.ligado, instrucao: instr, modelos: mods, modo: MODOS_FOTOIA.indexOf(x.modo) !== -1 ? x.modo : d.modo,
    formato: FORMATOS_FOTOIA.indexOf(x.formato) !== -1 ? x.formato : d.formato, tamanho: ['1K', '2K'].indexOf(x.tamanho) !== -1 ? x.tamanho : d.tamanho,
    limiteDia: isFinite(lim) && lim >= 1 ? Math.min(200, Math.round(lim)) : d.limiteDia,
    provedores: provs, cfModelo: /^@cf\/[A-Za-z0-9._\-]+\/[A-Za-z0-9._\-]{2,80}$/.test(cfm) ? cfm : d.cfModelo, instrucaoCf: instrCf };
}
async function lerCfgFotoIA(env) { let v = null; try { v = JSON.parse((await cfgGet(env, 'fotoia_cfg')) || 'null'); } catch (e) { v = null; } return normalizarCfgFotoIA(v); }
const diaFortaleza_ = (ms) => new Date(ms + FUSO_MIN * 60000).toISOString().slice(0, 10);
async function usoFotoIA_(env) { let v = null; try { v = JSON.parse((await cfgGet(env, 'fotoia_dia')) || 'null'); } catch (e) { v = null; } const hoje = diaFortaleza_(Date.now()); return v && v.dia === hoje ? v : { dia: hoje, n: 0 }; }
/** Procura imagens em QUALQUER lugar do JSON (steps/outputs/candidates/inlineData...): objeto com mime image/* (ou type:'image') e `data` em base64. Devolve a ÚLTIMA (a final). */
export function acharImagensIA(o, acc, prof) {
  acc = acc || []; prof = prof || 0; if (!o || typeof o !== 'object' || prof > 9) return acc;
  if (Array.isArray(o)) { o.forEach((x) => acharImagensIA(x, acc, prof + 1)); return acc; }
  const mime = String(o.mime_type || o.mimeType || ''), d = o.data;
  if (typeof d === 'string' && d.length > 200 && (/^image\//i.test(mime) || o.type === 'image') && /^[A-Za-z0-9+/=\s_-]+$/.test(d.slice(0, 400))) acc.push({ mime: /^image\//i.test(mime) ? mime.toLowerCase() : 'image/png', data: d.replace(/\s/g, '') });
  Object.keys(o).forEach((k) => { if (typeof o[k] === 'object') acharImagensIA(o[k], acc, prof + 1); });
  return acc;
}
function textoDaResposta_(o, acc, prof) { acc = acc || []; prof = prof || 0; if (!o || typeof o !== 'object' || prof > 9) return acc; if (Array.isArray(o)) { o.forEach((x) => textoDaResposta_(x, acc, prof + 1)); return acc; } if (typeof o.text === 'string' && o.text.trim()) acc.push(o.text.trim()); Object.keys(o).forEach((k) => { if (typeof o[k] === 'object') textoDaResposta_(o[k], acc, prof + 1); }); return acc; }
function b64ParaBuf_(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
/* ---------- Looks do pedido (v1.8): cada foto tem um PAPEL e cada look vira UMA pessoa na imagem ----------
 * papeis: 'cima' (só a peça de cima da foto), 'baixo' (só a de baixo), 'look' (a roupa toda / peça única: vestido, macacão, fantasia…).
 * Cima e baixo precisam fechar par (3 de cima ⇒ 3 de baixo); looks = fotos 'look' + pares. Destino: status | reels | carrossel. */
export const DESTINOS_FOTOIA = { status: { formato: '9:16', nome: 'Status do WhatsApp' }, reels: { formato: '9:16', nome: 'Reels' }, carrossel: { formato: '4:5', nome: 'capa de carrossel' } };
export const QUEM_FOTOIA = ['mulheres', 'criancas', 'homens', 'misto'];
const PAPEIS_FOTOIA = ['cima', 'baixo', 'look'];
const PERFIS_FOTOIA = {
  mulheres: [['mulher de uns 22 anos, magra, manequim 36, pele clara, cabelo liso escuro com franja', 'a woman about 22, slim, size 36, fair skin, straight dark hair with bangs'],
    ['mulher de uns 28 anos, manequim 40, pele negra, cabelo cacheado volumoso', 'a woman about 28, size 40, dark skin, voluminous curly hair'],
    ['mulher de uns 35 anos, curvilínea, manequim 44, pele parda, cabelo ondulado castanho', 'a woman about 35, curvy, size 44, brown skin, wavy brown hair'],
    ['mulher de uns 45 anos, manequim 42, pele morena clara, cabelo curto grisalho', 'a woman about 45, size 42, light tan skin, short gray hair'],
    ['mulher de uns 25 anos, manequim 38, descendente de asiáticos, cabelo preto liso e curto', 'a woman about 25, size 38, East Asian descent, short straight black hair'],
    ['mulher de uns 30 anos, plus size manequim 48, pele negra, tranças longas', 'a woman about 30, plus size 48, dark skin, long braids']],
  criancas: [['criança de uns 4 anos, pele clara, cabelo castanho liso', 'a child about 4, fair skin, straight brown hair'],
    ['criança de uns 6 anos, pele negra, cabelo cacheado', 'a child about 6, dark skin, curly hair'],
    ['criança de uns 8 anos, pele parda, cabelo ondulado', 'a child about 8, brown skin, wavy hair'],
    ['criança de uns 5 anos, pele morena, cabelo preto liso', 'a child about 5, tan skin, straight black hair'],
    ['criança de uns 10 anos, pele clara, cabelo loiro', 'a child about 10, fair skin, blond hair'],
    ['criança de uns 7 anos, descendente de asiáticos, cabelo preto liso', 'a child about 7, East Asian descent, straight black hair']],
  homens: [['homem de uns 22 anos, magro, pele clara, cabelo curto castanho', 'a man about 22, slim, fair skin, short brown hair'],
    ['homem de uns 30 anos, forte, pele negra, cabelo baixo e barba curta', 'a man about 30, athletic, dark skin, short hair and short beard'],
    ['homem de uns 40 anos, manequim grande, pele parda, cabelo ondulado', 'a man about 40, large build, brown skin, wavy hair'],
    ['homem de uns 50 anos, pele morena clara, cabelo grisalho', 'a man about 50, light tan skin, gray hair'],
    ['homem de uns 26 anos, descendente de asiáticos, cabelo preto liso', 'a man about 26, East Asian descent, straight black hair'],
    ['homem de uns 35 anos, pele negra clara, cabelo crespo', 'a man about 35, medium-dark skin, coily hair']],
};
const ROTULO_QUEM_EN = { mulheres: 'women', criancas: 'children', homens: 'men', misto: 'women and men' };
const perfilDe_ = (quem, k, en) => {
  const lista = quem === 'misto' ? (k % 3 === 2 ? PERFIS_FOTOIA.homens : PERFIS_FOTOIA.mulheres) : (PERFIS_FOTOIA[quem] || PERFIS_FOTOIA.mulheres);
  return lista[k % lista.length][en ? 1 : 0];
};
/** Valida/monta o plano a partir do que o painel mandou. → {ok:true, plano} | {ok:false, erro}. Nunca lança. */
export function montarPlanoFotoIA_(b, n, cfg) {
  b = b && typeof b === 'object' ? b : {};
  const destino = DESTINOS_FOTOIA[b.destino] ? b.destino : ((cfg && cfg.formato === '4:5') ? 'carrossel' : 'status');
  const quem = QUEM_FOTOIA.indexOf(b.quem) !== -1 ? b.quem : 'mulheres';
  let papeis;
  if (b.papeis === undefined || b.papeis === null) papeis = new Array(n).fill('look');
  else {
    papeis = Array.isArray(b.papeis) ? b.papeis.map((x) => String(x)) : [];
    if (papeis.length !== n || papeis.some((x) => PAPEIS_FOTOIA.indexOf(x) === -1)) return { ok: false, erro: 'Diga o que a IA deve usar em cada foto (peça de cima, de baixo ou look inteiro).' };
  }
  const cima = [], baixo = [];
  papeis.forEach((p, i) => { if (p === 'cima') cima.push(i); else if (p === 'baixo') baixo.push(i); });
  if (cima.length !== baixo.length) {
    const d = Math.abs(cima.length - baixo.length), falta = cima.length > baixo.length ? 'de baixo' : 'de cima';
    return { ok: false, faltam: cima.length > baixo.length ? 'baixo' : 'cima', erro: 'Faltam ' + d + ' peça' + (d > 1 ? 's' : '') + ' ' + falta + ' para combinar com as ' + (cima.length > baixo.length ? cima.length + ' de cima' : baixo.length + ' de baixo') + '. A IA não inventa peças: escolha ' + (d > 1 ? 'as que faltam' : 'a que falta') + ' ou mude o papel das fotos.' };
  }
  let looks = [];
  if (Array.isArray(b.looks) && b.looks.length) {
    const usados = {};
    for (const l of b.looks) {
      const ix = Array.isArray(l) ? l.map((x) => Number(x)) : [];
      if (!ix.length || ix.length > 2 || ix.some((i) => !Number.isInteger(i) || i < 0 || i >= n || usados[i])) return { ok: false, erro: 'A combinação dos looks não bate com as fotos. Refaça a combinação.' };
      if (ix.length === 1) { if (papeis[ix[0]] !== 'look') return { ok: false, erro: 'A combinação dos looks não bate com as fotos. Refaça a combinação.' }; }
      else { const ps = ix.map((i) => papeis[i]).sort().join('+'); if (ps !== 'baixo+cima') return { ok: false, erro: 'A combinação dos looks não bate com as fotos. Refaça a combinação.' }; }
      ix.forEach((i) => { usados[i] = true; });
      looks.push(ix.map((i) => ({ i: i, papel: papeis[i] })));
    }
    if (Object.keys(usados).length !== n) return { ok: false, erro: 'A combinação dos looks não bate com as fotos. Refaça a combinação.' };
  } else {
    let ib = 0;
    papeis.forEach((p, i) => { if (p === 'look') looks.push([{ i: i, papel: 'look' }]); else if (p === 'cima') { looks.push([{ i: i, papel: 'cima' }, { i: baixo[ib], papel: 'baixo' }]); ib++; } });
  }
  if (!looks.length || looks.length > FOTOIA_MAX_FOTOS) return { ok: false, erro: 'Escolha de 1 a ' + FOTOIA_MAX_FOTOS + ' looks.' };
  const rot = Array.isArray(b.rotulos) ? b.rotulos.slice(0, n).map((x) => String(x || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80)) : [];
  /* v1.9: a imagem NUNCA leva seta nem texto (o modelo errava as letras). `seta` fica sempre false só para pedidos/painéis antigos continuarem lendo o campo;
   seta, chamada e emoji vão no editor de visuais da aba Postagens. */
  const plano = { v: 1, destino: destino, formato: DESTINOS_FOTOIA[destino].formato, seta: false, quem: quem, looks: looks.map((l) => ({ partes: l })), rotulos: rot };
  if (b.pecas !== undefined) {
    if (!Array.isArray(b.pecas) || b.pecas.length !== n) return { ok: false, erro: 'As peças informadas não correspondem às fotos. Refaça o pedido.' };
    plano.pecas = b.pecas.map((p) => {
      p = p && typeof p === 'object' ? p : {};
      const cod = String(p.codigo || '').trim();
      const valor = typeof p.avista === 'number' && Number.isFinite(p.avista) && p.avista > 0 && p.avista <= 10000000 ? Math.round(p.avista * 100) / 100 : null;
      return { codigo: /^[a-zA-Z0-9_.-]{1,60}$/.test(cod) ? cod : '', nome: String(p.nome || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120), avista: valor };
    });
  }
  return { ok: true, plano: plano };
}
/** Plano guardado no pedido; pedido antigo (sem plano) = cada foto é um look inteiro, destino pelo formato da configuração. */
export function planoDe_(job, nFotos, cfg) {
  let p = null; try { p = typeof (job && job.plano) === 'string' ? JSON.parse(job.plano || 'null') : (job && job.plano) || null; } catch (e) { p = null; }
  if (p && Array.isArray(p.looks) && p.looks.length) return p;
  const r = montarPlanoFotoIA_({}, Math.max(1, Math.min(FOTOIA_MAX_FOTOS, nFotos || 1)), cfg);
  r.plano.implicito = true; if (cfg && cfg.formato) r.plano.formato = cfg.formato;       // pedido antigo: vale a proporção da configuração, como sempre valeu
  return r.plano;
}
const LIVRE_DESTINO_ = { status: 'Deixe livre cerca de 8% no topo e 14% embaixo (o Status do WhatsApp cobre essas faixas).', reels: 'Deixe livre cerca de 12% no topo e 22% embaixo: o Instagram cobre essas faixas com legenda e botões. Nenhum rosto nem peça nelas.', carrossel: 'Deixe livre cerca de 10% embaixo para o texto do post.' };
/** Texto da lista de looks. en=true: versão curta em inglês para o Cloudflare (as fotos são "image 0", "image 1"… = o índice da foto). */
export function textoLooks_(plano, en) {
  const L = plano.looks, rot = plano.rotulos || [], out = [];
  L.forEach((lk, k) => {
    const perfil = perfilDe_(plano.quem, k, en), nome = (i) => rot[i] ? ' (' + rot[i] + ')' : '';
    const pt = lk.partes.map((x) => x.papel === 'cima' ? 'a peça de CIMA da Foto ' + (x.i + 1) + nome(x.i) : x.papel === 'baixo' ? 'a peça de BAIXO da Foto ' + (x.i + 1) + nome(x.i) : 'o LOOK INTEIRO / PEÇA ÚNICA da Foto ' + (x.i + 1) + nome(x.i));
    const ing = lk.partes.map((x) => x.papel === 'cima' ? 'the top garment from image ' + (x.i + 1) : x.papel === 'baixo' ? 'the bottom garment from image ' + (x.i + 1) : 'the full outfit from image ' + (x.i + 1));   // referências numeradas a partir de 1 (image 1 = 1ª foto); antes era 0 e a IA trocava as roupas entre as pessoas
    out.push(en ? 'Person ' + (k + 1) + ' (' + perfil + ') wears ' + ing.join(' and ') + '.' : 'Look ' + (k + 1) + ' — pessoa ' + (k + 1) + ' (' + perfil + '): veste ' + pt.join(' + ') + '.');
  });
  if (en && L.length) out.push('The reference images are numbered 1 to ' + (1 + Math.max.apply(null, [].concat.apply([], L.map((lk) => lk.partes.map((x) => x.i))))) + ' in the order given. For each person use ONLY the garment named for that person from its reference image: ignore any person, face, background or other clothing visible in the reference images, and never put one person\'s garment on another person.');
  return out.join('\n');
}
export function promptFotoIA(cfg, job, nFotos) {
  const plano = planoDe_(job, nFotos, cfg), dest = DESTINOS_FOTOIA[plano.destino] || DESTINOS_FOTOIA.status, nLooks = plano.looks.length;
  let t = String(cfg.instrucao || INSTRUCAO_FOTOIA_PADRAO).replace(/--ar\s*(\d+:\d+)/gi, 'proporção $1');
  t += '\n\n---\nDADOS DESTE PEDIDO\n';
  if (job && job.nome) t += 'Produto/lote: ' + String(job.nome).slice(0, 120) + '\n';
  t += 'Fotos de referência enviadas, na ordem: ' + nFotos + ' (Foto 1 a Foto ' + nFotos + '). Use EXATAMENTE as peças que aparecem nelas.\n';
  t += 'Destino: ' + dest.nome + ' — proporção ' + plano.formato + ' (vertical). Gere UMA única imagem. ' + (LIVRE_DESTINO_[plano.destino] || '') + '\n';
  t += 'NÚMERO DE LOOKS = NÚMERO DE PESSOAS NA IMAGEM: ' + nLooks + ' ' + (nLooks === 1 ? '(uma pessoa só)' : '(' + nLooks + ' pessoas diferentes, uma por look)') + '.\n\n';
  t += 'LOOKS DESTE PEDIDO (da esquerda para a direita):\n' + textoLooks_(plano, false) + '\n';
  t += 'Lembrete: as pessoas das fotos de referência (se houver) NÃO aparecem; só a roupa. Cada pessoa da imagem é nova e diferente das outras.\n\n';
  t += 'SEM TEXTO E SEM ENFEITES: nenhuma palavra, letra, número, seta, emoji, adesivo, ícone ou logotipo na imagem — nem nas áreas livres. Textos, setas e emojis são colocados depois, em outro programa; entregue só a arte limpa das pessoas e do cenário.\n';
  if (job && job.extra) t += 'Observação do lojista para esta imagem: ' + String(job.extra).slice(0, 600) + '\n';
  return t;
}
function corpoFotoIA_(modo, modelo, cfg, prompt, fontes) {
  if (modo === 'interactions') return { model: modelo, input: [{ type: 'text', text: prompt }].concat(fontes.map((f) => ({ type: 'image', mime_type: f.mime, data: f.data }))), response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: cfg.formato, image_size: cfg.tamanho } };
  return { contents: [{ role: 'user', parts: [{ text: prompt }].concat(fontes.map((f) => ({ inline_data: { mime_type: f.mime, data: f.data } }))) }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: cfg.formato } } };
}
/** Tenta os modelos da lista, em ordem, pulando os que estão sem cota. Nunca lança. → {ok, buf, mime, modelo} | {ok:false, erro, espera?, semPlano?, fatal?, ateMs?} */
export async function chamarGeminiImagem(env, chave, cfg, prompt, fontes) {
  const esg = await modelosEsgotados(env), agoraMs = Date.now();
  let fila = cfg.modelos.filter((m) => !(esg[m] && esg[m] > agoraMs)), pulados = cfg.modelos.length - fila.length;
  if (!fila.length) { const ate = Math.min.apply(null, cfg.modelos.map((m) => esg[m] || agoraMs + 1800000)); return { ok: false, espera: true, ateMs: ate, erro: 'A cota da IA de imagens acabou em todos os modelos por agora. O pedido continua na fila e sai sozinho quando a cota voltar.' }; }
  let ultimo = '', quota = 0, semPlano = 0, tentados = 0, falhas = 0;
  const modos = cfg.modo === 'auto' ? ['interactions', 'generateContent'] : [cfg.modo];
  for (const modelo of fila) {
    let esgotou = false, deu = false;
    for (const modo of modos) {
      const url = modo === 'interactions' ? 'https://generativelanguage.googleapis.com/v1beta/interactions' : 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent';
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(corpoFotoIA_(modo, modelo, cfg, prompt, fontes)) });
        let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
        if (r.status === 200) {
          const imgs = acharImagensIA(j);
          if (imgs.length) { const im = imgs[imgs.length - 1]; try { return { ok: true, buf: b64ParaBuf_(im.data), mime: im.mime, modelo: modelo }; } catch (e) { ultimo = 'a imagem veio corrompida'; deu = true; break; } }
          const tx = textoDaResposta_(j).join(' ').replace(/\s+/g, ' ').slice(0, 160);
          ultimo = tx ? 'A IA respondeu sem imagem: ' + tx : 'A IA respondeu sem imagem'; deu = true; break;
        }
        const msg = String((j.error && j.error.message) || ('HTTP ' + r.status));
        ultimo = msg.replace(/key=[^&\s]+/g, 'key=***').slice(0, 200);
        if (r.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) { esgotou = true; if (/limit:\s*0\b/i.test(msg)) semPlano++; await marcarEsgotado(env, modelo, msg); break; }
        if (r.status === 401 || r.status === 403) return { ok: false, fatal: true, erro: 'O Google recusou a chave da IA (' + r.status + '). Confira a chave em Instagram ▸ ⚙️ e se o plano permite gerar imagens.' };
        if (r.status === 404 || r.status === 400) continue;          // este jeito/modelo não existe: tenta o outro jeito e depois o próximo modelo
        falhas++; break;
      } catch (e) { ultimo = 'sem conexão com a IA'; falhas++; break; }
    }
    tentados++; if (esgotou) quota++;
    if (deu) break;
  }
  if (quota && quota >= tentados) {
    const esg2 = await modelosEsgotados(env), ate = Math.min.apply(null, cfg.modelos.map((m) => esg2[m] || agoraMs + 1800000));
    return { ok: false, espera: true, semPlano: semPlano >= quota, ateMs: ate, erro: semPlano >= quota ? 'O plano desta chave não inclui geração de imagens (cota 0). O pedido fica na fila e tenta de novo mais tarde; se continuar assim, o plano gratuito não cobre imagens.' : 'A cota da IA de imagens acabou por agora. O pedido continua na fila e sai sozinho quando a cota voltar.' };
  }
  return { ok: false, erro: ultimo || 'A IA não respondeu' };
}
/* ---------- Cloudflare Workers AI (FLUX.2 klein 4B) — 2º motor, grátis até o limite diário da conta (10 000 "neurons"/dia) ----------
 * Aceita até 4 fotos de referência (cada uma < 512×512) e gera 1 imagem de 256 a 1920 px por lado. O pedido manda `refs` (cópias pequenas, feitas no aparelho).
 * Passou do grátis do dia = erro 4006: o pedido VOLTA para a fila e espera a meia-noite UTC (21:05 em Fortaleza). Na conta grátis nada é cobrado. */
const TAMANHOS_CF = { '9:16': { '1K': [720, 1280], '2K': [1088, 1920] }, '4:5': { '1K': [768, 960], '2K': [1088, 1360] }, '1:1': { '1K': [1024, 1024], '2K': [1536, 1536] }, '3:4': { '1K': [768, 1024], '2K': [1152, 1536] }, '16:9': { '1K': [1280, 720], '2K': [1920, 1088] } };
/** Largura/altura de JPEG ou PNG lendo só o cabeçalho (sem decodificar). → [w, h] | null */
export function dimensoesImagem(u8) {
  try {
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8.length > 24) return [((u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19]) >>> 0, ((u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23]) >>> 0];
    if (u8[0] === 0xff && u8[1] === 0xd8) {
      let i = 2;
      while (i + 9 < u8.length) {
        if (u8[i] !== 0xff) { i++; continue; }
        const m = u8[i + 1]; if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = (u8[i + 2] << 8) | u8[i + 3];
        if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return [(u8[i + 7] << 8) | u8[i + 8], (u8[i + 5] << 8) | u8[i + 6]];
        i += 2 + len;
      }
    }
  } catch (e) { /* cabeçalho estranho: não bloqueia */ }
  return null;
}
export function tamanhoCf(formato, tam) { const f = TAMANHOS_CF[formato] || TAMANHOS_CF['9:16']; return f[tam] || f['1K']; }
const proximaMeiaNoiteUtcMs_ = () => { const d = new Date(); d.setUTCHours(24, 5, 0, 0); return d.getTime(); };
const LIVRE_DESTINO_EN_ = { status: 'Keep roughly the top 8% and the bottom 14% of the frame empty.', reels: 'Keep roughly the top 12% and the bottom 22% of the frame empty (no faces or garments there).', carrossel: 'Keep roughly the bottom 10% of the frame empty.' };
export function promptCf(cfg, job, nRefs) {
  const base = String(cfg.instrucaoCf || INSTRUCAO_CF_PADRAO), plano = planoDe_(job, nRefs, cfg);
  const nome = job && job.nome ? String(job.nome).slice(0, 120) : '', extra = job && job.extra ? String(job.extra).slice(0, 400) : '', looksEn = textoLooks_(plano, true);
  const tinha = /\{nome\}/.test(base), tinhaLooks = /\{looks\}/.test(base);
  let t = base.replace(/\{formato\}/g, plano.formato).replace(/\{nome\}/g, nome).replace(/\{extra\}/g, extra).replace(/\{n\}/g, String(plano.looks.length)).replace(/\{quem\}/g, ROTULO_QUEM_EN[plano.quem] || 'women').replace(/\{looks\}/g, looksEn);
  if (!tinhaLooks) t += '\n' + looksEn;
  if (!tinha && nome) t += '\nProduct: ' + nome + '.';
  if (!/\{extra\}/.test(base) && extra) t += '\n' + extra;
  t += '\n' + (LIVRE_DESTINO_EN_[plano.destino] || '') + ' No text, no letters, no numbers, no arrows, no emojis, no stickers, no logos, no watermark: clean image only.';
  return t.replace(/[ \t]+\n/g, '\n').trim();
}
/** → {ok, buf, mime, modelo} | {ok:false, espera:true, ateMs, erro} | {ok:false, indisponivel:true} | {ok:false, erro}. Nunca lança. */
export async function chamarCloudflareImagem(env, cfg, prompt, refs) {
  if (!env.AI || typeof env.AI.run !== 'function') return { ok: false, indisponivel: true, erro: 'O Cloudflare (Workers AI) ainda não está ligado neste Worker.' };
  const ate = Number(await env.CACHE.get('fotoia_cf_ate')) || 0;
  if (ate > Date.now()) return { ok: false, espera: true, ateMs: ate, erro: 'Cloudflare: o grátis de hoje acabou (volta por volta das ' + new Date(ate + FUSO_MIN * 60000).toISOString().slice(11, 16) + ' de Fortaleza).' };
  try {
    const wh = tamanhoCf(cfg.formato, cfg.tamanho), form = new FormData();
    form.append('prompt', prompt); form.append('width', String(wh[0])); form.append('height', String(wh[1]));
    refs.slice(0, 4).forEach((r, i) => form.append('input_image_' + i, new Blob([r.buf], { type: r.mime || 'image/jpeg' }), 'ref' + i + '.jpg'));
    const resp = new Response(form);
    const out = await env.AI.run(cfg.cfModelo || CF_MODELO_PADRAO, { multipart: { body: resp.body, contentType: resp.headers.get('content-type') } });
    const img = out && typeof out === 'object' ? (out.image || (out.result && out.result.image)) : '';
    if (typeof img !== 'string' || img.length < 200) return { ok: false, erro: 'O Cloudflare respondeu sem imagem.' };
    let buf; try { buf = b64ParaBuf_(img.replace(/^data:[^,]*,/, '').replace(/\s/g, '')); } catch (e) { return { ok: false, erro: 'O Cloudflare devolveu uma imagem corrompida.' }; }
    return { ok: true, buf: buf, mime: 'image/jpeg', modelo: 'cloudflare:' + String(cfg.cfModelo || CF_MODELO_PADRAO).replace(/^@cf\/[^/]+\//, '') };
  } catch (e) {
    const msg = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 220);
    if (/4006|daily free allocation|used up your daily|neurons/i.test(msg)) { const ate2 = proximaMeiaNoiteUtcMs_(); try { await env.CACHE.put('fotoia_cf_ate', String(ate2), { expirationTtl: 86400 }); } catch (er) { /* sem KV: tenta de novo e recebe o mesmo erro */ } return { ok: false, espera: true, ateMs: ate2, erro: 'Cloudflare: o grátis de hoje (10 000 neurons) acabou; o pedido continua na fila e sai amanhã cedo.' }; }
    if (/3040|capacity|temporar|overload|try again|429|rate limit/i.test(msg)) return { ok: false, espera: true, ateMs: Date.now() + 3 * 60000, erro: 'Cloudflare: servidor de imagens ocupado agora; o pedido tenta de novo em alguns minutos.' };
    if (/10000|authentication|not authorized|permission|not enabled|binding/i.test(msg)) return { ok: false, fatal: true, erro: 'O Cloudflare recusou o uso do Workers AI (' + msg.slice(0, 120) + '). Confira se o Workers AI está ativo na conta.' };
    return { ok: false, erro: 'Cloudflare: ' + msg };
  }
}
/** Tenta os motores na ordem do gestor. Se nenhum deu imagem: junta os motivos (e, se algum só está esperando cota, o pedido espera). */
export async function gerarComMotores_(env, cfg0, job, fontes, refs, chaveGemini) {
  const planoJob = planoDe_(job, fontes.length, cfg0), explicito = !planoJob.implicito, cfg = explicito ? Object.assign({}, cfg0, { formato: planoJob.formato }) : cfg0;      // a proporção vem do destino escolhido no pedido (Status/Reels 9:16, carrossel 4:5)
  const notas = []; let ateMs = 0, espera = false, fatal = false, ultimo = '', semPlanoGem = false, tentouGem = false, tentouCf = false, so = null;
  for (const prov of cfg.provedores) {
    let g = null;
    if (prov === 'gemini') {
      if (!chaveGemini) { notas.push('Gemini: falta a chave'); continue; }
      tentouGem = true; g = await chamarGeminiImagem(env, chaveGemini, cfg, promptFotoIA(cfg, job, fontes.length), fontes);
      if (g.ok) return g;
      if (g.semPlano) semPlanoGem = true;
      notas.push('Gemini: ' + (g.semPlano ? 'o plano desta chave não inclui geração de imagens (cota 0)' : g.erro));
    } else if (prov === 'cloudflare') {
      if (explicito && fontes.length > FOTOIA_CF_MAX_REF) { if (env.AI) notas.push('Cloudflare: aceita no máximo ' + FOTOIA_CF_MAX_REF + ' fotos por imagem e este pedido tem ' + fontes.length + ' (divida em dois pedidos)'); continue; }
      if (!refs.length) { if (env.AI) notas.push('Cloudflare: este pedido não tem a foto pequena que ele exige (cancele e coloque na fila de novo)'); continue; }
      if (explicito && refs.length !== fontes.length) { notas.push('Cloudflare: faltam as cópias pequenas de algumas fotos (cancele e coloque na fila de novo)'); continue; }
      g = await chamarCloudflareImagem(env, cfg, promptCf(cfg, job, refs.length), refs);
      if (g.indisponivel) continue;
      tentouCf = true;
      if (g.ok) return g;
      notas.push(g.erro);
    } else continue;
    so = g;
    if (g.espera) { espera = true; ateMs = ateMs ? Math.min(ateMs, g.ateMs || 0) : (g.ateMs || 0); }
    else if (g.fatal) fatal = true; else ultimo = g.erro || ultimo;
  }
  if (!tentouGem && !tentouCf && !notas.length) return { ok: false, erro: 'Nenhum motor de imagem está disponível (ligue o Gemini com chave ou o Cloudflare).' };
  if (!tentouGem && !tentouCf) return { ok: false, fatal: true, erro: notas.join(' · ').slice(0, 480) };      // nenhum motor chegou a ser tentado: esperar não resolve
  if (tentouGem && !tentouCf && so && notas.length === 1) return so;   // só o Gemini foi tentado: devolve o resultado dele sem mudar nada
  const erro = notas.join(' · ').slice(0, 480);
  if (espera) return { ok: false, espera: true, ateMs: ateMs, semPlano: semPlanoGem && !tentouCf, contaTent: !!ultimo, erro: erro };   // um motor só espera cota, mas o outro deu erro de verdade: isso conta tentativa
  return { ok: false, fatal: fatal && !ultimo, erro: erro || ultimo };
}
const resumoPlano_ = (x) => { try { const p = x.plano ? JSON.parse(x.plano) : null; return p && Array.isArray(p.looks) ? { looks: p.looks.length, destino: p.destino || '', seta: false, quem: p.quem || '', pecas: Array.isArray(p.pecas) ? p.pecas : [] } : null; } catch (e) { return null; } };
const linhaFotoIA_ = (env, x) => ({ plano: resumoPlano_(x), id: x.id, status: x.status, nome: x.nome || '', produto: x.produto || '', extra: x.extra || '', resultado: x.resultado ? urlMidia(env, x.resultado) : '', modelo: x.modelo || '', erro: x.erro || '', espera: x.status === 'fila' && x.prox_em ? x.prox_em : '', tent: x.tent || 0,
  fontes: (function () { try { return JSON.parse(x.fontes || '[]').map((k) => urlMidia(env, k)); } catch (e) { return []; } })(), criado_em: x.criado_em, pronto_em: x.pronto_em || '' });
/** Faz UM pedido da fila (o mais antigo que já pode, ou `soId`). Nunca lança. */
export async function processarFotoIA(env, soId) {
  try {
    await iniciar(env);
    const cfg = await lerCfgFotoIA(env); if (!cfg.ligado) return { feitas: 0, desligado: true };
    const chave = await cfgGet(env, 'gemini_key');
    if (!chave && !(env.AI && cfg.provedores.indexOf('cloudflare') !== -1)) return { feitas: 0, semChave: true };
    if (await env.CACHE.get('fotoia_trava')) return { feitas: 0, ocupado: true };
    const agoraMs = Date.now(), agoraIso = new Date(agoraMs).toISOString();
    await env.DB.prepare("UPDATE fotoia SET status='fila', atualizado_em=? WHERE status='gerando' AND atualizado_em < ?").bind(agoraIso, new Date(agoraMs - 4 * 60000).toISOString()).run();
    const job = soId ? await env.DB.prepare("SELECT * FROM fotoia WHERE id=? AND status='fila'").bind(soId).first()
      : await env.DB.prepare("SELECT * FROM fotoia WHERE status='fila' AND (prox_em='' OR prox_em<=?) ORDER BY id LIMIT 1").bind(agoraIso).first();
    if (!job) return { feitas: 0 };
    const uso = await usoFotoIA_(env);
    if (uso.n >= cfg.limiteDia) {
      const amanha = new Date(Date.parse(diaFortaleza_(agoraMs) + 'T00:05:00Z') + 86400000 - FUSO_MIN * 60000).toISOString();
      await env.DB.prepare('UPDATE fotoia SET prox_em=?, erro=?, atualizado_em=? WHERE id=?').bind(amanha, 'Limite de ' + cfg.limiteDia + ' imagens por dia atingido. Continua amanhã.', agoraIso, job.id).run();
      return { feitas: 0, limiteDia: true };
    }
    await env.CACHE.put('fotoia_trava', '1', { expirationTtl: 90 });
    await env.DB.prepare("UPDATE fotoia SET status='gerando', atualizado_em=? WHERE id=?").bind(agoraIso, job.id).run();
    try {
      let chaves = []; try { chaves = JSON.parse(job.fontes || '[]'); } catch (e) { chaves = []; }
      const fontes = [];
      for (const k of chaves) { try { const o = await env.MIDIA.get(k); if (!o) continue; const buf = await o.arrayBuffer(); fontes.push({ mime: /\.png$/.test(k) ? 'image/png' : /\.webp$/.test(k) ? 'image/webp' : 'image/jpeg', data: b64(buf) }); } catch (e) { /* foto ilegível é ignorada */ } }
      if (!fontes.length || (job.plano && fontes.length !== chaves.length)) { await env.DB.prepare("UPDATE fotoia SET status='erro', erro=?, atualizado_em=? WHERE id=?").bind('As fotos de origem não estão mais guardadas. Faça o pedido de novo.', agoraIso, job.id).run(); return { feitas: 0 }; }
      const refs = [];
      if (env.AI && cfg.provedores.indexOf('cloudflare') !== -1) {
        let rk = []; try { rk = JSON.parse(job.refs || '[]'); } catch (e) { rk = []; }
        for (const k of rk) { try { const o = await env.MIDIA.get(k); if (!o) continue; refs.push({ mime: /\.png$/.test(k) ? 'image/png' : 'image/jpeg', buf: new Uint8Array(await o.arrayBuffer()) }); } catch (e) { /* ref ilegível é ignorada */ } }
      }
      const g = await gerarComMotores_(env, cfg, job, fontes, refs, chave);
      const t = new Date().toISOString();
      if (g.ok) {
        const ext = extensaoImagem(g.buf); if (!ext) { await env.DB.prepare("UPDATE fotoia SET status='erro', erro=?, tent=tent+1, atualizado_em=? WHERE id=?").bind('A IA devolveu um arquivo que não é imagem.', t, job.id).run(); return { feitas: 0 }; }
        if (g.buf.length > FOTOIA_MAX_RESULTADO) { await env.DB.prepare("UPDATE fotoia SET status='erro', erro=?, atualizado_em=? WHERE id=?").bind('A imagem veio grande demais (' + Math.round(g.buf.length / 1048576) + ' MB).', t, job.id).run(); return { feitas: 0 }; }
        const u = await lerUso(env);
        if (u.bytes + g.buf.length > limite(env)) { await env.DB.prepare("UPDATE fotoia SET status='fila', prox_em=?, erro=?, atualizado_em=? WHERE id=?").bind(new Date(Date.now() + 6 * 3600000).toISOString(), 'O armazenamento de fotos está cheio. Libere espaço (descarte imagens) e o pedido continua.', t, job.id).run(); return { feitas: 0 }; }
        const d = new Date(), chaveR2 = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + hex(10) + '.' + ext;
        await env.MIDIA.put(chaveR2, g.buf, { httpMetadata: { contentType: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext, cacheControl: 'public, max-age=31536000, immutable' } });
        u.bytes += g.buf.length; u.arquivos += 1; await env.CACHE.put('uso', JSON.stringify(u));
        await env.DB.prepare("UPDATE fotoia SET status='pronta', resultado=?, modelo=?, bytes=?, erro='', prox_em='', pronto_em=?, atualizado_em=? WHERE id=?").bind(chaveR2, g.modelo || '', g.buf.length, t, t, job.id).run();
        uso.n += 1; await cfgSet(env, 'fotoia_dia', JSON.stringify(uso));
        return { feitas: 1, id: job.id };
      }
      if (g.espera) {
        const ate = new Date(g.semPlano ? Date.now() + 6 * 3600000 : Math.max(Date.now() + 5 * 60000, Math.min(g.ateMs || (Date.now() + 1800000), Date.now() + 26 * 3600000))).toISOString();
        const tentE = (job.tent || 0) + (g.contaTent ? 1 : 0);
        if (g.contaTent && tentE >= 3) { await env.DB.prepare("UPDATE fotoia SET status='erro', tent=?, erro=?, prox_em='', atualizado_em=? WHERE id=?").bind(tentE, g.erro, t, job.id).run(); return { feitas: 0, erro: g.erro }; }
        await env.DB.prepare("UPDATE fotoia SET status='fila', prox_em=?, erro=?, tent=?, atualizado_em=? WHERE id=?").bind(ate, g.erro, tentE, t, job.id).run();
        return { feitas: 0, espera: true };
      }
      const tent = (job.tent || 0) + 1, fim = g.fatal || tent >= 3;
      await env.DB.prepare('UPDATE fotoia SET status=?, tent=?, erro=?, prox_em=?, atualizado_em=? WHERE id=?').bind(fim ? 'erro' : 'fila', tent, g.erro || 'Erro da IA', fim ? '' : new Date(Date.now() + tent * 5 * 60000).toISOString(), t, job.id).run();
      return { feitas: 0, erro: g.erro };
    } finally { try { await env.CACHE.delete('fotoia_trava'); } catch (e) { /* expira sozinha em 90 s */ } }
  } catch (e) { return { feitas: 0, erro: true }; }
}
export async function rotasFotoIA(env, ctx, req, url, J, perms) {          // /fotoia* (gerir_acessos ou catalogo_cadastrar; só o gestor muda a configuração)
  const p = url.pathname, gestor = (perms || []).indexOf('gerir_acessos') !== -1;
  const agoraIso = () => new Date().toISOString();
  const disparar = (id) => { const f = processarFotoIA(env, id).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(f); return f; };
  if (p === '/fotoia/config' && req.method === 'GET') {
    const cfg = await lerCfgFotoIA(env), chave = await cfgGet(env, 'gemini_key'), uso = await usoFotoIA_(env);
    const esg = await modelosEsgotados(env), agoraMs = Date.now(), de = {}; cfg.modelos.forEach((m) => { if (esg[m] && esg[m] > agoraMs) de[m] = new Date(esg[m]).toISOString(); });
    const cont = {}; ((await env.DB.prepare('SELECT status, COUNT(*) AS n FROM fotoia GROUP BY status').all()).results || []).forEach((x) => { cont[x.status] = x.n; });
    const cfAte = Number(await env.CACHE.get('fotoia_cf_ate')) || 0;
    return J({ ok: true, config: cfg, padrao: { instrucao: INSTRUCAO_FOTOIA_PADRAO, instrucaoCf: INSTRUCAO_CF_PADRAO, limiteDia: CFG_FOTOIA_PADRAO.limiteDia, modelos: CFG_FOTOIA_PADRAO.modelos, cfModelo: CF_MODELO_PADRAO }, cloudflare: { disponivel: !!(env.AI && typeof env.AI.run === 'function'), semGratisAte: cfAte > Date.now() ? new Date(cfAte).toISOString() : '' }, podeEditar: gestor, temChave: !!chave, fimChave: chave ? String(chave).slice(-4) : '', hoje: { usadas: uso.n, limite: cfg.limiteDia }, semCota: de, contagens: cont });
  }
  if (p === '/fotoia/config' && req.method === 'POST') {
    if (!gestor) return J({ ok: false, erro: 'Só o administrador total muda a instrução e os limites da IA.' }, 403);
    let b; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
    if (b && b.padrao) { await cfgSet(env, 'fotoia_cfg', null); return J({ ok: true, config: await lerCfgFotoIA(env) }); }
    const nova = normalizarCfgFotoIA(Object.assign({}, await lerCfgFotoIA(env), b && b.config));
    await cfgSet(env, 'fotoia_cfg', JSON.stringify(nova)); return J({ ok: true, config: nova });
  }
  if (p === '/fotoia/fila' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
    const fotos = Array.isArray(b && b.fotos) ? b.fotos : [];
    if (!fotos.length) return J({ ok: false, erro: 'Escolha pelo menos 1 foto da peça.' }, 400);
    if (fotos.length > FOTOIA_MAX_FOTOS) return J({ ok: false, erro: 'No máximo ' + FOTOIA_MAX_FOTOS + ' fotos por imagem.' }, 400);
    const cfgPed = await lerCfgFotoIA(env), pl = montarPlanoFotoIA_(b, fotos.length, cfgPed), comPlano = !!(b && (b.papeis || b.looks || b.destino || b.quem));      // sem nada disso = pedido no formato antigo (cada foto = um look, proporção da configuração)
    if (!pl.ok) return J({ ok: false, erro: pl.erro, faltam: pl.faltam || '' }, 400);
    const pend = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM fotoia WHERE status IN ('fila','gerando')").first()) || {}).n) || 0;
    if (pend >= FOTOIA_MAX_FILA) return J({ ok: false, erro: 'A fila já tem ' + pend + ' pedidos esperando. Aguarde alguns saírem.' }, 429);
    const bufs = [];
    for (const f of fotos) {
      let buf; try { buf = b64ParaBuf_(String((f && f.data) || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '')); } catch (e) { return J({ ok: false, erro: 'Uma das fotos veio corrompida.' }, 400); }
      if (!buf.length || buf.length > FOTOIA_MAX_FONTE) return J({ ok: false, erro: 'Cada foto precisa ter até 1,5 MB (o painel reduz sozinho; tente de novo).' }, 400);
      const ext = extensaoImagem(buf); if (!ext) return J({ ok: false, erro: 'Só foto JPG, PNG ou WEBP.' }, 400);
      bufs.push({ buf: buf, ext: ext });
    }
    const refsIn = Array.isArray(b && b.refs) ? b.refs.slice(0, comPlano ? FOTOIA_MAX_FOTOS : FOTOIA_CF_MAX_REF) : [], refBufs = [];       // cópias pequenas (< 512 px) para o Cloudflare; opcionais
    let refsOk = true;
    for (const f of refsIn) {
      let buf; try { buf = b64ParaBuf_(String((f && f.data) || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '')); } catch (e) { refsOk = false; continue; }
      const ext = extensaoImagem(buf); if (!buf.length || buf.length > FOTOIA_MAX_REF || !ext || ext === 'webp') { refsOk = false; continue; }
      const dm = dimensoesImagem(buf); if (dm && (dm[0] > 511 || dm[1] > 511)) { refsOk = false; continue; }
      refBufs.push({ buf: buf, ext: ext });
    }
    if (comPlano && (!refsOk || refBufs.length !== bufs.length || bufs.length > FOTOIA_CF_MAX_REF)) refBufs.length = 0;      // com looks, cada cópia pequena TEM que casar com a sua foto (a ordem liga foto ↔ look); senão o Cloudflare fica de fora deste pedido
    const uso = await lerUso(env), total = bufs.concat(refBufs).reduce((s, x) => s + x.buf.length, 0);
    if (uso.bytes + total > limite(env)) return J({ ok: false, erro: 'O armazenamento de fotos está cheio no momento.' }, 507);
    const d = new Date(), aaaamm = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0'), chaves = [];
    for (const x of bufs) { const k = 't/' + aaaamm + '/' + hex(10) + '.' + x.ext; await env.MIDIA.put(k, x.buf, { httpMetadata: { contentType: x.ext === 'jpg' ? 'image/jpeg' : 'image/' + x.ext, cacheControl: 'public, max-age=31536000, immutable' } }); chaves.push(k); }
    const chavesRef = [];
    for (const x of refBufs) { const k = 't/' + aaaamm + '/' + hex(10) + '.' + x.ext; await env.MIDIA.put(k, x.buf, { httpMetadata: { contentType: x.ext === 'jpg' ? 'image/jpeg' : 'image/' + x.ext, cacheControl: 'public, max-age=31536000, immutable' } }); chavesRef.push(k); }
    uso.bytes += total; uso.arquivos += bufs.length + refBufs.length; await env.CACHE.put('uso', JSON.stringify(uso));
    const nome = String((b && b.nome) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120), produto = String((b && b.produto) || '').replace(/[^\w.\-]/g, '').slice(0, 40), extra = String((b && b.extra) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600);
    const por = String(req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(0, 20), t = agoraIso();
    const r = await env.DB.prepare("INSERT INTO fotoia (status, nome, produto, extra, fontes, refs, plano, criado_por, criado_em, atualizado_em) VALUES ('fila',?,?,?,?,?,?,?,?,?)").bind(nome, produto, extra, JSON.stringify(chaves), JSON.stringify(chavesRef), comPlano ? JSON.stringify(pl.plano) : '', por, t, t).run();
    const id = r.meta && r.meta.last_row_id; disparar(id);
    return J({ ok: true, id: id });
  }
  if (p === '/fotoia/lista' && req.method === 'GET') {
    const st = url.searchParams.get('status') || 'todas';
    const q = st === 'todas' ? env.DB.prepare('SELECT * FROM fotoia ORDER BY id DESC LIMIT 40') : env.DB.prepare('SELECT * FROM fotoia WHERE status=? ORDER BY id DESC LIMIT 40').bind(st);
    const cont = {}; ((await env.DB.prepare('SELECT status, COUNT(*) AS n FROM fotoia GROUP BY status').all()).results || []).forEach((x) => { cont[x.status] = x.n; });
    return J({ ok: true, itens: ((await q.all()).results || []).map((x) => linhaFotoIA_(env, x)), contagens: cont });
  }
  if (p === '/fotoia/acao' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
    const id = Number(b && b.id), acao = String((b && b.acao) || ''); const x = id ? await env.DB.prepare('SELECT * FROM fotoia WHERE id=?').bind(id).first() : null;
    if (!x) return J({ ok: false, erro: 'Pedido não encontrado.' }, 404);
    const t = agoraIso();
    const apagarResultado = async () => { if (x.resultado) { try { await env.MIDIA.delete(x.resultado); const u = await lerUso(env); u.bytes = Math.max(0, u.bytes - (x.bytes || 0)); u.arquivos = Math.max(0, u.arquivos - 1); await env.CACHE.put('uso', JSON.stringify(u)); } catch (e) { /* o limpador diário não mexe nisso; fica sobrando, sem custo relevante */ } } };
    if (acao === 'aprovar' && x.status === 'pronta') await env.DB.prepare("UPDATE fotoia SET status='aprovada', atualizado_em=? WHERE id=?").bind(t, id).run();
    else if (acao === 'descartar' && (x.status === 'pronta' || x.status === 'aprovada' || x.status === 'erro')) { await apagarResultado(); await env.DB.prepare("UPDATE fotoia SET status='descartada', resultado='', bytes=0, atualizado_em=? WHERE id=?").bind(t, id).run(); }
    else if (acao === 'cancelar' && (x.status === 'fila' || x.status === 'erro')) await env.DB.prepare("UPDATE fotoia SET status='cancelada', atualizado_em=? WHERE id=?").bind(t, id).run();
    else if (acao === 'refazer' && ['pronta', 'aprovada', 'erro', 'descartada', 'cancelada'].indexOf(x.status) !== -1) { await apagarResultado(); await env.DB.prepare("UPDATE fotoia SET status='fila', resultado='', bytes=0, modelo='', tent=0, erro='', prox_em='', atualizado_em=? WHERE id=?").bind(t, id).run(); disparar(id); }
    else if (acao === 'agora' && x.status === 'fila') { await env.DB.prepare("UPDATE fotoia SET prox_em='', erro='', atualizado_em=? WHERE id=?").bind(t, id).run(); disparar(id); }
    else return J({ ok: false, erro: 'Essa ação não vale para este pedido agora.' }, 400);
    return J({ ok: true });
  }
  return null;
}


// Conversão opcional FreeConvert: API key somente em segredo do Worker.
// O resultado é validado novamente no navegador antes de ser usado.
async function freeconvertRota_(env, req, url, J, h) {
  if (!url.pathname.startsWith('/post/freeconvert/')) return null;
  const freeconvertChave=await cfgGet(env,'freeconvert_api_key') || env.FREECONVERT_API_KEY;
  if (!freeconvertChave) return J({ok:false,erro:'Configure a chave FreeConvert em Gestão → Configurações Avançadas.'},503);
  const sessao = req.headers.get('X-TK-Sessao') || '';
  const whats = req.headers.get('X-TK-Whats') || '';
  if (!sessao || !whats) return J({ok:false,erro:'Sessão inválida.'},401);
  const owner = await sha(whats + ':' + sessao);
  const key = 'fc_job_' + owner;
  const api = async (path, method, body) => {
    const r = await fetch('https://api.freeconvert.com/v1'+path, {
      method:method||'GET',
      headers:{Authorization:'Bearer '+freeconvertChave,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(r.status===429?'Limite gratuito atingido. Substitua o vídeo ou tente amanhã.':(j.message||j.error||'FreeConvert HTTP '+r.status));
    return j;
  };
  try {
    if(url.pathname==='/post/freeconvert/iniciar' && req.method==='POST') {
      const b=await req.json();
      if(b.confirmarCusto!==true)return J({ok:false,erro:'Conversão externa exige confirmação explícita de uso de cota/créditos. Use Preparar vídeo para a fila da loja.'},400);
      const u=new URL(String(b.url||''));
      if(u.protocol!=='https:' || u.hostname!=='tenkiter-midia.distkrpconfeccoes.workers.dev' || !u.pathname.startsWith('/m/'))
        return J({ok:false,erro:'A conversão aceita apenas mídias previamente enviadas à TENKiTER.'},400);
      const anterior=await env.CACHE.get(key,'json');
      if(anterior && Date.now()-anterior.criado<15*60*1000)
        return J({ok:false,erro:'Já existe uma conversão iniciada nesta sessão. Aguarde ou substitua o vídeo.'},409);
      const formato=String(b.formato||'mp4').toLowerCase();
      if(!['mp4','mov','webm'].includes(formato))return J({ok:false,erro:'Formato de entrada não aceito.'},400);
      const job=await api('/process/jobs','POST',{
        tag:'tenkiter-grupo',
        tasks:{
          importar:{operation:'import/url',url:u.href,filename:'video.'+formato},
          converter:{operation:'convert',input:'importar',input_format:formato,output_format:'mp4',options:{video_codec:'h264',audio_codec:'aac'}},
          exportar:{operation:'export/url',input:'converter',filename:'tenkiter-convertido.mp4'}
        }
      });
      const id=String(job.id||job.job?.id||'');
      if(!/^[a-zA-Z0-9_-]{10,80}$/.test(id))throw new Error('FreeConvert não retornou um identificador válido.');
      await env.CACHE.put(key,JSON.stringify({id,criado:Date.now()}),{expirationTtl:3600});
      return J({ok:true,id,status:'processing'});
    }
    const salvo=await env.CACHE.get(key,'json');
    if(!salvo || Date.now()-salvo.criado>3600000)return J({ok:false,erro:'Conversão expirada ou não encontrada nesta sessão.'},404);
    const job=await api('/process/jobs/'+encodeURIComponent(salvo.id));
    const tasks=Array.isArray(job.tasks)?job.tasks:Object.values(job.tasks||{});
    const exportar=tasks.find(t=>t.operation==='export/url');
    const falha=tasks.find(t=>t.status==='failed');
    const concluido=job.status==='completed' && exportar && exportar.status==='completed';
    if(url.pathname==='/post/freeconvert/estado') {
      return J({ok:true,status:falha?'failed':concluido?'completed':job.status||'processing',
        erro:falha?String(falha.message||falha.payload?.msg||'A conversão falhou.').slice(0,250):undefined});
    }
    if(url.pathname==='/post/freeconvert/resultado' && req.method==='GET') {
      if(!concluido)return J({ok:false,erro:'Conversão ainda não concluída.'},409);
      const arquivos=exportar.result?.files||exportar.payload?.files||[];
      const download=exportar.result?.url||exportar.payload?.url||arquivos[0]?.url;
      if(!download || new URL(download).protocol!=='https:')return J({ok:false,erro:'FreeConvert não retornou URL de download.'},502);
      const arquivo=await fetch(download);
      if(!arquivo.ok)return J({ok:false,erro:'Não foi possível obter o vídeo convertido.'},502);
      const tamanho=Number(arquivo.headers.get('Content-Length')||0);
      if(tamanho>40*1048576)return J({ok:false,erro:'Vídeo convertido excedeu 40 MB.'},413);
      const headers=new Headers(h);
      headers.set('Content-Type','video/mp4');
      headers.set('Cache-Control','no-store');
      return new Response(arquivo.body,{status:200,headers});
    }
    return J({ok:false,erro:'Operação inválida.'},404);
  }catch(e){return J({ok:false,erro:String(e.message||e).slice(0,250)},502);}
}


/* ==========================================================================
 * v2.2 -- MÓDULO MENSAGENS (dashboard): guarda as conversas daqui para frente, separadas por canal
 *
 *  Canais: instagram | whatsapp1 | whatsapp2. Só grava o que chega DEPOIS de ligado (nada de buscar histórico).
 *  Modelo inspirado no Chatwoot (db/schema.rb: inbox -> contato -> conversa -> mensagem; mensagem com direção,
 *  tipo, source_id único para não duplicar, última atividade na conversa), enxuto para o D1:
 *    msg_conversa (canal+contato únicos) e msg_mensagem (canal+ext_id únicos = INSERT OR IGNORE, webhook repetido não duplica).
 *  Webhooks públicos protegidos por segredo no caminho (gerado aqui, nunca devolvido ao navegador, exceto na hora de ligar o webhook na Wafly).
 *  Guardamos o texto (até 4000 caracteres), o TIPO e, para foto/vídeo/áudio, uma cópia da mídia no R2 (prefixo msg/, servida só a quem está logado); o conteúdo bruto do webhook nunca é salvo; eventos normalizados aguardam confirmação em um prefixo privado do R2.
 * ========================================================================== */
const MSG_CANAIS = ['instagram', 'whatsapp1', 'whatsapp2'];
const MSG_TEXTO_MAX = 4000;
async function msgSegredo_(env) {
  let v = await cfgGet(env, 'msg_wh_segredo');
  if (!v) { const b = crypto.getRandomValues(new Uint8Array(24)); v = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); await cfgSet(env, 'msg_wh_segredo', v); }
  return v;
}
function igualConst_(a, b) {
  a = String(a); b = String(b); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function notificarNovidade_(env, canal) {
  if(!env.MSG_EVENTOS)return;
  const canais=MSG_CANAIS.includes(canal)?[canal]:MSG_CANAIS;
  await Promise.all(canais.map(async c=>{try{await env.MSG_EVENTOS.get(env.MSG_EVENTOS.idFromName(c)).avisar();}catch(_){/* Consulta periódica continua sendo a reconciliação. */}}));
}
function origemEventos_(env,req){return cors(env,req).has('Access-Control-Allow-Origin');}
async function ticketsEventos_(env,req){
  if(!env.MSG_EVENTOS)return {ok:false,erro:'Atualização automática usa sincronização periódica.'};
  if(!origemEventos_(env,req))return {ok:false,erro:'Abra as mensagens pelo site da loja.'};
  const d=await req.json().catch(()=>null);
  if(!d||!Array.isArray(d.canais)||!d.canais.length||d.canais.length>3||d.canais.some(c=>!MSG_CANAIS.includes(c)))return {ok:false,erro:'Escolha os canais de mensagens.'};
  const segredo=await msgSegredo_(env), em=Date.now(), tickets=[];
  for(const canal of new Set(d.canais)){
    const corpo=btoa(JSON.stringify({canal,nonce:hex(24),conectar:em+30000,exp:em+300000})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    tickets.push({canal,token:corpo+'.'+await hmacHex_(segredo,'mensagens-eventos-v1:'+corpo)});
  }
  const url=new URL('/msg/tempo-real',req.url);url.protocol='wss:';
  return {ok:true,tickets,socketUrl:url.href,renovarEm:240000};
}
async function conectarEventos_(env,req){
  const negar=s=>new Response(null,{status:s,headers:{'Cache-Control':'no-store'}});
  if(req.method!=='GET'||req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return negar(426);
  if(!env.MSG_EVENTOS)return negar(503);
  if(!origemEventos_(env,req)||new URL(req.url).search)return negar(403);
  const protocolos=(req.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(s=>s.trim());
  if(protocolos.length!==2||!protocolos.includes('tk-msg'))return negar(401);
  const token=protocolos.find(p=>p.startsWith('tk-ticket.'))?.slice(10)||'';
  const [corpo,assinatura,...resto]=token.split('.');
  if(resto.length||!corpo||corpo.length>400||!/^[A-Za-z0-9_-]+$/.test(corpo)||!/^[a-f0-9]{64}$/.test(assinatura||''))return negar(401);
  const segredo=await cfgGet(env,'msg_wh_segredo');
  if(!segredo||!igualConst_(assinatura,await hmacHex_(segredo,'mensagens-eventos-v1:'+corpo)))return negar(401);
  let d;try{d=JSON.parse(atob(corpo.replace(/-/g,'+').replace(/_/g,'/')));}catch(_){return negar(401);}
  const now=Date.now();
  if(!MSG_CANAIS.includes(d.canal)||!/^[a-f0-9]{48}$/.test(d.nonce)||!Number.isSafeInteger(d.conectar)||!Number.isSafeInteger(d.exp)||d.conectar<now||d.conectar>now+30000||d.exp<=now||d.exp>now+300000)return negar(401);
  // Só estes cabeçalhos internos atravessam o binding. Credenciais e protocolo do navegador ficam fora.
  const interno=new Request('https://eventos.internal/',{headers:{Upgrade:'websocket','X-TK-Evento-Nonce':d.nonce,'X-TK-Evento-Exp':String(d.exp)}});
  return env.MSG_EVENTOS.get(env.MSG_EVENTOS.idFromName(d.canal)).fetch(interno);
}
/** Callback "ReceivedCallback" da Wafly -> linha pronta para gravar (ou null se não for conversa). */
function normalizarWafly_(b) {
  if (!b || typeof b !== 'object' || b.type !== 'ReceivedCallback') return null;
  const id = String(b.messageId || ''), fone = String(b.phone || '');
  if (!id || !fone || /broadcast|newsletter/i.test(fone) || b.isNewsletter === true) return null;
  const tipos = [['image', 'imagem'], ['video', 'vídeo'], ['audio', 'áudio'], ['document', 'documento'], ['sticker', 'figurinha'], ['contact', 'contato'], ['location', 'localização'], ['reaction', 'reação'], ['buttonsResponseMessage', 'resposta'], ['listResponseMessage', 'resposta'], ['text', 'texto']];   // mídia antes de texto: se vier os dois, vale a mídia
  let tipo = 'outro', texto = '', midiaUrl = '', midiaMime = '', midiaSeg = 0;
  const DICA_MIME = { 'imagem': 'image/jpeg', 'vídeo': 'video/mp4', 'áudio': 'audio/ogg', 'figurinha': 'image/webp' };
  for (const [k, nome] of tipos) {
    if (b[k] && typeof b[k] === 'object') {
      tipo = nome;
      texto = String(b[k].message || b[k].caption || b[k].fileName || b[k].title || b[k].value || '');
      // v2.12: cartão de contato e localização com o que dá para ler (antes aparecia só "Contato")
      if (nome === 'contato') { const o = b[k], tel = (/TEL[^:]*:([+\d\s()-]{8,20})/.exec(String(o.vCard || o.vcard || '')) || [])[1] || (Array.isArray(o.phones) ? String(o.phones[0] || '') : ''); texto = [String(o.displayName || o.name || '').trim(), String(tel).replace(/[^\d+]/g, '')].filter(Boolean).join(' · '); }
      if (nome === 'localização') { const o = b[k]; texto = [o.name, o.address].map((x) => String(x || '').trim()).filter(Boolean).join(' · ') || (o.latitude != null && o.longitude != null ? 'https://maps.google.com/?q=' + Number(o.latitude) + ',' + Number(o.longitude) : ''); }
      if (DICA_MIME[nome] || nome === 'documento') {                                   // mídia: guardamos o endereço só para copiar para o nosso armazenamento
        const o = b[k];
        midiaUrl = [o.imageUrl, o.videoUrl, o.audioUrl, o.stickerUrl, o.documentUrl, o.url, o.fileUrl, o.thumbnailUrl].find((x) => typeof x === 'string' && /^https:\/\//i.test(x)) || '';
        midiaMime = String(o.mimeType || DICA_MIME[nome] || '').slice(0, 80);
        midiaSeg = Math.max(0, Math.min(86400, Number(o.seconds) || 0));
      }
      break;
    }
  }
  const ms = Number(b.momment || b.moment || 0);
  const em = ms > 0 ? new Date(ms < 1e12 ? ms * 1000 : ms).toISOString() : agora();
  const grupo = b.isGroup === true || /-group$|@g\.us$/.test(fone);
  const fromMe = b.fromMe === true;
  const node = b.text || b.image || b.video || b.audio || {};
  const context = b.contextInfo || node.contextInfo || {};
  const statusInfo = b.statusReply && typeof b.statusReply==='object' ? b.statusReply : node.statusReply && typeof node.statusReply==='object' ? node.statusReply : {};
  const quoted = b.quotedMessage || b.referenceMessage || node.quotedMessage || node.referenceMessage || context.quotedMessage || statusInfo.quotedMessage || statusInfo.message || statusInfo;
  const ref = String(b.referenceMessageId || node.referenceMessageId || context.stanzaId || statusInfo.referenceMessageId || statusInfo.messageId || statusInfo.id || quoted.messageId || '').slice(0, 200);
  const statusReply = b.isStatusReply === true || node.isStatusReply === true || b.statusReply===true || Object.keys(statusInfo).length>0 || context.remoteJid === 'status@broadcast' || quoted.remoteJid === 'status@broadcast';
  const mediaContext = quoted.video || quoted.videoMessage || quoted.image || quoted.imageMessage || quoted;
  const ctxUrl = statusReply ? [mediaContext.videoUrl,mediaContext.imageUrl,mediaContext.url,mediaContext.fileUrl,statusInfo.mediaUrl,statusInfo.videoUrl,statusInfo.imageUrl,statusInfo.url,statusInfo.media&&statusInfo.media.url].find(x=>typeof x==='string'&&/^https:\/\//i.test(x)) || '' : '';
  // v2.9: em grupo, quem mandou cada mensagem (antes só ficava o nome do grupo e não dava para saber quem escreveu)
  const soDig = (x) => String(x || '').replace(/@.*$/, '').replace(/\D/g, '').slice(0, 20);
  const autorNome = grupo && !fromMe ? String(b.senderName || '').trim().slice(0, 80) : '';
  const autorFone = grupo && !fromMe ? soDig(b.participantPhone) : '';
  const autorLid = grupo && !fromMe ? soDig(b.participantLid) : '';
  /* v2.11: numa mensagem que a LOJA enviou, senderName é o nome do próprio WhatsApp da loja e, com contato não salvo, chatName também vem
   * com ele ("tenkitermodas"). Mensagem enviada nunca dá nome à conversa: o nome vem do cliente (o que ele colocou no WhatsApp). */
  const proprio = fromMe && !grupo ? String(b.senderName || '').trim().slice(0, 120) : '';
  const chat = String(b.chatName || '').trim();
  const nome = grupo ? chat : fromMe ? '' : String(b.senderName || '').trim() || chat;
  return { nomeProprio: proprio, autorNome: autorNome, autorFone: autorFone, autorLid: autorLid, extId: id, contato: fone.slice(0, 80), nome: nome.slice(0, 120), grupo: grupo ? 1 : 0, direcao: fromMe ? 'saida' : 'entrada', tipo: tipo, texto: texto.slice(0, MSG_TEXTO_MAX), em: em,
    midiaUrl: midiaUrl, midiaMime: midiaMime, midiaSeg: midiaSeg, ctxTipo: statusReply ? 'story' : (ref ? 'resposta' : ''), ctxRef: ref, ctxUrl: ctxUrl, ctxMime: String(mediaContext.mimeType || mediaContext.mimetype || statusInfo.mimeType || (statusInfo.media && statusInfo.media.mimeType) || '') };
}
/** Evento "messaging" do webhook do Instagram (DM) -> linhas prontas. */
function normalizarInstagram_(b) {
  const out = [];
  if (!b || b.object !== 'instagram' || !Array.isArray(b.entry)) return out;
  const mapa = { image: 'imagem', video: 'vídeo', audio: 'áudio', file: 'documento', share: 'compartilhamento', story_mention: 'menção em story', reel: 'reel', ig_reel: 'reel' };
  const vistos = new Set();
  const juntar = (dono, ev) => {
    const m = ev && ev.message; if (!m || typeof m !== 'object') return;
    const mid = String(m.mid || m.id || ''); if (!mid || vistos.has(mid)) return;
    const eco = m.is_echo === true;
    const idDe = (x) => String((x && typeof x === 'object' ? x.id : x) || '');
    const contato = eco ? idDe(ev.recipient) : idDe(ev.sender);
    if (!contato || contato === dono) return;
    vistos.add(mid);
    const a0 = Array.isArray(m.attachments) && m.attachments[0] && typeof m.attachments[0] === 'object' ? m.attachments[0] : null;
    const anexo = a0 ? String(a0.type || 'anexo') : '';
    const ms = Number(ev.timestamp || m.timestamp || 0);
    const pu = a0 && a0.payload && typeof a0.payload.url === 'string' && /^https:\/\//i.test(a0.payload.url) ? a0.payload.url : '';
    const dica = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mp4', story_mention: 'image/jpeg', reel: 'video/mp4', ig_reel: 'video/mp4' }[anexo] || '';
    const rt = m.reply_to && typeof m.reply_to === 'object' ? m.reply_to : null;
    const histUrl = rt && rt.story && typeof rt.story.url === 'string' && /^https:\/\//i.test(rt.story.url) ? rt.story.url : '';
    out.push({ extId: mid, contato: contato.slice(0, 80), nome: '', grupo: 0, direcao: eco ? 'saida' : 'entrada', tipo: anexo ? (mapa[anexo] || anexo) : 'texto', texto: String(m.text || '').slice(0, MSG_TEXTO_MAX), em: ms > 0 ? new Date(ms < 1e12 ? ms * 1000 : ms).toISOString() : agora(),
      midiaUrl: dica ? pu : '', midiaMime: dica, midiaSeg: 0, ctxTipo: rt && rt.story ? 'story' : (rt && rt.mid ? 'resposta' : ''), ctxRef: rt && rt.mid ? String(rt.mid).slice(0, 200) : '', ctxUrl: histUrl });
  };
  for (const e of b.entry) {
    if (!e || typeof e !== 'object') continue;
    const dono = String(e.id || '');
    for (const ev of (Array.isArray(e.messaging) ? e.messaging : [])) juntar(dono, ev);              // formato dos avisos reais
    for (const ev of (Array.isArray(e.standby) ? e.standby : [])) juntar(dono, ev);                 // app em espera
    for (const c of (Array.isArray(e.changes) ? e.changes : [])) if (c && /message/.test(String(c.field || '')) && c.value) juntar(dono, c.value);   // formato do botão "Testar" e de apps novos
  }
  return out;
}
/** Resumo SÓ da forma do aviso (nomes de campos e tipos de evento, nunca texto nem identificadores) para diagnosticar quando chega aviso e nenhuma mensagem é reconhecida. */
function formaInstagram_(b) {
  try {
    if (!b || typeof b !== 'object') return 'corpo inválido';
    const f = [];
    f.push('objeto=' + String(b.object || '?').slice(0, 20));
    const es = Array.isArray(b.entry) ? b.entry : [];
    f.push('entradas=' + es.length);
    for (const e of es.slice(0, 3)) {
      f.push('[' + Object.keys(e || {}).slice(0, 8).join(',') + ']');
      for (const k of ['messaging', 'standby']) for (const ev of (Array.isArray(e && e[k]) ? e[k] : []).slice(0, 3)) {
        const tipos = Object.keys(ev || {}).filter((x) => !['sender', 'recipient', 'timestamp'].includes(x));
        f.push(k + ':' + (tipos.join('+') || 'vazio') + (ev && ev.message ? '{' + Object.keys(ev.message).slice(0, 8).join(',') + '}' : ''));
      }
      for (const c of (Array.isArray(e && e.changes) ? e.changes : []).slice(0, 3)) f.push('change:' + String(c && c.field || '?').slice(0, 30) + (c && c.value ? '{' + Object.keys(c.value).slice(0, 8).join(',') + '}' : ''));
    }
    return f.join(' ').slice(0, 480);
  } catch (e) { return 'forma ilegível'; }
}
/* ---- mídia das conversas (foto, vídeo, áudio, figurinha, documento): copiada para o nosso R2 (prefixo msg/) porque os links da Wafly/Meta expiram ---- */
const MSG_MIDIA_MAX_ = 20 * 1048576;
const MSG_MIME_EXT_ = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba', 'audio/wav': 'wav', 'audio/amr': 'amr', 'application/pdf': 'pdf', 'application/vnd.android.package-archive':'apk', 'application/zip':'zip', 'application/x-zip-compressed':'zip', 'application/octet-stream':'bin', 'text/plain':'txt', 'text/csv':'csv', 'application/msword':'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx', 'application/vnd.ms-excel':'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx' };
const mimeLimpo_ = (m) => { const x = String(m || '').split(';')[0].trim().toLowerCase(); return x === 'image/jpg' ? 'image/jpeg' : x === 'audio/x-m4a' || x === 'audio/m4a' ? 'audio/mp4' : x === 'audio/mp3' ? 'audio/mpeg' : x; };
async function guardarMidiaMsg_(env, bytes, mime, prefixo) {
  const b = crypto.getRandomValues(new Uint8Array(12)), hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const chave = (prefixo || 'msg') + '/' + agora().slice(0, 7).replace('-', '') + '/' + hex + '.' + MSG_MIME_EXT_[mime];
  await env.MIDIA.put(chave, bytes, { httpMetadata: { contentType: mime } });
  return chave;
}
/** Baixa uma mídia de um endereço https e guarda no R2. Devolve { chave, mime, bytes } ou null (nunca derruba a gravação da mensagem). */
async function copiarMidiaRemota_(env, url, dica, documento=false) {
  if (!/^https:\/\//i.test(String(url || ''))) return null;
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    if (Number(r.headers.get('Content-Length') || 0) > MSG_MIDIA_MAX_) return null;
    if(!r.body)return null;
    const reader=r.body.getReader(),chunks=[];let length=0;
    try{for(;;){const x=await reader.read();if(x.done)break;length+=x.value.byteLength;if(length>MSG_MIDIA_MAX_){await reader.cancel();return null;}chunks.push(x.value);}}finally{reader.releaseLock();}
    if(!length)return null;const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const buf=bytes.buffer;
    let mime = mimeLimpo_(r.headers.get('Content-Type'));
    if (mime === 'application/octet-stream' && MSG_MIME_EXT_[mimeLimpo_(dica)]) mime = mimeLimpo_(dica);
    if (!MSG_MIME_EXT_[mime]) mime = mimeLimpo_(dica);
    if (!MSG_MIME_EXT_[mime]&&documento)mime="application/octet-stream";
    if (!MSG_MIME_EXT_[mime]) return null;
    return { chave: await guardarMidiaMsg_(env, buf, mime), mime: mime, bytes: buf.byteLength };
  } catch (e) { return null; }
}
/** Antes de gravar: copia a mídia (e a imagem do story respondido, no Instagram). Se não for possível, guarda o endereço para tentar de novo quando alguém abrir. */
async function prepararMidia_(env, canal, m) {
  if (!m.midiaUrl && !m.ctxUrl) return;
  const ja = await env.DB.prepare('SELECT 1 AS x FROM msg_mensagem WHERE canal=? AND ext_id=?').bind(canal, m.extId).first();
  if (ja) { m.midiaUrl = ''; m.ctxUrl = ''; return; }
  if (m.midiaUrl) { const x = await copiarMidiaRemota_(env, m.midiaUrl, m.midiaMime,m.tipo==='documento'); if (x) { m.midiaChave = x.chave; m.midiaMime = x.mime; m.midiaUrl = ''; } }
  if (m.ctxUrl) { const x = await copiarMidiaRemota_(env, m.ctxUrl, m.ctxMime || ''); if (x) m.ctxChave = x.chave; m.ctxUrl = ''; }
}
const STATUS_CANAIS_ = { whatsapp1: ['whatsapp', 'ambos'], whatsapp2: ['whatsapp2'] };
/** Chave do R2 da n-ésima mídia de uma postagem (só se for do nosso armazenamento público). */
async function chaveMidiaPostagem_(env, postId, n) {
  const po = await env.DB.prepare('SELECT midias FROM postagem WHERE id=?').bind(postId).first();
  let l = []; try { l = JSON.parse((po && po.midias) || '[]'); } catch (e) { l = []; }
  const u = String((l[n || 0] && l[n || 0].url) || ''), pref = String(env.MIDIA_URL || '').replace(/\/$/, '') + '/m/';
  return u.startsWith(pref) ? u.slice(pref.length) : '';
}
/** Status do WhatsApp publicados nas 26 h antes de um instante (candidatos a "story respondido"; a Wafly não diz qual foi). */
async function storiesNoAr_(env, canal, emIso) {
  const canais = STATUS_CANAIS_[canal]; if (!canais) return [];
  const desde = new Date(Date.parse(emIso) - 26 * 3600000).toISOString();
  const rs = await env.DB.prepare("SELECT id, legenda, midias, publicado_em FROM postagem WHERE status='publicado' AND canal IN (" + canais.map(() => '?').join(',') + ") AND publicado_em<>'' AND publicado_em<=? AND publicado_em>=? AND midias<>'[]' ORDER BY publicado_em DESC LIMIT 12").bind(...canais, emIso, desde).all();
  return (rs.results || []).map((r) => { let l = []; try { l = JSON.parse(r.midias || '[]'); } catch (e) { l = []; } return { id: r.id, publicado_em: r.publicado_em, legenda: String(r.legenda || '').slice(0, 140), tipo: l[0] && l[0].tipo === 'video' ? 'video' : 'imagem', n: l.length }; });
}
/** Resposta a story no WhatsApp: a Wafly não manda a imagem do story, então achamos o Status que a loja publicou nas 26 h anteriores. Se houver mais de um, usa o mais recente e marca como "provável". */
async function resolverStory_(env, canal, emIso) {
  const canais = STATUS_CANAIS_[canal] || [];
  if (!canais.length) return { post: 0, aprox: 0 };
  const desde = new Date(Date.parse(emIso) - 26 * 3600000).toISOString();
  const rs = await env.DB.prepare("SELECT id FROM postagem WHERE status='publicado' AND canal IN (" + canais.map(() => '?').join(',') + ") AND publicado_em<>'' AND publicado_em<=? AND publicado_em>=? AND midias<>'[]' ORDER BY publicado_em DESC LIMIT 6").bind(...canais, emIso, desde).all();
  const l = rs.results || [];
  return l.length ? { post: Number(l[0].id) || 0, aprox: l.length > 1 ? 1 : 0 } : { post: 0, aprox: 0 };
}
/* v2.11: o nome do próprio WhatsApp da loja (senderName das mensagens que ela envia) tinha virado nome de conversas ("tenkitermodas").
 * Só é tido como "nome da loja" quando o MESMO nome aparece enviando para dois contatos diferentes; aí as conversas com esse nome
 * voltam a mostrar o número (e ganham o nome do cliente quando ele escrever). */
async function aprenderNomeProprio_(env, canal, nome, contato, t) {
  if ((await cfgGet(env, 'msg_nome_proprio_' + canal)) === nome) return;
  let cand = null; try { cand = JSON.parse((await cfgGet(env, 'msg_nome_proprio_cand_' + canal)) || 'null'); } catch (e) { cand = null; }
  if (cand && cand.nome === nome && cand.contato !== contato) {
    await cfgSet(env, 'msg_nome_proprio_' + canal, nome);
    await cfgSet(env, 'msg_nome_proprio_cand_' + canal, null);
    await env.DB.prepare("UPDATE msg_conversa SET nome='', atualizada_em=? WHERE canal=? AND grupo=0 AND lower(nome)=lower(?)").bind(t, canal, nome).run();
  } else if (!cand || cand.nome !== nome) await cfgSet(env, 'msg_nome_proprio_cand_' + canal, JSON.stringify({ nome: nome, contato: contato }));
}
/** Grava uma mensagem (idempotente por canal+ext_id). Devolve true se era nova. */
async function gravarMensagem_(env, canal, m) {
  if (!MSG_CANAIS.includes(canal)) return false;
  const t = agora();
  if (m.nomeProprio && canal !== 'instagram') { try { await aprenderNomeProprio_(env, canal, m.nomeProprio, m.contato, t); } catch (e) { /* conserto do nome é conforto */ } }
  await env.DB.prepare('INSERT OR IGNORE INTO msg_conversa (canal, contato, nome, grupo, ultima_em, criado_em, atualizada_em) VALUES (?,?,?,?,?,?,?)').bind(canal, m.contato, m.nome, m.grupo, '', t, t).run();
  const c = await env.DB.prepare('SELECT id, pessoa FROM msg_conversa WHERE canal=? AND contato=?').bind(canal, m.contato).first();
  if (!c) return false;
  const saida = m.direcao === 'saida';
  if (!c.pessoa && !m.grupo && canal !== 'instagram' && /^\d{8,20}$/.test(m.contato)) { try { await env.DB.prepare('UPDATE msg_conversa SET pessoa=' + MSG_PESSOA_SQL_ + ' WHERE id=?').bind(c.id).run(); } catch (e) { /* o aviso de "nos 2 WhatsApp" é conforto */ } }
  if (saida && !String(m.extId).startsWith('inc:')) {      // o eco de uma resposta que ficou "sem confirmação" promove aquela linha (não cria uma segunda bolha)
    try {
      const desde = new Date(Date.parse(m.em) - 10 * 60000).toISOString();
      const pr = await env.DB.prepare("UPDATE msg_mensagem SET ext_id=?, status='enviada', status_em=? WHERE id=(SELECT id FROM msg_mensagem WHERE conversa_id=? AND direcao='saida' AND ext_id LIKE 'inc:%' AND texto=? AND tipo=? AND enviada_em>=? ORDER BY id LIMIT 1)").bind(m.extId, t, c.id, m.texto, m.tipo, desde).run();
      if (pr.meta && pr.meta.changes === 1) { await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(t, c.id).run(); await notificarNovidade_(env,canal); return false; }
    } catch (e) { /* o eco já existe: segue o caminho normal */ }
  }
  if(m.ctxTipo==='story'&&m.ctxRef&&!m.ctxChave){const ref=await env.DB.prepare('SELECT chave FROM msg_status_ref WHERE canal=? AND ext_id=?').bind(canal,m.ctxRef).first();if(ref)m.ctxChave=ref.chave;}
  let story = { post: 0, aprox: 0 };
  if (m.ctxTipo === 'story' && !saida && !m.ctxChave) { if (m.ctxPost) story = { post: Number(m.ctxPost) || 0, aprox: 0 }; else { try { const exato=m.ctxRef?await env.DB.prepare("SELECT p.id FROM postagem p LEFT JOIN postagem_grupo_recibo r ON r.postagem_id=p.id WHERE p.status='publicado' AND p.canal IN ("+(STATUS_CANAIS_[canal]||[]).map(()=>'?').join(',')+") AND (p.ig_id=? OR r.mensagem_id=?) LIMIT 1").bind(...(STATUS_CANAIS_[canal]||[]),m.ctxRef,m.ctxRef).first():null;story=exato?{post:Number(exato.id),aprox:0}:await resolverStory_(env, canal, m.em); } catch (e) { /* sem a imagem do story: a tela mostra só o aviso */ } } }
  const inserir = env.DB.prepare('INSERT OR IGNORE INTO msg_mensagem (conversa_id, canal, ext_id, direcao, tipo, texto, enviada_em, gravada_em, status, status_em, midia_chave, midia_mime, midia_seg, midia_url, ctx_tipo, ctx_ref, ctx_post, ctx_aprox, ctx_chave, autor_nome, autor_fone, autor_lid,por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(c.id, canal, m.extId, m.direcao, m.tipo, m.texto, m.em, t, saida ? 'enviada' : '', t, m.midiaChave || '', String(m.midiaMime || '').slice(0, 80), Number(m.midiaSeg) || 0, m.midiaUrl || '', m.ctxTipo || '', m.ctxRef || '', story.post, story.aprox, m.ctxChave || '', m.autorNome || '', m.autorFone || '', m.autorLid || '',String(m.por||'').slice(-4));
  const quem = m.grupo && m.direcao === 'entrada' ? (m.autorNome || (m.autorFone ? '+' + m.autorFone : '')) : '';
  const previa = ((quem ? quem + ': ' : '') + (m.texto || ('[' + m.tipo + ']'))).replace(/\s+/g, ' ').slice(0, 140);
  /* Em SQLite o lado direito do SET usa os valores ANTIGOS da linha: por isso a comparação com ultima_em/ult_entrada_em vale como "antes desta mensagem". */
  const atividade = env.DB.prepare("UPDATE msg_conversa SET total=total+1, nome=CASE WHEN ?<>'' AND (nome='' OR ?=1) THEN ? ELSE nome END, ultima_em=CASE WHEN ?>ultima_em THEN ? ELSE ultima_em END, previa=CASE WHEN ?>=ultima_em THEN ? ELSE previa END, ult_dir=CASE WHEN ?>=ultima_em THEN ? ELSE ult_dir END, ult_entrada_em=CASE WHEN ?='entrada' AND ?>ult_entrada_em THEN ? ELSE ult_entrada_em END, ult_saida_em=CASE WHEN ?='saida' AND ?>ult_saida_em THEN ? ELSE ult_saida_em END, nao_lidas=CASE WHEN ?='entrada' THEN nao_lidas+1 WHEN ?>=ult_entrada_em THEN 0 ELSE nao_lidas END, dono=CASE WHEN ?='entrada' AND encerrada_em<>'' THEN '' ELSE dono END, atendido_em=CASE WHEN ?='entrada' AND encerrada_em<>'' THEN '' ELSE atendido_em END, reaberta_em=CASE WHEN ?='entrada' AND encerrada_em<>'' THEN ? ELSE reaberta_em END, encerrada_em=CASE WHEN ?='entrada' THEN '' ELSE encerrada_em END, encerrada_motivo=CASE WHEN ?='entrada' THEN '' ELSE encerrada_motivo END, atualizada_em=? WHERE id=? AND changes()=1")
    .bind(m.nome, m.direcao === 'entrada' ? 1 : 0, m.nome, m.em, m.em, m.em, previa, m.em, m.direcao, m.direcao, m.em, m.em, m.direcao, m.em, m.em, m.direcao, m.em, m.direcao, m.direcao, m.em, m.direcao, m.direcao, m.direcao, t, c.id);
  const transacao=[inserir,atividade];
  if(!saida&&!m.grupo){
    // A resposta e o cancelamento dos próximos passos entram na mesma transação.
    const alvo="(SELECT CASE WHEN "+MSG_IDENTIDADE_SQL_+"<>'' THEN "+MSG_IDENTIDADE_SQL_+" ELSE 'c:'||id END FROM msg_conversa WHERE id=?)";
    transacao.push(env.DB.prepare("UPDATE msg_acompanhamento SET status='cancelada',atualizado_em=?,erro='Cliente respondeu.' WHERE status='ativo' AND (conversa_id=? OR alvo="+alvo+") AND entrada_ref<(SELECT id FROM msg_mensagem WHERE canal=? AND ext_id=?)").bind(t,c.id,c.id,canal,m.extId));
    transacao.push(env.DB.prepare("UPDATE msg_agenda SET status='cancelada',erro='Cliente respondeu.' WHERE status='pendente' AND acompanhamento IN (SELECT id FROM msg_acompanhamento WHERE status='cancelada' AND (conversa_id=? OR alvo="+alvo+"))").bind(c.id,c.id));
  }
  const [r] = await env.DB.batch(transacao);
  if (!r.meta || r.meta.changes !== 1) return false;
  await notificarNovidade_(env,canal);
  if (!saida && !m.grupo && canal !== 'instagram' && /^\d{10,15}$/.test(m.contato)) { try { if ((await cfgGet(env, 'contatos_auto')) === '1') await enfileirarContato_(env, canal, m.contato, m.nome); } catch (e) { /* o cadastro no Google é conforto: a mensagem já foi gravada */ } }
  m._conversaId = c.id; m._msgId = Number(r.meta.last_row_id) || 0;      // v7.40.9: para a resposta automática
  if(!saida && !m.grupo && Date.parse(m.em)>Date.now()-300000){try{await mobileTables_(env);await env.DB.prepare('INSERT OR IGNORE INTO msg_push_outbox(mensagem,conversa,canal,chave,criado) VALUES(?,?,?,?,?)').bind(Number(r.meta.last_row_id),c.id,canal,crypto.randomUUID(),t).run();}catch(_){/* falha de aviso não interrompe o recebimento */}}
  return true;
}
/* Entrada durável independente das gravações D1. Prefixo privado, recusado pelo
 * Worker público de mídia. Guarda apenas eventos autenticados e normalizados;
 * não inclui cabeçalhos, segredos ou o endereço secreto do webhook.
 * R2 conditional puts: lease entre execuções e at-least-once; D1 deduplica IDs.
 */
const MSG_ENTRADA_PREFIXO_='privado/mensagens/entrada/';
async function corpoWebhook_(req,maximo) {
  if(Number(req.headers.get('Content-Length')||0)>maximo)return null;
  if(!req.body)return '';
  const reader=req.body.getReader(),partes=[];let total=0;
  try{for(;;){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>maximo){await reader.cancel();return null;}partes.push(r.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let p=0;for(const x of partes){bytes.set(x,p);p+=x.byteLength;}return new TextDecoder().decode(bytes);
}
async function guardarEntrada_(env,tipo,canal,dados) {
  const corpo=JSON.stringify({v:1,tipo,canal,dados});
  if(new TextEncoder().encode(corpo).byteLength>1100000)throw Error('Evento grande demais.');
  const classe=['midia','zernio-contexto','status-publicado'].includes(tipo)?'complementos/':tipo==='status-wafly'?'atualizacoes/':'recebidas/';
  const chave=MSG_ENTRADA_PREFIXO_+classe+await sha(corpo)+'.json';
  await env.MIDIA.put(chave,corpo,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{em:agora(),tentativas:'0',proxima:'0',trava:'0'}});
  return chave;
}
async function aceitarEntrada_(env,ctx,tipo,canal,dados) {
  const chave=await guardarEntrada_(env,tipo,canal,dados);
  const tarefa=(async()=>{
    const r=await processarEntrada_(env,chave);
    // A fila de avisos é independente; indisponibilidade do push não devolve eventos à entrada.
    await processarPushMobile_(env,true).catch(()=>{});
    await processarComplementos_(env).catch(()=>{});
    return r;
  })().catch(()=>({pendente:true}));
  if(typeof ctx?.waitUntil==='function'){ctx.waitUntil(tarefa);return {ok:true,recebido:true};}
  return {...await tarefa,ok:true,recebido:true};
}

async function processarEntrada_(env,chave,forcar=false) {
  const obj=await env.MIDIA.get(chave);if(!obj)return {ok:true};
  const meta=obj.customMetadata||{},now=Date.now();
  if(Number(meta.trava)>now||(!forcar&&Number(meta.proxima)>now))return {ocupada:true};
  if(obj.size>1100000)throw Error('Registro de entrada inválido.');
  const corpo=await new Response(obj.body).text();
  const md={...meta,trava:String(now+120000)};
  const lock=await env.MIDIA.put(chave,corpo,{onlyIf:{etagMatches:obj.etag},httpMetadata:{contentType:'application/json'},customMetadata:md});
  if(!lock)return {ocupada:true};
  let j;
  try {
    j=JSON.parse(corpo);if(await msgPausado_(env,j.canal))throw Error('Canal pausado.');await iniciar(env);
    let resultado={};
    if(j.tipo==='mensagens'){
      let novas=0;const novidades=[];
      for(const m of j.dados.mensagens){if(await gravarMensagem_(env,j.canal,m)){novas++;novidades.push(m);}}
      resultado={novas,nova:novas>0};
      if(j.dados.diagnostico){const d=j.dados.diagnostico;await cfgSet(env,'msg_ult_forma'+(d.tipo==='texto'&&!d.ctx?'_txt':'')+'_'+j.canal,JSON.stringify(d)).catch(()=>{});}
      if(j.canal==='instagram')await cfgSet(env,'msg_ult_instagram',JSON.stringify({em:agora(),res:'ok',itens:j.dados.mensagens.length,novas,forma:j.dados.forma||''})).catch(()=>{});
      // Todas as mensagens básicas já aparecem na lista antes de qualquer rede de mídia.
      for(const m of j.dados.mensagens)if(m.midiaUrl||m.ctxUrl){const dados={...m};delete dados._conversaId;delete dados._msgId;await guardarEntrada_(env,'midia',j.canal,dados);}
      for(const m of novidades)await agendarAuto_(null,env,j.canal,m);
      if(j.dados.leituras?.length){await aplicarLeiturasInstagram_(env,j.dados.leituras);await notificarNovidade_(env,j.canal);}
    }else if(j.tipo==='zernio'){
      const z=await zernioCfg_(env);if(!z||j.dados.account.accountId&&String(j.dados.account.accountId)!==String(z.conta.id))throw Error('Conexão Instagram alterada.');
      const nova=await processarEventoZernio_(env,j.dados,true);resultado={nova};await cfgSet(env,'msg_ult_zernio',JSON.stringify({em:agora(),res:'ok',evento:j.dados.event})).catch(()=>{});
    }else if(j.tipo==='midia'){await completarMidiaEntrada_(env,j.canal,j.dados);
    }else if(j.tipo==='zernio-contexto'){await processarEventoZernio_(env,j.dados);
    }else if(j.tipo==='status-wafly'){
      let falta=false;for(const id of j.dados.ids)if(!await env.DB.prepare('SELECT id FROM msg_mensagem WHERE canal=? AND ext_id=?').bind(j.canal,id).first()){falta=true;break;}
      if(falta){const backlog=await env.MIDIA.list({prefix:MSG_ENTRADA_PREFIXO_+'recebidas/',limit:1});if(backlog.objects.length||Date.now()-Date.parse(meta.em)<300000){const e=Error('Referência ainda não recebida.');e.esperaReferencia=true;throw e;}}
      resultado={atualizadas:await atualizarStatusWafly_(env,j.canal,j.dados)};
      if(resultado.atualizadas)await notificarNovidade_(env,j.canal);
    }
    else if(j.tipo==='status-publicado'){
      const m=j.dados;await prepararMidia_(env,j.canal,m);
      if(m.midiaChave)await env.DB.prepare('INSERT OR REPLACE INTO msg_status_ref(canal,ext_id,chave,mime,em) VALUES (?,?,?,?,?)').bind(j.canal,m.extId,m.midiaChave,m.midiaMime,m.em).run();
      resultado={status:true};
    }else throw Error('Tipo de entrada inválido.');
    await env.MIDIA.delete(chave);
    return {ok:true,...resultado};
  }catch(erro){
    const tentativas=Number(meta.tentativas||0)+1;
    const motivo=erro.esperaReferencia?'referencia':/quota|cota|exceeded.*daily|daily.*limit/i.test(String(erro.message||''))?'cota':/Mídia aguardando|Story aguardando/i.test(String(erro.message||''))?'midia':/pausado/i.test(String(erro.message||''))?'pausa':'armazenamento';
    // Não descarta eventos em erro. Recuo evita insistir quando há cota/serviço indisponível.
    await env.MIDIA.put(chave,j?JSON.stringify(j):corpo,{onlyIf:{etagMatches:lock.etag},httpMetadata:{contentType:'application/json'},customMetadata:{...md,motivo,tentativas:String(tentativas),proxima:String(Date.now()+Math.min(1800000,15000*2**Math.min(tentativas,7))),trava:'0'}});
    if(!erro.esperaReferencia){console.warn(JSON.stringify({evento:'entrada_pendente',canal:j?.canal||'',motivo,tentativas}));}
    if(!erro.esperaReferencia)await anotarFalha_(env,'/wh/'+(j?.canal||''),503);
    return {ok:false,pendente:true};
  }
}
async function processarLoteEntrada_(env,classe,limite,forcar=false) {
  const ck='msg_entrada_cursor:'+classe,cursor=await env.CACHE.get(ck).catch(()=>null);
  const lote=await env.MIDIA.list({prefix:MSG_ENTRADA_PREFIXO_+classe+'/',limit:limite,cursor:cursor||undefined,include:['customMetadata']});
  for(const obj of lote.objects)await processarEntrada_(env,obj.key,forcar);
  if(lote.truncated)await env.CACHE.put(ck,lote.cursor,{expirationTtl:3600});else await env.CACHE.delete(ck);
}
const processarComplementos_=(env,forcar=false)=>processarLoteEntrada_(env,'complementos',4,forcar);
async function processarEntradas_(env,forcar=false) {
  await processarLoteEntrada_(env,'recebidas',20,forcar);
  await processarLoteEntrada_(env,'atualizacoes',20,forcar);
  await processarPushMobile_(env,true).catch(()=>{});
  await processarComplementos_(env,forcar);
}
async function completarMidiaEntrada_(env,canal,m) {
  const atual=await env.DB.prepare('SELECT id,conversa_id,midia_chave,ctx_chave,ctx_post,ctx_tipo FROM msg_mensagem WHERE canal=? AND ext_id=?').bind(canal,m.extId).first();
  if(!atual)return;
  const alteracoes=[];
  if(m.midiaUrl&&!atual.midia_chave){const x=m.midiaChave?{chave:m.midiaChave,mime:m.midiaMime}:await copiarMidiaRemota_(env,m.midiaUrl,m.midiaMime,m.tipo==='documento');if(!x)throw Error('Mídia aguardando cópia.');m.midiaChave=x.chave;m.midiaMime=x.mime;alteracoes.push(env.DB.prepare("UPDATE msg_mensagem SET midia_chave=?,midia_mime=?,midia_url='' WHERE id=? AND midia_chave=''").bind(x.chave,x.mime,atual.id));}
  if(m.ctxUrl&&!atual.ctx_chave){const x=m.ctxChave?{chave:m.ctxChave}:await copiarMidiaRemota_(env,m.ctxUrl,m.ctxMime||'');if(!x)throw Error('Story aguardando cópia.');m.ctxChave=x.chave;alteracoes.push(env.DB.prepare("UPDATE msg_mensagem SET ctx_chave=? WHERE id=? AND ctx_chave=''").bind(x.chave,atual.id));}
  if(m.ctxPost&&!atual.ctx_post)alteracoes.push(env.DB.prepare('UPDATE msg_mensagem SET ctx_post=?,ctx_aprox=0 WHERE id=? AND ctx_post=0').bind(m.ctxPost,atual.id));
  if(m.ctxTipo==='story'&&atual.ctx_tipo!=='story')alteracoes.push(env.DB.prepare("UPDATE msg_mensagem SET ctx_tipo='story' WHERE id=? AND ctx_tipo<> 'story'").bind(atual.id));
  if(alteracoes.length){const em=agora();alteracoes.push(env.DB.prepare('UPDATE msg_mensagem SET status_em=? WHERE id=?').bind(em,atual.id),env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(em,atual.conversa_id));await env.DB.batch(alteracoes);await notificarNovidade_(env,canal);}
}

/* Android: fila persistente e entrega pelo OneSignal. Nunca contém texto de conversa. */
async function mobilePushKey_(env){try{return String((await cfgGet(env,'mobile_onesignal_key'))||env.MOBILE_ONESIGNAL_KEY||'');}catch(_){return String(env.MOBILE_ONESIGNAL_KEY||'');}}
async function mobileTables_(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS msg_mobile (subscription TEXT PRIMARY KEY, dono TEXT NOT NULL, atualizado TEXT NOT NULL)').run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_push_outbox (mensagem INTEGER PRIMARY KEY, conversa INTEGER NOT NULL, canal TEXT NOT NULL, chave TEXT NOT NULL, criado TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendente', tentativas INTEGER NOT NULL DEFAULT 0)").run();
}
export async function registrarMobile_(env, req) {
  await mobileTables_(env);
  const d=await req.json().catch(()=>({})), id=String(d.subscription||'');
  if(!/^[a-f0-9-]{36}$/i.test(id))return {ok:false,erro:'Identificador do aparelho inválido.'};
  const dono=(req.headers.get('X-TK-Whats')||'').replace(/\D/g,'');
  if(req.method==='DELETE'){
    const existente=await env.DB.prepare('SELECT dono FROM msg_mobile WHERE subscription=?').bind(id).first();
    if(existente&&existente.dono!==dono)return {ok:false,erro:'Este aparelho está ligado a outra conta.'};
    await env.DB.prepare('DELETE FROM msg_mobile WHERE subscription=? AND dono=?').bind(id,dono).run();await env.CACHE.delete('mobile-session:'+id);return {ok:true};
  }
  await env.DB.prepare('DELETE FROM msg_mobile WHERE atualizado<?').bind(new Date(Date.now()-30*86400000).toISOString()).run();
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM msg_mobile WHERE dono=? AND subscription<>?').bind(dono,id).first();
  if(Number(count?.n)>=10)return {ok:false,erro:'Limite de dez aparelhos por conta. Desative um aparelho antes de adicionar outro.'};
  await env.DB.prepare('INSERT INTO msg_mobile(subscription,dono,atualizado) VALUES(?,?,?) ON CONFLICT(subscription) DO UPDATE SET dono=excluded.dono,atualizado=excluded.atualizado').bind(id,dono,agora()).run();
  // A sessão fica em KV com expiração e é revalidada antes de qualquer envio.
  await env.CACHE.put('mobile-session:'+id,JSON.stringify({whats:dono,sessao:req.headers.get('X-TK-Sessao')||''}),{expirationTtl:30*86400});
  return {ok:true,servidorConfigurado:!!(await mobilePushKey_(env)),renovarEmDias:30};
}
/** Conteúdo mínimo para conferir pelo aviso, sem URLs de mídia, sessão ou credenciais. */
export function previaPushMobile_(m) {
  const limpo=(v,n)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
  const canal=({whatsapp1:'WhatsApp 1',whatsapp2:'WhatsApp 2',instagram:'Instagram'})[m.canal]||'Mensagens';
  const nome=limpo(m.nome||m.contato,70)||'Novo contato';
  const tipo=({'imagem':'Foto','image':'Foto','áudio':'Áudio','audio':'Áudio','vídeo':'Vídeo','video':'Vídeo','sticker':'Figurinha','contato':'Contato','localizacao':'Localização'})[m.tipo]||'Anexo';
  const texto=limpo(m.texto,220), previa=m.tipo==='texto'?(texto||'Nova mensagem'):tipo+(texto?' · '+texto:'');
  const autor=m.grupo?limpo(m.autor_nome,50):'';
  return {titulo:nome+' · '+canal,texto:(autor?autor+': ':'')+previa};
}
export async function processarPushMobile_(env, recentes = false) {
  const pushKey=await mobilePushKey_(env);if(!pushKey)return {ok:false,motivo:'sem_configuracao'};
  await mobileTables_(env);
  const fila=(await env.DB.prepare("SELECT * FROM msg_push_outbox WHERE estado='pendente' AND tentativas<5 ORDER BY mensagem "+(recentes?"DESC":"ASC")+" LIMIT 10").all()).results||[];
  const devices=(await env.DB.prepare('SELECT subscription FROM msg_mobile ORDER BY atualizado DESC LIMIT 20').all()).results||[],ids=[], regras = await msgRegras_(env);
  for(const dev of devices){
    const cred=await env.CACHE.get('mobile-session:'+dev.subscription,'json');if(!cred)continue;
    const perms=await permissoes(env,new Request('https://sessao.invalid',{headers:{'X-TK-Whats':cred.whats,'X-TK-Sessao':cred.sessao}}));
    if(Array.isArray(perms)&&msgDireitos_(perms,cred.whats,regras).acessar)ids.push(dev.subscription);
  }
  let enviadas=0;
  for(const item of fila){
    if(Date.parse(item.criado)<Date.now()-3600000){await env.DB.prepare("UPDATE msg_push_outbox SET estado='expirada' WHERE mensagem=?").bind(item.mensagem).run();continue;}
    if(!ids.length)continue;
    try{
      const mensagem=await env.DB.prepare("SELECT c.nome,c.contato,c.grupo,c.canal,c.nao_lidas,c.encerrada_em,m.texto,m.tipo,m.autor_nome FROM msg_mensagem m JOIN msg_conversa c ON c.id=m.conversa_id WHERE c.id=? AND EXISTS(SELECT 1 FROM msg_mensagem original WHERE original.id=? AND original.conversa_id=c.id AND original.direcao='entrada') AND m.id=(SELECT recente.id FROM msg_mensagem recente WHERE recente.conversa_id=c.id AND recente.direcao='entrada' ORDER BY recente.enviada_em DESC,recente.id DESC LIMIT 1)").bind(item.conversa,item.mensagem).first();
      if(!mensagem||Number(mensagem.nao_lidas)<=0||mensagem.encerrada_em){await env.DB.prepare("UPDATE msg_push_outbox SET estado='expirada' WHERE mensagem=?").bind(item.mensagem).run();continue;}
      const contatoAtual=await env.DB.prepare('SELECT '+MSG_COLS_CONVERSA_+' FROM msg_conversa WHERE id=?').bind(item.conversa).first();if(contatoAtual)mensagem.nome=contatoAtual.nome;
      const previa=previaPushMobile_(mensagem);
      const r=await fetch('https://api.onesignal.com/notifications',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','Authorization':'Key '+pushKey},body:JSON.stringify({app_id:'535f6b0d-c866-43c2-b241-43bd7ab62fae',target_channel:'push',include_subscription_ids:ids,idempotency_key:item.chave,headings:{en:previa.titulo,pt:previa.titulo},contents:{en:previa.texto,pt:previa.texto},priority:10,small_icon:'ic_stat_message',buttons:[{id:'espiar',text:'Espiar'},{id:'abrir',text:'Abrir conversa'}],android_visibility:0,data:{conversa:item.conversa,canal:item.canal,modo:'espiar'},collapse_id:'conversa-'+item.conversa,ttl:3600})});
      const j=await r.json();
      if(r.ok&&j.id){await env.DB.prepare("UPDATE msg_push_outbox SET estado='enviada' WHERE mensagem=?").bind(item.mensagem).run();enviadas++;}
      else await env.DB.prepare('UPDATE msg_push_outbox SET tentativas=tentativas+1 WHERE mensagem=?').bind(item.mensagem).run();
    }catch(_){await env.DB.prepare('UPDATE msg_push_outbox SET tentativas=tentativas+1 WHERE mensagem=?').bind(item.mensagem).run();}
  }
  await env.DB.prepare("DELETE FROM msg_push_outbox WHERE criado<?").bind(new Date(Date.now()-7*86400000).toISOString()).run();
  return {ok:true,enviadas};
}

/** Segredo do app da Meta: o cadastrado na Gestão (D1) vale primeiro; o secret do Worker é o reserva. */
async function igAppSecret_(env) {
  try { const v = await cfgGet(env, 'ig_app_secret'); if (v) return v; } catch (e) { /* cai no secret */ }
  return String(env.IG_APP_SECRET || '');
}
async function msgPausado_(env, canal) { try { return (await cfgGet(env, 'msg_pausa_' + canal)) === '1'; } catch (e) { return false; } }
/** Webhooks públicos. Sempre responde rápido; só aceita com o segredo certo no caminho. */
async function rotaWebhookMensagens_(env, req, url, ctx) {
  const ok = (c, o) => new Response(JSON.stringify(o), { status: c, headers: { 'Content-Type': 'application/json' } });
  const partes = url.pathname.split('/').filter(Boolean);                      // ['wh','wafly','1','<segredo>'] | ['wh','instagram','<segredo>']
  let segredo;try{segredo=await msgSegredo_(env);}catch(e){if(!/no such table/i.test(String(e)))throw e;await iniciar(env);segredo=await msgSegredo_(env);}
  if (partes[1] === 'instagram') {
    if (!igualConst_(partes[2] || '', segredo)) return ok(404, { ok: false });
    if (req.method === 'GET') {                                                // verificação do webhook pela Meta
      return url.searchParams.get('hub.mode') === 'subscribe' && igualConst_(url.searchParams.get('hub.verify_token') || '', segredo)
        ? new Response(String(url.searchParams.get('hub.challenge') || ''), { status: 200 }) : ok(403, { ok: false });
    }
    if (req.method !== 'POST') return ok(405, { ok: false });
    const segApp = await igAppSecret_(env);
    if (!segApp) return ok(503, { ok: false, erro: 'Segredo do app da Meta não configurado.' });
    const bruto = await corpoWebhook_(req,262144);
    if (bruto === null) return ok(413, { ok: false });
    const assin = (req.headers.get('X-Hub-Signature-256') || '').replace(/^sha256=/, '');
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segApp), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const esperado = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(bruto))), (x) => x.toString(16).padStart(2, '0')).join('');
    if (!assin || !igualConst_(assin, esperado)) { await cfgSet(env, 'msg_ult_instagram', JSON.stringify({ em: agora(), res: 'assinatura', tem: !!assin })).catch(()=>{}); return ok(401, { ok: false }); }
    if (await msgPausado_(env, 'instagram')) return ok(200, { ok: true, pausado: true });
    let b = null; try { b = JSON.parse(bruto); } catch (e) { return ok(400, { ok: false }); }
    const lista=normalizarInstagram_(b),leituras=leiturasInstagram_(b);
    if(!lista.length&&!leituras.length){await cfgSet(env,'msg_ult_instagram',JSON.stringify({em:agora(),res:'ok',itens:0,novas:0,forma:formaInstagram_(b)})).catch(()=>{});return ok(200,{ok:true,novas:0});}
    return ok(200,await aceitarEntrada_(env,ctx,'mensagens','instagram',{mensagens:lista,leituras,forma:lista.length?'':formaInstagram_(b)}));
  }
  if (partes[1] === 'wafly' && (partes[2] === '1' || partes[2] === '2')) {
    if (!igualConst_(partes[3] || '', segredo)) return ok(404, { ok: false });
    if (req.method !== 'POST') return ok(405, { ok: false });
    const canal = 'whatsapp' + partes[2];
    const bruto = await corpoWebhook_(req,262144);
    if (bruto === null) return ok(413, { ok: false });
    let b = null; try { b = JSON.parse(bruto); } catch (e) { return ok(400, { ok: false }); }
    if (await msgPausado_(env, canal)) return ok(200, { ok: true, pausado: true });
    const cfg = await cfgWafly_(env, Number(partes[2]));
    if (cfg && b && b.instanceId && String(b.instanceId) !== cfg.instance) return ok(200, { ok: true, ignorado: 'outra instância' });
    if (b && b.type === 'MessageStatusCallback') return ok(200,await aceitarEntrada_(env,ctx,'status-wafly',canal,{status:String(b.status||''),ids:(Array.isArray(b.ids)?b.ids:[]).slice(0,50).map(String)}));
    if(b&&b.type==='ReceivedCallback'&&b.fromMe===true&&(b.phone==='status@broadcast'||b.isStatus===true)){
      const status=normalizarWafly_(Object.assign({},b,{phone:'0000000000',isGroup:false}));
      return ok(200,status&&status.midiaUrl?await aceitarEntrada_(env,ctx,'status-publicado',canal,status):{ok:true,status:true});
    }
    const m = normalizarWafly_(b);
    if (!m) return ok(200, { ok: true, ignorado: true });
    const campos=o=>Object.keys(o||{}).filter(k=>/^[a-zA-Z][a-zA-Z0-9_]{0,35}$/.test(k)).slice(0,40);
    const diagnostico={em:agora(),campos:campos(b),tipo:m.tipo,ctx:m.ctxTipo,isStatusReply:b.isStatusReply===true,temRef:!!b.referenceMessageId,temStatusReply:!!b.statusReply,interno:campos(b[({imagem:'image','vídeo':'video','áudio':'audio',documento:'document',figurinha:'sticker',texto:'text'})[m.tipo]])};
    return ok(200,await aceitarEntrada_(env,ctx,'mensagens',canal,{mensagens:[m],diagnostico}));
  }
  return ok(404, { ok: false });
}
/** Liga a gravação: aponta o webhook de mensagens da instância Wafly para este Worker. */
async function ligarWebhookWafly_(env, slot, origem) {
  const cfg = await cfgWafly_(env, slot);
  if (!cfg) return { ok: false, erro: slot === 1 ? 'Cadastre o Wafly 1 em Conexões antes de ligar as mensagens.' : 'Cadastre o Wafly 2 em Conexões antes de ligar as mensagens.' };
  const alvo = origem + '/wh/wafly/' + slot + '/' + (await msgSegredo_(env));
  try {
    const r = await fetch(waflyUrl_(cfg, '/update-webhook-received'), { method: 'PUT', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Client-Token': cfg.clientToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ value: alvo }) });
    if (!r.ok) return { ok: false, erro: 'A Wafly não aceitou ligar o recebimento (HTTP ' + r.status + '). Confira as credenciais e tente de novo.' };
  } catch (e) { return { ok: false, erro: 'Sem resposta da Wafly agora. Tente de novo.' }; }
  await cfgSet(env, 'msg_wh_ligado_whatsapp' + slot, agora());
  await cfgSet(env, 'msg_pausa_whatsapp' + slot, null);
  /* v2: também (1) registrar o que a loja envia pelo celular e (2) receber entregue/lida. Se a Wafly não aceitar, avisa sem desfazer a gravação. */
  const avisos = [], diag = [], redigir = (t) => String(t || '').split(alvo).join('***').replace(/\s+/g, ' ').slice(0, 160);
  const tentar = async (rotulo, caminho, variantes, aviso) => {
    for (const [metodo, corpo] of variantes) {
      try {
        const r = await fetch(waflyUrl_(cfg, caminho), { method: metodo, redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Client-Token': cfg.clientToken, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const txt = await r.text().catch(() => '');
        let falhou = !r.ok; try { const j = JSON.parse(txt); if (j && (j.value === false || j.error)) falhou = true; } catch (e) { /* corpo não é JSON */ }
        diag.push(rotulo + ' ' + metodo + ' ' + r.status + (falhou ? ' ' + redigir(txt) : ' ok'));
        if (!falhou) return true;
      } catch (e) { diag.push(rotulo + ' ' + metodo + ' sem resposta'); }
    }
    avisos.push(aviso); return false;
  };
  /* A Wafly não tem /update-notify-sent-by-me (404). Pede o mesmo no próprio endereço de recebimento; se não aceitar, tenta o "recebimento+entrega". */
  const okEnv = await tentar('enviadas', '/update-webhook-received', [['PUT', { value: alvo, notifySentByMe: true }]], '');
  if (okEnv) { avisos.length = 0; } else { avisos.length = 0; await tentar('enviadas', '/update-webhook-received-delivery', [['PUT', { value: alvo, notifySentByMe: true }]], 'Não consegui ativar o registro das mensagens que você envia pelo celular.'); }
  await tentar('status', '/update-webhook-message-status', [['PUT', { value: alvo }], ['POST', { value: alvo }]], 'Não consegui ativar o aviso de entregue/lida.');
  await cfgSet(env, 'msg_ligar_diag_' + slot, JSON.stringify({ em: agora(), tentativas: diag }));
  await cfgSet(env, 'msg_wh_v2_whatsapp' + slot, avisos.length ? null : agora());   // só marca "enviadas e leituras ativas" se a Wafly aceitou tudo
  return { ok: true, avisos: avisos, detalhes: diag };
}
async function resumoMensagens_(env, origem) {
  const canais = {};
  for (const c of MSG_CANAIS) {
    const x = await env.DB.prepare('SELECT SUM(CASE WHEN encerrada_em=\'\' THEN 1 ELSE 0 END) AS conversas, COALESCE(SUM(total),0) AS mensagens, COALESCE(MAX(ultima_em),\'\') AS ultima FROM msg_conversa WHERE canal=?').bind(c).first();
    canais[c] = { v2: !!(await cfgGet(env, 'msg_wh_v2_' + c)), conversas: Number(x.conversas) || 0, mensagens: Number(x.mensagens) || 0, ultima: x.ultima || '', ligadoEm: (await cfgGet(env, 'msg_wh_ligado_' + c)) || '', pausado: await msgPausado_(env, c) };
  }
  const cont = await msgContagens_(env);
  for (const c of MSG_CANAIS) { canais[c].naoLidas = cont[c].nao_lidas; canais[c].semResposta = cont[c].sem_resposta; }
  const temSegApp = !!(await igAppSecret_(env));
  canais.instagram.pronto = temSegApp;
  return { ok: true, canais: canais, urlInstagram: temSegApp ? origem + '/wh/instagram/' + (await msgSegredo_(env)) : '' };
}
/* ---------------------------------------------------------------------------
 * Mensagens v2 — responder pelo painel, entrega/leitura, "falta responder", novidades ao vivo, exportação e métricas.
 *  • Envio: nunca reenvia sozinho. Resposta incerta (tempo esgotado/5xx) vira "sem confirmação" e a pessoa decide.
 *  • idLocal (gerado na tela) torna o envio idempotente: tocar duas vezes não manda duas mensagens.
 *  • Leitura ("lida") vem da Wafly (MessageStatusCallback) e do Instagram (evento read); a loja só vê, nunca envia confirmação de leitura.
 * ------------------------------------------------------------------------- */
const MSG_RANK_ = "CASE status WHEN 'lida' THEN 3 WHEN 'entregue' THEN 2 WHEN 'enviada' THEN 1 ELSE 0 END";
const MSG_RANK_NOVO_ = { enviada: 1, entregue: 2, lida: 3 };
const MSG_NOME_CANAL_ = { whatsapp1: 'WhatsApp 1', whatsapp2: 'WhatsApp 2', instagram: 'Instagram' };
/** MessageStatusCallback da Wafly: SENT/RECEIVED/READ/PLAYED sobem o "tique" (nunca descem); READ_BY_ME limpa o "não lida". */
async function atualizarStatusWafly_(env, canal, b) {
  const ids = (Array.isArray(b && b.ids) ? b.ids : []).map((x) => String(x)).filter(Boolean).slice(0, 50);
  const st = String((b && b.status) || '').toUpperCase();
  const novo = st === 'READ' || st === 'PLAYED' ? 'lida' : st === 'RECEIVED' ? 'entregue' : st === 'SENT' ? 'enviada' : '';
  if (!ids.length || (!novo && st !== 'READ_BY_ME')) return 0;
  const t = agora(); let n = 0;
  for (const id of ids) {
    const m = await env.DB.prepare('SELECT id, conversa_id, direcao, enviada_em FROM msg_mensagem WHERE canal=? AND ext_id=?').bind(canal, id).first();
    if (!m) continue;
    if (st === 'READ_BY_ME') { await env.DB.prepare("UPDATE msg_conversa SET nao_lidas=MIN(nao_lidas,(SELECT COUNT(*) FROM msg_mensagem WHERE conversa_id=? AND direcao='entrada' AND (enviada_em>? OR (enviada_em=? AND id>?)))),atualizada_em=? WHERE id=? AND nao_lidas<>0").bind(m.conversa_id,m.enviada_em,m.enviada_em,m.id,t,m.conversa_id).run(); n++; continue; }
    if (m.direcao !== 'saida') continue;
    const r = await env.DB.prepare("UPDATE msg_mensagem SET status=?, status_em=? WHERE conversa_id=? AND direcao='saida' AND status<>'incerta' AND enviada_em<=? AND " + MSG_RANK_ + ' < ?').bind(novo, t, m.conversa_id, m.enviada_em, MSG_RANK_NOVO_[novo]).run();
    if (r.meta && r.meta.changes > 0) { await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(t, m.conversa_id).run(); n++; }
  }
  return n;
}
/** Instagram: evento "read" (o cliente abriu a conversa) -> mensagens da loja até aquele momento ficam "lidas". */
function leiturasInstagram_(b) {
  const out = [];
  if (!b || b.object !== 'instagram' || !Array.isArray(b.entry)) return out;
  const idDe = (x) => String((x && typeof x === 'object' ? x.id : x) || '');
  for (const e of b.entry) {
    const dono = String((e && e.id) || '');
    for (const ev of (Array.isArray(e && e.messaging) ? e.messaging : [])) {
      if (!ev || !ev.read) continue;
      const contato = idDe(ev.sender); if (!contato || contato === dono) continue;
      const ms = Number(ev.timestamp || 0);
      out.push({ contato: contato.slice(0, 80), ate: ms > 0 ? new Date(ms < 1e12 ? ms * 1000 : ms).toISOString() : agora() });
    }
  }
  return out;
}
async function aplicarLeiturasInstagram_(env, lst) {
  const t = agora(); let n = 0;
  for (const x of lst) {
    const c = await env.DB.prepare("SELECT id FROM msg_conversa WHERE canal='instagram' AND contato=?").bind(x.contato).first();
    if (!c) continue;
    const r = await env.DB.prepare("UPDATE msg_mensagem SET status='lida', status_em=? WHERE conversa_id=? AND direcao='saida' AND enviada_em<=? AND status NOT IN ('lida','incerta')").bind(t, c.id, x.ate).run();
    if (r.meta && r.meta.changes > 0) { await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(t, c.id).run(); n++; }
  }
  return n;
}
/* Identidade do atendimento: vínculo explícito por telefone/contato, sem inferir por nome. */
const pessoaTelefone_ = (v) => { const n = foneNormal_(String(v || '')); return n.ok ? n : null; };
async function indexarNomesGoogle_(env) {
  if (!(await cfgGet(env, 'contatos_url'))) return { ok: true, fim: true, ligada: false };
  const done = Date.parse((await cfgGet(env, 'msg_google_index_em')) || '');
  if (done && Date.now() - done < 86400000) return { ok: true, fim: true };
  const pagina = (await cfgGet(env, 'msg_google_index_pagina')) || '';
  const r = await ponte_(env, { acao: 'listar', pagina: pagina || undefined });
  if (!r.ok) return r;
  const statements = [];
  for (const c of (Array.isArray(r.contatos) ? r.contatos : [])) {
    const numbers = (Array.isArray(c.f) ? c.f : []).map(pessoaTelefone_).filter(Boolean);
    const nome = String(c.n || '').trim().slice(0, 120); if (!nome || !numbers.length) continue;
    for (const n of numbers) statements.push(env.DB.prepare('INSERT INTO msg_google_nome (chave,nome,pessoa,em) VALUES (?,?,?,?) ON CONFLICT(chave) DO UPDATE SET nome=excluded.nome,pessoa=excluded.pessoa,em=excluded.em').bind(n.chave,nome,numbers[0].chave,agora()));
  }
  for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
  await cfgSet(env, 'msg_google_index_pagina', String(r.proxima || ''));
  if (!r.proxima) { await cfgSet(env, 'msg_google_index_em', agora()); await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE grupo=0').bind(agora()).run(); }
  return { ok: true, fim: !r.proxima, lidos: Number(r.contatos && r.contatos.length) || 0, total: Number(r.total) || 0 };
}
async function pessoaAtendimento_(env, id) {
  const c = await env.DB.prepare('SELECT '+MSG_COLS_CONVERSA_+' FROM msg_conversa WHERE id=?').bind(id).first();
  if (!c || c.grupo) return null;
  const key = c.pessoa || 'ig:'+c.contato;
  const pessoa = await env.DB.prepare('SELECT nome,whatsapp,segundo FROM msg_pessoa WHERE id=?').bind(key).first();
  const canais = (await env.DB.prepare('SELECT '+MSG_COLS_CONVERSA_+' FROM msg_conversa WHERE grupo=0 AND ('+MSG_IDENTIDADE_SQL_+'=? OR id=?) ORDER BY ultima_em DESC LIMIT 50').bind(key,id).all()).results;
  return { ok:true, conversa:c, pessoa:key, nome:(pessoa && pessoa.nome)||c.nome||'', whatsapp:(pessoa && pessoa.whatsapp)||(c.canal!=='instagram'?c.contato:''), segundo:(pessoa && pessoa.segundo)||'', canais:canais };
}
async function salvarPessoaAtendimento_(env, d) {
  const atual = await pessoaAtendimento_(env,Number(d.conversa)); if (!atual) return {ok:false,erro:'Conversa individual não encontrada.'};
  const nome = String(d.nome || '').trim().slice(0,120);
  const phone = pessoaTelefone_(d.whatsapp), second = String(d.segundo || '').trim()?pessoaTelefone_(d.segundo):null;
  if (!nome) return {ok:false,erro:'Informe o nome da pessoa.'};
  if (!phone && !(atual.conversa.canal==='instagram'&&d.semWhatsApp===true)) return {ok:false,erro:'Informe um WhatsApp válido ou indique que o cliente não informou o número.'};
  if (String(d.segundo || '').trim()&&!second) return {ok:false,erro:'Confira o segundo WhatsApp.'};
  if(!phone&&atual.canais.some(c=>c.canal!=='instagram'))return {ok:false,erro:'Esse cadastro já tem um WhatsApp vinculado. Mantenha o número principal.'};
  const key = phone ? phone.chave : atual.pessoa;
  const ids = [...new Set([Number(d.conversa),...(Array.isArray(d.vincular)?d.vincular:[]).map(Number)])].filter(x=>Number.isSafeInteger(x)&&x>0).slice(0,20);
  const selected = (await env.DB.prepare('SELECT '+MSG_COLS_CONVERSA_+' FROM msg_conversa WHERE grupo=0 AND id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all()).results;
  if (selected.length!==ids.length) return {ok:false,erro:'Um dos contatos escolhidos não está disponível.'};
  const keys = [...new Set([atual.pessoa,key,...selected.map(x=>x.pessoa).filter(Boolean),...(second?[second.chave]:[])])];
  const all = (await env.DB.prepare('SELECT '+MSG_COLS_CONVERSA_+' FROM msg_conversa WHERE grupo=0 AND ('+MSG_IDENTIDADE_SQL_+' IN ('+keys.map(()=>'?').join(',')+') OR id IN ('+ids.map(()=>'?').join(',')+')) LIMIT 100').bind(...keys,...ids).all()).results;
  const t=agora(), batch=[env.DB.prepare('INSERT INTO msg_pessoa (id,nome,whatsapp,segundo,em) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,whatsapp=excluded.whatsapp,segundo=excluded.segundo,em=excluded.em').bind(key,nome,phone?phone.d:'',second?second.d:'',t)];
  for(const c of all){batch.push(env.DB.prepare('INSERT INTO msg_pessoa_alias (canal,contato,pessoa) VALUES (?,?,?) ON CONFLICT(canal,contato) DO UPDATE SET pessoa=excluded.pessoa').bind(c.canal,c.contato,key));batch.push(env.DB.prepare('UPDATE msg_conversa SET pessoa=?,atualizada_em=? WHERE id=?').bind(key,t,c.id));}
  for(const n of [phone,second].filter(Boolean)) for(const canal of ['whatsapp1','whatsapp2']) for(const fone of [...new Set([n.d,n.chave])]) batch.push(env.DB.prepare('INSERT INTO msg_pessoa_alias (canal,contato,pessoa) VALUES (?,?,?) ON CONFLICT(canal,contato) DO UPDATE SET pessoa=excluded.pessoa').bind(canal,fone,key));
  await env.DB.batch(batch);
  return pessoaAtendimento_(env,Number(d.conversa));
}

/* v2.11: chave da pessoa = número só com dígitos e, no Brasil, sem o 9º dígito do celular (o mesmo cliente às vezes chega com e sem ele). */
/* v2.13: motivos de encerramento. Concluído/Vendeu/Cliente parou de responder contam como atendimento resolvido na hora do encerramento;
 * Engano ou spam tira a conversa das métricas. */
const MSG_MOTIVOS_ = ['concluido', 'vendeu', 'sem_resposta', 'engano'];
const MSG_PESSOA_SQL_ = "(CASE WHEN length(contato)=13 AND substr(contato,1,2)='55' AND substr(contato,5,1)='9' THEN substr(contato,1,4)||substr(contato,6) ELSE contato END)";
// v2.12: conversa encerrada não conta como "a pessoa também está no outro WhatsApp" (volta a contar quando o cliente escreve de novo nela)
const MSG_OUTRO_SQL_ = "(SELECT o.id FROM msg_conversa o WHERE msg_conversa.pessoa<>'' AND o.pessoa=msg_conversa.pessoa AND o.canal<>msg_conversa.canal AND o.canal IN ('whatsapp1','whatsapp2') AND msg_conversa.canal IN ('whatsapp1','whatsapp2') AND o.total>0 AND o.encerrada_em='' ORDER BY o.ultima_em DESC LIMIT 1)";
/* v7.40.4: etiquetas da pessoa (alvo = identidade da pessoa ou "c:<id da conversa>") */
const ETIQUETAS_PADRAO_ = [['Novo cliente', 'cinza', 1], ['Reserva', 'ambar', 1], ['Aguardando pagamento', 'azul', 1], ['Pago', 'verde', 1], ['Enviado', 'roxo', 1], ['Troca', 'rosa', 0]];
const ETQ_CORES_ = ['cinza', 'ambar', 'azul', 'verde', 'roxo', 'rosa'];
async function etiquetas_(env) {
  let rs = (await env.DB.prepare('SELECT id, nome, cor, ordem, venda FROM msg_etiqueta WHERE arquivada=0 ORDER BY ordem, id').all()).results || [];
  if (!rs.length && !(await cfgGet(env, 'msg_etq_semeada'))) {
    await env.DB.batch(ETIQUETAS_PADRAO_.map((e, i) => env.DB.prepare('INSERT INTO msg_etiqueta (nome, cor, ordem, venda) VALUES (?,?,?,?)').bind(e[0], e[1], i, e[2])));
    await cfgSet(env, 'msg_etq_semeada', '1');
    rs = (await env.DB.prepare('SELECT id, nome, cor, ordem, venda FROM msg_etiqueta WHERE arquivada=0 ORDER BY ordem, id').all()).results || [];
  }
  return rs;
}
/* v7.40.9: atalhos de resposta rápida (semeados uma vez, sem apagar os que a equipe já salvou) e respostas automáticas (desligadas por padrão).
 * Os dados da loja que mudam (chave Pix, nome da titular, valores) NUNCA ficam aqui: a semente traz [chave Pix], [nome] e [valor …] para a atendente completar no app. */
const MSG_ATALHOS_PADRAO_ = [
  ['/oi', 'Oi, tudo bem? Aqui é a [nome], da TENKiTER 😊 Me diz o que você tá procurando que eu te mostro.'],
  ['/preco', 'Esse sai por R$ [valor no Pix] no Pix ou dinheiro, ou R$ [valor no cartão] em até 10x sem juros. Qual tamanho você usa? Vejo aqui se tem.'],
  ['/foto', 'Conseguiu ver as fotos? Se quiser, mando de outro jeito ou vejo outra cor pra você.'],
  ['/tamanho', 'Tem sim! Qual número você veste? Já confiro as cores que tem no seu tamanho.'],
  ['/entrega', 'Aqui em Crateús a gente entrega por mototáxi, a taxa é R$ 5. Me manda seu endereço com um ponto de referência que eu combino a entrega.'],
  ['/outracidade', 'Pra outra cidade a gente manda por carro de linha ou ônibus. Me diz qual é a cidade que eu vejo certinho como fica pra você.'],
  ['/pix', 'Pode fazer o Pix nessa chave: [chave Pix] ([nome]). Quando pagar, me manda o comprovante que eu já separo sua peça.'],
  ['/endereco', 'A loja fica na Rua Dr. Moreira da Rocha, 759, Centro. Abrimos de segunda a sexta das 7h30 às 18h e sábado das 7h30 às 14h. https://www.google.com/maps/search/?api=1&query=Rua%20Dr.%20Moreira%20da%20Rocha%20759%20Crate%C3%BAs%20CE'],
  ['/retorno', 'Oi! Passando pra saber se você ainda quer aquela peça. Quer que eu separe pra você?'],
  ['/obrigado', 'Prontinho, sua compra tá separada! Obrigada pela preferência 😊 Depois me conta se gostou.'],
  ['/saiu', 'Sua encomenda já saiu com o mototáxi! Fica de olho no celular que ele já tá chegando.']
];
async function respostasRapidas_(env) {
  let lista = null; try { lista = JSON.parse((await cfgGet(env, 'msg_respostas')) || 'null'); } catch (e) { lista = null; }
  if (!(await cfgGet(env, 'msg_resp_semeada'))) {
    const base = Array.isArray(lista) ? lista.slice() : [], tem = new Set(base.map((r) => String((r && r.t) || '').trim().toLowerCase()));
    for (const [t, x] of MSG_ATALHOS_PADRAO_) if (base.length < 30 && !tem.has(t)) base.push({ t: t, x: x });
    await cfgSet(env, 'msg_respostas', JSON.stringify(base)); await cfgSet(env, 'msg_resp_semeada', '1'); lista = base;
  }
  return Array.isArray(lista) ? lista : null;
}
/* Horário da loja em Fortaleza (UTC-3, sem horário de verão), em minutos do dia: seg–sex 7h30–18h; sáb 7h30–14h; domingo fechado.
 * Feriado da lista (dia em que o comércio abre) = 8h–13h, em qualquer dia da semana. O fim é exclusivo (sábado 14:00 já está fechado). */
const HORARIO_LOJA_ = { 1: [450, 1080], 2: [450, 1080], 3: [450, 1080], 4: [450, 1080], 5: [450, 1080], 6: [450, 840] }, HORARIO_FERIADO_ = [480, 780];
const DIAS_SEMANA_ = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const FUSO_MS_ = 3 * 3600000, DIA_MS_ = 86400000;
const EXPEDIENTE_PADRAO_ = {semana:{0:[],1:[[450,1080]],2:[[450,1080]],3:[[450,1080]],4:[[450,1080]],5:[[450,1080]],6:[[450,840]]},excecoes:{}};
const dataValidaExpediente_ = d => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
/** Faixas em minutos locais (Fortaleza). Dias fechados são arrays vazios. */
export function validarExpediente_(d){
  if(!d||typeof d!=='object'||Array.isArray(d)||!d.semana||typeof d.semana!=='object'||!d.excecoes||typeof d.excecoes!=='object'||Array.isArray(d.excecoes))return ['Confira o horário semanal e as exceções.'];
  const out={semana:{},excecoes:{}};
  const faixas=v=>{
    if(!Array.isArray(v)||v.length>3)return null;
    let anterior=-1;
    for(const par of v){if(!Array.isArray(par)||par.length!==2||!par.every(Number.isInteger)||par[0]<0||par[1]>1440||par[0]>=par[1]||par[0]<anterior)return null;anterior=par[1];}
    return v.map(x=>x.slice());
  };
  for(let dia=0;dia<7;dia++){const f=faixas(d.semana[dia]);if(!f)return ['Confira a abertura e o fechamento de '+DIAS_SEMANA_[dia]+'.'];out.semana[dia]=f;}
  const excecoes=Object.entries(d.excecoes);if(excecoes.length>366)return ['Use até 366 exceções de horário.'];
  for(const [data,v] of excecoes){if(!dataValidaExpediente_(data))return ['Confira a data da exceção de horário.'];const f=faixas(v);if(!f)return ['Confira o horário de '+data+'.'];out.excecoes[data]=f;}
  return [null,out];
}
function faixasExpediente_(dia,expediente,feriados){
  const data=new Date(dia*DIA_MS_),iso=data.toISOString().slice(0,10),cfg=expediente||EXPEDIENTE_PADRAO_;
  if(Object.hasOwn(cfg.excecoes,iso))return cfg.excecoes[iso];
  if(Array.isArray(feriados)&&feriados.includes(iso))return [HORARIO_FERIADO_];
  return cfg.semana[data.getUTCDay()];
}
/** Conta somente minutos de atendimento, atravessando noites, domingos e exceções.
 * No fim exato de uma faixa a ação fica para a abertura seguinte. */
export function somarMinutosUteis_(ms,minutos,expediente,feriados){
  if(!Number.isFinite(ms)||!Number.isFinite(minutos)||minutos<0||minutos>86400)throw Error('Prazo de acompanhamento inválido.');
  const [erro,cfg]=validarExpediente_(expediente||EXPEDIENTE_PADRAO_);if(erro)throw Error(erro);
  const dia0=Math.floor((ms-FUSO_MS_)/DIA_MS_);let restante=minutos*60000;
  for(let d=dia0;d<dia0+370;d++)for(const [abre,fecha] of faixasExpediente_(d,cfg,feriados)){
    const inicio=d*DIA_MS_+abre*60000+FUSO_MS_,fim=d*DIA_MS_+fecha*60000+FUSO_MS_,de=Math.max(ms,inicio);
    if(de>=fim)continue;
    if(restante<fim-de)return new Date(de+restante).toISOString();
    restante-=fim-de;
  }
  throw Error('Não há horário de atendimento disponível para esse prazo. Confira as configurações.');
}
export function textoAbertura_(dias, diaSemana, minutos, dataIso) {
  const hora = Math.floor(minutos / 60) + 'h' + (minutos % 60 ? String(minutos % 60).padStart(2, '0') : '');
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias < 7 ? DIAS_SEMANA_[diaSemana] : 'dia ' + String(dataIso).slice(8, 10) + '/' + String(dataIso).slice(5, 7);
  return quando + ' às ' + hora;
}
/** Situação da loja no instante ms: { aberta, feriado } ou { aberta:false, abreEm (ISO, UTC), abertura: "amanhã às 7h30" }. */
export function horarioLoja_(ms, feriados, expediente) {
  const [erro,cfg]=validarExpediente_(expediente||EXPEDIENTE_PADRAO_);if(erro)throw Error(erro);
  const dia0=Math.floor((ms-FUSO_MS_)/DIA_MS_);
  for(let k=0;k<370;k++){
    const dia=dia0+k,data=new Date(dia*DIA_MS_),iso=data.toISOString().slice(0,10),feriado=!Object.hasOwn(cfg.excecoes,iso)&&Array.isArray(feriados)&&feriados.includes(iso);
    for(const [abre,fecha] of faixasExpediente_(dia,cfg,feriados)){
      const inicio=dia*DIA_MS_+abre*60000+FUSO_MS_,fim=dia*DIA_MS_+fecha*60000+FUSO_MS_;
      if(ms>=inicio&&ms<fim)return {aberta:true,feriado:!!feriado};
      if(inicio>ms)return {aberta:false,feriado:!!feriado,abreEm:new Date(inicio).toISOString(),abertura:textoAbertura_(k,data.getUTCDay(),abre,iso)};
    }
  }
  return {aberta:false,feriado:false,abreEm:'',abertura:'sem horário cadastrado'};
}

const MSG_AUTO_PADRAO_ = {
  boasVindas: { ligado: false, texto: 'Oi! Que bom ter você aqui 😊 Já já uma das meninas te responde. Se já viu alguma peça, pode mandar o print ou o código que agiliza.' },
  foraHorario: { ligado: false, texto: 'Oi! A loja tá fechada agora, mas sua mensagem ficou guardada aqui. A gente volta {abertura} e te responde 😊 Se quiser, já deixa o print da peça e seu tamanho.' },
  feriados: [],
  expediente: EXPEDIENTE_PADRAO_,
  acompanhamento: {textoLembrete:'{saudacao} amiga, passando aqui pra saber se já deu certo o seu, fiquei aguardando sua resposta 🧡',mensagemFinal:false,textoFinal:''}
};
const textoAuto_ = (v) => String(v == null ? '' : v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 1000);
const feriadosLimpos_ = (l) => Array.from(new Set((Array.isArray(l) ? l : []).map(String).filter((x) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x))).sort().slice(-60);
/** Configuração das respostas automáticas: o que foi salvo por cima do padrão (desligadas; textos padrão; nenhum feriado). */
async function msgAuto_(env) {
  let c = null; try { c = JSON.parse((await cfgGet(env, 'msg_auto')) || 'null'); } catch (e) { c = null; }
  const out = JSON.parse(JSON.stringify(MSG_AUTO_PADRAO_));
  for (const k of ['boasVindas', 'foraHorario']) if (c && c[k] && typeof c[k] === 'object') { if (typeof c[k].ligado === 'boolean') out[k].ligado = c[k].ligado; const t = textoAuto_(c[k].texto); if (t) out[k].texto = t; }
  if (c && Array.isArray(c.feriados)) out.feriados = feriadosLimpos_(c.feriados);
  if(c&&c.expediente){const [erro,expediente]=validarExpediente_(c.expediente);if(erro)throw Error('Confira o horário de atendimento nas configurações.');out.expediente=expediente;}
  if(c&&c.acompanhamento){const a=c.acompanhamento;out.acompanhamento={textoLembrete:textoAuto_(a.textoLembrete)||MSG_AUTO_PADRAO_.acompanhamento.textoLembrete,mensagemFinal:a.mensagemFinal===true,textoFinal:textoAuto_(a.textoFinal)};}
  return out;
}
async function salvarMsgAuto_(env, d) {
  const atual = await msgAuto_(env);
  for (const k of ['boasVindas', 'foraHorario']) if (d && d[k] && typeof d[k] === 'object') { if (typeof d[k].ligado === 'boolean') atual[k].ligado = d[k].ligado; if (typeof d[k].texto === 'string') atual[k].texto = textoAuto_(d[k].texto) || MSG_AUTO_PADRAO_[k].texto; }
  if (d && Array.isArray(d.feriados)) atual.feriados = feriadosLimpos_(d.feriados);
  if(d&&d.expediente){const [erro,expediente]=validarExpediente_(d.expediente);if(erro)throw Object.assign(Error(erro),{codigo:400});atual.expediente=expediente;}
  if(d&&d.acompanhamento){const a=d.acompanhamento;atual.acompanhamento={textoLembrete:textoAuto_(a.textoLembrete)||MSG_AUTO_PADRAO_.acompanhamento.textoLembrete,mensagemFinal:a.mensagemFinal===true,textoFinal:textoAuto_(a.textoFinal)};if(atual.acompanhamento.mensagemFinal&&!atual.acompanhamento.textoFinal)throw Object.assign(Error('Escreva a mensagem de encerramento ou desmarque o envio dela.'),{codigo:400});}
  await cfgSet(env, 'msg_auto', JSON.stringify(atual));
  return atual;
}
/** Webhook: agenda a resposta automática sem atrasar o aceite (ctx.waitUntil); sem ctx (testes), roda na hora. Nunca derruba o webhook. */
const autoElegivel_ = (canal, m) => !!(m && m._conversaId && m.direcao === 'entrada' && !m.grupo && MSG_CANAIS.includes(canal) && m.tipo !== 'reação' && !(m.ctxTipo === 'story' && !String(m.texto || '').trim()));
async function agendarAuto_(ctx, env, canal, m) {
  if (!autoElegivel_(canal, m)) return;
  let cfg; try { cfg = await msgAuto_(env); } catch (e) { return; }
  if (!cfg.boasVindas.ligado && !cfg.foraHorario.ligado) return;            // desligadas: nada é agendado
  const p = respostaAutomatica_(env, canal, m, cfg).catch(() => null);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); else await p;
}
/** Boas-vindas (loja aberta, 12 h sem nenhuma mensagem na conversa) ou Fora do horário (loja fechada, 1 vez por período fechado).
 *  Nunca em grupo, nunca para mensagem da loja, nunca para resposta a status sem texto nem para reação. Sai pela mesma função do /msg/enviar,
 *  marcada como automática (por='auto'): aparece na conversa, não vira "dono" e não tira a conversa de "falta responder". */
async function respostaAutomatica_(env, canal, m, cfgPronta) {
  if (!autoElegivel_(canal, m)) return null;
  const t = Date.parse(m.em); if (isNaN(t) || Math.abs(Date.now() - t) > 10 * 60000) return null;      // só mensagem que acabou de chegar (nada de histórico reenviado)
  const cfg = cfgPronta || (await msgAuto_(env)); if (!cfg.boasVindas.ligado && !cfg.foraHorario.ligado) return null;
  const conv = m._conversaId, h = horarioLoja_(t, cfg.feriados, cfg.expediente);
  let tipo, periodo, texto;
  if (h.aberta) {
    if (!cfg.boasVindas.ligado) return null;
    const antes = await env.DB.prepare('SELECT 1 AS x FROM msg_mensagem WHERE conversa_id=? AND id<>? AND enviada_em>=? LIMIT 1').bind(conv, m._msgId || 0, new Date(t - 12 * 3600000).toISOString()).first();
    if (antes) return null;
    tipo = 'boas_vindas'; periodo = String(m.extId).slice(0, 200); texto = cfg.boasVindas.texto;
  } else {
    if (!cfg.foraHorario.ligado) return null;
    const equipe = await env.DB.prepare("SELECT 1 AS x FROM msg_mensagem WHERE conversa_id=? AND direcao='saida' AND COALESCE(por,'')<>'auto' AND enviada_em>=? LIMIT 1").bind(conv, new Date(t - 30 * 60000).toISOString()).first();
    if (equipe) return null;                                                     // alguém da equipe está conversando agora: não interrompe com "loja fechada"
    tipo = 'fora_horario'; periodo = h.abreEm || 'sem-abertura'; texto = cfg.foraHorario.texto.replace(/\{abertura\}/g, h.abertura);
  }
  const reserva = await env.DB.prepare('INSERT OR IGNORE INTO msg_auto_envio (conversa_id, tipo, periodo, em, res) VALUES (?,?,?,?,?)').bind(conv, tipo, periodo, agora(), 'enviando').run();
  if (!reserva.meta || reserva.meta.changes !== 1) return null;                 // já saiu (ou está saindo) neste período
  let res = { ok: false, erro: 'falha inesperada' };
  try {
    const antes = await env.DB.prepare('SELECT previa, ult_dir, nao_lidas FROM msg_conversa WHERE id=?').bind(conv).first(), t0 = agora();
    const idLocal = 'auto' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => x.toString(16).padStart(2, '0')).join('');
    const [cod, corpo] = await responderMensagem_(env, 'auto', { conversa: conv, texto: texto, idLocal: idLocal });
    res = corpo && corpo.ok ? { ok: true } : { ok: false, incerto: !!(corpo && corpo.incerto), erro: String((corpo && corpo.erro) || ('HTTP ' + cod)).slice(0, 200) };
    if (antes && (res.ok || res.incerto)) await env.DB.prepare("UPDATE msg_conversa SET previa=?, ult_dir=?, nao_lidas=MAX(nao_lidas, ?) WHERE id=? AND ult_dir='saida' AND NOT EXISTS (SELECT 1 FROM msg_mensagem q WHERE q.conversa_id=? AND q.direcao='saida' AND COALESCE(q.por,'')<>'auto' AND q.gravada_em>=?)").bind(antes.previa, antes.ult_dir, Number(antes.nao_lidas) || 0, conv, conv, t0).run();
  } catch (e) { res = { ok: false, erro: 'falha ao enviar' }; }
  try {
    if (res.ok || res.incerto) await env.DB.prepare('UPDATE msg_auto_envio SET res=? WHERE conversa_id=? AND tipo=? AND periodo=?').bind(res.ok ? 'ok' : 'incerta', conv, tipo, periodo).run();
    else await env.DB.prepare('DELETE FROM msg_auto_envio WHERE conversa_id=? AND tipo=? AND periodo=?').bind(conv, tipo, periodo).run();   // falhou de vez: a próxima mensagem do cliente tenta de novo
    await env.DB.prepare('DELETE FROM msg_auto_envio WHERE em<?').bind(new Date(Date.now() - 45 * DIA_MS_).toISOString()).run();
    await cfgSet(env, 'msg_auto_diag', JSON.stringify({ em: agora(), tipo: tipo, canal: canal, ok: !!res.ok, incerto: !!res.incerto, erro: res.ok ? '' : res.erro }));
  } catch (e) { /* diagnóstico é conforto */ }
  return Object.assign({ tipo: tipo }, res);
}
async function etiquetasDosAlvos_(env, alvos) {
  const mapa = {}; const lista = Array.from(new Set(alvos.filter(Boolean))).slice(0, 90); if (!lista.length) return mapa;
  const rs = (await env.DB.prepare('SELECT a.alvo, e.id, e.nome, e.cor, e.venda FROM msg_alvo_etiqueta a JOIN msg_etiqueta e ON e.id=a.etiqueta_id WHERE e.arquivada=0 AND a.alvo IN (' + lista.map(() => '?').join(',') + ') ORDER BY e.venda DESC, e.ordem').bind(...lista).all()).results || [];
  rs.forEach((r) => { (mapa[r.alvo] = mapa[r.alvo] || []).push({ id: r.id, nome: r.nome, cor: r.cor, venda: r.venda }); });
  return mapa;
}
// Preferência no cadastro de atendimento: mesma chave com/sem +55 e nono dígito.
async function perfilAtendente_(env, req, perms) {
  const raw = (req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(0,20), f = pessoaTelefone_(raw);
  const chave = msgTelefone_(raw), nomes = [...new Set([chave, raw, f && f.d, f && f.d.slice(2), f && f.chave, f && f.chave.slice(2)].filter(Boolean))];
  let escolhido = '';
  for (const k of nomes) { escolhido = (await cfgGet(env, 'msg_atendente_' + k)) || ''; if (escolhido) break; }
  const ps = perms || await permissoes(env, req), admin = Array.isArray(ps) && ps.includes('gerir_acessos');
  const cadastro = Array.isArray(ps) ? String(ps.msgNome || '').trim() : '';
  let padrao = nomeAtendenteLimpo_(cadastro.split(/\s+/)[0] || '');
  if (padrao && padrao === padrao.toUpperCase()) padrao = padrao[0] + padrao.slice(1).toLowerCase();
  return { chave, meuNome: escolhido, nomePadrao: padrao, nomeCadastro: cadastro, podeOcultar: admin,
    mostrarNome: !admin || (await cfgGet(env, 'msg_assinatura_' + chave)) !== '0' };
}
async function meuNomeAtendente_(env, req) {
  const p = await perfilAtendente_(env, req);
  return p.meuNome || p.nomePadrao || 'Equipe';
}
async function textoAssinadoEquipe_(env,req,canal,texto){
  const p=await perfilAtendente_(env,req),nome=p.meuNome||p.nomePadrao||'Equipe';
  const t=String(texto||'').trim();if(!t)return '';
  const prefixo=canal==='instagram'?nome+':\n':'*'+nome+':*\n';
  return t.startsWith(prefixo)?t:prefixo+t;
}
const alvoDe_ = (c) => (c && c.pessoa ? String(c.pessoa) : 'c:' + (c && c.id));
const MSG_IDENTIDADE_SQL_ = "COALESCE((SELECT a.pessoa FROM msg_pessoa_alias a WHERE a.canal=msg_conversa.canal AND a.contato=msg_conversa.contato),(SELECT g.pessoa FROM msg_google_nome g WHERE g.chave=msg_conversa.pessoa),NULLIF(msg_conversa.pessoa,''),'')";
const MSG_NOME_SQL_ = "COALESCE((SELECT p.nome FROM msg_pessoa p WHERE p.id="+MSG_IDENTIDADE_SQL_+"),(SELECT g.nome FROM msg_google_nome g WHERE g.chave=msg_conversa.pessoa),msg_conversa.nome)";
const MSG_NOTAS_ALVO_SQL_ = "(CASE WHEN "+MSG_IDENTIDADE_SQL_+"<>'' THEN "+MSG_IDENTIDADE_SQL_+" ELSE 'c:'||msg_conversa.id END)";
const MSG_NOTAS_COUNT_SQL_ = "(SELECT COUNT(*) FROM msg_nota nn WHERE nn.alvo="+MSG_NOTAS_ALVO_SQL_+" AND nn.excluida_em='')";
// Leitura, espiar, "assumir" e automações NÃO iniciam atendimento (regra do #305, que continua
// valendo: assumir não é responder). v7.40.35 acrescenta `atendido_em`, gravado quando o
// atendente toca em "Atender" — é esse gesto explícito, não o campo `dono`, que move a
// conversa de Pendentes para Em atendimento.
// Uma conversa ENCERRADA conta como atendida (histórico do #305): ela nunca cai em Pendentes
// enquanto o cliente não escrever de novo.
// E o encerramento NÃO vale mais para sempre: se o cliente voltar, a conversa volta para a fila
// em Pendentes (o encerramento é apagado), e só uma resposta posterior a traz de volta.
const MSG_ULT_ENC_ = "(SELECT MAX(e.em) FROM msg_encerramento e WHERE e.conversa_id=msg_conversa.id)";
const MSG_ATENDIDO_SQL_ = "(msg_conversa.atendido_em<>'' OR EXISTS(SELECT 1 FROM msg_mensagem humana WHERE humana.conversa_id=msg_conversa.id AND humana.direcao='saida' AND COALESCE(humana.por,'')<>'auto' AND COALESCE(humana.status,'') NOT IN ('incerta','falhou','enviando') AND humana.enviada_em>COALESCE("+MSG_ULT_ENC_+",'')) OR EXISTS(SELECT 1 FROM msg_encerramento fim WHERE fim.conversa_id=msg_conversa.id AND NOT EXISTS(SELECT 1 FROM msg_mensagem depois WHERE depois.conversa_id=msg_conversa.id AND depois.direcao='entrada' AND depois.enviada_em>fim.em)))";
const MSG_COLS_CONVERSA_ = "id, canal, contato, dono, reaberta_em, "+MSG_ATENDIDO_SQL_+" AS em_atendimento, "+MSG_NOTAS_COUNT_SQL_+" AS notas, "+MSG_NOME_SQL_+" AS nome, "+MSG_IDENTIDADE_SQL_+" AS pessoa, grupo, ultima_em, previa, total, nao_lidas, ult_dir, ult_entrada_em, ult_saida_em, atualizada_em, encerrada_em, encerrada_motivo, " + MSG_OUTRO_SQL_ + " AS outro_id, (SELECT m.status FROM msg_mensagem m WHERE m.conversa_id=msg_conversa.id ORDER BY m.enviada_em DESC, m.id DESC LIMIT 1) AS ult_status";
const MSG_Q_ = (c) => "(SELECT q." + c + " FROM msg_mensagem q WHERE q.canal=msg_mensagem.canal AND q.ext_id=msg_mensagem.ctx_ref AND msg_mensagem.ctx_ref<>'' LIMIT 1)";
const MSG_COLS_MSG_ = "id, direcao, tipo, texto, enviada_em, status, por, status_em, autor_nome, autor_fone, autor_lid, midia_mime, midia_seg, (CASE WHEN midia_chave<>'' OR midia_url<>'' THEN 1 ELSE 0 END) AS midia, ctx_tipo, CASE WHEN ctx_tipo='link' THEN ctx_ref ELSE '' END AS link_previa, ctx_aprox, (CASE WHEN ctx_post>0 OR ctx_chave<>'' THEN 1 ELSE 0 END) AS ctx_midia, CASE WHEN ctx_chave LIKE '%.mp4' OR ctx_chave LIKE '%.mov' OR ctx_chave LIKE '%.webm' THEN 'video' ELSE (SELECT json_extract(p.midias,'$[0].tipo') FROM postagem p WHERE p.id=msg_mensagem.ctx_post) END AS ctx_mtipo, (SELECT p.publicado_em FROM postagem p WHERE p.id=msg_mensagem.ctx_post) AS ctx_em, (SELECT substr(p.legenda,1,120) FROM postagem p WHERE p.id=msg_mensagem.ctx_post) AS ctx_legenda, " + "COALESCE(NULLIF(ctx_trecho,'')," + MSG_Q_('texto') + ") AS ctx_texto, " + MSG_Q_('tipo') + " AS ctx_qtipo, " + MSG_Q_('direcao') + " AS ctx_qdir, " + "COALESCE(NULLIF(ctx_autor,''),'')" + " AS ctx_autor";
async function msgContagens_(env, canal, tipo) {
  const fields={esperando:"encerrada_em='' AND grupo=0 AND NOT "+MSG_ATENDIDO_SQL_,em_atendimento:"encerrada_em='' AND grupo=0 AND "+MSG_ATENDIDO_SQL_,conversas:"encerrada_em=''",nao_lidas:"encerrada_em='' AND nao_lidas>0",sem_resposta:"encerrada_em='' AND (nao_lidas>0 OR ult_dir='entrada')",grupos:"encerrada_em='' AND grupo=1",individuais:"encerrada_em='' AND grupo=0",encerradas:"encerrada_em<>''",ambos:"encerrada_em='' AND pessoa<>'' AND "+MSG_OUTRO_SQL_+" IS NOT NULL"};
  const key="CASE WHEN grupo=1 THEN 'grupo:'||id ELSE COALESCE(NULLIF("+MSG_IDENTIDADE_SQL_+",''),'conversa:'||id) END";
  const cols=Object.entries(fields).map(([name,condition])=>"COUNT(DISTINCT CASE WHEN "+condition+" THEN "+key+" END) AS "+name).join(',');
  const where=' FROM msg_conversa WHERE total>0'+(canal?' AND canal=?':'')+(tipo==='grupo'?' AND grupo=1':tipo==='individual'?' AND grupo=0':'');
  const rows=(await env.DB.prepare('SELECT canal,'+cols+where+' GROUP BY canal').bind(...(canal?[canal]:[])).all()).results;
  const zero=()=>Object.fromEntries(Object.keys(fields).map(k=>[k,0])),out={};for(const c of MSG_CANAIS)out[c]=zero();
  for(const row of rows)for(const k of Object.keys(fields))out[row.canal][k]=Number(row[k])||0;
  out.todos=Object.assign(zero(),await env.DB.prepare('SELECT '+cols+where).bind(...(canal?[canal]:[])).first());
  return out;
}

/* v2.10: confirmar a leitura no aparelho (WhatsApp pela Wafly; Instagram pela Graph API). Só quando a pessoa ABRE a conversa
 * normalmente e o canal está com "marcar como lida no celular" ligado; o "Espiar" do painel nunca chama isto. */
// v2.11: assinatura = nome do atendente antes da resposta (ligada por padrão; o Admin liga/desliga para todos)
const MSG_CFG_PADRAO_ = { lerCelular: { whatsapp1: true, whatsapp2: true, instagram: true }, assinatura: true };
/** Nome que o atendente escolheu para aparecer nas respostas: sem símbolos de formatação do WhatsApp, até 30 letras. */
const nomeAtendenteLimpo_ = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f*_~`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
async function msgCfg_(env) {
  let c = null; try { c = JSON.parse((await cfgGet(env, 'msg_cfg')) || 'null'); } catch (e) { c = null; }
  const out = JSON.parse(JSON.stringify(MSG_CFG_PADRAO_));
  if (c && c.lerCelular && typeof c.lerCelular === 'object') for (const k of MSG_CANAIS) if (typeof c.lerCelular[k] === 'boolean') out.lerCelular[k] = c.lerCelular[k];
  if (c && typeof c.assinatura === 'boolean') out.assinatura = c.assinatura;
  return out;
}
async function confirmarLeituraCelular_(env, conv) {
  const ult = await env.DB.prepare("SELECT ext_id FROM msg_mensagem WHERE conversa_id=? AND direcao='entrada' AND ext_id NOT LIKE 'inc:%' ORDER BY enviada_em DESC, id DESC LIMIT 1").bind(conv.id).first();
  let res;
  if (conv.canal === 'instagram') {
    const tk = await cfgGet(env, 'ig_token');
    if (!tk) res = { ok: false, erro: 'Instagram não conectado.' };
    else {
      try {
        const rr = await fetch(igBase(env) + '/me/messages', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: conv.contato }, sender_action: 'mark_seen' }) });
        res = rr.ok ? { ok: true, rota: 'mark_seen' } : { ok: false, erro: 'O Instagram recusou (HTTP ' + rr.status + ').' };
      } catch (e) { res = { ok: false, erro: 'Sem resposta do Instagram.' }; }
    }
  } else {
    const slot = conv.canal === 'whatsapp1' ? 1 : 2, cfg = await cfgWafly_(env, slot);
    if (!cfg) res = { ok: false, erro: 'Wafly ' + slot + ' não cadastrado em Conexões.' };
    else {
      // 1º marca a conversa inteira como lida (modify-chat); se a Wafly não aceitar, marca a última mensagem recebida (read-message)
      const tentativas = [['/modify-chat', { phone: conv.contato, action: 'read' }]];
      if (ult && ult.ext_id) tentativas.push(['/read-message', { phone: conv.contato, messageId: ult.ext_id }]);
      res = { ok: false, erro: 'A Wafly não confirmou a leitura.' };
      for (const [rota, corpo] of tentativas) {
        try {
          const rr = await fetch(waflyUrl_(cfg, rota), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Client-Token': cfg.clientToken, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
          const j = await rr.json().catch(() => ({}));
          if (rr.ok && !(j && (j.error || j.value === false))) { res = { ok: true, rota: rota }; break; }
          res = { ok: false, erro: 'A Wafly recusou (HTTP ' + rr.status + ').' };
        } catch (e) { res = { ok: false, erro: 'Sem resposta da Wafly.' }; }
      }
    }
  }
  try { await cfgSet(env, 'msg_leitura_diag_' + conv.canal, JSON.stringify(Object.assign({ em: agora() }, res))); } catch (e) { /* diagnóstico é conforto */ }
  return res;
}
/** Responder: texto simples para WhatsApp (Wafly) ou Instagram (DM). Devolve { ok, extId } | { ok:false, erro } | { ok:false, incerto:true, erro }. */
async function enviarWaflyGenerico_(env, conv, caminho, corpo, limiteMs) {
  const slot = conv.canal === 'whatsapp1' ? 1 : 2, cfg = await cfgWafly_(env, slot);
  if (!cfg) return { ok: false, erro: 'Cadastre o Wafly ' + slot + ' em Conexões antes de responder por aqui.' };
  try {
    const r = await fetch(waflyUrl_(cfg, caminho), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(limiteMs || 25000), headers: { 'Client-Token': cfg.clientToken, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ phone: conv.contato }, corpo)) });
    const j = await r.json().catch(() => ({}));
    const id = String((j && (j.messageId || j.id || j.zaapId)) || '');
    if (r.ok && id && !(j && (j.error || j.value === false))) return { ok: true, extId: id };
    if (r.ok) return { ok: false, incerto: true, erro: 'A Wafly respondeu sem confirmar o envio. Confira no WhatsApp antes de tentar de novo.' };
    if (r.status === 401 || r.status === 403) return { ok: false, erro: 'A Wafly não aceitou as credenciais do WhatsApp ' + slot + '. Confira em Conexões.' };
    if (r.status >= 400 && r.status < 500 && ![408, 409, 429].includes(r.status)) return { ok: false, erro: 'A Wafly recusou a mensagem (HTTP ' + r.status + '). Confira se o WhatsApp ' + slot + ' está conectado' + (caminho === '/send-text' ? '.' : ' e se o arquivo é aceito pelo WhatsApp.') };
    return { ok: false, incerto: true, erro: 'Sem confirmação da Wafly. Confira no WhatsApp antes de tentar de novo.' };
  } catch (e) { return { ok: false, incerto: true, erro: 'Sem confirmação da Wafly. Confira no WhatsApp antes de tentar de novo.' }; }
}
/** Zernio: lista as contas conectadas (confere a chave sem enviar nada). Erros em português, sem repassar o corpo da resposta. */
async function zernioContas_(chave) {
  try {
    const r = await fetch('https://zernio.com/api/v1/accounts?platform=instagram', { headers: { Authorization: 'Bearer ' + chave, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (r.status === 401 || r.status === 403) { if (r.body) await r.body.cancel(); return { ok: false, cod: 400, erro: 'O Zernio recusou essa chave. Confira se copiou a chave inteira em Settings → API Keys.' }; }
    if (!r.ok) { if (r.body) await r.body.cancel(); return { ok: false, cod: 502, erro: 'O Zernio não respondeu direito agora (HTTP ' + r.status + '). Tente de novo em alguns minutos.' }; }
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.accounts)) return { ok: false, cod: 502, erro: 'O Zernio respondeu num formato inesperado. Tente de novo.' };
    return { ok: true, contas: j.accounts };
  } catch (e) { return { ok: false, cod: 502, erro: 'Sem resposta do Zernio agora. Tente de novo.' }; }
}
async function enviarTextoWhats_(env, conv, texto, cit) {
  // v7.40.36: `messageId` no /send-text da Wafly = resposta citando aquela mensagem no app do cliente.
  // Só vale com o id real do WhatsApp; um envio "incerta" (inc:...) não tem id para citar.
  const corpo = { message: texto };
  if (cit && cit.extId && !String(cit.extId).startsWith('inc:')) corpo.messageId = String(cit.extId).slice(0, 200);
  return enviarWaflyGenerico_(env, conv, '/send-text', corpo);
}
/* v2.13: "Prévia do link" marcada na mensagem: sai pelo /send-link da Wafly (cartão com título e descrição) usando o primeiro link do texto. Sem link, vai como texto simples. */
const MSG_LINK_RE_ = /https?:\/\/[^\s<>"']+/i;
const textoCartao_ = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function linkLoja_(link) {
  try {const u=new URL(link);return u.protocol==='https:'&&!u.username&&!u.password&&u.origin==='https://tenkitermodas.com.br' ? u : null;}catch(_){return null;}
}
function imagemCartao_(valor){
  try{const u=new URL(String(valor||''));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href.length<=2048&&['tenkiter-midia.distkrpconfeccoes.workers.dev','midia.tenkitermodas.com.br','res.cloudinary.com','lh3.googleusercontent.com'].includes(u.hostname)?u.href:'';}catch(_){return '';}
}
function snapshotPrevia_(texto,d){
  const m=texto.match(MSG_LINK_RE_),url=m?m[0].replace(/[).,;:!?*_~]+$/,''):'';
  if(!linkLoja_(url))return '';
  const imagem=imagemCartao_(d.previaImagem);if(!imagem)return '';
  return JSON.stringify({url,imagem,titulo:textoCartao_(d.previaTitulo,100),descricao:textoCartao_(d.previaDescricao,200)});
}
async function enviarTextoComPrevia_(env, conv, texto, d) {
  const m = texto.match(MSG_LINK_RE_), link = m ? m[0].replace(/[).,;:!?*_~]+$/, '') : '';
  if (!link) return enviarTextoWhats_(env, conv, texto);
  const corpo = { message: texto, linkUrl: link };
  // Links da loja têm OG próprio com foto. Não substituir seus metadados por
  // um cartão parcial só de texto. A imagem não é um parâmetro do /send-link.
  if(!linkLoja_(link)){
    const titulo=textoCartao_(d.previaTitulo,100),desc=textoCartao_(d.previaDescricao,200);
    if(titulo)corpo.title=titulo;if(desc)corpo.linkDescription=desc;
  }
  return enviarWaflyGenerico_(env, conv, '/send-link', corpo);
}
const WHATS_ROTAS_MIDIA_ = { 'imagem': ['/send-image', 'image'], 'vídeo': ['/send-video', 'video'], 'áudio': ['/send-audio', 'audio'] };
async function enviarMidiaWhats_(env, conv, anexo, legenda, cit) {
  const rota = WHATS_ROTAS_MIDIA_[anexo.tipo], corpo = {}; corpo[rota[1]] = anexo.url;
  if (legenda && anexo.tipo !== 'áudio') corpo.caption = legenda;
  if (cit && cit.extId && !String(cit.extId).startsWith('inc:')) corpo.messageId = String(cit.extId).slice(0, 200);   // v7.40.36: citação também na mídia
  return enviarWaflyGenerico_(env, conv, rota[0], corpo, 60000);
}
async function enviarInstagram_(env, conv, mensagem) {
  const tk = await cfgGet(env, 'ig_token');
  if (!tk) return { ok: false, erro: 'O Instagram não está conectado. Conecte em Produtos para aceitar → Conectar.' };
  try {
    const r = await fetch(igBase(env) + '/me/messages', { method: 'POST', signal: AbortSignal.timeout(40000), headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: conv.contato }, message: mensagem }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j && j.message_id) return { ok: true, extId: String(j.message_id) };
    if (r.ok) return { ok: false, incerto: true, erro: 'O Instagram respondeu sem confirmar. Confira no app antes de tentar de novo.' };
    const e = (j && j.error) || {}, msg = String(e.message || '');
    if (e.code === 10 || /window|24|outside/i.test(msg)) return { ok: false, erro: 'Já passaram mais de 24 horas da última mensagem deste cliente. O Instagram só deixa responder dentro desse prazo.' };
    if (e.code === 190) return { ok: false, erro: 'O Instagram desconectou. Reconecte em Produtos para aceitar → Conectar.' };
    if (e.code === 200 || e.code === 3 || /permission/i.test(msg)) return { ok: false, erro: 'Falta a permissão de mensagens do Instagram no app da Meta (instagram_business_manage_messages).' };
    if (r.status >= 500) return { ok: false, incerto: true, erro: 'Sem confirmação do Instagram. Confira no app antes de tentar de novo.' };
    return { ok: false, erro: 'O Instagram recusou a mensagem agora. Tente de novo em instantes.' };
  } catch (e) { return { ok: false, incerto: true, erro: 'Sem confirmação do Instagram. Confira no app antes de tentar de novo.' }; }
}
async function enviarTextoInstagram_(env, conv, texto, automatico=false) { const z = await zernioCfg_(env); if (z) return enviarZernio_(env, z, conv, { message: texto }, !automatico); return enviarInstagram_(env, conv, { text: texto }); }
async function enviarMidiaInstagram_(env, conv, anexo, automatico=false) {
  const tipo = ({ 'imagem': 'image', 'vídeo': 'video', 'áudio': 'audio' })[anexo.tipo], z = await zernioCfg_(env);
  if (z) return enviarZernio_(env, z, conv, { attachmentUrl: anexo.url, attachmentType: tipo }, !automatico);
  return enviarInstagram_(env, conv, { attachment: { type: tipo, payload: { url: anexo.url } } });
}
/* ---- v2.18: Instagram Direct pelo Zernio (API oficial da Meta pelo app aprovado deles) ----
 * Recebe: /wh/zernio/<segredo> com assinatura HMAC-SHA256 (X-Zernio-Signature); responde 200 na hora e grava em segundo plano.
 * Envia: POST /v1/inbox/conversations/{conversa}/messages; depois de 24 h, tenta de novo com HUMAN_AGENT (resposta digitada por pessoa, até 7 dias). */
const ZERNIO_API_ = 'https://zernio.com/api/v1';
/* ---- v2.19: cofre das chaves guardadas NESTE servidor (D1). A senha da conta é conferida pelo Apps Script (abrirCofre, com o freio de
 * tentativas dele); o código de abertura vale 5 min, fica no KV por pessoa e serve para os dois lados (as chaves do Apps Script e estas). ---- */
const COFRE_W_ = {
  zernio: { titulo: 'Zernio — chave da API (Instagram Direct)', ler: async (env) => (await cfgGet(env, 'zernio_chave')) || '' },
  wafly1: { titulo: 'Wafly 1 — instância e tokens (WhatsApp 1)', ler: async (env) => { const c = await cfgWafly_(env, 1); return c ? 'Instância: ' + c.instance + '\nToken: ' + c.token + '\nClient-Token: ' + c.clientToken : ''; } },
  wafly2: { titulo: 'Wafly 2 — instância e tokens (WhatsApp 2)', ler: async (env) => { const c = await cfgWafly_(env, 2); return c ? 'Instância: ' + c.instance + '\nToken: ' + c.token + '\nClient-Token: ' + c.clientToken : ''; } },
  wame: { titulo: 'Wame — chave da instância (Status 2 antigo)', ler: async (env) => (await cfgGet(env, 'wame_status_2')) || '' },
  gemini: { titulo: 'Gemini — chave da IA (leitura das fotos)', ler: async (env) => (await cfgGet(env, 'gemini_key')) || '' },
  freeconvert: { titulo: 'FreeConvert — chave da API (vídeos)', ler: async (env) => (await cfgGet(env, 'freeconvert_api_key')) || '' },
  contatos: { titulo: 'Google Contatos — endereço e chave da ponte', ler: async (env) => { const u = await cfgGet(env, 'contatos_url'), k = await cfgGet(env, 'contatos_chave'); return u && k ? 'Endereço: ' + u + '\nChave: ' + k : ''; } },
  mobile: { titulo: 'OneSignal — chave de envio do app Android', ler: async (env) => (await cfgGet(env, 'mobile_onesignal_key')) || '' }
};
const fimChave_ = (v) => { const t = String(v || '').replace(/\s+/g, ''); return t.length >= 8 ? t.slice(-4) : ''; };
async function rotasCofreW_(env, req, p, J) {
  const whats = (req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(0, 20), kv = 'cofre_w:' + whats;
  if (p === '/cofre/itens' && req.method === 'GET') {
    const itens = [];
    for (const [nome, c] of Object.entries(COFRE_W_)) { let v = ''; try { v = await c.ler(env); } catch (e) { v = ''; } itens.push({ nome: nome, titulo: c.titulo, temChave: !!v, fim: fimChave_(v.split('\n').pop()) }); }
    return J({ ok: true, itens: itens });
  }
  if (p === '/cofre/abrir' && req.method === 'POST') {
    const d = await req.json().catch(() => ({})), senha = String(d.senha == null ? '' : d.senha);
    if (!senha) return J({ ok: false, erro: 'Digite a senha da sua conta.' }, 400);
    let j = null;
    try { const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'abrirCofre', whatsapp: whats, sessao: (req.headers.get('X-TK-Sessao') || '').slice(0, 400), senha: senha }) }); j = await r.json(); }
    catch (e) { return J({ ok: false, erro: 'Não consegui conferir a senha agora. Tente de novo.' }, 503); }
    if (!j || !j.ok || typeof j.cofre !== 'string') return J({ ok: false, erro: String((j && j.erro) || 'Senha incorreta.').slice(0, 200), bloqueado: !!(j && j.bloqueado), senhaRecusada: true }, 403);
    const seg = Math.min(300, Math.max(60, Number(j.validoSegundos) || 300));
    await env.CACHE.put(kv, j.cofre, { expirationTtl: seg });
    return J({ ok: true, cofre: j.cofre, validoSegundos: seg });
  }
  if (p === '/cofre/fechar' && req.method === 'POST') { await env.CACHE.delete(kv); return J({ ok: true }); }
  if (p === '/cofre/revelar' && req.method === 'POST') {
    const d = await req.json().catch(() => ({})), item = Object.prototype.hasOwnProperty.call(COFRE_W_, String(d.nome || '')) ? COFRE_W_[d.nome] : null;
    if (!item) return J({ ok: false, erro: 'Chave desconhecida.' }, 400);
    const aberto = String((await env.CACHE.get(kv)) || '');
    if (!aberto || typeof d.cofre !== 'string' || !igualConst_(aberto, d.cofre)) return J({ ok: false, cofreFechado: true, erro: 'O cofre está trancado. Digite sua senha para abrir.' }, 403);
    const ku = 'cofre_w_usos:' + whats, usos = Number((await env.CACHE.get(ku)) || 0);
    if (usos >= 30) return J({ ok: false, erro: 'Muitas cópias em pouco tempo. Espere alguns minutos.' }, 429);
    await env.CACHE.put(ku, String(usos + 1), { expirationTtl: 600 });
    const valor = await item.ler(env);
    if (!valor) return J({ ok: false, erro: 'Essa chave ainda não está guardada no servidor.' }, 404);
    try { await cfgSet(env, 'cofre_ult_' + d.nome, JSON.stringify({ em: agora(), quem: whats.slice(-4) })); } catch (e) { /* registro é conforto */ }
    return J({ ok: true, nome: d.nome, valor: valor });
  }
  return null;
}
async function zernioCfg_(env) {
  const chave = await cfgGet(env, 'zernio_chave'); let conta = null;
  try { conta = JSON.parse((await cfgGet(env, 'zernio_conta')) || 'null'); } catch (e) { conta = null; }
  return chave && conta && conta.id ? { chave: chave, conta: conta } : null;
}
async function zernioApi_(chave, metodo, caminho, corpo, limiteMs) {
  try {
    const r = await fetch(ZERNIO_API_ + caminho, { method: metodo, signal: AbortSignal.timeout(limiteMs || 15000), headers: { Authorization: 'Bearer ' + chave, Accept: 'application/json', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { ok: r.ok, status: r.status, j: await r.json().catch(() => null) };
  } catch (e) { return { ok: false, status: 0, j: null }; }
}
/** Liga (ou atualiza) o aviso de mensagens do Zernio para este servidor, só para o Instagram escolhido. */
async function ligarAvisoZernio_(env, origem, z) {
  let seg = await cfgGet(env, 'zernio_wh_segredo');
  if (!seg) { const a = new Uint8Array(32); crypto.getRandomValues(a); seg = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join(''); await cfgSet(env, 'zernio_wh_segredo', seg); }
  const corpo = { name: 'TENKiTER Mensagens', url: origem + '/wh/zernio/' + (await msgSegredo_(env)), secret: seg, events: ['message.received', 'message.sent'], accountIds: [z.conta.id], isActive: true };
  const id = await cfgGet(env, 'zernio_wh_id');
  let r = id ? await zernioApi_(z.chave, 'PUT', '/webhooks/settings', Object.assign({ webhookId: id }, corpo)) : null;
  if (!r || !r.ok) r = await zernioApi_(z.chave, 'POST', '/webhooks/settings', corpo);
  if (!r.ok) return { ok: false, erro: 'O Zernio não aceitou ligar o aviso de mensagens agora (HTTP ' + r.status + '). Toque em "Salvar e conferir" de novo.' };
  const wid = r.j && r.j.webhook && r.j.webhook._id; if (wid) await cfgSet(env, 'zernio_wh_id', String(wid));
  await cfgSet(env, 'zernio_wh_em', agora());
  return { ok: true };
}
/** Diagnóstico do aviso do Zernio: o aviso está ativo, aponta para este servidor e como foram as últimas entregas (sem chave nem segredo). */
async function diagnosticoZernio_(env, origem, testar) {
  const z = await zernioCfg_(env); if (!z) return { ok: false, erro: 'Guarde a chave do Zernio e escolha o Instagram primeiro.' };
  const wid = String((await cfgGet(env, 'zernio_wh_id')) || ''), nosso = origem + '/wh/zernio/';
  const st = await zernioApi_(z.chave, 'GET', '/webhooks/settings', null, 10000);
  if (!st.ok) return { ok: false, erro: 'O Zernio não respondeu agora (HTTP ' + st.status + '). Tente de novo em instantes.' };
  const lista = Array.isArray(st.j && st.j.webhooks) ? st.j.webhooks : Array.isArray(st.j) ? st.j : (st.j && st.j.webhook ? [st.j.webhook] : []);
  const w = lista.find((x) => x && String(x._id || x.id || '') === wid) || lista.find((x) => x && String(x.url || '').indexOf(nosso) === 0) || null;
  const aviso = w ? { existe: true, ativo: w.isActive !== false, esteServidor: String(w.url || '').indexOf(nosso) === 0, eventos: Array.isArray(w.events) ? w.events.slice(0, 10).map(String) : [], contas: Array.isArray(w.accountIds) ? w.accountIds.length : 0, contaCerta: !Array.isArray(w.accountIds) || !w.accountIds.length || w.accountIds.map(String).includes(z.conta.id) } : { existe: false };
  let teste = null;
  if (testar && w) { const t = await zernioApi_(z.chave, 'POST', '/webhooks/test', { webhookId: String(w._id || w.id), event: 'message.received' }, 15000); teste = { enviado: t.ok, codigo: t.status }; }
  const lg = await zernioApi_(z.chave, 'GET', '/webhooks/logs?limit=10' + (w ? '&webhook_id=' + encodeURIComponent(String(w._id || w.id)) : ''), null, 10000);
  const brutos = Array.isArray(lg.j && lg.j.logs) ? lg.j.logs : Array.isArray(lg.j && lg.j.data) ? lg.j.data : Array.isArray(lg.j) ? lg.j : [];
  const txt = (v, n) => (v == null ? '' : String(typeof v === 'object' ? JSON.stringify(v) : v)).replace(/[\r\n]+/g, ' ').slice(0, n);
  const entregas = brutos.slice(0, 10).map((x) => ({ em: txt(x.createdAt || x.timestamp || x.sentAt || x.deliveredAt, 40), evento: txt(x.event || x.eventType || x.type, 40), situacao: txt(x.status || x.deliveryStatus || (x.success === true ? 'success' : x.success === false ? 'failed' : ''), 30), codigo: Number(x.statusCode || x.responseStatus || x.httpStatus || 0) || 0, erro: txt(x.error || x.errorMessage || x.message, 160), teste: x.test === true }));
  let ult = null; try { ult = JSON.parse((await cfgGet(env, 'msg_ult_zernio')) || 'null'); } catch (e) { ult = null; }
  return { ok: true, aviso: aviso, teste: teste, entregas: entregas, logsDisponiveis: lg.ok, ultimoRecebido: ult };
}
async function hmacHex_(segredo, texto) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto))), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function rotaZernio_(env, req, url, ctx) {
  const resp = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!igualConst_(url.pathname.split('/')[3] || '', await msgSegredo_(env))) return resp(404, { ok: false });
  const seg = await cfgGet(env, 'zernio_wh_segredo'), corpo = await corpoWebhook_(req,1048576);
  if(corpo===null)return resp(413,{ok:false});
  if (!seg) return resp(503, { ok: false });
  const assin = String(req.headers.get('X-Zernio-Signature') || req.headers.get('X-Late-Signature') || '').toLowerCase();
  if (!assin || !igualConst_(assin, await hmacHex_(seg, corpo))) { await cfgSet(env, 'msg_ult_zernio', JSON.stringify({ em: agora(), res: 'assinatura' })).catch(()=>{}); return resp(401, { ok: false }); }
  let b = null; try { b = JSON.parse(corpo); } catch (e) { return resp(400, { ok: false }); }
  if(b&&(b.event==='message.received'||b.event==='message.sent')){
    const m=b.message||{};
    if(m.platform!=='instagram'||!m.platformMessageId&&!m.id)return resp(200,{ok:true,ignorado:true});
    if(await msgPausado_(env,'instagram'))return resp(200,{ok:true,pausado:true});
    const z=await zernioCfg_(env),conta=b.account?.accountId||b.account?.id;
    if(z&&conta&&String(conta)!==String(z.conta.id))return resp(200,{ok:true,ignorado:true});
    const dados={event:b.event,account:{accountId:b.account?.accountId||b.account?.id||''},message:{}};
    for(const k of ['platform','platformMessageId','id','conversationId','direction','text','sentAt'])if(k in m)dados.message[k]=String(m[k]||'');
    dados.message.sender=Object.fromEntries(['id','name','username'].filter(k=>m.sender?.[k]!=null).map(k=>[k,String(m.sender[k])]));
    dados.message.attachments=(Array.isArray(m.attachments)?m.attachments:[]).slice(0,20).map(a=>Object.fromEntries(['type','originalType','url'].filter(k=>a?.[k]!=null).map(k=>[k,String(a[k])])));
    const sr=m.storyReply||m.metadata?.storyReply;
    if(sr)dados.message.storyReply=Object.fromEntries(['storyUrl','storyId'].filter(k=>sr[k]!=null).map(k=>[k,String(sr[k])]));
    return resp(200,await aceitarEntrada_(env,ctx,'zernio','instagram',dados));
  }
  return resp(200,{ok:true});
}

async function criarFilaZernio_(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS msg_zernio_fila(id TEXT PRIMARY KEY,payload TEXT NOT NULL,em TEXT NOT NULL,prox INTEGER NOT NULL DEFAULT 0,trava INTEGER NOT NULL DEFAULT 0,tentativas INTEGER NOT NULL DEFAULT 0)").run();
}
async function processarFilaZernio_(env){
  await criarFilaZernio_(env);const now=Date.now();
  const rows=(await env.DB.prepare('SELECT id,payload,tentativas FROM msg_zernio_fila WHERE prox<=? AND trava<=? ORDER BY em LIMIT 5').bind(now,now).all()).results;
  if(!rows.length)return;
  await iniciar(env);
  for(const row of rows){
    const claimed=await env.DB.prepare('UPDATE msg_zernio_fila SET trava=? WHERE id=? AND trava<=?').bind(Date.now()+120000,row.id,Date.now()).run();if(!claimed.meta.changes)continue;
    try{
      const b=JSON.parse(row.payload);await processarEventoZernio_(env,b);
      await env.DB.prepare('DELETE FROM msg_zernio_fila WHERE id=?').bind(row.id).run();
      await cfgSet(env,'msg_zernio_processado',JSON.stringify({em:agora(),ok:true}));
      // Push failures cannot make the already-saved message disappear or retry ingestion.
      if(b.event==='message.received')await processarPushMobile_(env,true).catch(()=>{});
    }catch(e){
      await env.DB.prepare('UPDATE msg_zernio_fila SET tentativas=tentativas+1,prox=?,trava=0 WHERE id=?').bind(Date.now()+Math.min(1800000,30000*Math.pow(2,Math.min(6,row.tentativas))),row.id).run();
      await cfgSet(env,'msg_zernio_processado',JSON.stringify({em:agora(),ok:false,erro:'Falha ao gravar; evento preservado para nova tentativa.'}));
    }
  }
}
const ZERNIO_TIPO_ = { image: 'imagem', video: 'vídeo', audio: 'áudio', file: 'documento', sticker: 'figurinha', share: 'compartilhamento' };
async function processarEventoZernio_(env, b, basico=false) {
  const z = await zernioCfg_(env), msg = (b && b.message) || {}; if (!z || msg.platform !== 'instagram') return false;
  const contaEv = b.account && (b.account.accountId || b.account.id); if (contaEv && String(contaEv) !== z.conta.id) return false;
  if (await msgPausado_(env, 'instagram')) return false;
  const entrada = msg.direction === 'incoming', cid = String(msg.conversationId || '').slice(0, 120), snd = msg.sender || {};
  let contato = '';
  if (entrada) { contato = String(snd.id || '').slice(0, 80); if (contato && cid) await env.DB.prepare('INSERT INTO msg_zernio_conv (contato, conversa, em) VALUES (?, ?, ?) ON CONFLICT(contato) DO UPDATE SET conversa=excluded.conversa, em=excluded.em').bind(contato, cid, agora()).run(); }
  else if (cid) { const x = await env.DB.prepare('SELECT contato FROM msg_zernio_conv WHERE conversa=?').bind(cid).first(); contato = x ? x.contato : ''; }
  if (!contato) return false;
  const a0 = Array.isArray(msg.attachments) && msg.attachments[0] ? msg.attachments[0] : null;
  const ot = a0 ? String(a0.originalType || '') : '', tipoA = a0 ? String(a0.type || '') : '';
  const tipo = !a0 ? 'texto' : ot === 'story_mention' ? 'menção em story' : (ZERNIO_TIPO_[tipoA] || 'anexo');
  const mime = { imagem: 'image/jpeg', 'vídeo': 'video/mp4', 'áudio': 'audio/mp4', 'menção em story': 'image/jpeg' }[tipo] || '';
  const m = { extId: String(msg.platformMessageId || msg.id || '').slice(0, 200), contato: contato, nome: entrada ? String(snd.name || (snd.username ? '@' + snd.username : '')).slice(0, 80) : '', grupo: 0,
    direcao: entrada ? 'entrada' : 'saida', tipo: tipo, texto: String(msg.text || '').slice(0, MSG_TEXTO_MAX), em: msg.sentAt && !isNaN(Date.parse(msg.sentAt)) ? new Date(msg.sentAt).toISOString() : agora(),
    midiaUrl: mime && a0 && /^https:\/\//i.test(String(a0.url || '')) ? String(a0.url) : '', midiaMime: mime, midiaSeg: 0, ctxTipo: '', ctxRef: '', ctxUrl: '', ctxPost: 0 };
  if (!m.extId) return false;
  const nova = await gravarMensagem_(env, 'instagram', m);
  if(basico){
    await guardarEntrada_(env,'zernio-contexto','instagram',b);
    if(nova)await agendarAuto_(null,env,'instagram',m);
    return nova;
  }
  if (entrada && cid) {      // resposta a story: o aviso não traz, a lista de mensagens traz storyReply (link vence ~24 h: a mídia é copiada agora)
    const r = await zernioApi_(z.chave, 'GET', '/inbox/conversations/' + encodeURIComponent(cid) + '/messages?accountId=' + encodeURIComponent(z.conta.id) + '&limit=10&sortOrder=desc', null, 8000);
    const lista = r.ok && r.j && Array.isArray(r.j.messages) ? r.j.messages : [];
    const mm = lista.find((x) => x && (String(x.id) === m.extId || String(x.id) === String(msg.id) || String(x.platformMessageId) === m.extId));
    const sr = msg.storyReply || (msg.metadata && msg.metadata.storyReply) || (mm && mm.storyReply);
    if (sr) {
      m.ctxTipo = 'story'; m.ctxUrl = /^https:\/\//i.test(String(sr.storyUrl || '')) ? String(sr.storyUrl) : '';
      if (sr.storyId) { const po = await env.DB.prepare("SELECT id FROM postagem WHERE ig_id=? AND status='publicado' LIMIT 1").bind(String(sr.storyId)).first(); if (po) { m.ctxPost = Number(po.id) || 0; m.ctxUrl = ''; } }
    }
  }
  Object.assign(m,b._midiaSalva||{});
  try{await completarMidiaEntrada_(env,'instagram',m);}finally{b._midiaSalva={midiaChave:m.midiaChave||'',midiaMime:m.midiaMime||'',ctxChave:m.ctxChave||''};}
  if (nova) { try { await respostaAutomatica_(env, 'instagram', m); } catch (e) { /* resposta automática nunca derruba o recebimento */ } }
  return nova;
}
async function repararContextoInstagram_(env,id){
  const c=await env.DB.prepare('SELECT id,canal,contato FROM msg_conversa WHERE id=?').bind(id).first();
  if(!c||c.canal!=='instagram')return {ok:true,atualizadas:0};
  const z=await zernioCfg_(env), link=await env.DB.prepare('SELECT conversa FROM msg_zernio_conv WHERE contato=?').bind(c.contato).first();
  if(!z||!link)return {ok:true,atualizadas:0};
  const r=await zernioApi_(z.chave,'GET','/inbox/conversations/'+encodeURIComponent(link.conversa)+'/messages?accountId='+encodeURIComponent(z.conta.id)+'&limit=100&sortOrder=desc',null,15000);
  if(!r.ok)return {ok:false,erro:'Não foi possível atualizar os stories do Instagram agora.'};
  let count=0;
  for(const m of (r.j&&Array.isArray(r.j.messages)?r.j.messages:[])){
    const sr=m.storyReply||(m.metadata&&m.metadata.storyReply);if(!sr)continue;
    const saved=await env.DB.prepare("SELECT id,ctx_chave FROM msg_mensagem WHERE conversa_id=? AND (ext_id=? OR ext_id=?) AND ctx_chave='' LIMIT 1").bind(id,String(m.id||''),String(m.platformMessageId||'')).first();if(!saved)continue;
    const po=sr.storyId?await env.DB.prepare("SELECT id FROM postagem WHERE ig_id=? AND status='publicado' LIMIT 1").bind(String(sr.storyId)).first():null;
    let key='';if(!po&&sr.storyUrl){const media=await copiarMidiaRemota_(env,String(sr.storyUrl),'');if(media)key=media.chave;}
    if(po||key){await env.DB.prepare("UPDATE msg_mensagem SET ctx_tipo='story',ctx_post=?,ctx_chave=?,ctx_aprox=0,status_em=? WHERE id=?").bind(po?po.id:0,key,agora(),saved.id).run();count++;}
    if(count>=3)break;
  }
  if(count)await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(agora(),id).run();
  return {ok:true,atualizadas:count};
}

async function enviarZernio_(env, z, conv, corpo, podeHumano=true) {
  const x = await env.DB.prepare('SELECT conversa FROM msg_zernio_conv WHERE contato=?').bind(conv.contato).first();
  if (!x) return { ok: false, erro: 'Esta conversa ainda não chegou pelo Zernio. Responda pelo app do Instagram; quando o cliente escrever de novo, ela passa a sair por aqui.' };
  const caminho = '/inbox/conversations/' + encodeURIComponent(x.conversa) + '/messages', base = Object.assign({ accountId: z.conta.id }, corpo);
  let r = await zernioApi_(z.chave, 'POST', caminho, base, 40000);
  const texto = JSON.stringify(r.j || {});
  if (podeHumano && !r.ok && r.status >= 400 && r.status < 500 && /24|window|outside|janela/i.test(texto)) r = await zernioApi_(z.chave, 'POST', caminho, Object.assign({ messagingType: 'MESSAGE_TAG', messageTag: 'HUMAN_AGENT' }, base), 40000);
  const id = r.j && r.j.data && (r.j.data.messageId || (Array.isArray(r.j.data.messageIds) && r.j.data.messageIds[0]));
  if (r.ok && id) return { ok: true, extId: String(id) };
  if (r.ok) return { ok: false, incerto: true, erro: 'O Zernio respondeu sem confirmar o envio. Confira no Instagram antes de tentar de novo.' };
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'O Zernio não aceitou a chave. Confira em Conexões → Instagram Direct · Zernio.' };
  if (r.status === 0 || r.status >= 500) return { ok: false, incerto: true, erro: 'Sem confirmação do Zernio. Confira no Instagram antes de tentar de novo.' };
  if (/24|window|outside|7 days|7-day/i.test(JSON.stringify(r.j || {}))) return { ok: false, erro: 'Já passaram mais de 7 dias da última mensagem deste cliente. O Instagram não deixa responder por aqui.' };
  return { ok: false, erro: 'O Instagram recusou a mensagem (HTTP ' + r.status + '). Tente de novo em instantes.' };
}
const MSG_ANEXO_RE_ = /^out\/\d{6}\/[a-f0-9]{24}\.[a-z0-9]{2,4}$/;
const MSG_TIPO_DE_MIME_ = (mime) => /^image\/(jpeg|png|webp)$/.test(mime) ? 'imagem' : /^video\/(mp4|quicktime)$/.test(mime) ? 'vídeo' : /^audio\//.test(mime) ? 'áudio' : '';
async function responderMensagem_(env, whats, d) {
  const id = Number(d.conversa), texto = String(d.texto == null ? '' : d.texto).replace(/\r\n/g, '\n').trim(), idLocal = String(d.idLocal || ''), chaveAnexo = String(d.anexo || '');
  if (!id) return [400, { ok: false, erro: 'Escolha uma conversa.' }];
  if (!texto && !chaveAnexo) return [400, { ok: false, erro: 'Escreva a mensagem antes de enviar.' }];
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(idLocal)) return [400, { ok: false, erro: 'Atualize a página e tente de novo.' }];
  const conv = await env.DB.prepare('SELECT id, canal, contato, nome, grupo FROM msg_conversa WHERE id=?').bind(id).first();
  if (!conv) return [404, { ok: false, erro: 'Conversa não encontrada.' }];
  let anexo = null;
  if (chaveAnexo) {
    if (!MSG_ANEXO_RE_.test(chaveAnexo)) return [400, { ok: false, erro: 'Anexo inválido. Escolha o arquivo de novo.' }];
    const cabeca = await env.MIDIA.head(chaveAnexo);
    if (!cabeca) return [400, { ok: false, erro: 'O anexo não foi encontrado. Escolha o arquivo de novo.' }];
    const mime = mimeLimpo_(cabeca.httpMetadata && cabeca.httpMetadata.contentType), tipo = MSG_TIPO_DE_MIME_(mime);
    if (!tipo) return [400, { ok: false, erro: 'Este tipo de arquivo não pode ser enviado por aqui. Use foto, vídeo ou áudio.' }];
    if (!env.MIDIA_URL) return [409, { ok: false, erro: 'O endereço público das mídias não está configurado. Avise o gestor.' }];
    if (conv.canal === 'instagram' && texto) return [400, { ok: false, erro: 'O Instagram não aceita texto junto com a foto, o vídeo ou o áudio. Envie o anexo e depois o texto em outra mensagem.' }];
    if (texto.length > 1024) return [400, { ok: false, erro: 'A legenda aceita até 1024 letras.' }];
    anexo = { chave: chaveAnexo, mime: mime, tipo: tipo, url: urlMidia(env, chaveAnexo) };
  } else if (conv.canal === 'instagram' ? new TextEncoder().encode(texto).length > 1000 : texto.length > MSG_TEXTO_MAX) return [400, { ok: false, erro: conv.canal === 'instagram' ? 'O Instagram aceita até 1000 letras por mensagem. Divida em duas.' : 'Mensagem grande demais. Divida em duas.' }];
  /* Reserva atômica no D1 (chave única): sobrevive a queda do Worker e nunca deixa a mesma tentativa sair duas vezes. */
  /* v7.40.36: responder uma mensagem especifica. A citada tem de ser DESTA conversa
   * (nada de citar mensagem de outra pessoa) e o vínculo fica gravado na linha enviada. */
  let cit = null, textoEnvio = texto;
  if (String(d.citada == null ? '' : d.citada).trim()) {
    const alvoId = Number(d.citada);
    const q = alvoId ? await env.DB.prepare('SELECT id, ext_id, direcao, tipo, texto, autor_nome FROM msg_mensagem WHERE id=? AND conversa_id=?').bind(alvoId, id).first() : null;
    if (!q) return [400, { ok: false, erro: 'A mensagem citada não está nesta conversa. Atualize a conversa e tente de novo.' }];
    const rotulo = ({ 'imagem': '[foto]', 'vídeo': '[vídeo]', 'áudio': '[áudio]', 'documento': '[documento]', 'figurinha': '[figurinha]' })[q.tipo] || '';
    const bruto = String(q.texto || '').replace(/\s+/g, ' ').trim();
    cit = { id: q.id, extId: String(q.ext_id || ''), qdir: q.direcao, qtipo: q.tipo,
      autor: String(q.direcao === 'saida' ? 'Você' : (q.autor_nome || 'Cliente')).slice(0, 60),
      trecho: (bruto || rotulo || '[mensagem]').slice(0, 160) };
    if (conv.canal === 'instagram') {
      if (anexo) return [400, { ok: false, erro: 'No Instagram a citação vai dentro do texto, e o Instagram não aceita texto junto com foto, vídeo ou áudio. Envie a citação em uma mensagem só de texto.' }];
      textoEnvio = cit.trecho.split('\n').map((l) => '> ' + l).join('\n') + '\n\n' + texto;
      if (new TextEncoder().encode(textoEnvio).length > 1000) return [400, { ok: false, erro: 'Com a citação a mensagem passa de 1000 letras do Instagram. Encurte o texto.' }];
    }
  }
  const chave = 'msgenv:' + idLocal, t0 = agora();
  const reserva = await env.DB.prepare('INSERT OR IGNORE INTO cfg (chave, valor) VALUES (?, ?)').bind(chave, t0 + '|enviando').run();
  if (!reserva.meta || reserva.meta.changes !== 1) {
    const ant = await env.DB.prepare('SELECT valor FROM cfg WHERE chave=?').bind(chave).first(), carga = ant ? String(ant.valor).slice(25) : 'enviando';
    if (carga !== 'enviando') { try { return [200, JSON.parse(carga)]; } catch (e) { /* cai no aviso */ } }
    return [200, { ok: false, incerto: true, erro: 'Esta mensagem já foi tentada e ficou sem confirmação. Confira no ' + (conv.canal === 'instagram' ? 'Instagram' : 'WhatsApp') + ' antes de enviar de novo.' }];
  }
  try { await env.DB.prepare("DELETE FROM cfg WHERE chave LIKE 'msgenv:%' AND substr(valor,1,24)<?").bind(new Date(Date.now() - 3 * 86400000).toISOString()).run(); } catch (e) { /* limpeza é conforto */ }
  const automatico=whats==='auto'||d._janelaAutomatica===true;
  if(d._acompanhamento&&!await conferirAcompanhamento_(env,Number(d._acompanhamento))){await cfgSet(env,chave,null);return [409,{ok:false,cancelado:true,erro:'Cliente respondeu; acompanhamento cancelado.'}];}
  if(automatico&&conv.canal==='instagram'){const c=await env.DB.prepare('SELECT ult_entrada_em FROM msg_conversa WHERE id=?').bind(id).first();if(!c?.ult_entrada_em||Date.now()-Date.parse(c.ult_entrada_em)>=24*3600000){await cfgSet(env,chave,null);return [409,{ok:false,erro:'O prazo de 24 horas do Instagram terminou. Confira a conversa antes de enviar.'}];}}
  const res = anexo ? (conv.canal === 'instagram' ? await enviarMidiaInstagram_(env, conv, anexo, automatico) : await enviarMidiaWhats_(env, conv, anexo, texto, cit))
    : (conv.canal === 'instagram' ? await enviarTextoInstagram_(env, conv, textoEnvio, automatico) : (d.previa === true && !cit) ? await enviarTextoComPrevia_(env, conv, textoEnvio, d) : await enviarTextoWhats_(env, conv, textoEnvio, cit));
  if (!res.ok && !res.incerto) { await env.DB.prepare('DELETE FROM cfg WHERE chave=?').bind(chave).run(); return [409, { ok: false, erro: res.erro }]; }
  const extId = res.ok ? res.extId : 'inc:' + idLocal, em = agora();
  await gravarMensagem_(env, conv.canal, { extId: extId, contato: conv.contato, nome: '', grupo: conv.grupo, direcao: 'saida', tipo: anexo ? anexo.tipo : 'texto', texto: textoEnvio, em: em, por:String(whats||'').slice(-4), midiaChave: anexo ? anexo.chave : '', midiaMime: anexo ? anexo.mime : '', midiaSeg: Math.max(0, Math.min(86400, Number(d.seg) || 0)) });
  await env.DB.prepare('UPDATE msg_mensagem SET por=?, status=CASE WHEN ? THEN status ELSE ? END WHERE canal=? AND ext_id=?').bind(String(whats || '').slice(-4), res.ok ? 1 : 0, 'incerta', conv.canal, extId).run();
  // v7.40.36: o vínculo da citação acompanha a mensagem (a bolha enviada mostra o que foi citado).
  if (cit) { try { await env.DB.prepare("UPDATE msg_mensagem SET ctx_tipo='resposta', ctx_ref=?, ctx_autor=?, ctx_trecho=?, ctx_aprox=0 WHERE canal=? AND ext_id=? AND ctx_tipo IN ('','link')").bind(cit.extId || '', cit.autor, cit.trecho, conv.canal, extId).run(); } catch (e) { /* a mensagem já saiu: só a citação no histórico fica sem o vínculo */ } }
  // Contexto próprio do link: snapshot acompanha a mensagem e sua retenção, sem tabela nova. Não substitui story/citação.
  if(!anexo&&conv.canal!=='instagram'&&d.previa===true){const snapshot=snapshotPrevia_(texto,d);if(snapshot)await env.DB.prepare("UPDATE msg_mensagem SET ctx_tipo='link',ctx_ref=? WHERE canal=? AND ext_id=? AND ctx_tipo IN ('','link')").bind(snapshot,conv.canal,extId).run();}
  const linha = await env.DB.prepare('SELECT ' + MSG_COLS_MSG_ + ' FROM msg_mensagem WHERE canal=? AND ext_id=?').bind(conv.canal, extId).first();
  const corpo = res.ok ? { ok: true, mensagem: linha } : { ok: false, incerto: true, erro: res.erro, mensagem: linha };
  await env.DB.prepare('UPDATE cfg SET valor=? WHERE chave=?').bind(t0 + '|' + JSON.stringify(corpo), chave).run();
  return [200, corpo];
}
/* ---- v7.40.14: ficha do cliente — tamanhos, preferências e cidade por PESSOA (alvo = identidade entre canais ou "c:<id>", igual a notas e etiquetas).
 * O resto da ficha só junta o que já existe: etiquetas, últimas notas, canais vinculados e compras (encerramentos "Vendeu"). Nada é inventado. */
const FICHA_LIM_ = { tamanhos: 60, preferencias: 300, cidade: 60 };
const FICHA_NOME_ = { tamanhos: 'Tamanhos', preferencias: 'Preferências', cidade: 'Cidade/bairro' };
const FICHA_GRUPOS_ = ['tamanhos', 'generos', 'tecidos', 'cores'];
function perfilFichaJson_(valor) {
  try { const p = JSON.parse(String(valor || '{}')); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; }
  catch (e) { return {}; }
}
function validarPerfilFicha_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['As preferências estruturadas estão inválidas.'];
  const out = { cidade: '', municipio: '', bairro: '', localidade: '', preferencias: {} };
  for (const [k, rotulo] of [['cidade', 'Cidade'], ['municipio', 'Município'], ['bairro', 'Bairro'], ['localidade', 'Localidade']]) {
    if (raw[k] != null && typeof raw[k] !== 'string') return [rotulo + ': valor inválido.'];
    const texto = String(raw[k] == null ? '' : raw[k]).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (texto.length > 100) return [rotulo + ': no máximo 100 letras.'];
    out[k] = texto;
  }
  const prefs = raw.preferencias && typeof raw.preferencias === 'object' && !Array.isArray(raw.preferencias) ? raw.preferencias : {};
  let total = 0;
  for (const grupo of FICHA_GRUPOS_) {
    if (prefs[grupo] != null && !Array.isArray(prefs[grupo])) return ['As opções de ' + grupo + ' estão inválidas.'];
    const valores = Array.isArray(prefs[grupo]) ? prefs[grupo] : [];
    if (valores.length > 40) return ['Escolha até 40 opções em cada grupo de preferências.'];
    const vistos = new Set(), limpos = [];
    for (const valor of valores) {
      if (valor != null && typeof valor !== 'string') return ['Cada opção de preferência deve ser texto.'];
      const texto = String(valor == null ? '' : valor).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!texto) continue;
      if (texto.length > 100) return ['Cada opção de preferência aceita até 100 letras.'];
      total += texto.length;
      const chave = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
      if (!vistos.has(chave)) { vistos.add(chave); limpos.push(texto); }
    }
    out.preferencias[grupo] = limpos;
  }
  if (total > 6000) return ['As preferências estão grandes demais.'];
  return [null, out];
}
/** Valida os campos enviados. Devolve [erro] ou [null, {campo: texto}] só com os campos que vieram. */
export function validarFicha_(d) {
  const v = {};
  for (const k of Object.keys(FICHA_LIM_)) {
    if (!d || d[k] == null) continue;
    const t = String(d[k]).replace(/\s+/g, ' ').trim();
    if (t.length > FICHA_LIM_[k]) return [FICHA_NOME_[k] + ': no máximo ' + FICHA_LIM_[k] + ' letras (agora tem ' + t.length + ').'];
    v[k] = t;
  }
  if (d && Object.prototype.hasOwnProperty.call(d, 'perfil')) {
    const [erro, perfil] = validarPerfilFicha_(d.perfil);
    if (erro) return [erro];
    v.perfil = perfil;
  }
  return [null, v];
}
/* v7.40.15: etiquetas da pessoa gravadas de uma vez (usado por "Etiquetas" e pelo funil). fica = ids que a pessoa passa a ter. */
async function gravarEtiquetas_(env, conv, fica) {
  const alvo = alvoDe_(conv), em = agora();
  await env.DB.batch([env.DB.prepare('DELETE FROM msg_alvo_etiqueta WHERE alvo=?').bind(alvo)].concat(Array.from(new Set(fica)).map((x) => env.DB.prepare('INSERT OR IGNORE INTO msg_alvo_etiqueta (alvo, etiqueta_id, em) VALUES (?,?,?)').bind(alvo, x, em))));
  await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(em, conv.id).run();
  return (await etiquetasDosAlvos_(env, [alvo]))[alvo] || [];
}
/* v7.40.15: funil de vendas. Colunas = etiquetas de venda ativas, na ordem da equipe (renomear/arquivar muda o quadro sozinho).
 * Cartão = uma pessoa: só conversas individuais abertas; a pessoa com vários canais aparece uma vez, pela conversa mais recente (no filtro de canal, a mais recente daquele canal).
 * Se, por dado antigo, a pessoa tiver duas etiquetas de venda, vale a mais adiantada. Cada coluna traz o total e até 30 cartões, os mais recentes primeiro. */
const MSG_ALVO_SQL_ = "(CASE WHEN " + MSG_IDENTIDADE_SQL_ + "<>'' THEN " + MSG_IDENTIDADE_SQL_ + " ELSE 'c:'||msg_conversa.id END)";
export async function funilVendas_(env, canal) {
  const etapas = (await etiquetas_(env)).filter((e) => e.venda);
  if (!etapas.length) return [];
  const ids = etapas.map((e) => e.id);
  const sql = "WITH fc AS (SELECT id, ultima_em, " + MSG_ALVO_SQL_ + " AS alvo FROM msg_conversa WHERE grupo=0 AND encerrada_em='' AND total>0" + (canal ? ' AND canal=?' : '') + "), " +
    "fp AS (SELECT id, alvo, ultima_em, ROW_NUMBER() OVER (PARTITION BY alvo ORDER BY ultima_em DESC, id DESC) AS rn FROM fc), " +
    "fe AS (SELECT x.alvo, x.etiqueta_id, ROW_NUMBER() OVER (PARTITION BY x.alvo ORDER BY et.ordem DESC, et.id DESC) AS rn FROM msg_alvo_etiqueta x JOIN msg_etiqueta et ON et.id=x.etiqueta_id WHERE x.etiqueta_id IN (" + ids.map(() => '?').join(',') + ")), " +
    "fr AS (SELECT fp.id, fe.etiqueta_id, ROW_NUMBER() OVER (PARTITION BY fe.etiqueta_id ORDER BY fp.ultima_em DESC, fp.id DESC) AS pos, COUNT(*) OVER (PARTITION BY fe.etiqueta_id) AS n FROM fp JOIN fe ON fe.alvo=fp.alvo AND fe.rn=1 WHERE fp.rn=1) " +
    "SELECT fr.etiqueta_id, fr.n, msg_conversa.id, msg_conversa.canal, msg_conversa.contato, msg_conversa.dono, msg_conversa.ultima_em, substr(msg_conversa.previa,1,90) AS previa, " + MSG_NOME_SQL_ + " AS nome FROM fr JOIN msg_conversa ON msg_conversa.id=fr.id WHERE fr.pos<=30 ORDER BY fr.pos";
  const rs = (await env.DB.prepare(sql).bind(...(canal ? [canal] : []), ...ids).all()).results || [];
  return etapas.map((e) => {
    const meus = rs.filter((r) => r.etiqueta_id === e.id);
    return { etiqueta: { id: e.id, nome: e.nome, cor: e.cor }, total: meus.length ? Number(meus[0].n) || 0 : 0, cartoes: meus.map((r) => ({ conversa: r.id, nome: r.nome || '', contato: r.contato || '', canal: r.canal, previa: r.previa || '', ultima_em: r.ultima_em || '', dono: r.dono || '' })) };
  });
}
/* Mover o cartão = trocar só a etiqueta de venda da pessoa (as outras etiquetas ficam). etiqueta 0 = tirar do funil. Devolve [status, erro] ou [0, resultado]. */
export async function moverNoFunil_(env, d) {
  const id = Number(d && d.conversa) || 0, etq = Number(d && d.etiqueta);
  if (!id) return [400, 'Escolha a conversa que vai mudar de etapa.'];
  if (!Number.isInteger(etq) || etq < 0) return [400, 'Escolha a etapa da venda.'];
  const conv = await env.DB.prepare('SELECT id, grupo, ' + MSG_IDENTIDADE_SQL_ + ' AS pessoa FROM msg_conversa WHERE id=?').bind(id).first();
  if (!conv) return [404, 'Conversa não encontrada.'];
  if (conv.grupo) return [400, 'O funil de vendas é só para conversas individuais, não para grupos.'];
  const etapas = (await etiquetas_(env)).filter((e) => e.venda);
  if (etq && !etapas.some((e) => e.id === etq)) return [400, 'Essa etapa não existe mais. Atualize o funil e tente de novo.'];
  const outras = ((await env.DB.prepare('SELECT x.etiqueta_id AS id FROM msg_alvo_etiqueta x JOIN msg_etiqueta e ON e.id=x.etiqueta_id WHERE x.alvo=? AND e.venda=0').bind(alvoDe_(conv)).all()).results || []).map((r) => r.id);
  return [0, { etiquetas: await gravarEtiquetas_(env, conv, outras.concat(etq ? [etq] : [])) }];
}
async function convFicha_(env, id) {
  const conv = id ? await env.DB.prepare('SELECT id, canal, contato, grupo, ' + MSG_NOME_SQL_ + ' AS nome, ' + MSG_IDENTIDADE_SQL_ + ' AS pessoa FROM msg_conversa WHERE id=?').bind(id).first() : null;
  if (!conv) return [404, 'Conversa não encontrada.'];
  if (conv.grupo) return [400, 'A ficha do cliente é só para conversas individuais, não para grupos.'];
  return [0, conv];
}
export async function fichaDaConversa_(env, conv) {
  const alvo = alvoDe_(conv);
  const f = await env.DB.prepare('SELECT tamanhos, preferencias, cidade, atualizado_em, autor, perfil_json FROM msg_ficha WHERE alvo=?').bind(alvo).first();
  const perfil = perfilFichaJson_(f && f.perfil_json);
  const temTamanhosPerfil=!!(perfil&&perfil.preferencias&&Array.isArray(perfil.preferencias.tamanhos));
  const tamanhosPerfil = temTamanhosPerfil ? perfil.preferencias.tamanhos.join(' · ') : '';
  const canais = conv.pessoa ? ((await env.DB.prepare('SELECT id, canal, contato FROM msg_conversa WHERE grupo=0 AND (' + MSG_IDENTIDADE_SQL_ + '=? OR id=?) ORDER BY ultima_em DESC LIMIT 20').bind(conv.pessoa, conv.id).all()).results || []) : [{ id: conv.id, canal: conv.canal, contato: conv.contato }];
  const ids = canais.map((c) => c.id), marca = ids.map(() => '?').join(',');
  /* compra = encerramento "Vendeu" que valeu: se a mesma conversa foi encerrada de novo sem mensagem nenhuma no meio, foi correção do motivo e vale o último */
  const compras = (await env.DB.prepare("SELECT e.em, e.canal FROM msg_encerramento e WHERE e.motivo='vendeu' AND e.conversa_id IN (" + marca + ") AND NOT EXISTS (SELECT 1 FROM msg_encerramento x WHERE x.conversa_id=e.conversa_id AND (x.em>e.em OR (x.em=e.em AND x.id>e.id)) AND NOT EXISTS (SELECT 1 FROM msg_mensagem m WHERE m.conversa_id=e.conversa_id AND m.enviada_em>e.em AND m.enviada_em<x.em)) ORDER BY e.em DESC LIMIT 20").bind(...ids).all()).results || [];
  const notas = (await env.DB.prepare('SELECT id, texto, autor, em FROM msg_nota WHERE alvo=? AND length(excluida_em)=0 ORDER BY em DESC, id DESC LIMIT 5').bind(alvo).all()).results || [];
  let etiquetas = []; try { etiquetas = (await etiquetasDosAlvos_(env, [alvo]))[alvo] || []; } catch (e) { /* etiqueta é conforto */ }
  return {
    nome: conv.nome || '',
    ficha: { tamanhos: temTamanhosPerfil ? tamanhosPerfil : (f && f.tamanhos) || '', preferencias: (f && f.preferencias) || '', cidade: (f && f.cidade) || '', perfil: perfil, atualizado_em: (f && f.atualizado_em) || '', autor: (f && f.autor) || '' },
    etiquetas: etiquetas, notas: notas, canais: canais.map((c) => ({ id: c.id, canal: c.canal, contato: c.contato, atual: c.id === conv.id })), compras: compras.map((c) => ({ em: c.em, canal: c.canal }))
  };
}
/* ---- v7.40.13: mensagens agendadas (a atendente escreve agora e o texto sai sozinho na hora marcada) ---- */
const AGENDA_COLS_ = "id, conversa_id, texto, quando, autor, status, erro, criado_em, enviado_em, tipo, acompanhamento, anexo_nome, anexo_mime, CASE WHEN anexo<>'' THEN 1 ELSE 0 END AS tem_anexo";
const AGENDA_MAX_DIAS_ = 60;
export function saudacaoAtendimento_(ms){const h=new Date(ms-FUSO_MS_).getUTCHours();return h>=5&&h<12?'Bom dia':h>=12&&h<18?'Boa tarde':'Boa noite';}
async function contextoAcompanhamento_(env,id){
  const c=await env.DB.prepare('SELECT id,canal,contato,grupo,encerrada_em,ult_entrada_em,'+MSG_IDENTIDADE_SQL_+' AS pessoa FROM msg_conversa WHERE id=?').bind(id).first();
  if(!c)return null;
  const alvo=alvoDe_(c);
  const r=await env.DB.prepare("SELECT COALESCE(MAX(m.id),0) AS ref FROM msg_mensagem m WHERE m.direcao='entrada' AND m.conversa_id IN (SELECT id FROM msg_conversa WHERE id=? OR (grupo=0 AND "+MSG_IDENTIDADE_SQL_+"<>'' AND "+MSG_IDENTIDADE_SQL_+"=?))").bind(id,c.pessoa||'').first();
  return {...c,alvo,entradaRef:Number(r?.ref)||0};
}
const ACOMP_COLS_='id,conversa_id,etapa,status,quando,autor,texto_lembrete,texto_final,lembrete_em,criado_em,atualizado_em,erro';
async function acompanhamentoDaConversa_(env,id){
  const r=await env.DB.prepare('SELECT '+ACOMP_COLS_+" FROM msg_acompanhamento WHERE conversa_id=? ORDER BY CASE WHEN status='ativo' THEN 0 ELSE 1 END,id DESC LIMIT 1").bind(id).first();
  return r||null;
}
async function guardarAutorizacaoAgenda_(env,req){
  const whats=(req.headers.get('X-TK-Whats')||'').replace(/\D/g,'').slice(0,20),sessao=req.headers.get('X-TK-Sessao')||'';
  if(!whats||!/^tk[123]\./.test(sessao))throw Error('Entre novamente para agendar.');
  const ref=hex(24),ms=Date.now(),partes=sessao.split('.'),exp=partes[0]==='tk3'&&/^\d{10}$/.test(partes[2]||'')?Number(partes[2])*1000:ms+30*DIA_MS_;
  await env.CACHE.put('agenda-auth:'+ref,JSON.stringify({whats,sessao}),{expirationTtl:61*86400});
  await env.DB.prepare('INSERT INTO msg_agenda_autorizacao(ref,proxima,limite,criado_em) VALUES(?,?,?,?)').bind(ref,new Date(Math.max(ms,Math.min(ms+7*DIA_MS_,exp-DIA_MS_))).toISOString(),new Date(ms+61*DIA_MS_).toISOString(),new Date(ms).toISOString()).run();return ref;
}
async function autorizacaoAgenda_(env,ref,acompanhamento){
  const meta=await env.DB.prepare('SELECT estado,limite FROM msg_agenda_autorizacao WHERE ref=?').bind(ref).first();
  if(meta&&(meta.estado!=='ativo'||Date.parse(meta.limite)<=Date.now()))return {ok:false,erro:'O acesso de quem agendou não está mais ativo.'};
  const raw=await env.CACHE.get('agenda-auth:'+ref);if(!raw)return {ok:false,temporario:true,erro:'Aguardando autorização do agendamento.'};
  let cred;try{cred=JSON.parse(raw);}catch(_){return {ok:false,erro:'Entre e faça um novo agendamento.'};}
  const req=new Request('https://agenda.internal',{headers:{'X-TK-Whats':cred.whats,'X-TK-Sessao':cred.sessao}}),ps=await permissoes(env,req);
  if(ps==='indisponivel')return {ok:false,temporario:true,erro:'Não foi possível confirmar o acesso agora.'};
  if(!Array.isArray(ps))return {ok:false,erro:'O acesso de quem agendou não está mais ativo.'};
  const direitos=msgDireitos_(ps,cred.whats,await msgRegras_(env));
  if(!direitos.acessar||!direitos.responder||!direitos.agenda)return {ok:false,erro:'Quem agendou não tem mais permissão para enviar mensagens.'};
  return {ok:true,whats:cred.whats,req};
}
async function renovarAutorizacoesAgenda_(env,ms){
  const t=new Date(ms).toISOString();
  // Encerradas/orfãs deixam a seleção de renovação; a tolerância cobre o INSERT do agendamento em curso.
  await env.DB.prepare("UPDATE msg_agenda_autorizacao SET estado='concluida' WHERE ref IN (SELECT u.ref FROM msg_agenda_autorizacao u WHERE estado='ativo' AND proxima<=? AND criado_em<? AND NOT EXISTS(SELECT 1 FROM msg_agenda a WHERE a.auth_ref=u.ref AND a.status IN ('pendente','enviando')) LIMIT 100)").bind(t,new Date(ms-10*60000).toISOString()).run();
  const refs=(await env.DB.prepare("SELECT ref,limite FROM msg_agenda_autorizacao u WHERE estado='ativo' AND proxima<=? AND EXISTS(SELECT 1 FROM msg_agenda a WHERE a.auth_ref=u.ref AND a.status IN ('pendente','enviando')) ORDER BY proxima LIMIT 5").bind(t).all()).results||[];
  for(const u of refs){
    let revogada=Date.parse(u.limite)<=ms;
    try{
      const raw=await env.CACHE.get('agenda-auth:'+u.ref);if(!raw)throw Error('Aguardando credencial.');const cred=JSON.parse(raw);
      const r=await fetch(env.API_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8','User-Agent':UA},body:JSON.stringify({action:'sessao',whatsapp:cred.whats,sessao:cred.sessao}),signal:AbortSignal.timeout(15000)});
      const j=await r.json();if(r.status>=500)throw Error('Sessão indisponível.');
      if(j.inativa||j.sessaoInvalida||[401,403].includes(r.status))revogada=true;
      if(j.ok&&j.usuario&&Array.isArray(j.usuario.permissoes)){
        const ps=j.usuario.permissoes;ps.msgPerfis=Array.isArray(j.usuario.perfis)?j.usuario.perfis:String(j.usuario.perfil||'').split(',');const d=msgDireitos_(ps,cred.whats,await msgRegras_(env));if(!d.acessar||!d.responder||!d.agenda)revogada=true;
        if(!revogada&&/^tk[123]\./.test(String(j.sessao||''))){await env.CACHE.put('agenda-auth:'+u.ref,JSON.stringify({whats:cred.whats,sessao:j.sessao}),{expirationTtl:Math.max(60,Math.ceil((Date.parse(u.limite)-ms)/1000))});await env.DB.prepare('UPDATE msg_agenda_autorizacao SET proxima=? WHERE ref=?').bind(new Date(ms+7*DIA_MS_).toISOString(),u.ref).run();continue;}
      }
      if(!revogada)throw Error('Renovação não confirmada.');
    }catch(_){if(!revogada){await env.DB.prepare('UPDATE msg_agenda_autorizacao SET proxima=? WHERE ref=?').bind(new Date(ms+10*60000).toISOString(),u.ref).run();continue;}}
    if(revogada){
      await env.DB.batch([env.DB.prepare("UPDATE msg_agenda_autorizacao SET estado='revogada' WHERE ref=?").bind(u.ref),env.DB.prepare("UPDATE msg_agenda SET status='falhou',erro='O acesso de quem agendou não está mais ativo.' WHERE auth_ref=? AND status='pendente'").bind(u.ref),env.DB.prepare("UPDATE msg_acompanhamento SET status='falhou',erro='O acesso de quem agendou não está mais ativo.',atualizado_em=? WHERE auth_ref=? AND status='ativo'").bind(t,u.ref)]);await env.CACHE.delete('agenda-auth:'+u.ref);
    }
  }
}
async function alterarAcompanhamento_(env,req,d){
  const id=Number(d.conversa)||0,c=await contextoAcompanhamento_(env,id);
  if(!c||c.grupo)return {ok:false,cod:404,erro:'Escolha uma conversa individual.'};
  const em=agora();
  if(d.ligado===false){
    await env.DB.batch([env.DB.prepare("UPDATE msg_acompanhamento SET status='cancelada',atualizado_em=?,erro='Cancelado pela equipe.' WHERE conversa_id=? AND status='ativo'").bind(em,id),env.DB.prepare("UPDATE msg_agenda SET status='cancelada',erro='Cancelado pela equipe.' WHERE status='pendente' AND acompanhamento IN (SELECT id FROM msg_acompanhamento WHERE conversa_id=? AND status='cancelada')").bind(id),env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(em,id)]);
    await notificarNovidade_(env,c.canal);return {ok:true,acompanhamento:await acompanhamentoDaConversa_(env,id)};
  }
  if(d.ligado!==true||!/^[A-Za-z0-9_-]{8,64}$/.test(String(d.idLocal||'')))return {ok:false,cod:400,erro:'Atualize a conversa e tente de novo.'};
  if(c.encerrada_em)return {ok:false,cod:409,erro:'Reabra o atendimento antes de acompanhar.'};
  const atual=await acompanhamentoDaConversa_(env,id);if(atual?.status==='ativo')return {ok:true,acompanhamento:atual};
  const config=await msgAuto_(env);let quando;
  try{quando=somarMinutosUteis_(Date.now(),120,config.expediente,config.feriados);const fim=somarMinutosUteis_(Date.parse(quando),120,config.expediente,config.feriados);if(Date.parse(fim)>Date.now()+60*DIA_MS_)throw Error('Confira o expediente: o acompanhamento precisa terminar nos próximos 60 dias.');}catch(e){return {ok:false,cod:400,erro:e.message};}
  if(c.canal==='instagram'&&(!c.ult_entrada_em||Date.parse(quando)>=Date.parse(c.ult_entrada_em)+24*3600000))return {ok:false,cod:400,erro:'Esse lembrete ficará fora das 24 horas permitidas pelo Instagram. Aguarde uma nova mensagem do cliente.'};
  const whats=(req.headers.get('X-TK-Whats')||'').replace(/\D/g,'').slice(0,20),chave=await sha(whats+'|'+d.idLocal);
  const repetido=await env.DB.prepare('SELECT '+ACOMP_COLS_+' FROM msg_acompanhamento WHERE chave=?').bind(chave).first();
  if(repetido)return {ok:true,acompanhamento:repetido};
  const perfil=await perfilAtendente_(env,req),autor=perfil.meuNome||perfil.nomePadrao||'Equipe';
  const prefixo=perfil.mostrarNome?(c.canal==='instagram'?autor+':\n':'*'+autor+':*\n'):'';
  const lembrete=prefixo+config.acompanhamento.textoLembrete,final=config.acompanhamento.mensagemFinal?prefixo+config.acompanhamento.textoFinal:'';
  const auth=await guardarAutorizacaoAgenda_(env,req);
  try{await env.DB.batch([
    env.DB.prepare("INSERT INTO msg_acompanhamento(chave,conversa_id,alvo,entrada_ref,quando,autor,whats,auth_ref,texto_lembrete,texto_final,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(chave,id,c.alvo,c.entradaRef,quando,autor,whats,auth,lembrete,final,em,em),
    env.DB.prepare("INSERT INTO msg_agenda(conversa_id,texto,quando,autor,whats,criado_em,tipo,acompanhamento,auth_ref) SELECT conversa_id,texto_lembrete,quando,autor,whats,criado_em,'lembrete',id,auth_ref FROM msg_acompanhamento WHERE chave=?").bind(chave),
    env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(em,id)
  ]);}catch(e){
    const outro=await acompanhamentoDaConversa_(env,id);if(outro?.status==='ativo')return {ok:true,acompanhamento:outro};throw e;
  }
  // Uma resposta que entrou entre o snapshot e o INSERT também cancela os passos.
  if(!await conferirAcompanhamento_(env,(await env.DB.prepare('SELECT id FROM msg_acompanhamento WHERE chave=?').bind(chave).first()).id))return {ok:true,acompanhamento:await acompanhamentoDaConversa_(env,id)};
  await notificarNovidade_(env,c.canal);return {ok:true,acompanhamento:await acompanhamentoDaConversa_(env,id)};
}
async function conferirAcompanhamento_(env,id){
  const a=await env.DB.prepare("SELECT id,conversa_id,entrada_ref,status FROM msg_acompanhamento WHERE id=?").bind(id).first();
  if(!a||a.status!=='ativo')return false;
  const c=await contextoAcompanhamento_(env,a.conversa_id);
  if(!c||c.encerrada_em||c.entradaRef>a.entrada_ref){const em=agora();await env.DB.batch([env.DB.prepare("UPDATE msg_acompanhamento SET status='cancelada',atualizado_em=?,erro=? WHERE id=? AND status='ativo'").bind(em,c?.encerrada_em?'Atendimento encerrado.':'Cliente respondeu.',id),env.DB.prepare("UPDATE msg_agenda SET status='cancelada',erro='Acompanhamento cancelado.' WHERE acompanhamento=? AND status='pendente'").bind(id)]);return false;}
  return true;
}
async function finalizarAcompanhamento_(env,a,em){
  const alvo="(SELECT CASE WHEN "+MSG_IDENTIDADE_SQL_+"<>'' THEN "+MSG_IDENTIDADE_SQL_+" ELSE 'c:'||id END FROM msg_conversa WHERE id=?)";
  const [r]=await env.DB.batch([
    env.DB.prepare("UPDATE msg_conversa SET encerrada_em=?,encerrada_motivo='sem_resposta',nao_lidas=0,atualizada_em=? WHERE id=? AND encerrada_em='' AND EXISTS(SELECT 1 FROM msg_acompanhamento WHERE id=? AND status='ativo') AND NOT EXISTS(SELECT 1 FROM msg_mensagem m WHERE m.direcao='entrada' AND m.id>? AND m.conversa_id IN (SELECT id FROM msg_conversa WHERE id=? OR (grupo=0 AND (CASE WHEN "+MSG_IDENTIDADE_SQL_+"<>'' THEN "+MSG_IDENTIDADE_SQL_+" ELSE 'c:'||id END)="+alvo+")))").bind(em,em,a.conversa_id,a.acompanhamento,a.entrada_ref,a.conversa_id,a.conversa_id),
    env.DB.prepare("INSERT INTO msg_encerramento(conversa_id,canal,pessoa,contato,motivo,em,por) SELECT id,canal,pessoa,contato,'sem_resposta',?,? FROM msg_conversa WHERE id=? AND changes()=1").bind(em,a.autor,a.conversa_id),
    env.DB.prepare("UPDATE msg_acompanhamento SET status='concluida',atualizado_em=?,erro=? WHERE id=? AND status='ativo' AND EXISTS(SELECT 1 FROM msg_conversa WHERE id=? AND encerrada_em=?)").bind(em,a.erroFinal||'',a.acompanhamento,a.conversa_id,em)
  ]);
  return Number(r.meta?.changes)===1;
}
async function processarEtapaAcompanhamento_(env,a,ms){
  const id=a.acompanhamento;
  if(!await conferirAcompanhamento_(env,id))return {status:'cancelada',erro:'Acompanhamento cancelado.'};
  const plano=await env.DB.prepare('SELECT * FROM msg_acompanhamento WHERE id=?').bind(id).first();
  const canal=(await env.DB.prepare('SELECT canal FROM msg_conversa WHERE id=?').bind(a.conversa_id).first())?.canal;
  if(canal&&await msgPausado_(env,canal))return {status:'pendente',quando:new Date(ms+5*60000).toISOString(),erro:'Canal pausado; acompanhamento aguardando.'};
  const cfg=await msgAuto_(env),abertura=horarioLoja_(ms,cfg.feriados,cfg.expediente);
  if(!abertura.aberta){
    if(!abertura.abreEm)return {status:'falhou',erro:'Confira o horário de atendimento nas configurações.'};
    await env.DB.prepare("UPDATE msg_acompanhamento SET quando=?,atualizado_em=? WHERE id=? AND status='ativo'").bind(abertura.abreEm,agora(),id).run();
    return {status:'pendente',quando:abertura.abreEm,erro:''};
  }
  let corpo={ok:true},enviouMensagem=false,textoEnviado='',avisoFinal='';
  if(a.tipo==='lembrete'||plano.texto_final){
    textoEnviado=(a.tipo==='lembrete'?plano.texto_lembrete:plano.texto_final).replace(/\{saudacao\}/g,saudacaoAtendimento_(ms));
    const [,r]=await responderMensagem_(env,'auto',{conversa:a.conversa_id,texto:textoEnviado,idLocal:'acomp-'+id+'-'+a.tipo,_acompanhamento:id,_janelaAutomatica:true});corpo=r;
    if(!corpo?.ok){
      if(a.tipo==='lembrete'||corpo?.cancelado)return {status:corpo?.cancelado?'cancelada':'falhou',erro:corpo?.erro||'Não foi possível confirmar o lembrete.',texto:textoEnviado};
      avisoFinal='Atendimento encerrado; mensagem final '+(corpo?.incerto?'sem confirmação. ':'não enviada. ')+String(corpo?.erro||'Confira a conversa.').slice(0,160);
    }
    enviouMensagem=!!corpo?.ok;
  }
  // A resposta pode ter entrado durante a chamada ao provedor. Nunca arma o próximo passo nesse caso.
  if(!await conferirAcompanhamento_(env,id))return {status:enviouMensagem?'enviada':'cancelada',erro:'Cliente respondeu; próximos passos cancelados.',texto:textoEnviado||undefined};
  const em=new Date(Math.max(ms,Date.now())).toISOString();
  if(a.tipo==='lembrete'){
    let quando;try{quando=somarMinutosUteis_(Math.max(ms,Date.parse(em)),120,cfg.expediente,cfg.feriados);if(Date.parse(quando)>Date.parse(plano.criado_em)+60*DIA_MS_)throw Error('Prazo muito longo.');}catch(_){return {status:'falhou',erro:'Lembrete enviado. Confira o expediente para definir o encerramento.',texto:textoEnviado};}
    await env.DB.batch([
      env.DB.prepare("UPDATE msg_agenda SET status='enviada',erro='',enviado_em=?,texto=? WHERE id=? AND status='enviando'").bind(em,textoEnviado,a.id),
      env.DB.prepare("INSERT INTO msg_agenda(conversa_id,texto,quando,autor,whats,criado_em,tipo,acompanhamento,auth_ref) SELECT conversa_id,texto_final,?,autor,whats,?,'encerrar',id,auth_ref FROM msg_acompanhamento WHERE id=? AND status='ativo' AND etapa='lembrete'").bind(quando,em,id),
      env.DB.prepare("UPDATE msg_acompanhamento SET etapa='encerrar',quando=?,lembrete_em=?,atualizado_em=? WHERE id=? AND status='ativo' AND etapa='lembrete'").bind(quando,em,em,id)
    ]);
    return {status:'enviada',erro:'',texto:textoEnviado};
  }
  const encerrou=await finalizarAcompanhamento_(env,{...a,entrada_ref:plano.entrada_ref,erroFinal:avisoFinal},em);
  return {status:encerrou?(avisoFinal?'falhou':'enviada'):'cancelada',erro:encerrou?avisoFinal:'Cliente respondeu ou atendimento já encerrado.',texto:textoEnviado||undefined};
}
/** Valida o pedido de agendamento. Devolve [erro] ou [null, {texto, quando}]. */
export function validarAgenda_(d, agoraMs) {
  const texto = String(d && d.texto != null ? d.texto : '').replace(/\r\n/g, '\n').trim();
  const anexo=String(d?.anexo||'');
  if(anexo&&!MSG_ANEXO_RE_.test(anexo))return ['Anexo inválido. Escolha o arquivo novamente.'];
  if (!texto&&!anexo) return ['Escreva a mensagem ou escolha um anexo antes de agendar.'];
  if (texto.length > 1000) return ['A mensagem agendada aceita até 1000 letras. Divida em duas.'];
  const t = Date.parse(String((d && d.quando) || '')), n = agoraMs || Date.now();
  if (!d || !d.quando || isNaN(t)) return ['Escolha o dia e a hora do envio.'];
  if (t <= n + 30000) return ['Esse horário já passou. Escolha um horário no futuro.'];
  if (t > n + AGENDA_MAX_DIAS_ * 86400000) return ['Dá para agendar no máximo ' + AGENDA_MAX_DIAS_ + ' dias à frente.'];
  return [null, { texto: texto, quando: new Date(t).toISOString(),anexo }];
}
export async function agendasDaConversa_(env, conversa) {
  const pendentes = (await env.DB.prepare("SELECT " + AGENDA_COLS_ + " FROM msg_agenda WHERE conversa_id=? AND status IN ('pendente','enviando') ORDER BY quando, id LIMIT 50").bind(conversa).all()).results || [];
  const historico = (await env.DB.prepare("SELECT " + AGENDA_COLS_ + " FROM msg_agenda WHERE conversa_id=? AND status IN ('enviada','falhou','cancelada') ORDER BY COALESCE(NULLIF(enviado_em,''),quando) DESC, id DESC LIMIT 10").bind(conversa).all()).results || [];
  return { pendentes: pendentes, historico: historico };
}
async function painelAgenda_(env,req,url){
  const q=url.searchParams,estado=q.get('status')||'pendentes',canal=q.get('canal')||'todos',tipo=q.get('tipo')||'todos';
  if(!['pendentes','enviada','falhou','cancelada','todas'].includes(estado)||!['todos',...MSG_CANAIS].includes(canal)||!['todos','manual','lembrete','encerrar'].includes(tipo))throw Object.assign(Error('Confira os filtros dos agendamentos.'),{codigo:400});
  const partes=['1=1'],args=[],asc=estado==='pendentes';
  if(estado==='pendentes')partes.push("a.status IN ('pendente','enviando')");else if(estado!=='todas'){partes.push('a.status=?');args.push(estado);}
  if(canal!=='todos'){partes.push('msg_conversa.canal=?');args.push(canal);}
  if(tipo!=='todos'){partes.push('a.tipo=?');args.push(tipo);}
  if(q.get('minhas')==='1'){
    const d=(req.headers.get('X-TK-Whats')||'').replace(/\D/g,'');
    partes.push("(CASE WHEN length(a.whats)>=12 AND substr(a.whats,1,2)='55' THEN substr(a.whats,3) ELSE a.whats END)=?");args.push(d.length>=12&&d.startsWith('55')?d.slice(2):d);
  }
  const busca=String(q.get('busca')||'').trim().slice(0,120);
  if(busca){partes.push('('+MSG_NOME_SQL_+" LIKE ? OR msg_conversa.contato LIKE ? OR a.texto LIKE ? OR a.anexo_nome LIKE ? OR a.autor LIKE ?)");args.push(...Array(5).fill('%'+busca+'%'));}
  for(const [campo,sinal] of [['de','>='],['ate','<=']]){
    const v=q.get(campo);if(!v)continue;
    if(!dataValidaExpediente_(v))throw Object.assign(Error('Confira o período dos agendamentos.'),{codigo:400});
    partes.push('a.quando'+sinal+'?');args.push(new Date(v+(campo==='de'?'T00:00:00.000-03:00':'T23:59:59.999-03:00')).toISOString());
  }
  // Datas são armazenadas em UTC; o fim do dia de Fortaleza vira 02:59:59Z do dia seguinte.
  const ate=q.get('ate');
  if(q.get('de')&&ate&&q.get('de')>ate)throw Object.assign(Error('A data inicial precisa vir antes da final.'),{codigo:400});
  const cursor=q.get('cursor');
  if(cursor){let c;try{c=JSON.parse(atob(cursor));}catch(_){throw Object.assign(Error('Atualize a lista de agendamentos.'),{codigo:400});}
    if(!Number.isSafeInteger(c.id)||c.id<1||typeof c.quando!=='string'||!/^\d{4}-\d\d-\d\dT/.test(c.quando)||!Number.isFinite(Date.parse(c.quando)))throw Object.assign(Error('Atualize a lista de agendamentos.'),{codigo:400});
    const sinal=asc?'>':'<';partes.push('(a.quando'+sinal+'? OR (a.quando=? AND a.id'+sinal+'?))');args.push(c.quando,c.quando,c.id);
  }
  const ordem=asc?'ASC':'DESC',rs=(await env.DB.prepare("SELECT a.id,a.conversa_id,a.texto,a.quando,a.autor,a.status,a.erro,a.criado_em,a.enviado_em,a.tipo,a.acompanhamento,a.anexo_nome,a.anexo_mime,CASE WHEN a.anexo<>'' THEN 1 ELSE 0 END AS tem_anexo,msg_conversa.canal,msg_conversa.contato,"+MSG_NOME_SQL_+' AS nome FROM msg_agenda a JOIN msg_conversa ON msg_conversa.id=a.conversa_id WHERE '+partes.join(' AND ')+' ORDER BY a.quando '+ordem+',a.id '+ordem+' LIMIT 31').bind(...args).all()).results||[];
  const mais=rs.length>30,itens=rs.slice(0,30),ultimo=itens.at(-1);
  return {ok:true,agendamentos:itens,temMais:mais,proximo:mais?btoa(JSON.stringify({id:ultimo.id,quando:ultimo.quando})):''};
}
/** Roda a cada minuto: envia até 5 agendadas vencidas. Marca "enviando" antes (nunca sai duas vezes) e usa o mesmo envio do POST /msg/enviar. */
export async function processarAgenda_(env, agoraMs) {
  await iniciar(env);
  const ms=agoraMs||Date.now(),t=new Date(ms).toISOString();
  await renovarAutorizacoesAgenda_(env,ms);
  await env.DB.prepare("UPDATE msg_agenda SET status='falhou',erro=? WHERE status='enviando' AND COALESCE(NULLIF(processando_em,''),quando)<?").bind('Ficou sem confirmação. Confira na conversa antes de mandar de novo.',new Date(ms-10*60000).toISOString()).run();
  await env.DB.prepare("UPDATE msg_acompanhamento SET status='falhou',atualizado_em=?,erro='Uma etapa ficou sem confirmação. Confira a conversa.' WHERE status='ativo' AND EXISTS(SELECT 1 FROM msg_agenda WHERE acompanhamento=msg_acompanhamento.id AND status='falhou')").bind(t).run();
  const rs=(await env.DB.prepare("SELECT * FROM msg_agenda WHERE status='pendente' AND quando<=? ORDER BY quando,id LIMIT 5").bind(t).all()).results||[];
  const entradaPendente=rs.some(a=>a.acompanhamento)&&!!(await env.MIDIA.list({prefix:MSG_ENTRADA_PREFIXO_+'recebidas/',limit:1})).objects.length;
  let enviadas=0;
  for(const a of rs){
    const trava=await env.DB.prepare("UPDATE msg_agenda SET status='enviando',processando_em=?,tentativas=tentativas+1 WHERE id=? AND status='pendente'").bind(t,a.id).run();
    if(Number(trava.meta?.changes)!==1)continue;
    let resultado={status:'falhou',erro:'Não foi possível confirmar o envio.'};
    try{
      let autorizacao={ok:true};
      if(a.auth_ref)autorizacao=await autorizacaoAgenda_(env,a.auth_ref,!!a.acompanhamento);
      if(a.acompanhamento&&entradaPendente){resultado={status:'pendente',quando:new Date(ms+60000).toISOString(),erro:'Aguardando mensagens já recebidas antes de acompanhar.'};
      }else if(!autorizacao.ok){
        resultado=autorizacao.temporario&&Number(a.tentativas)<11?{status:'pendente',quando:new Date(ms+5*60000).toISOString(),erro:autorizacao.erro}:{status:'falhou',erro:autorizacao.erro};
      }else if(a.acompanhamento){resultado=await processarEtapaAcompanhamento_(env,a,ms);
      }else{
        const [,corpo]=await responderMensagem_(env,a.whats||'',{conversa:a.conversa_id,texto:a.texto,anexo:a.anexo||'',idLocal:'agenda-'+String(a.id).padStart(6,'0'),_janelaAutomatica:!!a.auth_ref});
        resultado=corpo?.ok?{status:'enviada',erro:''}:{status:'falhou',erro:String(corpo?.erro||'Não foi possível enviar.').slice(0,200)};
      }
    }catch(_){resultado={status:'falhou',erro:'Uma etapa ficou sem confirmação. Confira a conversa antes de tentar novamente.'};}
    const em=new Date(Math.max(ms,Date.now())).toISOString();
    await env.DB.prepare("UPDATE msg_agenda SET status=?,erro=?,enviado_em=?,quando=COALESCE(?,quando),texto=COALESCE(?,texto) WHERE id=? AND status='enviando'").bind(resultado.status,resultado.erro||'',resultado.status==='enviada'?em:'',resultado.quando||null,resultado.texto??null,a.id).run();
    if(resultado.status==='enviada'&&(a.tipo!=='encerrar'||resultado.texto&&!resultado.erro))enviadas++;
    if(a.acompanhamento){
      if(resultado.status==='falhou')await env.DB.prepare("UPDATE msg_acompanhamento SET status='falhou',erro=?,atualizado_em=? WHERE id=? AND status='ativo'").bind(resultado.erro,em,a.acompanhamento).run();
      else if(resultado.quando)await env.DB.prepare("UPDATE msg_acompanhamento SET quando=?,atualizado_em=? WHERE id=? AND status='ativo'").bind(resultado.quando,em,a.acompanhamento).run();
    }else if(resultado.status==='enviada'&&a.autor){await env.DB.prepare("UPDATE msg_conversa SET dono=? WHERE id=? AND (dono IS NULL OR dono='')").bind(a.autor,a.conversa_id).run();}
    await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=?').bind(em,a.conversa_id).run();
    await notificarNovidade_(env);
  }
  return {vistas:rs.length,enviadas};
}

/** Detecta o tipo real do arquivo pelos primeiros bytes (nunca confia no nome nem no tipo declarado). */
function detectarAnexo_(buf, tipoPedido) {
  const u = new Uint8Array(buf, 0, Math.min(buf.byteLength, 32)), eq = (i, t) => t.split('').every((c, k) => u[i + k] === c.charCodeAt(0));
  if (tipoPedido === 'imagem') {
    if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'image/jpeg';
    if (u[0] === 0x89 && eq(1, 'PNG')) return 'image/png';
    if (eq(0, 'RIFF') && eq(8, 'WEBP')) return 'image/webp';
    return '';
  }
  if (tipoPedido === 'vídeo') { if (eq(4, 'ftyp')) return eq(8, 'qt') ? 'video/quicktime' : 'video/mp4'; return ''; }
  if (tipoPedido === 'áudio') {
    if (eq(0, 'OggS')) return 'audio/ogg';
    if (eq(0, 'ID3') || (u[0] === 0xFF && (u[1] & 0xE0) === 0xE0)) return 'audio/mpeg';
    if (eq(4, 'ftyp')) return 'audio/mp4';
    if (u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) return 'audio/webm';
    if (eq(0, 'RIFF') && eq(8, 'WAVE')) return 'audio/wav';
    if (eq(0, '#!AMR')) return 'audio/amr';
  }
  return '';
}
const MSG_ANEXO_MAX_ = { 'imagem': 8 * 1048576, 'vídeo': 15000000, 'áudio': 16 * 1048576 };
async function receberAnexo_(env, req, url) {
  const tipo = String(url.searchParams.get('tipo') || '');
  if (!MSG_ANEXO_MAX_[tipo]) return [400, { ok: false, erro: 'Escolha foto, vídeo ou áudio.' }];
  const declarado = Number(req.headers.get('Content-Length') || 0);
  if (declarado > MSG_ANEXO_MAX_[tipo]) return [413, { ok: false, erro: 'Arquivo grande demais (' + (tipo === 'imagem' ? 'foto: até 8 MiB' : tipo==='vídeo'?'vídeo: até 15 MB':'áudio: até 16 MiB') + ').' }];
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return [400, { ok: false, erro: 'O arquivo veio vazio. Escolha de novo.' }];
  if (buf.byteLength > MSG_ANEXO_MAX_[tipo]) return [413, { ok: false, erro: 'Arquivo grande demais (' + (tipo === 'imagem' ? 'foto: até 8 MiB' : tipo==='vídeo'?'vídeo: até 15 MB':'áudio: até 16 MiB') + ').' }];
  const mime = detectarAnexo_(buf, tipo);
  if (!mime) return [415, { ok: false, erro: tipo === 'imagem' ? 'Use uma foto JPG, PNG ou WebP.' : tipo === 'vídeo' ? 'Use um vídeo MP4.' : 'Este áudio não é de um formato aceito (use MP3, OGG, M4A ou gravação do celular).' }];
  if (tipo === 'vídeo' && /hvc1|hev1/.test(new TextDecoder('latin1').decode(buf))) return [415, { ok: false, erro: 'Este vídeo está em H.265/HEVC e o WhatsApp pode recusar. Grave ou converta em MP4 H.264.' }];
  const chave = await guardarMidiaMsg_(env, buf, mime, 'out');     // out/ = o único prefixo de mensagens com leitura pública (a Wafly e a Meta abrem o link)
  return [200, { ok: true, anexo: chave, tipo: tipo, mime: mime, bytes: buf.byteLength }];
}
/* ---- exportação ---- */
const fusoLocal_ = (iso) => { const d = new Date(Date.parse(iso) - 3 * 3600000); return isNaN(d) ? '' : d.toISOString(); };       // Fortaleza (UTC-3, sem horário de verão)
const dataBR_ = (iso) => { const s = fusoLocal_(iso); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) + ' ' + s.slice(11, 16) : ''; };
function csvCelula_(v) { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function rotuloContato_(c) { if (c.nome) return c.nome; const n = String(c.contato || '').replace(/-group$|@g\.us$|@s\.whatsapp\.net$/g, ''); return /^\d{10,15}$/.test(n) ? '+' + n : (c.grupo ? 'Grupo ' + n : n); }
const ROTULO_STATUS_ = { enviada: 'enviada', entregue: 'entregue', lida: 'lida', incerta: 'sem confirmação' };
/** Mensagens (já em ordem por conversa e tempo) -> mesmas linhas com a demora da PRIMEIRA resposta da loja a cada pergunta do cliente. */
function comDemora_(linhas) {
  let conv = null, aberto = null;
  for (const m of linhas) {
    if (m.conversa_id !== conv) { conv = m.conversa_id; aberto = null; }
    m.demora_min = '';
    if (m.direcao === 'entrada') { if (aberto === null) aberto = Date.parse(m.enviada_em); }
    else if (aberto !== null && m.por !== 'auto') { m.demora_min = Math.max(0, Math.round((Date.parse(m.enviada_em) - aberto) / 60000)); aberto = null; }
  }
  return linhas;
}
async function exportarMensagens_(env, q) {
  const onde = [], args = [];
  const conversa = Number(q.conversa) || 0, canal = String(q.canal || '');
  if (conversa) { onde.push('c.id=?'); args.push(conversa); } else if (canal) { if (!MSG_CANAIS.includes(canal)) return { erro: 'Escolha Instagram, WhatsApp 1 ou WhatsApp 2.' }; onde.push('c.canal=?'); args.push(canal); }
  const dia = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  if (dia(q.de)) { onde.push('m.enviada_em>=?'); args.push(dia(q.de) + 'T03:00:00.000Z'); }
  if (dia(q.ate)) { onde.push('m.enviada_em<?'); args.push(new Date(Date.parse(dia(q.ate) + 'T03:00:00.000Z') + 86400000).toISOString()); }
  const LIM = 20000;
  const rs = await env.DB.prepare('SELECT m.id, m.conversa_id, m.canal, m.direcao, m.tipo, m.texto, m.enviada_em, m.status, m.por, m.autor_nome, m.autor_fone, c.contato, ' + MSG_NOME_SQL_.replace(/msg_conversa/g,'c') + ' AS nome, c.grupo FROM msg_mensagem m JOIN msg_conversa c ON c.id=m.conversa_id' + (onde.length ? ' WHERE ' + onde.join(' AND ') : '') + ' ORDER BY m.conversa_id, m.enviada_em, m.id LIMIT ' + (LIM + 1)).bind(...args).all();
  let linhas = rs.results; const cortou = linhas.length > LIM; if (cortou) linhas = linhas.slice(0, LIM);
  // v2.9: em grupo, "quem" é o nome (ou número) de quem mandou; nas conversas individuais continua "cliente"
  const autorDe_ = (m) => (m.grupo && (m.autor_nome || m.autor_fone)) ? (m.autor_nome || '+' + m.autor_fone) : '';
  comDemora_(linhas);
  const formato = ['csv', 'txt', 'json'].includes(q.formato) ? q.formato : 'csv', hoje = fusoLocal_(agora()).slice(0, 10).replace(/-/g, '');
  const escopo = conversa ? 'conversa-' + conversa : (canal || 'todos-os-canais');
  const nome = 'tenkiter-mensagens-' + escopo + '-' + hoje + '.' + formato;
  let corpo, tipo;
  if (formato === 'csv') {
    const cab = ['canal', 'conversa', 'contato', 'nome', 'grupo', 'data_hora', 'quem', 'tipo', 'texto', 'status', 'enviado_por_final', 'demora_primeira_resposta_min'];
    corpo = '﻿' + cab.join(';') + '\r\n' + linhas.map((m) => [MSG_NOME_CANAL_[m.canal] || m.canal, m.conversa_id, m.contato, m.nome, m.grupo ? 'sim' : 'não', dataBR_(m.enviada_em), m.direcao === 'saida' ? 'loja' : (autorDe_(m) || 'cliente'), m.tipo, m.texto, m.direcao === 'saida' ? (ROTULO_STATUS_[m.status] || m.status || '') : '', m.por || '', m.demora_min].map(csvCelula_).join(';')).join('\r\n') + (linhas.length ? '\r\n' : '');
    tipo = 'text/csv; charset=utf-8';
  } else if (formato === 'json') {
    const porConv = new Map();
    for (const m of linhas) { if (!porConv.has(m.conversa_id)) porConv.set(m.conversa_id, { conversa: m.conversa_id, canal: MSG_NOME_CANAL_[m.canal] || m.canal, contato: m.contato, nome: m.nome, grupo: !!m.grupo, mensagens: [] }); porConv.get(m.conversa_id).mensagens.push({ data_hora: dataBR_(m.enviada_em), iso: m.enviada_em, quem: m.direcao === 'saida' ? (m.por === 'auto' ? 'loja (automática)' : 'loja') : (autorDe_(m) || 'cliente'), tipo: m.tipo, texto: m.texto, status: m.direcao === 'saida' ? (m.status || '') : undefined, demora_primeira_resposta_min: m.demora_min === '' ? undefined : m.demora_min }); }
    corpo = JSON.stringify({ exportado_em: agora(), fuso: 'America/Fortaleza (UTC-3)', cortado: cortou, conversas: Array.from(porConv.values()) }, null, 1); tipo = 'application/json; charset=utf-8';
  } else {
    const partes = []; let atual = null;
    for (const m of linhas) {
      if (m.conversa_id !== atual) { atual = m.conversa_id; partes.push((partes.length ? '\n' : '') + '=== ' + (MSG_NOME_CANAL_[m.canal] || m.canal) + ' · ' + rotuloContato_(m) + (m.grupo ? ' (grupo)' : '') + ' ===') ; }
      const quem = m.direcao === 'saida' ? (m.por === 'auto' ? 'Loja (automática)' : 'Loja') + (m.demora_min !== '' ? ' (respondeu em ' + m.demora_min + ' min)' : '') : (autorDe_(m) || 'Cliente');
      partes.push('[' + dataBR_(m.enviada_em) + '] ' + quem + ': ' + ((m.texto || '') + (m.tipo && m.tipo !== 'texto' ? (m.texto ? ' ' : '') + '[' + m.tipo + ']' : '')).replace(/\n/g, '\n    '));
    }
    corpo = '﻿# Conversas da TENKiTER Modas (horário de Fortaleza)\n# "Cliente" = quem escreveu para a loja; "Loja" = respostas da equipe.\n\n' + partes.join('\n') + '\n'; tipo = 'text/plain; charset=utf-8';
  }
  return { corpo: corpo, tipo: tipo, nome: nome, cortado: cortou, total: linhas.length };
}
/* ---- métricas de atendimento (base para a auditoria) ---- */
/* ---------------------------------------------------------------------------
 * v2.14 — Google Contatos pela "ponte" (contatos-ponte-*.gs.txt, publicada pelo Pablo na conta dos contatos).
 * Esta fase só LÊ: cópia de segurança (no Drive daquela conta) e relatório da primeira limpeza. Nada muda no Google sem aprovação.
 * O endereço e a chave da ponte ficam só aqui no servidor (cfg); a tela só sabe se está ligada.
 * ------------------------------------------------------------------------- */
const PONTE_URL_RE_ = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
async function ponte_(env, corpo, cfgTeste) {
  const url = cfgTeste ? cfgTeste.url : await cfgGet(env, 'contatos_url'), chave = cfgTeste ? cfgTeste.chave : await cfgGet(env, 'contatos_chave');
  if (!url || !chave) return { ok: false, erro: 'A ponte do Google Contatos ainda não foi ligada.' };
  let r;
  try { r = await fetch(url, { method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(90000), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, corpo, { chave: chave })) }); }
  catch (e) { return { ok: false, erro: 'A ponte do Google Contatos não respondeu agora. Tente de novo.' }; }
  const txt = await r.text();
  try { const j = JSON.parse(txt); return j && typeof j === 'object' ? j : { ok: false, erro: 'Resposta estranha da ponte.' }; }
  catch (e) { return { ok: false, erro: 'A ponte respondeu uma página em vez de dados. Confira se a implantação está como "App da Web", executar como "Eu" e acesso "Qualquer pessoa".' }; }
}
/** Número -> forma única. Brasil: 55 + DDD + número; aceita sem 55, com zero na frente e com máscara. */
function foneNormal_(bruto) {
  const s = String(bruto || '').trim(), mais = s.indexOf('+') === 0;
  let d = s.replace(/\D/g, '');
  if (!d) return { ok: false, motivo: 'vazio' };
  if (!mais) { d = d.replace(/^00/, ''); if (d.length >= 11 && d.length <= 12 && d.charAt(0) === '0') d = d.slice(1); if (d.length === 10 || d.length === 11) d = '55' + d; else if (d.length === 9 && d.charAt(0) === '9') d = '5588' + d; }   // v2.16: 9 dígitos sem DDD = DDD 88 da loja (aprovado pelo Pablo)
  // celular antigo de 8 dígitos (6 a 9 na frente) ganha o 9; fixo (2 a 5) fica com 8
  if (/^55[1-9][1-9][6-9]\d{7}$/.test(d)) d = d.slice(0, 4) + '9' + d.slice(4);
  const br = /^55[1-9][1-9](9\d{8}|[2-5]\d{7})$/.test(d);
  if (br) return { ok: true, d: d, chave: d.length === 13 ? d.slice(0, 4) + d.slice(5) : d, br: true };
  if (mais && d.length >= 8 && d.length <= 15 && d.indexOf('55') !== 0) return { ok: true, d: d, chave: d, br: false };
  return { ok: false, motivo: 'inválido', d: d };
}
async function relatorioContatos_(env) {
  const atual=await contatosR2Atual_(env);if(atual){if(atual.m.status==='pronto'&&atual.m.relatorio)return {ok:true,...atual.m.relatorio};return {ok:false,erro:'Já existe um relatório em andamento. Continue a leitura por etapas ou faça uma nova cópia de segurança antes de reiniciar.'};}
  const contatos = []; let pagina = '', voltas = 0, conta = '';
  do {
    const r = await ponte_(env, { acao: 'listar', pagina: pagina || undefined });
    if (!r.ok) return r;
    (r.contatos || []).forEach((c) => contatos.push(c));
    pagina = r.proxima || ''; voltas++;
  } while (pagina && voltas < 60);
  return montarRelatorioContatos_(env, contatos);
}
/* v2.15: relatório em etapas para contas grandes (15 mil+ contatos): cada chamada lê UMA página da ponte e guarda
 * só nome/telefones/e-mails em msg_contatos_tmp; a etapa "fim" monta o relatório e limpa a tabela. */
/* Staging de contatos em R2 privado. Manter `msg_contatos_tmp` e `msg_contatos_plano`
 * para leituras de operações iniciadas antes deste deploy; nenhuma migração apaga essas linhas. */
const CONTATOS_R2_PREFIX_ = 'privado/contatos/staging/';
const CONTATOS_R2_PTR_ = 'contatos_r2_ativo';
const CONTATOS_R2_CHUNK_ = 100;
function contatosR2IdValido_(id) { return /^[a-f0-9-]{20,64}$/.test(String(id || '')); }
function contatosR2ManifestValido_(m,id) {
  if(!m||m.v!==1||m.id!==id||!['lendo','pronto'].includes(m.status)||typeof m.backup!=='string'||typeof m.cursor!=='string'||typeof m.completo!=='boolean'||!Number.isSafeInteger(m.paginas)||m.paginas<0||!Number.isSafeInteger(m.lidos)||m.lidos<0||!Number.isSafeInteger(m.total)||m.total<0||!m.plano||typeof m.plano.pronto!=='boolean'||!Number.isSafeInteger(m.plano.dup)||m.plano.dup<0||!Number.isSafeInteger(m.plano.novos)||m.plano.novos<0||!Number.isSafeInteger(m.plano.dupPaginas)||!Number.isSafeInteger(m.plano.novoPaginas)||!m.limpeza||typeof m.limpeza!=='object')return false;
  if(m.plano.dupPaginas!==Math.ceil(m.plano.dup/CONTATOS_R2_CHUNK_)||m.plano.novoPaginas!==Math.ceil(m.plano.novos/CONTATOS_R2_CHUNK_))return false;
  if((m.status==='pronto')!==m.plano.pronto||m.completo&&(!m.paginas||m.cursor!==''))return false;
  if(m.paginas===0?m.ultima!==null:!m.ultima||typeof m.ultima.entrada!=='string'||typeof m.ultima.saida!=='string')return false;
  return true;
}
function contatosR2Base_(id) { return CONTATOS_R2_PREFIX_ + id + '/'; }
function contatosR2ManifestKey_(id) { return contatosR2Base_(id) + 'manifest.json'; }
function contatosR2ChunkKey_(id, area, tipo, n) { return contatosR2Base_(id) + area + '/' + (tipo ? tipo + '/' : '') + String(n).padStart(8, '0') + '.json'; }
async function contatosR2GetJson_(env, key) {
  const o = await env.MIDIA.get(key); if (!o) return null;
  if(o.size>4*1024*1024)throw Error('Uma parte do relatório excedeu o tamanho permitido. Refaça o relatório em partes menores.');
  try { return { obj: o, value: JSON.parse(new TextDecoder().decode(await o.arrayBuffer())) }; } catch (_) { throw new Error('Dados temporários de contatos inválidos.'); }
}
async function contatosR2PutNewJson_(env, key, value) {
  const body = JSON.stringify(value);
  const put = await env.MIDIA.put(key, body, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
  if (put) return true;
  const old = await contatosR2GetJson_(env, key);
  if (!old || JSON.stringify(old.value) !== JSON.stringify(value)) throw new Error('Não foi possível gravar os dados temporários de contatos.');
  return false;
}
async function contatosR2CasJson_(env, key, value, etag) {
  const o = await env.MIDIA.put(key, JSON.stringify(value), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
  return !!o;
}
async function contatosR2Atual_(env) {
  const raw=await cfgGet(env,CONTATOS_R2_PTR_);if(raw===null||raw===undefined)return null;
  let p;try{p=JSON.parse(raw);}catch(_){throw new Error('Não consegui retomar o relatório salvo. Peça ao administrador para verificar.');}
  if(!p||!contatosR2IdValido_(p.id))throw new Error('Não consegui retomar o relatório salvo. Peça ao administrador para verificar.');
  const got=await contatosR2GetJson_(env,contatosR2ManifestKey_(p.id));
  if(!got||!contatosR2ManifestValido_(got.value,p.id))throw new Error('Não consegui abrir o relatório salvo. Tente novamente ou peça ao administrador para verificar.');
  return {id:p.id,obj:got.obj,m:got.value};
}
async function contatosR2Novo_(env) {
  const anterior=await cfgGet(env,CONTATOS_R2_PTR_);let existente=null;
  if(anterior!==null&&anterior!==undefined) { try { const p=JSON.parse(anterior); if(!p||!contatosR2IdValido_(p.id))throw 0; existente=await contatosR2Atual_(env); } catch(_) { throw new Error('Não consegui retomar o relatório salvo. Peça ao administrador para verificar.'); } }
  const id=crypto.randomUUID().toLowerCase(),bk=JSON.parse((await cfgGet(env,'contatos_backup'))||'null');
  if(existente&&existente.m.status==='lendo'&&existente.m.backup===(bk&&bk.em||''))throw new Error('Já existe um relatório em andamento para este backup. Conclua-o ou faça um backup novo antes de reiniciar.');
  const m={v:1,id:id,status:'lendo',criado:agora(),backup:bk&&bk.em||'',cursor:'',completo:false,paginas:0,lidos:0,total:0,ultima:null,plano:{pronto:false,dup:0,novos:0,dupPaginas:0,novoPaginas:0},limpeza:{}};
  if(!await contatosR2CasJson_(env,contatosR2ManifestKey_(id),m,''))throw new Error('Não foi possível guardar o início do relatório. Tente novamente.');
  const valor=JSON.stringify({id:id}),sql=anterior===null||anterior===undefined||anterior===''?'INSERT OR IGNORE INTO cfg (chave,valor) VALUES (?,?)':'UPDATE cfg SET valor=? WHERE chave=? AND valor=?';
  const r=anterior===null||anterior===undefined?await env.DB.prepare(sql).bind(CONTATOS_R2_PTR_,valor).run():await env.DB.prepare(sql).bind(valor,CONTATOS_R2_PTR_,anterior).run();
  if(!(r.meta&&r.meta.changes===1))throw new Error('Outro relatório de contatos começou ao mesmo tempo. Recarregue a etapa antes de continuar.');
  return await contatosR2Atual_(env);
}
async function contatosR2Salvar_(env, atual, m) {
  if (!await contatosR2CasJson_(env, contatosR2ManifestKey_(atual.id), m, atual.obj.etag)) return false;
  return true;
}
async function contatosR2LimparPtr_(env,id) {
  const raw=await cfgGet(env,CONTATOS_R2_PTR_);if(raw===null||raw===undefined)return true;
  let p;try{p=JSON.parse(raw);}catch(_){throw new Error('Ponteiro privado de contatos inválido; não será limpo.');}
  if(!p||p.id!==id)return false;
  const r=await env.DB.prepare('DELETE FROM cfg WHERE chave=? AND valor=?').bind(CONTATOS_R2_PTR_,raw).run();
  return !!(r.meta&&r.meta.changes===1);
}
async function contatosR2Parte_(env, atual, cursor) {
  const m=atual.m;
  if(m.ultima&&cursor===m.ultima.entrada)return {ok:true,lidos:m.lidos,total:m.total,proxima:m.ultima.saida};
  if(m.completo||m.status!=='lendo')return {conflito:true};
  if(cursor!==m.cursor)return {conflito:true};
  const key=contatosR2ChunkKey_(atual.id,'relatorio','',m.paginas);let page=await contatosR2GetJson_(env,key);
  if(!page){const r=await ponte_(env,{acao:'listar',pagina:cursor||undefined});if(!r.ok)return r;
    const contatos=(Array.isArray(r.contatos)?r.contatos:[]).filter(c=>c&&c.r).map(c=>({r:String(c.r).slice(0,80),n:String(c.n||'').slice(0,120),f:(Array.isArray(c.f)?c.f:[]).slice(0,10),m:(Array.isArray(c.m)?c.m:[]).slice(0,5)}));
    page={value:{entrada:cursor,saida:String(r.proxima||''),total:Number(r.total)||0,contatos:contatos}};await contatosR2PutNewJson_(env,key,page.value);
  }
  if(page.value.entrada!==cursor||!Array.isArray(page.value.contatos))throw new Error('Cursor ou conteúdo da página de contatos inválido.');
  const saida=String(page.value.saida||''),next=Object.assign({},m,{cursor:saida,completo:!saida,paginas:m.paginas+1,lidos:m.lidos+page.value.contatos.length,total:Number(page.value.total)||m.total,ultima:{entrada:cursor,saida:saida}});
  if(!await contatosR2Salvar_(env,atual,next)){const latest=await contatosR2Atual_(env);if(latest&&latest.m.ultima&&latest.m.ultima.entrada===cursor)return {ok:true,lidos:latest.m.lidos,total:latest.m.total,proxima:latest.m.ultima.saida};throw new Error('O relatório foi atualizado em outra tela. Repita esta etapa.');}
  return {ok:true,lidos:next.lidos,total:next.total,proxima:next.cursor};
}
async function contatosR2LerRelatorio_(env, atual) {
  const out = [], vistos = new Map();
  for (let i=0; i<atual.m.paginas; i++) {
    const got = await contatosR2GetJson_(env, contatosR2ChunkKey_(atual.id, 'relatorio', '', i));
    if (!got) throw new Error('Falta uma parte do relatório temporário.');
    for (const c of got.value.contatos || []) vistos.set(c.r, c);
  }
  out.push(...vistos.values()); return out;
}
async function contatosR2PlanSlice_(env, atual, tipo, desde, limite) {
  if(!['dup','novo'].includes(tipo))throw new Error('Tipo de plano inválido.');
  const count=Number(tipo==='dup'?atual.m.plano.dup:atual.m.plano.novos);
  if(!Number.isSafeInteger(count)||count<0)throw new Error('Contagem do plano inválida.');
  const nDesde=Number(desde)||0;if(!Number.isSafeInteger(nDesde)||nDesde<0)throw new Error('Cursor do plano inválido.');const inicio=nDesde,fim=Math.min(count,inicio+(limite||100)),out=[];
  for(let n=inicio;n<fim;){
    const seq=Math.floor(n/CONTATOS_R2_CHUNK_),off=n%CONTATOS_R2_CHUNK_,esperado=Math.min(CONTATOS_R2_CHUNK_,count-seq*CONTATOS_R2_CHUNK_);
    const got=await contatosR2GetJson_(env,contatosR2ChunkKey_(atual.id,'plano',tipo,seq));
    if(!got||got.value.tipo!==tipo||!Array.isArray(got.value.dados)||got.value.dados.length!==esperado)throw new Error('Parte ausente ou inconsistente no plano de contatos.');
    const dados=got.value.dados;for(let i=off;i<dados.length&&n<fim;i++,n++)out.push(dados[i]);
  }
  if(out.length!==fim-inicio)throw new Error('Plano de contatos incompleto; cursor não avançado.');
  return {itens:out,total:count,proximo:fim<count?String(fim):''};
}
async function contatosR2CriarPlano_(env, atual, duplicados, semCadastro, relatorio) {
  const listas={ dup: duplicados, novo: semCadastro };
  for (const tipo of ['dup','novo']) {
    const a=listas[tipo];
    for(let i=0;i<a.length;i+=CONTATOS_R2_CHUNK_) await contatosR2PutNewJson_(env,contatosR2ChunkKey_(atual.id,'plano',tipo,Math.floor(i/CONTATOS_R2_CHUNK_)),{tipo:tipo,dados:a.slice(i,i+CONTATOS_R2_CHUNK_)});
  }
  const m=Object.assign({},atual.m,{plano:{pronto:true,dup:duplicados.length,novos:semCadastro.length,dupPaginas:Math.ceil(duplicados.length/CONTATOS_R2_CHUNK_),novoPaginas:Math.ceil(semCadastro.length/CONTATOS_R2_CHUNK_)},status:'pronto',relatorio:relatorio||atual.m.relatorio||null});
  if(!await contatosR2Salvar_(env,atual,m)) throw new Error('O relatório foi atualizado em outra tela. Reabra o relatório para continuar.');
}
async function contatosR2TemPlano_(env) { const a=await contatosR2Atual_(env); return a && a.m.plano && a.m.plano.pronto ? a : null; }
async function contatosR2ApagarJob_(env, id) {
  const prefix=contatosR2Base_(id); let cursor,voltas=0;
  do { const l=await env.MIDIA.list({prefix,cursor,limit:500}); const keys=(l.objects||[]).map(x=>x.key); if(keys.length) await env.MIDIA.delete(keys); cursor=l.truncated?l.cursor:null; if(++voltas>100) throw new Error('Limpeza do staging de contatos excedeu o limite.'); } while(cursor);
}
async function contatosR2ExpurgarOrfaos_(env, agoraMs, cursor) {
  // Se o ponteiro existe mas não pode ser lido/validado, falha fechado: não apagar nenhum objeto.
  const ativo=await contatosR2Atual_(env), corte=(agoraMs||Date.now())-7*86400000;
  const l=await env.MIDIA.list({prefix:CONTATOS_R2_PREFIX_,cursor:cursor||undefined,limit:200}),apagar=[];
  for(const o of l.objects||[]){const m=/^privado\/contatos\/staging\/([a-f0-9-]{20,64})\//.exec(o.key);if(!m||ativo&&m[1]===ativo.id)continue;const t=Date.parse(o.uploaded);if(Number.isFinite(t)&&t<corte)apagar.push(o.key);}
  if(apagar.length)await env.MIDIA.delete(apagar);
  return {apagados:apagar.length,cursor:l.truncated?String(l.cursor||''):''};
}
async function contatosR2Limpeza_(env, d, atual, acc, salvar) {
  const pendente=atual.m.limpeza&&atual.m.limpeza.joinPendente;
  if (d.etapa === 'juntar') {
    const lc=atual.m.limpeza||{},pgTotal=atual.m.plano.dup,rawDesde=Math.max(0,Number(d.desde)||0);
    if(lc.lastJoin&&Number(lc.lastJoin.entrada)===rawDesde){acc.juntados=Number(lc.juntados)||0;acc.apagados=Number(lc.apagados)||0;await salvar();return {ok:true,feito:lc.lastJoin.feito,total:pgTotal,proximo:lc.lastJoin.proximo};}
    if(pendente)return {ok:false,cod:409,erro:'O estado do lote externo é incerto. Faça novo backup e relatório para conferir o que já foi aplicado.'};
    let desde=rawDesde;if(!desde&&Number(lc.joinCursor)>0)desde=Number(lc.joinCursor);
    if(desde!==Number(lc.joinCursor||0))return {ok:false,cod:409,erro:'O cursor de junção mudou. Reabra a limpeza para retomar.'};
    acc.juntados=Number(lc.juntados)||0;acc.apagados=Number(lc.apagados)||0;acc._r2Job=atual.id;
    const pg=await contatosR2PlanSlice_(env,atual,'dup',desde,100),rs=pg.itens;
    if(!rs.length){await salvar();return {ok:true,feito:pgTotal,total:pgTotal,proximo:''};}
    const intento=crypto.randomUUID(),marcado=Object.assign({},atual.m,{limpeza:Object.assign({},lc,{joinPendente:{intento,entrada:desde,quantidade:rs.length,em:agora()}})});
    let reservado=false;try{reservado=await contatosR2Salvar_(env,atual,marcado);}catch(e){return {ok:false,cod:503,erro:'Não foi possível reservar o lote; nenhuma chamada à ponte foi feita.'};}if(!reservado){const latest=await contatosR2Atual_(env);if(latest&&latest.m.limpeza&&latest.m.limpeza.joinPendente)return {ok:false,cod:409,erro:'O estado do lote externo é incerto. Faça novo backup e relatório para conferir o que já foi aplicado.'};return {ok:false,cod:503,erro:'Não foi possível reservar o lote; nenhuma chamada à ponte foi feita.'};}
    let r;try{r=await ponte_(env,{acao:'juntar_lote',confirmar:true,grupos:rs.map(g=>({manter:g.manter,apagar:g.apagar}))});}catch(e){return {ok:false,cod:502,erro:'A resposta da ponte é incerta. Faça novo backup e relatório para conferir o que já foi aplicado.'};}
    if(!r.ok)return {ok:false,cod:502,erro:'A resposta da ponte é incerta. Faça novo backup e relatório para conferir o que já foi aplicado.'};
    let posterior;try{posterior=await contatosR2Atual_(env);}catch(e){return {ok:false,cod:503,erro:'A ponte respondeu, mas não consegui conferir a confirmação salva do lote. Faça novo backup e relatório para conferir o que já foi aplicado.'};}
    if(!posterior||!posterior.m.limpeza||!posterior.m.limpeza.joinPendente||posterior.m.limpeza.joinPendente.intento!==intento)return {ok:false,cod:409,erro:'O estado do lote externo é incerto. Faça novo backup e relatório para conferir o que já foi aplicado.'};
    const feito=desde+rs.length,proximo=feito<pgTotal?String(feito):'',jq=Number(r.feitos)||0,ap=Number(r.apagados)||0,base=posterior.m.limpeza;
    const {joinPendente,...semPendente}=base;
    const next=Object.assign({},posterior.m,{limpeza:Object.assign({},semPendente,{joinCursor:feito,juntados:(Number(base.juntados)||0)+jq,apagados:(Number(base.apagados)||0)+ap,lastJoin:{entrada:desde,feito,proximo,feitos:jq,apagados:ap}})});
    let salvo=false;try{salvo=await contatosR2Salvar_(env,posterior,next);}catch(e){return {ok:false,cod:503,erro:'A ponte respondeu, mas não consegui guardar a confirmação do lote. Faça novo backup e relatório para conferir o que já foi aplicado.'};}if(!salvo)return {ok:false,cod:503,erro:'A ponte respondeu, mas não consegui guardar a confirmação do lote. Faça novo backup e relatório para conferir o que já foi aplicado.'};
    acc.juntados=Number(next.limpeza.juntados)||0;acc.apagados=Number(next.limpeza.apagados)||0;await salvar();
    return {ok:true,feito,total:pgTotal,proximo};
  }
  if(pendente)return {ok:false,cod:409,erro:'O estado do lote externo é incerto. Faça novo backup e relatório para conferir o que já foi aplicado.'};
  if (d.etapa === 'padronizar') {
    const r=await ponte_(env,{acao:'padronizar_parte',pagina:typeof d.pagina==='string'&&d.pagina?d.pagina.slice(0,500):undefined});
    if(!r.ok)return {ok:false,cod:502,erro:r.erro==='Ação desconhecida.'?'A ponte precisa da versão 1.2 (contatos-ponte-1.2) para a limpeza.':r.erro};
    acc.padronizados=(acc.padronizados||0)+(Number(r.mudados)||0);acc.lidosPad=(d.pagina?(acc.lidosPad||0):0)+(Number(r.lidos)||0);await salvar();
    return {ok:true,feito:acc.lidosPad,total:Number(r.totalPessoas)||acc.lidosPad,proxima:String(r.proxima||'')};
  }
  if (d.etapa === 'criar') {
    if(!d.continuar){acc.criarTotal=0;let off=0;while(off<atual.m.plano.novos){const pg=await contatosR2PlanSlice_(env,atual,'novo',off,100);for(const n of pg.itens){await enfileirarContato_(env,n.canal,n.fone,n.nome);acc.criarTotal++;}off+=pg.itens.length;}}
    acc._r2Job=atual.id;const r=await processarFilaContatos_(env,15);if(!r.ok)return {ok:false,cod:502,erro:r.erro};
    const rest=(await env.DB.prepare("SELECT COUNT(*) n FROM msg_contatos_fila WHERE estado='pendente' AND tentativas<5").first()).n,total=Math.max(acc.criarTotal||0,rest);await salvar();
    return {ok:true,feito:total-rest,total:total,restantes:rest};
  }
  if(d.etapa==='fim'){
    const criados=(await env.DB.prepare("SELECT COUNT(*) n FROM msg_contatos_fila WHERE estado='feito'").first()).n;
    const res={em:agora(),juntados:acc.juntados||0,apagados:acc.apagados||0,padronizados:acc.padronizados||0,criados:criados};
    await cfgSet(env,'contatos_limpeza',JSON.stringify(res));await cfgSet(env,'contatos_limpeza_and',null);await cfgSet(env,'contatos_auto','1');
    // A limpeza concluída remove também eventual plano D1 legado; nenhuma linha é apagada na migração.
    await env.DB.prepare('DELETE FROM msg_contatos_plano').run();
    // Resumo/auto persistem antes de remover os dados pessoais temporários.
    const limpo=await contatosR2LimparPtr_(env,atual.id);if(limpo)try{await contatosR2ApagarJob_(env,atual.id);}catch(e){/* órfão privado será removido pelo expurgo limitado */}
    return Object.assign({ok:true,auto:true},res);
  }
  return {ok:false,cod:400,erro:'Etapa da limpeza inválida.'};
}

async function relatorioContatosEtapa_(env, d) {
  if (d.etapa === 'inicio') {
    try { await contatosR2Novo_(env); return {ok:true}; }
    catch(e){return {ok:false,erro:String(e.message||'Não foi possível iniciar o relatório.')};}
  }
  if (d.etapa === 'parte') {
    const cursor=typeof d.pagina==='string'?d.pagina.slice(0,500):'', a=await contatosR2Atual_(env);
    if(a) { try { const r=await contatosR2Parte_(env,a,cursor); return r.conflito?{ok:false,erro:'O cursor do relatório mudou. Reabra a etapa do relatório.'}:r; } catch(e) { return {ok:false,erro:String(e.message||'Falha ao gravar a etapa do relatório.')}; } }
    // Fallback para sessão começada antes deste deploy; conserva o cursor e as linhas D1 existentes.
    const r=await ponte_(env,{acao:'listar',pagina:cursor||undefined});if(!r.ok)return r;
    const lista=Array.isArray(r.contatos)?r.contatos:[],SQL_INS='INSERT OR REPLACE INTO msg_contatos_tmp (r,n,f,m) VALUES (?,?,?,?)';
    for(let i=0;i<lista.length;i+=100)await env.DB.batch(lista.slice(i,i+100).filter(c=>c&&c.r).map(c=>env.DB.prepare(SQL_INS).bind(String(c.r).slice(0,80),String(c.n||'').slice(0,120),JSON.stringify((Array.isArray(c.f)?c.f:[]).slice(0,10)),JSON.stringify((Array.isArray(c.m)?c.m:[]).slice(0,5)))));
    const lidos=(await env.DB.prepare('SELECT COUNT(*) n FROM msg_contatos_tmp').first()).n;return {ok:true,lidos:lidos,total:Number(r.total)||0,proxima:r.proxima||''};
  }
  if (d.etapa === 'fim') {
    const a=await contatosR2Atual_(env);
    if(a&&['lendo','pronto'].includes(a.m.status)) {
      if(a.m.status==='pronto'&&a.m.relatorio){try{await cfgSet(env,'contatos_relatorio',JSON.stringify(a.m.relatorio));}catch(e){/* snapshot R2 é fonte de recuperação */}return Object.assign({ok:true},a.m.relatorio);}
      if(!a.m.paginas||!a.m.completo||a.m.cursor) return {ok:false,erro:'O relatório ainda tem páginas pendentes.'};
      try {
        const contatos=await contatosR2LerRelatorio_(env,a),rel=await montarRelatorioContatos_(env,contatos);
        if(!rel.ok)return rel;
        const atual=await contatosR2Atual_(env);if(!atual||atual.m.status!=='pronto'||!atual.m.relatorio)throw new Error('Não consegui concluir o relatório com segurança. Tente concluir novamente.');
        return rel;
      } catch(e){return {ok:false,erro:String(e.message||'Não foi possível montar o relatório.')};}
    }
    // Fallback para relatório/plano D1 que já estavam em andamento antes do deploy.
    const rs=(await env.DB.prepare('SELECT r,n,f,m FROM msg_contatos_tmp').all()).results;
    const contatos=rs.map(x=>({r:x.r,n:x.n,f:JSON.parse(x.f||'[]'),m:JSON.parse(x.m||'[]')}));
    const rel=await montarRelatorioContatos_(env,contatos);if(rel.ok)await env.DB.prepare('DELETE FROM msg_contatos_tmp').run();return rel;
  }
  return {ok:false,erro:'Etapa do relatório inválida.'};
}
async function montarRelatorioContatos_(env, contatos) {
  const porChave = new Map(), invalidos = [], corrigir = []; let semFone = 0;
  for (const c of contatos) {
    const fs = Array.isArray(c.f) ? c.f : [];
    if (!fs.length) { semFone++; continue; }
    for (const f of fs) {
      const n = foneNormal_(f);
      if (!n.ok) { invalidos.push({ r: c.r, n: c.n, f: f }); continue; }
      if ('+' + n.d !== String(f).replace(/[^\d+]/g, '')) corrigir.push({ r: c.r, n: c.n, de: f, para: '+' + n.d });
      if (!porChave.has(n.chave)) porChave.set(n.chave, []);
      const g = porChave.get(n.chave); if (!g.some((x) => x.r === c.r)) g.push({ r: c.r, n: c.n, f: fs, m: c.m || [] });
    }
  }
  const duplicados = [...porChave.entries()].filter(([, g]) => g.length > 1).map(([chave, g]) => ({ chave: chave, contatos: g }));
  const conv = (await env.DB.prepare("SELECT id, canal, contato, nome, pessoa, ultima_em FROM msg_conversa WHERE grupo=0 AND canal IN ('whatsapp1','whatsapp2') AND total>0 ORDER BY ultima_em DESC LIMIT 5000").all()).results;
  const vistos = new Set(), semCadastro = [];
  for (const c of conv) {
    const n = foneNormal_('+' + c.contato); if (!n.ok || porChave.has(n.chave) || vistos.has(n.chave)) continue;
    vistos.add(n.chave); semCadastro.push({ conversa: c.id, canal: c.canal, nome: c.nome || '', fone: '+' + n.d, ultima: c.ultima_em });
  }
  const corta = (a) => a.slice(0, 500);
  const rel = { em: agora(), total: contatos.length, comFone: contatos.length - semFone, semFone: semFone,
    duplicados: { total: duplicados.length, contatosEnvolvidos: duplicados.reduce((t, g) => t + g.contatos.length, 0), lista: corta(duplicados) },
    corrigir: { total: corrigir.length, lista: corta(corrigir) }, invalidos: { total: invalidos.length, lista: corta(invalidos) },
    semCadastro: { total: semCadastro.length, lista: corta(semCadastro) } };
  await salvarPlanoContatos_(env, duplicados, semCadastro, rel);
  try { await cfgSet(env, 'contatos_relatorio', JSON.stringify(rel)); } catch (e) { const salvo=await contatosR2TemPlano_(env);if(!salvo?.m.relatorio)throw e; /* só o novo snapshot R2 permite retomar sem esta cópia */ }
  return Object.assign({ ok: true }, rel);
}
/* v2.16: plano completo da limpeza aprovada (o relatório guarda só 500 de cada lista).
 * Repetidos ligados entre si (um contato com dois números em dois grupos) viram um grupo só; fica o nome mais completo. */
async function salvarPlanoContatos_(env, duplicados, semCadastro, relatorio) {
  const pai=new Map(),dados=new Map(),raiz=x=>{while(pai.get(x)!==x){pai.set(x,pai.get(pai.get(x)));x=pai.get(x);}return x;};
  for(const g of duplicados)for(const c of g.contatos)if(!pai.has(c.r)){pai.set(c.r,c.r);dados.set(c.r,c);}
  for(const g of duplicados)for(let i=1;i<g.contatos.length;i++){const a=raiz(g.contatos[0].r),b=raiz(g.contatos[i].r);if(a!==b)pai.set(b,a);}
  const comp=new Map();for(const r of pai.keys()){const k=raiz(r);if(!comp.has(k))comp.set(k,[]);comp.get(k).push(dados.get(r));}
  const peso=c=>[String(c.n||'').trim().length,(c.f||[]).length+(c.m||[]).length];
  const grupos=[...comp.values()].filter(g=>g.length>1&&g.length<=11).map(g=>{const ord=g.slice().sort((a,b)=>{const pa=peso(a),pb=peso(b);return pb[0]-pa[0]||pb[1]-pa[1];});return {manter:ord[0].r,nome:ord[0].n||'',apagar:ord.slice(1).map(c=>c.r)};});
  const a=await contatosR2Atual_(env);
  if(a){if(a.m.status==='lendo'||a.m.status==='pronto'&&!a.m.relatorio){await contatosR2CriarPlano_(env,a,grupos,semCadastro,relatorio);return;}throw Error('O relatório já está pronto. Faça uma nova cópia de segurança para começar outro.');}
  // Chamada síncrona antiga ou leitura em andamento anterior ao deploy: preservar comportamento D1.
  await env.DB.prepare('DELETE FROM msg_contatos_plano').run();
  const SQL='INSERT INTO msg_contatos_plano (tipo,dados) VALUES (?,?)',linhas=grupos.map(g=>['dup',g]).concat(semCadastro.map(x=>['novo',x]));
  for(let i=0;i<linhas.length;i+=100)await env.DB.batch(linhas.slice(i,i+100).map(([t,d])=>env.DB.prepare(SQL).bind(t,JSON.stringify(d))));
}
const nomeTM_ = (nome, d) => {
  const n = String(nome || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const f = d && d.length >= 12 && d.indexOf('55') === 0 ? '(' + d.slice(2, 4) + ') ' + d.slice(4, -4) + '-' + d.slice(-4) : '+' + d;
  return 'TM Cliente ' + (n || f);
};
/** Fila do cadastro no Google: número novo de WhatsApp (ou da limpeza) vira "TM Cliente …" no marcador. Sem duplicar pela chave do número. */
async function enfileirarContato_(env, canal, fone, nome) {
  const n = foneNormal_(String(fone || '').indexOf('+') === 0 ? fone : '+' + fone); if (!n.ok || !n.br) return false;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO msg_contatos_fila (chave, fone, nome, canal, em) VALUES (?, ?, ?, ?, ?)').bind(n.chave, n.d, nomeTM_(nome, n.d), String(canal || ''), agora()).run();
  return !!(r.meta && r.meta.changes === 1);
}
async function processarFilaContatos_(env, limite) {
  const pend = (await env.DB.prepare("SELECT chave, fone, nome, canal FROM msg_contatos_fila WHERE estado='pendente' AND tentativas<5 ORDER BY em LIMIT ?").bind(limite || 5).all()).results;
  if (!pend.length) return { ok: true, feitos: 0 };
  const rotulo = { whatsapp1: 'WhatsApp 1', whatsapp2: 'WhatsApp 2' };
  const r = await ponte_(env, { acao: 'criar_lote', contatos: pend.map((x) => ({ nome: x.nome, fone: x.fone, nota: 'Criado pelo site TENKiTER' + (rotulo[x.canal] ? ' (' + rotulo[x.canal] + ')' : '') })) });
  if (!r.ok) { await env.DB.prepare("UPDATE msg_contatos_fila SET tentativas=tentativas+1, erro=? WHERE estado='pendente' AND chave IN (" + pend.map(() => '?').join(',') + ')').bind(String(r.erro || '').slice(0, 200), ...pend.map((x) => x.chave)).run(); return r; }
  const porFone = new Map((r.resultados || []).map((x) => [String(x.fone), x]));
  for (const x of pend) {
    const res = porFone.get(x.fone);
    if (res && res.ok) await env.DB.prepare('UPDATE msg_contatos_fila SET estado=?, r=?, erro=? WHERE chave=?').bind(res.ja ? 'ja' : 'feito', String(res.r || '').slice(0, 80), '', x.chave).run();
    else await env.DB.prepare('UPDATE msg_contatos_fila SET tentativas=tentativas+1, erro=? WHERE chave=?').bind(String((res && res.erro) || 'sem resposta').slice(0, 200), x.chave).run();
  }
  return { ok: true, feitos: pend.length };
}
async function filaContatosAuto_(env) { try { if ((await cfgGet(env, 'contatos_auto')) !== '1' || !(await cfgGet(env, 'contatos_url'))) return; await processarFilaContatos_(env, 5); } catch (e) { /* a fila tenta de novo no próximo minuto */ } }
/** v2.16: aplica a limpeza aprovada por etapas: juntar (100 grupos por vez), padronizar (páginas), criar (fila), fim. */
async function limpezaContatos_(env, d) {
  const b = JSON.parse((await cfgGet(env, 'contatos_backup')) || 'null');
  if (!b || Date.now() - Date.parse(b.em) > 6 * 3600000) return { ok: false, cod: 409, erro: 'Faça uma cópia de segurança nova (menos de 6 horas) antes da limpeza.' };
  const acc = JSON.parse((await cfgGet(env, 'contatos_limpeza_and')) || '{}'), salvar = () => cfgSet(env, 'contatos_limpeza_and', JSON.stringify(acc));
  const planoR2=await contatosR2TemPlano_(env); if(planoR2) { if(planoR2.m.backup!==b.em)return {ok:false,cod:409,erro:'O backup mudou desde o relatório. Faça novo relatório antes da limpeza.'}; return await contatosR2Limpeza_(env,d,planoR2,acc,salvar); }
  if (d.etapa === 'juntar') {
    const desde = Math.max(0, Number(d.desde) || 0), total = (await env.DB.prepare("SELECT COUNT(*) n FROM msg_contatos_plano WHERE tipo='dup'").first()).n;
    const rs = (await env.DB.prepare("SELECT id, dados FROM msg_contatos_plano WHERE tipo='dup' AND id>? ORDER BY id LIMIT 100").bind(desde).all()).results;
    if (!desde) { for (const k of Object.keys(acc)) delete acc[k]; }
    if (!rs.length) { await salvar(); return { ok: true, feito: total, total: total, proximo: '' }; }
    const r = await ponte_(env, { acao: 'juntar_lote', confirmar: true, grupos: rs.map((x) => { const g = JSON.parse(x.dados); return { manter: g.manter, apagar: g.apagar }; }) });
    if (!r.ok) return { ok: false, cod: 502, erro: r.erro === 'Ação desconhecida.' ? 'A ponte precisa da versão 1.2 (contatos-ponte-1.2) para a limpeza.' : r.erro };
    acc.juntados = (acc.juntados || 0) + (Number(r.feitos) || 0); acc.apagados = (acc.apagados || 0) + (Number(r.apagados) || 0); await salvar();
    const ultimo = rs[rs.length - 1].id, feito = (await env.DB.prepare("SELECT COUNT(*) n FROM msg_contatos_plano WHERE tipo='dup' AND id<=?").bind(ultimo).first()).n;
    return { ok: true, feito: feito, total: total, proximo: feito < total ? String(ultimo) : '' };
  }
  if (d.etapa === 'padronizar') {
    const r = await ponte_(env, { acao: 'padronizar_parte', pagina: typeof d.pagina === 'string' && d.pagina ? d.pagina.slice(0, 500) : undefined });
    if (!r.ok) return { ok: false, cod: 502, erro: r.erro === 'Ação desconhecida.' ? 'A ponte precisa da versão 1.2 (contatos-ponte-1.2) para a limpeza.' : r.erro };
    acc.padronizados = (acc.padronizados || 0) + (Number(r.mudados) || 0); acc.lidosPad = (d.pagina ? (acc.lidosPad || 0) : 0) + (Number(r.lidos) || 0); await salvar();
    return { ok: true, feito: acc.lidosPad, total: Number(r.totalPessoas) || acc.lidosPad, proxima: String(r.proxima || '') };
  }
  if (d.etapa === 'criar') {
    if (!d.continuar) { const novos = (await env.DB.prepare("SELECT dados FROM msg_contatos_plano WHERE tipo='novo'").all()).results; acc.criarTotal = 0; for (const x of novos) { const n = JSON.parse(x.dados); await enfileirarContato_(env, n.canal, n.fone, n.nome); acc.criarTotal++; } }
    const r = await processarFilaContatos_(env, 15);
    if (!r.ok) return { ok: false, cod: 502, erro: r.erro };
    const rest = (await env.DB.prepare("SELECT COUNT(*) n FROM msg_contatos_fila WHERE estado='pendente' AND tentativas<5").first()).n;
    const total = Math.max(acc.criarTotal || 0, rest); await salvar();
    return { ok: true, feito: total - rest, total: total, restantes: rest };
  }
  if (d.etapa === 'fim') {
    const criados = (await env.DB.prepare("SELECT COUNT(*) n FROM msg_contatos_fila WHERE estado='feito'").first()).n;
    const res = { em: agora(), juntados: acc.juntados || 0, apagados: acc.apagados || 0, padronizados: acc.padronizados || 0, criados: criados };
    await cfgSet(env, 'contatos_limpeza', JSON.stringify(res)); await cfgSet(env, 'contatos_limpeza_and', null); await cfgSet(env, 'contatos_auto', '1');
    await env.DB.prepare('DELETE FROM msg_contatos_plano').run();
    return Object.assign({ ok: true, auto: true }, res);
  }
  return { ok: false, cod: 400, erro: 'Etapa da limpeza inválida.' };
}
async function esperaMetricas_(env,canal){
  const espera = await env.DB.prepare("SELECT id, canal, contato, nome, ult_entrada_em FROM msg_conversa WHERE grupo=0 AND ult_dir='entrada' AND encerrada_em='' AND total>0" + (canal ? ' AND canal=?' : '') + ' ORDER BY ult_entrada_em ASC LIMIT 8').bind(...(canal ? [canal] : [])).all();
  const totEspera = await env.DB.prepare("SELECT COUNT(*) AS n FROM msg_conversa WHERE grupo=0 AND ult_dir='entrada' AND encerrada_em='' AND total>0" + (canal ? ' AND canal=?' : '')).bind(...(canal ? [canal] : [])).first();
  return {total:Number((totEspera||{}).n)||0,maisAntigas:espera.results.map(x=>({id:x.id,canal:x.canal,nome:rotuloContato_(x),desde:x.ult_entrada_em}))};
}
async function metricasMensagens_(env, canal, dias, usarCache) {
  dias = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const ck=new Request('https://metricas.invalid/tenkiter-ig-v2/'+(canal||'todos')+'/'+dias);
  if(usarCache){try{const hit=await caches.default.match(ck);if(hit){const salvo=await hit.json();if(Date.now()-Date.parse(salvo.calculadoEm)<300000)return {...salvo,aguardando:await esperaMetricas_(env,canal)};}}catch(_){}}
  const rs = await env.DB.prepare("SELECT m.conversa_id, m.direcao, m.enviada_em FROM msg_mensagem m JOIN msg_conversa c ON c.id=m.conversa_id WHERE c.grupo=0 AND COALESCE(m.por,'')<>'auto' AND m.enviada_em>=?" + (canal ? ' AND c.canal=?' : '') + ' ORDER BY m.conversa_id, m.enviada_em, m.id LIMIT 30001').bind(...(canal ? [desde, canal] : [desde])).all();
  /* Encerramento resolve um ciclo, mas não é resposta enviada. Engano/spam fica fora. */
  const enc = (await env.DB.prepare('SELECT e.conversa_id, e.motivo, e.em AS enviada_em FROM msg_encerramento e JOIN msg_conversa c ON c.id=e.conversa_id WHERE c.grupo=0 AND e.em>=?' + (canal ? ' AND c.canal=?' : '') + ' ORDER BY e.em,e.id LIMIT 20001').bind(...(canal ? [desde, canal] : [desde])).all()).results;
  const parcial=rs.results.length>30000||enc.length>20000;rs.results=rs.results.slice(0,30000);enc.splice(20000);
  const engano = new Set(enc.filter((e) => e.motivo === 'engano').map((e) => e.conversa_id)), encerramentos = { concluido: 0, vendeu: 0, sem_resposta: 0, engano: 0 };
  enc.forEach((e) => { if (encerramentos[e.motivo] != null) encerramentos[e.motivo]++; });
  const linha = rs.results.filter((m) => !engano.has(m.conversa_id)).concat(enc.filter((e) => !engano.has(e.conversa_id)).map((e) => ({ conversa_id: e.conversa_id, direcao: 'encerrou', enviada_em: e.enviada_em })))
    .sort((a, b) => a.conversa_id - b.conversa_id || String(a.enviada_em).localeCompare(String(b.enviada_em)));
  let conv = null, aberto = null, entradas = 0, saidas = 0; const demoras = [], porHora = Array.from({ length: 24 }, () => ({ entradas: 0, demoras: [] })), convs = new Set(); let semResposta = 0, horaAberta = 0, resolvidosSemResposta=0;
  const fechar = () => { if (aberto !== null) semResposta++; aberto = null; };
  for (const m of linha) {
    if (m.conversa_id !== conv) { fechar(); conv = m.conversa_id; convs.add(conv); }
    if (m.direcao === 'encerrou') { if(aberto!==null)resolvidosSemResposta++;aberto=null;continue; }
    if (m.direcao === 'entrada') { entradas++; if (aberto === null) { aberto = Date.parse(m.enviada_em); horaAberta = new Date(aberto - 3 * 3600000).getUTCHours(); porHora[horaAberta].entradas++; } }
    else { saidas++; if (aberto !== null) { const min = Math.max(0, (Date.parse(m.enviada_em) - aberto) / 60000); demoras.push(min); porHora[horaAberta].demoras.push(min); aberto = null; } }
  }
  fechar();
  const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), k = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2); };
  const pct = (a, f) => a.length ? Math.round(100 * a.filter(f).length / a.length) : null;
  const aguardando=await esperaMetricas_(env,canal);
  const resultado={ ok: true, calculadoEm:agora(), cobertura:{parcial,limiteMensagens:30000,limiteEncerramentos:20000}, resolvidosSemResposta, dias: dias, canal: canal || 'todos', encerramentos: encerramentos, conversas: convs.size, entradas: entradas, saidas: saidas, perguntasRespondidas: demoras.length, perguntasSemResposta: semResposta, medianaMin: med(demoras), mediaMin: demoras.length ? Math.round(demoras.reduce((a, b) => a + b, 0) / demoras.length) : null, ate5min: pct(demoras, (x) => x <= 5), ate60min: pct(demoras, (x) => x <= 60), acima24h: pct(demoras, (x) => x > 1440),
    aguardando,
    porHora: porHora.map((h, i) => ({ hora: i, entradas: h.entradas, medianaMin: med(h.demoras) })) };
  try{await caches.default.put(ck,new Response(JSON.stringify(resultado),{headers:{'Cache-Control':'max-age=300','Content-Type':'application/json'}}));}catch(_){}
  return resultado;
}
/* v7.40.2: saúde dos avisos. Só grava no KV quando um aviso FALHA (raro); a tela lê a cada ~40 s.
   O alerta some sozinho quando uma mensagem volta a ser gravada depois da falha. */
async function anotarFalha_(env, pathname, cod) {
  try {
    const k = 'saude:falha', a = await env.CACHE.get(k, 'json'), t = Date.now();
    if (a && t - Date.parse(a.em) < 20000) return;
    const seg = pathname.split('/'), canal = seg[2] === 'zernio' ? 'instagram' : seg[2] === 'wafly' ? 'whatsapp' + (seg[3] || '') : String(seg[2] || '');
    const junto = a && t - Date.parse(a.em) < 1800000;
    await env.CACHE.put(k, JSON.stringify({ desde: junto ? a.desde : new Date(t).toISOString(), em: new Date(t).toISOString(), n: junto ? (a.n || 1) + 1 : 1, canal: canal.slice(0, 20), cod: Number(cod) || 0 }), { expirationTtl: 172800 });
  } catch (e) { /* conforto */ }
}
/** Contagem limitada, sem conteúdo/IDs de clientes. Cache de borda evita listar R2 por aparelho. */
async function resumoEntradas_(env) {
  const ck=new Request('https://saude.invalid/entrada-v1');
  try{const cache=await caches.default.match(ck);if(cache){const r=await cache.json();if(Date.now()-r.em<20000)return r;}}catch(_){}
  const r={em:Date.now(),recebidas:0,anexos:0,maisRecebidas:false,maisAnexos:false,desde:'',erro:false,motivo:''};
  for(const [classe,campo,mais] of [['recebidas','recebidas','maisRecebidas'],['complementos','anexos','maisAnexos']]){
    const l=await env.MIDIA.list({prefix:MSG_ENTRADA_PREFIXO_+classe+'/',limit:50,include:['customMetadata']});
    r[campo]=l.objects.length;r[mais]=l.truncated;
    for(const o of l.objects){const m=o.customMetadata||{};if(m.em&&(!r.desde||m.em<r.desde))r.desde=m.em;if(Number(m.tentativas)>0)r.erro=true;if(m.motivo==='cota')r.motivo='cota';}
  }
  try{await caches.default.put(ck,new Response(JSON.stringify(r),{headers:{'Cache-Control':'max-age=20','Content-Type':'application/json'}}));}catch(_){}
  return r;
}
async function saudeAvisos_(env) {
  let fila;
  try{fila=await resumoEntradas_(env);}catch(_){fila=null;}
  if(fila&&(fila.recebidas||fila.anexos)&&(fila.erro||fila.maisRecebidas||fila.maisAnexos||Date.now()-Date.parse(fila.desde)>20000))
    return {alerta:true,tipo:fila.recebidas?'entrada':'anexos',desde:fila.desde,pendentes:fila.recebidas,anexos:fila.anexos,mais:fila.maisRecebidas||fila.maisAnexos,motivo:fila.motivo};
  let a=null;try{a=await env.CACHE.get('saude:falha','json');}catch(_){return {alerta:false};}
  if(!a||(a.n||1)<2)return {alerta:false};
  try{const where=MSG_CANAIS.includes(a.canal)?' WHERE canal=?':'';const q=env.DB.prepare('SELECT MAX(gravada_em) AS u FROM msg_mensagem'+where);const r=await (where?q.bind(a.canal):q).first();const u=r?.u||'';return {alerta:a.em>u,desde:a.desde,em:a.em,canal:a.canal,cod:a.cod,ultimaOk:u};}
  catch(_){return {alerta:true,desde:a.desde,em:a.em,canal:a.canal,cod:a.cod,ultimaOk:''};}
}

/* Nomes de tecidos públicos; renomear exige Admin total e não regrava produtos. */
const TECIDOS_CFG_='catalogo_tecidos_v1';
const tecidoChave_=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export function renomearTecido_(config,d,autor){
  if(!d||typeof d.nome!=='string'||(d.de!=null&&typeof d.de!=='string'))return ['Informe o nome do tecido.'];
  const limpar=v=>String(v||'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim();
  const nome=limpar(d.nome),de=limpar(d.de);
  if(!nome||nome.length>80||de.length>100)return ['Use um nome de tecido com até 80 caracteres.'];
  const c=config&&Array.isArray(config.itens)?config:{versao:0,itens:[],historico:[]};
  const alvos=new Set([tecidoChave_(de),tecidoChave_(nome)].filter(Boolean)),aliases=new Set([de,nome].filter(Boolean));
  const itens=[];
  for(const it of c.itens){const nomes=[it.nome,...(it.apelidos||[])];if(nomes.some(v=>alvos.has(tecidoChave_(v))))nomes.forEach(v=>aliases.add(v));else itens.push(it);}
  if(itens.length>=200||aliases.size>200)return ['Há muitos nomes associados. Revise os tecidos antes de continuar.'];
  itens.push({nome,apelidos:[...aliases]});itens.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const historico=(Array.isArray(c.historico)?c.historico:[]).slice(-99);historico.push({de,nome,por:String(autor||'').slice(0,30),em:agora()});
  return [null,{versao:(Number(c.versao)||0)+1,itens,historico}];
}
async function rotaTecidos_(env,req,J){
  if(!['GET','POST'].includes(req.method))return J({ok:false,erro:'Ação não disponível.'},405);
  if(req.method==='POST'){
    const perms=await permissoes(env,req);
    if(perms==='sem_sessao')return J({ok:false,erro:'Entre na sua conta de administrador.'},401);
    if(perms==='indisponivel')return J({ok:false,erro:'Não consegui confirmar seu acesso. Tente de novo.'},503);
    if(!perms.includes('gerir_acessos'))return J({ok:false,erro:'Somente o administrador pode gerenciar nomes de tecidos.'},403);
  }
  await iniciar(env);
  const raw=await cfgGet(env,TECIDOS_CFG_);let atual;try{atual=JSON.parse(raw||'null');}catch(_){return J({ok:false,erro:'Não foi possível ler os tecidos. Tente de novo.'},503);}
  atual=atual||{versao:0,itens:[],historico:[]};
  if(req.method==='GET')return J({ok:true,versao:atual.versao,itens:atual.itens});
  const d=await req.json().catch(()=>null);
  if(!d||d.versao!==atual.versao)return J({ok:false,erro:'Os tecidos foram atualizados por outra pessoa. Atualize a lista e tente de novo.'},409);
  const [erro,novo]=renomearTecido_(atual,d,req.headers.get('X-TK-Whats'));if(erro)return J({ok:false,erro},400);
  const valor=JSON.stringify(novo);
  const r=raw===null?await env.DB.prepare('INSERT OR IGNORE INTO cfg (chave,valor) VALUES (?,?)').bind(TECIDOS_CFG_,valor).run():await env.DB.prepare('UPDATE cfg SET valor=? WHERE chave=? AND valor=?').bind(valor,TECIDOS_CFG_,raw).run();
  if(!r.meta||r.meta.changes!==1)return J({ok:false,erro:'A lista mudou enquanto você editava. Atualize e tente novamente.'},409);
  return J({ok:true,versao:novo.versao,itens:novo.itens});
}

/* v7.40.33 — presença aproximada e atividade registrada (retomado do checkpoint #305).
   Presença vale 2 minutos e atividade é registro de ação confirmada: nenhuma das duas
   prova trabalho efetivo nem cobre todo ato. Nada aqui envia mensagem, marca como lida
   ou assume responsável. */
async function registrarAtividade_(env, req, d, acao) {
  const usuario = msgTelefone_(req.headers.get('X-TK-Whats'));
  const nome = await meuNomeAtendente_(env, req);
  const id = Number.isSafeInteger(Number(d && d.conversa)) ? Math.max(0, Number(d.conversa)) : 0;
  const chave = d && d.idLocal && acao === 'responder' ? await sha('atividade:' + usuario + ':' + d.idLocal) : crypto.randomUUID();
  await env.DB.prepare('INSERT OR IGNORE INTO msg_atividade(chave,usuario,nome,acao,conversa_id,em) VALUES(?,?,?,?,?,?)').bind(chave, usuario, nome, acao, id, agora()).run();
}

async function equipeAtendimento_(env, url) {
  const dia = (ms) => new Date(ms - FUSO_MS_).toISOString().slice(0, 10);
  const de = url.searchParams.get('de') || dia(Date.now() - 6 * 86400000);
  const ate = url.searchParams.get('ate') || dia(Date.now());
  const inicio = Date.parse(de + 'T00:00:00-03:00'), fim = Date.parse(ate + 'T23:59:59.999-03:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || !Number.isFinite(inicio) || !Number.isFinite(fim) || dia(inicio) !== de || dia(fim) !== ate || fim < inicio || fim - inicio > 31 * 86400000)
    return { ok: false, cod: 400, erro: 'Escolha um período de até 31 dias.' };
  const usuario = String(url.searchParams.get('usuario') || '').replace(/\D/g, '').slice(0, 20);
  const antes = Number(url.searchParams.get('antes')) || 0;
  const onde = ' FROM msg_atividade a WHERE em>=? AND em<=?' + (usuario ? ' AND usuario=?' : '');
  const args = [new Date(inicio).toISOString(), new Date(fim).toISOString(), ...(usuario ? [usuario] : [])];
  const presencas = (await env.DB.prepare('SELECT usuario,nome,em,conversa_id FROM msg_presenca ORDER BY em DESC LIMIT 200').all()).results;
  const totais = (await env.DB.prepare("SELECT usuario,MAX(nome) AS nome,COUNT(*) AS acoes,SUM(acao='responder') AS respostas,SUM(acao='encerrar') AS encerramentos,SUM(acao='notas') AS notas" + onde + ' GROUP BY usuario ORDER BY respostas DESC,acoes DESC').bind(...args).all()).results;
  const historico = (await env.DB.prepare('SELECT a.id,a.usuario,a.nome,a.acao,a.conversa_id,a.em,(SELECT nome FROM msg_conversa c WHERE c.id=a.conversa_id) AS cliente' + onde + (antes ? ' AND a.id<?' : '') + ' ORDER BY a.id DESC LIMIT 51').bind(...args, ...(antes ? [antes] : [])).all()).results;
  return { ok: true, de, ate, agora: agora(),
    presencas: presencas.map(p => ({ ...p, online: Date.now() - Date.parse(p.em) < 120000 })),
    totais, atividades: historico.slice(0, 50), temMais: historico.length > 50, proximo: historico[49] ? historico[49].id : 0 };
}

/* v7.40.34 — "Nova conversa" envia pelo WhatsApp e só abre pelo Instagram.
   A api-bridge-whats (Wafly) deixa a loja escrever primeiro; a API oficial do Instagram
   não deixa, por isso lá a conversa apenas é aberta/registrada, sem envio iniciado.
   As credenciais ficam guardadas no servidor (tabela cfg: wafly_1 / wafly_2, gravadas
   pela gaveta Conexões) e nunca descem para o navegador nem viajam nesta requisição. */
async function iniciarConversa_(env, req, d) {
  const canal = String((d && d.canal) || '');
  if (!MSG_CANAIS.includes(canal)) return { ok: false, cod: 400, erro: 'Escolha WhatsApp 1, WhatsApp 2 ou Instagram.' };
  const texto = String((d && d.texto) == null ? '' : d.texto).replace(/\r\n/g, '\n').trim();
  let conversa = null;
  if (canal === 'instagram') {
    // Instagram: abrir/registrar apenas. Envio iniciado pelo sistema é recusado pela Meta.
    if (texto) return { ok: false, cod: 400, erro: 'O Instagram não permite que a loja escreva primeiro. Abra a conversa e responda quando o cliente escrever.' };
    const usuario = String((d && d.destino) || '').trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(usuario)) return { ok: false, cod: 400, erro: 'Digite o @ do Instagram, como @loja.cliente.' };
    const achados = (await env.DB.prepare("SELECT id FROM msg_conversa WHERE canal='instagram' AND grupo=0 AND (lower(nome)=? OR lower(nome)=?) LIMIT 2").bind(usuario, '@' + usuario).all()).results;
    if (achados.length !== 1) return { ok: false, cod: 409, erro: 'Não encontrei uma conversa única com esse @. O Instagram exige que o cliente escreva para a loja primeiro.' };
    conversa = achados[0];
  } else {
    const fone = pessoaTelefone_(String((d && d.destino) || '').replace(/\D/g, ''));
    if (!fone || !/^55[1-9][0-9]{9,10}$/.test(fone.d)) return { ok: false, cod: 400, erro: 'Digite um WhatsApp com DDD, como (88) 99999-9999.' };
    conversa = await env.DB.prepare('SELECT id FROM msg_conversa WHERE canal=? AND grupo=0 AND (contato=? OR contato=?) ORDER BY total DESC,id LIMIT 1').bind(canal, fone.d, fone.chave).first();
    if (!conversa) {
      const em = agora();
      // total fica 0 até a primeira mensagem: a lista mostra só conversa com mensagem.
      await env.DB.prepare("INSERT OR IGNORE INTO msg_conversa(canal,contato,nome,grupo,ultima_em,criado_em,atualizada_em,pessoa) VALUES(?,?,'',0,?,?,?,?)").bind(canal, fone.d, em, em, em, fone.chave).run();
      conversa = await env.DB.prepare('SELECT id FROM msg_conversa WHERE canal=? AND contato=?').bind(canal, fone.d).first();
    }
  }
  if (!conversa) return { ok: false, cod: 409, erro: 'Não foi possível abrir a conversa agora. Tente de novo.' };
  if (!texto) return { ok: true, conversa: conversa.id, enviada: false };
  /* Envio: mesmo caminho de /msg/enviar (reserva atômica por idLocal, recibo da Wafly e
     gravação da bolha). Nunca sai duas vezes, mesmo com toque duplo ou nova tentativa. */
  if (texto.length > MSG_TEXTO_MAX) return { ok: false, cod: 400, erro: 'Mensagem grande demais. Divida em duas.' };
  const idLocal = String((d && d.idLocal) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || ('nc' + crypto.randomUUID().replace(/-/g, ''));
  const [cod, corpo] = await responderMensagem_(env, req.headers.get('X-TK-Whats') || '', { conversa: conversa.id, texto: texto, idLocal: idLocal });
  if (cod !== 200 || !corpo) return { ok: false, cod: cod || 409, conversa: conversa.id, erro: (corpo && corpo.erro) || 'Não foi possível enviar agora. Tente de novo.' };
  if (!corpo.ok) return { ok: false, cod: 409, conversa: conversa.id, incerto: !!corpo.incerto, erro: corpo.erro };
  try { await env.DB.prepare("UPDATE msg_conversa SET dono=? WHERE id=? AND (dono IS NULL OR dono='')").bind(await meuNomeAtendente_(env, req), conversa.id).run(); } catch (e) { /* dono é conforto */ }
  return { ok: true, conversa: conversa.id, enviada: true, mensagem: corpo.mensagem };
}

/* Preparação privada de vídeo. Somente gera arquivos; nunca envia mensagens/postagens.
 * O runner recebe identidade OIDC curta, restrita ao workflow da main, sem acesso SQL genérico. */
const VIDEO_PERFIS_ = Object.freeze({'postagens-partes':{bytes:9961472,max:30,min:3},mensageiro:{bytes:15000000,max:0,min:0},postagens:{bytes:9961472,max:30,min:3}});
const VIDEO_TABELA_ = `CREATE TABLE IF NOT EXISTS video_preparo(id TEXT PRIMARY KEY,dono TEXT NOT NULL,perfil TEXT NOT NULL,estado TEXT NOT NULL,origem TEXT NOT NULL,resultado TEXT NOT NULL DEFAULT '',inicio REAL NOT NULL DEFAULT 0,duracao REAL NOT NULL DEFAULT 0,lease TEXT NOT NULL DEFAULT '',ate INTEGER NOT NULL DEFAULT 0,criado INTEGER NOT NULL,reservado INTEGER NOT NULL DEFAULT 0,erro TEXT NOT NULL DEFAULT '')`;
const VIDEO_PARTES_TABELA_ = `CREATE TABLE IF NOT EXISTS video_parte(preparo TEXT NOT NULL,ordem INTEGER NOT NULL,total INTEGER NOT NULL,inicio REAL NOT NULL,duracao REAL NOT NULL,chave TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(preparo,ordem))`;
export function planoPartes(duracao,maximo=30){
  if(!Number.isFinite(duracao)||duracao<3||duracao>1800||!Number.isFinite(maximo)||maximo<3||maximo>30)throw Error('Use um vídeo entre 3 segundos e 30 minutos, com partes de 3 a 30 segundos.');
  const n=Math.ceil(duracao/maximo);if(n>60)throw Error('Use no máximo 60 partes por vídeo. Aumente a duração de cada parte.');const ds=Array.from({length:n},(_,i)=>Math.min(maximo,duracao-i*maximo));
  if(n>1&&ds[n-1]<3){ds[n-2]-=3-ds[n-1];ds[n-1]=3;}
  if(ds.some(x=>x<3))throw Error('A duração escolhida deixa uma parte menor que 3 segundos. Escolha partes maiores.');
  let inicio=0;return ds.map((d,i)=>{const r={ordem:i+1,total:n,inicio,duracao:d};inicio+=d;return r;});
}
async function iniciarPartesVideo_(env){await env.DB.prepare(VIDEO_PARTES_TABELA_).run();}
async function corpoLimitadoVideo_(req,max){
  if(Number(req.headers.get('Content-Length'))>max)throw Error('Arquivo acima do limite de entrada (40 MiB).');
  const reader=req.body?.getReader();if(!reader)throw Error('Arquivo vazio.');const partes=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw Error('Arquivo acima do limite de entrada.');}partes.push(value);}}finally{reader.releaseLock();}
  if(!total)throw Error('Arquivo vazio.');const out=new Uint8Array(total);let i=0;for(const b of partes){out.set(b,i);i+=b.length;}return out;
}
function videoClaims_(c){
  const n=Date.now()/1000,repo='pablofonteneleadv/tenkiter-catalogo';
  return c.iss==='https://token.actions.githubusercontent.com'&&c.aud==='tenkiter-video'&&c.repository===repo&&c.repository_id==='1366921721'&&c.repository_owner_id==='207932006'&&c.repository_owner==='pablofonteneleadv'&&c.ref==='refs/heads/main'&&c.workflow_ref===repo+'/.github/workflows/wafly-transcode.yml@refs/heads/main'&&typeof c.sub==='string'&&c.sub.length>0&&['schedule','push','workflow_dispatch'].includes(c.event_name)&&Number.isFinite(c.exp)&&c.exp>n&&c.exp<n+900&&Number.isFinite(c.nbf)&&c.nbf<=n+30;
}
async function autorizarVideoRunner_(req){
  try{
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');if(token.length>16000)return false;
    const partes=token.split('.');if(partes.length!==3)return false;
    const dec=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
    const cab=JSON.parse(new TextDecoder().decode(dec(partes[0]))),claims=JSON.parse(new TextDecoder().decode(dec(partes[1])));
    if(cab.alg!=='RS256'||typeof cab.kid!=='string'||!videoClaims_(claims))return false;
    const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(10000),cf:{cacheTtl:3600,cacheEverything:true}});
    if(!r.ok)return false;const buf=await corpoLimitadoVideo_(r,65536);const jwks=JSON.parse(new TextDecoder().decode(buf));
    const jwk=jwks.keys?.find(k=>k.kid===cab.kid&&k.kty==='RSA'&&k.use==='sig');if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,dec(partes[2]),new TextEncoder().encode(partes[0]+'.'+partes[1]));
  }catch(_){return false;}
}
async function videoRunner_(env,req,url,J){
  if(!await autorizarVideoRunner_(req))return J({ok:false,erro:'Identidade do processador não autorizada.'},401);
  await env.DB.prepare(VIDEO_TABELA_).run();await iniciarPartesVideo_(env);
  const id=url.searchParams.get('id')||'',acao=url.searchParams.get('acao')||'';
  if(acao==='saude'){await env.MIDIA.list({prefix:'video-preparo/',limit:1});return J({ok:true,processador:'video-v1',armazenamento:true,envio:false,sequencias:env.POSTAGENS_SEQUENCIA?await env.POSTAGENS_SEQUENCIA.get(env.POSTAGENS_SEQUENCIA.idFromName('loja')).saude():null});}
  if(acao==='proximo'&&req.method==='POST'){
    // Recupera lease abandonado sem liberar qualquer envio.
    await env.DB.prepare("UPDATE video_preparo SET estado='erro',erro='O processamento foi interrompido. Selecione novamente o original.' WHERE estado='processando' AND ate<?").bind(Date.now()).run();
    const job=await env.DB.prepare("SELECT * FROM video_preparo WHERE estado='fila' AND criado>? ORDER BY criado LIMIT 1").bind(Date.now()-86400000).first();
    if(!job)return J({ok:true,job:null});const lease=crypto.randomUUID();
    const r=await env.DB.prepare("UPDATE video_preparo SET estado='processando',lease=?,ate=? WHERE id=? AND estado='fila'").bind(lease,Date.now()+2100000,job.id).run();
    return J({ok:true,job:r.meta.changes?{id:job.id,perfil:job.perfil,inicio:job.inicio,duracao:job.duracao,lease,partes:job.perfil==='postagens-partes'&&job.duracao>0?planoPartes(job.duracao,job.inicio):null}:null});
  }
  const job=await env.DB.prepare('SELECT * FROM video_preparo WHERE id=?').bind(id).first();
  if(!job||job.estado!=='processando'||job.lease!==req.headers.get('X-Video-Lease')||job.ate<Date.now())return J({ok:false,erro:'Trabalho indisponível.'},409);
  if(acao==='origem'&&req.method==='GET'){
    const obj=await env.MIDIA.get(job.origem);return obj?new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}}):J({ok:false},404);
  }
  if(acao==='falha'&&req.method==='POST'){
    await env.DB.prepare("UPDATE video_preparo SET estado='erro',erro='Não foi possível preparar este vídeo. O original foi preservado; tente outro arquivo ou envie um link.' WHERE id=? AND lease=?").bind(id,job.lease).run();return J({ok:true});
  }
  if(acao==='plano'&&req.method==='POST'&&job.perfil==='postagens-partes'&&job.duracao===0){
    const d=JSON.parse(new TextDecoder().decode(await corpoLimitadoVideo_(req,1024))),partes=planoPartes(Number(d.duracao),job.inicio);
    await env.DB.prepare("UPDATE video_preparo SET duracao=? WHERE id=? AND lease=? AND estado='processando' AND duracao=0 AND ate>?").bind(Number(d.duracao),id,job.lease,Date.now()).run();
    return J({ok:true,partes});
  }
  if(acao==='resultado'&&req.method==='POST'){
    const max=job.perfil==='postagens-partes'?Math.min(9961472,Math.floor(256*1048576/planoPartes(job.duracao,job.inicio).length)):VIDEO_PERFIS_[job.perfil].bytes;
    const bytes=await corpoLimitadoVideo_(req,max);
    if(job.perfil==='postagens-partes'){
      const plano=planoPartes(job.duracao,job.inicio),ordem=Number(url.searchParams.get('parte')),parte=plano[ordem-1];
      if(!parte)return J({ok:false,erro:'Parte inválida.'},400);
      const segundos=duracaoMp4Status_(bytes.buffer);
      if(!segundos||segundos<3||segundos>30||Math.abs(segundos-parte.duracao)>.15||detectarAnexo_(bytes.buffer,'vídeo')!=='video/mp4'||/hvc1|hev1/.test(new TextDecoder('latin1').decode(bytes)))return J({ok:false,erro:'Parte fora do formato ou duração esperados.'},415);
      const chave='video-preparo/'+id+'/'+job.lease+'-'+ordem+'.mp4',hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      await env.MIDIA.put(chave,bytes,{httpMetadata:{contentType:'video/mp4'}});
      await env.DB.prepare('INSERT OR REPLACE INTO video_parte(preparo,ordem,total,inicio,duracao,chave,hash) VALUES(?,?,?,?,?,?,?)').bind(id,ordem,plano.length,parte.inicio,parte.duracao,chave,hash).run();
      const n=await env.DB.prepare('SELECT COUNT(*) n FROM video_parte WHERE preparo=?').bind(id).first();
      if(n.n===plano.length)await env.DB.prepare("UPDATE video_preparo SET estado='pronto',resultado=? WHERE id=? AND lease=? AND estado='processando' AND ate>?").bind('partes',id,job.lease,Date.now()).run();
      return J({ok:true});
    }
    const segundos=duracaoMp4Status_(bytes.buffer);if(!segundos||(job.perfil==='postagens'&&(segundos<3||segundos>30)))return J({ok:false,erro:'Duração final inválida.'},415);
    if(detectarAnexo_(bytes.buffer,'vídeo')!=='video/mp4'||/hvc1|hev1/.test(new TextDecoder('latin1').decode(bytes)))return J({ok:false,erro:'Saída inválida.'},415);
    const chave='video-preparo/'+id+'/'+job.lease+'.mp4';await env.MIDIA.put(chave,bytes,{httpMetadata:{contentType:'video/mp4'}});
    const r=await env.DB.prepare("UPDATE video_preparo SET estado='pronto',resultado=? WHERE id=? AND lease=? AND estado='processando' AND ate>?").bind(chave,id,job.lease,Date.now()).run();if(!r.meta.changes)await env.MIDIA.delete(chave);return J({ok:!!r.meta.changes});
  }
  return J({ok:false},404);
}
async function limparVideoPreparo_(env){
  try{const rows=(await env.DB.prepare('SELECT id,origem,resultado FROM video_preparo WHERE criado<? LIMIT 10').bind(Date.now()-86400000).all()).results;
    for(const row of rows){if(!/^[a-f0-9-]{36}$/.test(row.id))continue;const l=await env.MIDIA.list({prefix:'video-preparo/'+row.id+'/',limit:100});for(const o of l.objects)await env.MIDIA.delete(o.key);if(l.truncated)continue;await env.DB.prepare('DELETE FROM video_parte WHERE preparo=?').bind(row.id).run();await env.DB.prepare('DELETE FROM video_preparo WHERE id=? AND criado<?').bind(row.id,Date.now()-86400000).run();}
  }catch(e){if(!/no such table/.test(String(e)))throw e;}
}
async function videoUsuario_(env,req,url,J){
  await env.DB.prepare(VIDEO_TABELA_).run();await iniciarPartesVideo_(env);
  const dono=await sha(req.headers.get('X-TK-Whats')||''),perfil=url.pathname.startsWith('/msg/')?'mensageiro':url.searchParams.get('partes')==='1'?'postagens-partes':'postagens';
  if(req.method==='POST'){
    const fila=await env.DB.prepare("SELECT COUNT(*) n FROM video_preparo WHERE dono=? AND criado>? AND estado IN ('recebendo','fila','processando')").bind(dono,Date.now()-86400000).first();
    if(fila.n>=3)return J({ok:false,erro:'Há três vídeos em preparação. Aguarde antes de adicionar outro.'},429);
    const inicio=Number(url.searchParams.get('inicio')||0),duracao=Number(url.searchParams.get('duracao')||0);
    if(!Number.isFinite(inicio)||inicio<0||!Number.isFinite(duracao)||(perfil==='postagens'&&(duracao<3||duracao>30))||(perfil==='mensageiro'&&(inicio!==0||duracao!==0)))return J({ok:false,erro:'Escolha um trecho de 3 a 30 segundos para Postagens.'},400);
    if(perfil==='postagens-partes'){try{if(inicio<3||inicio>30||duracao<0)throw Error('Escolha partes de 3 a 30 segundos.');if(duracao>0)planoPartes(duracao,inicio);}catch(e){return J({ok:false,erro:e.message},400);}}
    const buf=await corpoLimitadoVideo_(req,40*1048576);
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buf))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const hash=await sha('video-v1:'+dono+':'+perfil+':'+inicio+':'+duracao+':'+Math.floor(Date.now()/86400000)+':'+digest);
    const id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-'+hash.slice(12,16)+'-'+hash.slice(16,20)+'-'+hash.slice(20,32);
    const existente=await env.DB.prepare('SELECT estado FROM video_preparo WHERE id=? AND dono=?').bind(id,dono).first();
    if(existente&&existente.estado!=='erro')return J({ok:true,id,estado:existente.estado});
    if(existente){const antigos=await env.MIDIA.list({prefix:'video-preparo/'+id+'/',limit:100});for(const o of antigos.objects)if(o.key!=='video-preparo/'+id+'/original')await env.MIDIA.delete(o.key);if(antigos.truncated)return J({ok:false,erro:'Limpando resultados da tentativa anterior. Tente novamente em instantes; o original foi preservado.'},409);await env.DB.prepare('DELETE FROM video_parte WHERE preparo=?').bind(id).run();await env.DB.prepare("UPDATE video_preparo SET estado='fila',erro='',lease='',ate=0 WHERE id=? AND estado='erro'").bind(id).run();return J({ok:true,id,estado:'fila'});}
    // Reserva atômica: limita temporários e respeita o orçamento de armazenamento existente.
    const uso=await lerUso(env),reserva=buf.byteLength+(perfil==='postagens-partes'?(duracao>0?Math.min(256*1048576,planoPartes(duracao,inicio).length*9961472):256*1048576):VIDEO_PERFIS_[perfil].bytes);
    const teto=Math.min(512*1048576,Math.max(0,limite(env)-uso.bytes));
    const origem='video-preparo/'+id+'/original';
    const reservado=await env.DB.prepare("INSERT OR IGNORE INTO video_preparo(id,dono,perfil,estado,origem,inicio,duracao,criado,reservado) SELECT ?,?,?,'recebendo',?,?,?,?,? WHERE (SELECT COALESCE(SUM(reservado),0) FROM video_preparo)+?<=? AND (SELECT COUNT(*) FROM video_preparo WHERE dono=? AND criado>?)<20 AND (SELECT COUNT(*) FROM video_preparo WHERE dono=? AND estado IN ('recebendo','fila','processando') AND criado>?)<3").bind(id,dono,perfil,origem,inicio,duracao,Date.now(),reserva,reserva,teto,dono,Date.now()-86400000,dono,Date.now()-86400000).run();
    if(!reservado.meta.changes){const atual=await env.DB.prepare('SELECT estado FROM video_preparo WHERE id=? AND dono=?').bind(id,dono).first();return atual?J({ok:true,id,estado:atual.estado}):J({ok:false,erro:'Limite de preparação ou espaço temporário atingido. Aguarde a limpeza dos temporários ou use um link para o original.'},429);}
    // Prefixo não aceito pelas rotas públicas /m/ ou /msg/midia.
    try{
      await env.MIDIA.put(origem,buf,{httpMetadata:{contentType:'application/octet-stream'}});
      await env.DB.prepare("UPDATE video_preparo SET estado='fila' WHERE id=? AND estado='recebendo'").bind(id).run();
    }catch(e){await env.MIDIA.delete(origem);await env.DB.prepare("DELETE FROM video_preparo WHERE id=? AND estado='recebendo'").bind(id).run();throw e;}
    return J({ok:true,id,estado:'fila'});
  }
  const id=url.searchParams.get('id')||'';
  const job=await env.DB.prepare('SELECT * FROM video_preparo WHERE id=? AND dono=? AND perfil=?').bind(id,dono,perfil).first();
  if(!job||job.criado<Date.now()-86400000)return J({ok:false,erro:'Preparação expirada. Selecione novamente o original.'},404);
  if(url.searchParams.get('arquivo')==='1'){
    if(job.estado!=='pronto')return J({ok:false,erro:'Vídeo ainda não está pronto.'},409);
    let chave=job.resultado;if(job.perfil==='postagens-partes'){const pt=await env.DB.prepare('SELECT chave FROM video_parte WHERE preparo=? AND ordem=?').bind(id,Number(url.searchParams.get('parte'))).first();if(!pt)return J({ok:false},404);chave=pt.chave;}
    const obj=await env.MIDIA.get(chave);return obj?new Response(obj.body,{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store',...Object.fromEntries(cors(env,req))}}):J({ok:false},404);
  }
  return J({ok:true,id,estado:job.estado,erro:job.erro,partes:job.perfil==='postagens-partes'?(await env.DB.prepare('SELECT ordem,total,inicio,duracao FROM video_parte WHERE preparo=? ORDER BY ordem').bind(id).all()).results:undefined});
}

export default {
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(processarPushMobile_(env).catch(()=>{}));
    ctx.waitUntil(processarFilaZernio_(env).catch(()=>{}));
    ctx.waitUntil(processarEntradas_(env).catch(()=>{}));
    ctx.waitUntil(processarAgenda_(env).catch(()=>{}));                      // a cada minuto: mensagens agendadas que chegaram na hora
    ctx.waitUntil(dispararPostagens_(env));                                   // a cada minuto: publica o que está na hora
    ctx.waitUntil(processarFotoIA(env));                                      // a cada minuto: 1 imagem da fila de Fotos com IA (se já puder: cota/limite do dia)
    ctx.waitUntil(filaContatosAuto_(env));                                    // a cada minuto: até 5 números novos viram "TM Cliente …" no Google (se ligado)
    const min = ev && ev.scheduledTime ? new Date(ev.scheduledTime).getUTCMinutes() : 0;
    if (min === 7) {ctx.waitUntil(limparVideoPreparo_(env));ctx.waitUntil(limparTemporarios(env).catch(() => {}));ctx.waitUntil((async()=>{const c=await env.CACHE.get('contatos_staging_cursor');const r=await contatosR2ExpurgarOrfaos_(env,Date.now(),c||undefined);if(r.cursor)await env.CACHE.put('contatos_staging_cursor',r.cursor,{expirationTtl:86400});else await env.CACHE.delete('contatos_staging_cursor');})().catch(()=>{}));}      // 1x por dia: apaga do R2 o que é temporário (t/) com mais de 5 dias
    if (min % 30 !== 0) return;                                                // importar do Instagram só a cada 30 min (como antes)
    if (await env.CACHE.get('ig_hist_trava')) return;
    ctx.waitUntil((async () => { await ciclo(env, 'cron'); try { await analisarPendentes(env, 5); } catch (e) { /* a IA é conforto: o ciclo não pode cair por causa dela */ } })());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), h = cors(env, req); let direitos = null;
    const acoesAuditadas={'/msg/enviar':'responder','/msg/encerrar':'encerrar','/msg/dono':'responsavel','/msg/notas':'notas','/msg/rotular':'etapa','/msg/ficha':'ficha','/msg/agendar':'agendar','/msg/acompanhamento':'acompanhar','/msg/iniciar':'criar'};
    let auditarAtividade_=req.method==='POST'&&acoesAuditadas[url.pathname]?req.clone().json().catch(()=>({})):null;
    const J = (c, s) => {
      // v7.40.33: trilha da equipe — só ação confirmada, nunca o texto da mensagem.
      // Best effort: se o D1 falhar na trilha, a ação do atendente não é desfeita.
      if(c?.ok&&(!s||s<300)&&auditarAtividade_){
        const lida=auditarAtividade_;auditarAtividade_=null;
        const trilha=(async()=>{const d=await lida;if(d)await registrarAtividade_(env,req,d,acoesAuditadas[url.pathname]);})().catch(()=>{});
        if(ctx?.waitUntil)ctx.waitUntil(trilha);
      }
      if(c?.ok&&(!s||s<300)&&['POST','DELETE'].includes(req.method)&&/^\/msg\/(enviar|lida|dono|encerrar|rotular|etiquetas|notas|ficha|pessoa|agendar|acompanhamento)(\/|$)/.test(url.pathname)){
        const p=notificarNovidade_(env);if(ctx?.waitUntil)ctx.waitUntil(p);
      }
      return resp(direitos ? msgFiltrarDados_(c,direitos) : c, s, h);
    };
    if (req.method === 'OPTIONS') { h.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); h.set('Access-Control-Allow-Headers', 'Content-Type, X-TK-Whats, X-TK-Sessao'); h.set('Access-Control-Max-Age', '86400'); return new Response(null, { status: 204, headers: h }); }
    if(url.pathname==='/internal/video'){try{return await videoRunner_(env,req,url,J);}catch(_){return J({ok:false,erro:'Processador indisponível.'},503);}}
    if(url.pathname==='/msg/tempo-real'){try{return await conectarEventos_(env,req);}catch(_){return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}}
    if(url.pathname==='/catalogo/tecidos'){try{return await rotaTecidos_(env,req,J);}catch(_){return J({ok:false,erro:'Não foi possível atualizar os tecidos. Tente de novo.'},503);}}
    if (url.pathname === '/cliente/foto') { try { const rc = await rotasFotosCliente(env, req, url, J); if (rc) return rc; } catch (e) { return J({ ok: false, erro: 'Não foi possível enviar agora. Tente de novo.' }, 500); } }
    if (url.pathname.indexOf('/wh/zernio/') === 0 && req.method === 'POST') { try { const rz = await rotaZernio_(env, req, url, ctx); if (rz.status >= 500) await anotarFalha_(env, url.pathname, rz.status); return rz; } catch (e) { await anotarFalha_(env, url.pathname, 500); return new Response('{"ok":false}', { status: 500, headers: { 'Content-Type': 'application/json' } }); } }
    if (url.pathname.indexOf('/wh/') === 0) { try {
      const resposta = await rotaWebhookMensagens_(env, req, url, ctx);
      if (req.method === 'POST' && resposta.ok) {
        const recebido = await resposta.clone().json().catch(() => null);
        // A mensagem já está persistida; push não atrasa nem derruba o aceite do webhook.
        if (recebido && (recebido.nova === true || recebido.novas > 0) && typeof ctx?.waitUntil === 'function') ctx.waitUntil(processarPushMobile_(env,true).catch(() => {}));
      }
      if (resposta.status >= 500) await anotarFalha_(env, url.pathname, resposta.status);
      return resposta;
    } catch (e) { await anotarFalha_(env, url.pathname, 500); return new Response('{"ok":false}', { status: 500, headers: { 'Content-Type': 'application/json' } }); } }
    const perms = await permissoes(env, req);
    if (perms === 'sem_sessao') return J({ ok: false, erro: 'Entre na sua conta de administrador.' }, 401);
    if (perms === 'indisponivel') return J({ ok: false, erro: 'Nao consegui confirmar sua sessao agora. Tente de novo.' }, 503);
    const ehPost = url.pathname === '/posts' || url.pathname.indexOf('/post') === 0 || url.pathname.indexOf('/fotos') === 0 || url.pathname.indexOf('/fotoia') === 0;
    const ehMsg = url.pathname.startsWith('/msg/');
    if (!ehMsg && (ehPost ? (perms.indexOf('gerir_acessos') === -1 && perms.indexOf('catalogo_cadastrar') === -1) : perms.indexOf('gerir_acessos') === -1)) return J({ ok: false, erro: ehPost ? 'Você não tem permissão para postar no Instagram.' : 'Só o administrador total acessa o importador do Instagram.' }, 403);
    try {
      await iniciar(env);
      const p = url.pathname;
      if (ehMsg) {
        const regras = await msgRegras_(env);
        const calculados = msgDireitos_(perms,req.headers.get('X-TK-Whats'),regras);
        if (p === '/msg/acesso' && req.method === 'GET') return J({ok:true,permitido:calculados.acessar,direitos:calculados,ferramentas:MSG_FERRAMENTAS_});
        if (p === '/msg/acessos' && ['GET','POST'].includes(req.method)) {
          if (!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente a gestão altera os acessos.'},403);
          if (req.method === 'POST') {
            const d = await req.json().catch(() => ({}));
            const tipo = d.tipo === 'perfil' ? 'perfis' : d.tipo === 'pessoa' ? 'pessoas' : '';
            const alvo = tipo === 'perfis' ? msgPerfil_(d.alvo) : msgTelefone_(d.alvo);
            if (!tipo || !alvo || ['constructor','prototype','__proto__'].includes(alvo) || !Object.hasOwn(MSG_FERRAMENTAS_, d.chave) || ![true,false,null].includes(d.valor)) return J({ok:false,erro:'Escolha o acesso e a pessoa ou perfil.'},400);
            let salvo = false;
            for (let i=0;i<4&&!salvo;i++) {
              const antigo = await cfgGet(env,'msg_acessos_v1');
              const novo = antigo ? JSON.parse(antigo) : {perfis:{},pessoas:{}};
              novo[tipo] ||= {}; novo[tipo][alvo] ||= {};
              if (d.valor === null) delete novo[tipo][alvo][d.chave]; else novo[tipo][alvo][d.chave] = d.valor;
              if (!antigo) await env.DB.prepare("INSERT OR IGNORE INTO cfg(chave,valor) VALUES('msg_acessos_v1','{\"perfis\":{},\"pessoas\":{}}')").run();
              const anterior = antigo || '{"perfis":{},"pessoas":{}}';
              const r = await env.DB.prepare("UPDATE cfg SET valor=? WHERE chave='msg_acessos_v1' AND valor=?").bind(JSON.stringify(novo),anterior).run();
              salvo = !!r.meta.changes;
            }
            if (!salvo) return J({ok:false,erro:'Outro acesso mudou ao mesmo tempo. Tente novamente.'},409);
          }
          return J({ok:true,regras:await msgRegras_(env),ferramentas:MSG_FERRAMENTAS_});
        }
        direitos = calculados;
        if (!direitos.acessar || !direitos[msgRecurso_(p,req,url)]) return J({ok:false,erro:'Seu acesso não permite usar esta ferramenta de Mensagens.'},403);
        if (p === '/msg/conversas' && url.searchParams.get('filtro') === 'com_notas' && !direitos.notas) return J({ok:false,erro:'Seu acesso não permite consultar notas.'},403);
        if (p === '/msg/notas/log' && !direitos.notas) return J({ok:false,erro:'Seu acesso não permite consultar notas.'},403);
        if (p === '/msg/config' && req.method === 'POST') {
          const d = await req.clone().json().catch(()=>({}));
          if ('assinatura' in d && !perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente o administrador pode ocultar o próprio nome.'},403);
          if ((('respostas' in d) && !direitos.respostas) || (('lerCelular' in d) && !direitos.configuracoes) || (('meuNome' in d)&&!direitos.responder)) return J({ok:false,erro:'Seu acesso não permite alterar esta configuração.'},403);
        }
      }
      if(['/msg/video-preparar','/post/video-preparar'].includes(p)&&['GET','POST'].includes(req.method))return await videoUsuario_(env,req,url,J);
      if(p==='/msg/tempo-real/ticket'&&req.method==='POST')return J(await ticketsEventos_(env,req));
      if (p === '/post/freeconvert/config' && req.method === 'GET') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const chave=await cfgGet(env,'freeconvert_api_key');
        return J({ok:true,configurada:!!(chave||env.FREECONVERT_API_KEY),origem:chave?'gestao':env.FREECONVERT_API_KEY?'worker':'nenhuma'});
      }
      if (p === '/post/freeconvert/config' && req.method === 'POST') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const dados=await req.json().catch(()=>({}));
        if(dados.apagar===true){await cfgSet(env,'freeconvert_api_key','');return J({ok:true,configurada:!!env.FREECONVERT_API_KEY});}
        const chave=String(dados.chave||'').trim();
        if(!/^api_(?:production|sandbox)_[a-zA-Z0-9._-]{25,200}$/.test(chave))
          return J({ok:false,erro:'Formato de chave FreeConvert inválido.'},400);
        await cfgSet(env,'freeconvert_api_key',chave);
        return J({ok:true,configurada:true});
      }
      if(p==='/msg/entrada/reprocessar'&&req.method==='POST'){
        const tarefa=processarEntradas_(env,true).catch(()=>{});
        if(typeof ctx?.waitUntil==='function')ctx.waitUntil(tarefa);else await tarefa;
        try{await caches.default.delete(new Request('https://saude.invalid/entrada-v1'));}catch(_){}
        return J({ok:true,iniciado:true});
      }
      if (p === '/msg/instagram/segredo' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));
        if (d.apagar === true) { await cfgSet(env, 'ig_app_secret', null); return J({ ok: true, configurado: !!env.IG_APP_SECRET }); }
        const v = String(d.segredo || '').trim();
        if (!/^[A-Za-z0-9]{16,80}$/.test(v)) return J({ ok: false, erro: 'O segredo do app parece inválido. Cole só o código (letras e números), sem espaços.' }, 400);
        await cfgSet(env, 'ig_app_secret', v);
        return J({ ok: true, configurado: true });
      }
      if (p === '/msg/instagram/situacao' && req.method === 'GET') {
        let ult = null; try { ult = JSON.parse((await cfgGet(env, 'msg_ult_instagram')) || 'null'); } catch (e) { /* sem registro */ }
        const out = { ok: true, ultimaTentativa: ult, token: !!(await cfgGet(env, 'ig_token')), assinada: null };
        const tk = await cfgGet(env, 'ig_token');
        if (tk) { try { const r = await fetch(igBase(env) + '/me/subscribed_apps', { headers: { Authorization: 'Bearer ' + tk }, signal: AbortSignal.timeout(15000) }); const j = await r.json().catch(() => ({})); if (r.ok && Array.isArray(j.data)) out.assinada = j.data.some((a) => Array.isArray(a.subscribed_fields) && a.subscribed_fields.indexOf('messages') !== -1); else out.erroMeta = (j.error && j.error.message) || ('HTTP ' + r.status); } catch (e) { out.erroMeta = 'Sem resposta da Meta agora.'; } }
        return J(out);
      }
      if (p === '/msg/instagram/assinar' && req.method === 'POST') {
        const tk = await cfgGet(env, 'ig_token');
        if (!tk) return J({ ok: false, erro: 'Conecte o Instagram em Conexões antes (cole o token longo que começa com IGAA).' }, 409);
        try {
          const r = await fetch(igBase(env) + '/me/subscribed_apps?subscribed_fields=messages', { method: 'POST', headers: { Authorization: 'Bearer ' + tk }, signal: AbortSignal.timeout(15000) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.success === false) return J({ ok: false, erro: 'A Meta não aceitou: ' + ((j.error && j.error.message) || ('HTTP ' + r.status)) }, 409);
        } catch (e) { return J({ ok: false, erro: 'Sem resposta da Meta agora. Tente de novo.' }, 409); }
        return J({ ok: true });
      }
      if(p==='/msg/mobile/config'&&req.method==='GET')return J({ok:true,configurada:!!(await mobilePushKey_(env))});
      if(p==='/msg/mobile/config'&&req.method==='POST'){
        const d=await req.json().catch(()=>({}));if(d.apagar===true){await cfgSet(env,'mobile_onesignal_key',null);return J({ok:true,configurada:!!env.MOBILE_ONESIGNAL_KEY});}
        const key=String(d.chave||'').trim();if(key.length<20||key.length>500||/\s/.test(key))return J({ok:false,erro:'Cole a App API Key completa do OneSignal.'},400);
        try{const r=await fetch('https://api.onesignal.com/notifications?app_id=535f6b0d-c866-43c2-b241-43bd7ab62fae&limit=1',{headers:{Authorization:'Key '+key},signal:AbortSignal.timeout(10000)});if(r.body)await r.body.cancel();if(!r.ok)return J({ok:false,erro:'O OneSignal recusou essa chave. Use a App API Key do aplicativo da TENKiTER.'},400);}catch(_){return J({ok:false,erro:'Não foi possível conferir com o OneSignal agora.'},502);}
        await cfgSet(env,'mobile_onesignal_key',key);return J({ok:true,configurada:true});
      }
      if(p==='/msg/mobile/subscription' && ['POST','DELETE'].includes(req.method)) return J(await registrarMobile_(env,req));
      /* v2.14: Zernio (Instagram Direct pela API oficial, app já aprovado pela Meta). A chave fica só no D1; a tela recebe só se está ligada e qual Instagram. */
      if (p.indexOf('/cofre/') === 0) { const rc = await rotasCofreW_(env, req, p, J); if (rc) return rc; }
      if (p === '/msg/zernio/config' && req.method === 'GET') {
        const conta = await cfgGet(env, 'zernio_conta');
        let c = null; try { c = conta ? JSON.parse(conta) : null; } catch (e) { c = null; }
        let ult = null; try { ult = JSON.parse((await cfgGet(env, 'msg_ult_zernio')) || 'null'); } catch (e) { ult = null; }
        return J({ ok: true, configurada: !!(await cfgGet(env, 'zernio_chave')), conta: c, conferidaEm: (await cfgGet(env, 'zernio_conferida')) || '', avisoLigado: !!(await cfgGet(env, 'zernio_wh_id')), ultimoAviso: ult });
      }
      if (p === '/msg/zernio/config' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));
        if (d.apagar === true) {
          const zc = await cfgGet(env, 'zernio_chave'), wid = await cfgGet(env, 'zernio_wh_id');
          if (zc && wid) await zernioApi_(zc, 'DELETE', '/webhooks/settings?webhookId=' + encodeURIComponent(wid), null, 10000);
          for (const k of ['zernio_chave', 'zernio_conta', 'zernio_conferida', 'zernio_wh_id', 'zernio_wh_em']) await cfgSet(env, k, null);
          return J({ ok: true, configurada: false });
        }
        if (d.diagnostico === true || d.testar === true) return J(await diagnosticoZernio_(env, url.origin, d.testar === true));
        /* v2.17: com mais de um Instagram no Zernio, a tela lista e o gestor escolhe (listar / escolher usam a chave já guardada) */
        const usarGuardada = d.listar === true || typeof d.escolher === 'string';
        const chave = usarGuardada ? String((await cfgGet(env, 'zernio_chave')) || '') : String(d.chave || '').trim();
        if (usarGuardada && !chave) return J({ ok: false, erro: 'Guarde a chave do Zernio primeiro.' }, 409);
        if (!usarGuardada && (chave.length < 20 || chave.length > 300 || /\s/.test(chave))) return J({ ok: false, erro: 'Cole a chave de API completa do Zernio (Settings → API Keys).' }, 400);
        const r = await zernioContas_(chave);
        if (!r.ok) return J({ ok: false, erro: r.erro }, r.cod || 400);
        const contas = r.contas.filter((x) => x && x.platform === 'instagram').map((x) => ({ id: String(x._id || ''), usuario: String(x.username || x.displayName || '').slice(0, 60) })).filter((x) => x.id);
        let atual = null; try { atual = JSON.parse((await cfgGet(env, 'zernio_conta')) || 'null'); } catch (e) { atual = null; }
        let conta;
        if (typeof d.escolher === 'string') { conta = contas.find((x) => x.id === d.escolher); if (!conta) return J({ ok: false, erro: 'Esse Instagram não está conectado no Zernio.' }, 400); }
        else if (d.listar === true) conta = (atual && contas.find((x) => x.id === atual.id)) || null;
        else conta = contas.find((x) => /tenkiter/i.test(x.usuario)) || contas[0] || null;      // prefere o Instagram da loja quando há mais de um
        if (!usarGuardada) await cfgSet(env, 'zernio_chave', chave);
        if (d.listar !== true) { await cfgSet(env, 'zernio_conta', conta ? JSON.stringify(conta) : null); await cfgSet(env, 'zernio_conferida', agora()); }
        let aviso = null;
        if (d.listar !== true && conta) aviso = await ligarAvisoZernio_(env, url.origin, { chave: chave, conta: conta });
        return J({ ok: true, configurada: true, conta: conta, contas: contas, aviso: aviso, avisoLigado: !!(await cfgGet(env, 'zernio_wh_id')), conferidaEm: await cfgGet(env, 'zernio_conferida') });
      }
      if(p==='/msg/contexto'&&req.method==='POST'){const d=await req.json().catch(()=>({}));return J(await repararContextoInstagram_(env,Number(d.conversa)));}
      if(p==='/msg/pessoas/google'&&req.method==='POST')return J(await indexarNomesGoogle_(env));
      if(p==='/msg/pessoa'&&req.method==='GET'){const r=await pessoaAtendimento_(env,Number(url.searchParams.get('conversa')));return r?J(r):J({ok:false,erro:'Conversa não encontrada.'},404);}
      if(p==='/msg/pessoa'&&req.method==='POST'){const r=await salvarPessoaAtendimento_(env,await req.json().catch(()=>({})));return J(r,r.ok?200:400);}
      if (p === '/msg/presenca' && req.method === 'POST') {
        if(!direitos.acessar) return J({ok:false,erro:'Seu acesso não permite usar esta ferramenta de Mensagens.'},403);
        const d=await req.json().catch(()=>({})),usuario=msgTelefone_(req.headers.get('X-TK-Whats')),nome=await meuNomeAtendente_(env,req),em=agora();
        const id=Number.isSafeInteger(Number(d.conversa))?Math.max(0,Number(d.conversa)):0;
        if(id&&!await env.DB.prepare('SELECT id FROM msg_conversa WHERE id=?').bind(id).first())return J({ok:false,erro:'Conversa não encontrada.'},404);
        const antiga=await env.DB.prepare('SELECT em,conversa_id FROM msg_presenca WHERE usuario=?').bind(usuario).first();
        await env.DB.prepare('INSERT INTO msg_presenca(usuario,nome,em,conversa_id) VALUES(?,?,?,?) ON CONFLICT(usuario) DO UPDATE SET nome=excluded.nome,em=excluded.em,conversa_id=excluded.conversa_id').bind(usuario,nome,em,id).run();
        // Só registra mudança de estado: primeira sessão, volta depois de 2 minutos ou troca de conversa.
        if(!antiga||Date.now()-Date.parse(antiga.em)>120000||id!==antiga.conversa_id)await registrarAtividade_(env,req,{conversa:id},id?(d.espiar===true?'espiar':'visualizar'):'online');
        return J({ok:true});
      }
      if (p === '/msg/equipe' && req.method === 'GET') {
        const r=await equipeAtendimento_(env,url),cod=r.cod||200;delete r.cod;return J(r,cod);
      }
      if (p === '/msg/iniciar' && req.method === 'POST') {
        const d=await req.json().catch(()=>({}));
        auditarAtividade_=Promise.resolve(d);
        const r=await iniciarConversa_(env,req,d),cod=r.cod||200;delete r.cod;return J(r,cod);
      }
      if (p === '/msg/resumo' && req.method === 'GET') return J(await resumoMensagens_(env, url.origin));
      if (p === '/msg/conversas' && req.method === 'GET') {
        const cursorConsulta=agora();
        const canal = url.searchParams.get('canal') || '', busca = String(url.searchParams.get('busca') || '').trim().slice(0, 60), antes = url.searchParams.get('antes') || '', filtro = url.searchParams.get('filtro') || '';
        const tipo = ['individual', 'grupo'].includes(url.searchParams.get('tipo')) ? url.searchParams.get('tipo') : '';   // v2.12: só conversas, só grupos ou os dois
        const todos = canal === 'todos';   // v2.10: aba "Todas" = os três canais juntos
        if (!todos && !MSG_CANAIS.includes(canal)) return J({ ok: false, erro: 'Escolha Todas, Instagram, WhatsApp 1 ou WhatsApp 2.' }, 400);
        let sql = 'SELECT ' + MSG_COLS_CONVERSA_ + ' FROM msg_conversa WHERE ' + (todos ? '' : 'canal=? AND ') + 'total>0', args = todos ? [] : [canal];
        // v2.11: encerradas só aparecem no filtro "Encerradas" (ou numa busca); voltam sozinhas quando o cliente escreve de novo
        if (filtro === 'encerradas') sql += " AND encerrada_em<>''"; else if (!busca) sql += " AND encerrada_em=''";
        if (filtro === 'nao_lidas') sql += ' AND nao_lidas>0'; else if (filtro === 'lidas') sql += ' AND nao_lidas=0'; else if (filtro === 'sem_resposta') sql += " AND (nao_lidas>0 OR ult_dir='entrada')"; else if (filtro === 'grupos') sql += ' AND grupo=1'; else if (filtro === 'ambos') sql += " AND pessoa<>'' AND " + MSG_OUTRO_SQL_ + ' IS NOT NULL';
        if(filtro==='com_notas')sql+=" AND encerrada_em='' AND "+MSG_NOTAS_COUNT_SQL_+'>0';
        const fila=url.searchParams.get('fila')||'',escopo=url.searchParams.get('escopo')||'todos';
        if(!['','esperando','em_atendimento'].includes(fila)||!['todos','meus'].includes(escopo))return J({ok:false,erro:'Escolha uma fila e Todos ou Meus.'},400);
        if(fila&&tipo!=='grupo'&&filtro!=='encerradas'){
          sql+=" AND encerrada_em='' AND grupo=0 AND "+(fila==='esperando'?'NOT ':'')+MSG_ATENDIDO_SQL_;
          if(fila==='em_atendimento'&&escopo==='meus'){sql+=' AND dono=?';args.push(await meuNomeAtendente_(env,req));}
        }
        if (tipo) sql += tipo === 'grupo' ? ' AND grupo=1' : ' AND grupo=0';
        if (filtro === 'minhas') { sql += ' AND dono=?'; args.push(await meuNomeAtendente_(env, req)); }
        if (filtro === 'retomar') {   // v7.40.12: quem parou de responder (última mensagem foi nossa) ou reservou e não pagou, parado há 1 a 30 dias
          sql += " AND grupo=0 AND ultima_em<? AND ultima_em>? AND (ult_dir='saida' OR (CASE WHEN " + MSG_IDENTIDADE_SQL_ + "<>'' THEN " + MSG_IDENTIDADE_SQL_ + " ELSE 'c:'||msg_conversa.id END) IN (SELECT a.alvo FROM msg_alvo_etiqueta a JOIN msg_etiqueta e ON e.id=a.etiqueta_id WHERE e.arquivada=0 AND e.nome IN ('Reserva','Aguardando pagamento')))";
          args.push(new Date(Date.now() - 864e5).toISOString(), new Date(Date.now() - 30 * 864e5).toISOString());
        }
        const etqF = Number(url.searchParams.get('etiqueta')) || 0;
        if (etqF) { sql += " AND (CASE WHEN " + MSG_IDENTIDADE_SQL_ + "<>'' THEN " + MSG_IDENTIDADE_SQL_ + " ELSE 'c:'||msg_conversa.id END) IN (SELECT alvo FROM msg_alvo_etiqueta WHERE etiqueta_id=?)"; args.push(etqF); }
        if (busca) { sql += ' AND ('+MSG_NOME_SQL_+' LIKE ? OR contato LIKE ? OR previa LIKE ? ' + (busca.length >= 3 ? ' OR EXISTS (SELECT 1 FROM msg_mensagem mm WHERE mm.conversa_id=msg_conversa.id AND mm.texto LIKE ?)' : '') + ')'; const q = '%' + busca.replace(/[%_]/g, '') + '%'; args.push(q, q, q); if (busca.length >= 3) args.push(q); }
        // A página seleciona PESSOAS; só depois traz seus canais. Uma conversa antiga
        // não pode desaparecer do bloco porque outras 50 conversas são mais recentes.
        let rs;
        if(url.searchParams.get('blocos')==='1'){
        const key = "CASE WHEN grupo=1 THEN 'grupo:'||id ELSE COALESCE(NULLIF("+MSG_IDENTIDADE_SQL_+",''),'conversa:'||id) END";
        let pagina = 'SELECT bloco, MAX(ultima_em) AS em, MAX(id) AS ancora FROM base GROUP BY bloco';
        if (antes) {const id=Number(url.searchParams.get('antesId'))||0;pagina += id?' HAVING (MAX(ultima_em)<? OR (MAX(ultima_em)=? AND MAX(id)<?))':' HAVING MAX(ultima_em)<?';args.push(...(id?[antes,antes,id]:[antes]));}
        rs = await env.DB.prepare('WITH base AS (' + sql.replace('SELECT '+MSG_COLS_CONVERSA_, 'SELECT '+MSG_COLS_CONVERSA_+', '+key+' AS bloco') + '), pagina AS ('+pagina+' ORDER BY em DESC, ancora DESC LIMIT 50) SELECT base.* FROM base JOIN pagina USING(bloco) ORDER BY pagina.em DESC, pagina.ancora DESC, base.ultima_em DESC, base.id DESC').bind(...args).all();
        }else{
          if(antes){const id=Number(url.searchParams.get('antesId'))||0;sql+=id?' AND (ultima_em<? OR (ultima_em=? AND id<?))':' AND ultima_em<?';args.push(...(id?[antes,antes,id]:[antes]));}
          rs=await env.DB.prepare(sql+' ORDER BY ultima_em DESC,id DESC LIMIT 50').bind(...args).all();
        }
        try { const mp = await etiquetasDosAlvos_(env, rs.results.map(alvoDe_)); rs.results.forEach((r) => { r.etiquetas = mp[alvoDe_(r)] || []; }); } catch (e) { /* etiqueta é conforto */ }
        // Indicador de agenda na fila: consulta em lote, sem N requisições por cliente.
        // Somente agendamentos realmente pendentes; não mostrar cancelados, enviados ou falhos.
        if (direitos.agenda && rs.results.length) {
          try {
            const ids = [...new Set(rs.results.map(c => Number(c.id)).filter(Number.isSafeInteger))];
            if (ids.length) {
              const marcadores = await env.DB.prepare(
                'SELECT conversa_id, COUNT(*) AS total, MIN(quando) AS proxima FROM msg_agenda WHERE status IN (\'pendente\',\'enviando\') AND conversa_id IN (' +
                ids.map(() => '?').join(',') + ') GROUP BY conversa_id'
              ).bind(...ids).all();
              const porConversa = new Map((marcadores.results || []).map(a => [Number(a.conversa_id), a]));
              rs.results.forEach(c => {
                const agenda = porConversa.get(Number(c.id));
                c.agenda_pendente = agenda ? Number(agenda.total) : 0;
                c.agenda_proxima = agenda ? agenda.proxima : '';
              });
            }
          } catch (e) { /* Agenda não disponível: não inventar indicador. */ }
        }
        const geral = (await msgContagens_(env, todos ? '' : canal))[canal];
        return J({ ok: true, conversas: rs.results, contagens: tipo ? (await msgContagens_(env, todos ? '' : canal, tipo))[canal] : geral, tipos: { individuais: geral.individuais, grupos: geral.grupos }, cursor: cursorConsulta });
      }
      if (p === '/msg/mensagens' && req.method === 'GET') {
        const id = Number(url.searchParams.get('conversa')), antes = url.searchParams.get('antes') || '';
        if (!id) return J({ ok: false, erro: 'Escolha uma conversa.' }, 400);
        const conv = await env.DB.prepare('SELECT ' + MSG_COLS_CONVERSA_ + ' FROM msg_conversa WHERE id=?').bind(id).first();
        if (!conv) return J({ ok: false, erro: 'Conversa não encontrada.' }, 404);
        const antesId=Number(url.searchParams.get('antesId'))||0;
        const where=antes?(antesId>0?' AND (enviada_em<? OR (enviada_em=? AND id<?))':' AND enviada_em<?'):'';
        const args=antes?(antesId>0?[id,antes,antes,antesId]:[id,antes]):[id];
        const rs = await env.DB.prepare('SELECT ' + MSG_COLS_MSG_ + ' FROM msg_mensagem WHERE conversa_id=?' + where + ' ORDER BY enviada_em DESC, id DESC LIMIT 100').bind(...args).all();
        const notas = antes ? [] : ((await env.DB.prepare('SELECT id, texto, autor, em FROM msg_nota WHERE alvo=? AND length(excluida_em)=0 ORDER BY em LIMIT 200').bind(conv.pessoa ? String(conv.pessoa) : 'c:' + id).all()).results || []);
        try { conv.etiquetas = (await etiquetasDosAlvos_(env, [alvoDe_(conv)]))[alvoDe_(conv)] || []; } catch (e) { conv.etiquetas = []; }
        if (!antes && !conv.grupo) { try { const fx = await env.DB.prepare('SELECT tamanhos FROM msg_ficha WHERE alvo=?').bind(alvoDe_(conv)).first(); conv.tamanhos = (fx && fx.tamanhos) || ''; } catch (e) { conv.tamanhos = ''; } }   // v7.40.14: "Veste M · 38" na faixa
        let agendadas; if (!antes) { try { agendadas = (await agendasDaConversa_(env, id)).pendentes; } catch (e) { agendadas = []; } }
        return J({ ok: true, conversa: conv, mensagens: rs.results.reverse(), notas: notas, agendadas: agendadas, acompanhamento:direitos.agenda?await acompanhamentoDaConversa_(env,id):undefined, temMais: rs.results.length === 100, cursor: agora() });
      }
      if (p === '/msg/etiquetas' && req.method === 'GET') {
        const lista = await etiquetas_(env);
        const cont = (await env.DB.prepare('SELECT etiqueta_id AS id, COUNT(*) AS n FROM msg_alvo_etiqueta GROUP BY etiqueta_id').all()).results || [];
        lista.forEach((e) => { const x = cont.find((c) => c.id === e.id); e.pessoas = x ? x.n : 0; });
        return J({ ok: true, etiquetas: lista, cores: ETQ_CORES_ });
      }
      if (p === '/msg/rotular' && req.method === 'POST') {   // substitui as etiquetas da pessoa; de venda fica só uma (a etapa)
        const d = await req.json().catch(() => ({})), id = Number(d.conversa) || 0;
        const conv = await env.DB.prepare('SELECT id, ' + MSG_IDENTIDADE_SQL_ + ' AS pessoa FROM msg_conversa WHERE id=?').bind(id).first();
        if (!conv) return J({ ok: false, erro: 'Conversa não encontrada.' }, 404);
        const validas = await etiquetas_(env), quer = (Array.isArray(d.etiquetas) ? d.etiquetas : []).map(Number).filter((x) => validas.some((e) => e.id === x));
        const venda = quer.filter((x) => validas.find((e) => e.id === x).venda), fica = quer.filter((x) => !validas.find((e) => e.id === x).venda).concat(venda.slice(-1));
        return J({ ok: true, etiquetas: await gravarEtiquetas_(env, conv, fica) });
      }
      if (p === '/msg/funil' && req.method === 'GET') {   // v7.40.15: funil de vendas
        const cf = url.searchParams.get('canal') || 'todos';
        if (cf !== 'todos' && !MSG_CANAIS.includes(cf)) return J({ ok: false, erro: 'Escolha Todas, Instagram, WhatsApp 1 ou WhatsApp 2.' }, 400);
        return J({ ok: true, canal: cf, colunas: await funilVendas_(env, cf === 'todos' ? '' : cf) });
      }
      if (p === '/msg/funil/mover' && req.method === 'POST') {
        const [st, r] = await moverNoFunil_(env, await req.json().catch(() => ({})));
        return st ? J({ ok: false, erro: r }, st) : J(Object.assign({ ok: true }, r));
      }
      if((p==='/msg/notas'||p==='/msg/notas/log')&&(req.method==='GET'||req.method==='DELETE')){
        const id=Number(url.searchParams.get('conversa'))||0;
        const conv=await env.DB.prepare('SELECT id,'+MSG_IDENTIDADE_SQL_+' AS pessoa FROM msg_conversa WHERE id=?').bind(id).first();
        if(!conv)return J({ok:false,erro:'Conversa não encontrada.'},404);
        const alvo=conv.pessoa?String(conv.pessoa):'c:'+id;
        if(p==='/msg/notas/log'){
          if(!direitos.exportar || !direitos.notas)return J({ok:false,erro:'Seu acesso não permite consultar o histórico de exclusões.'},403);
          return J({ok:true,exclusoes:(await env.DB.prepare("SELECT id,texto,autor,em,excluida_em,excluida_por FROM msg_nota WHERE alvo=? AND excluida_em<>'' ORDER BY excluida_em DESC LIMIT 200").bind(alvo).all()).results});
        }
        if(req.method==='DELETE'){
          const nota=Number(url.searchParams.get('id'))||0,quem=(await meuNomeAtendente_(env,req))+' · '+(req.headers.get('X-TK-Whats')||'').replace(/\D/g,''),em=agora();
          const changed=await env.DB.prepare("UPDATE msg_nota SET excluida_em=?,excluida_por=? WHERE id=? AND alvo=? AND length(excluida_em)=0").bind(em,quem,nota,alvo).run();
          if(changed.meta.changes)await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE '+MSG_NOTAS_ALVO_SQL_+'=?').bind(em,alvo).run();
        }
        return J({ok:true,notas:(await env.DB.prepare("SELECT id,texto,autor,em FROM msg_nota WHERE alvo=? AND length(excluida_em)=0 ORDER BY em,id LIMIT 200").bind(alvo).all()).results});
      }
      if (p === '/msg/notas' && req.method === 'POST') {   // v7.40.3: nota interna, compartilhada entre os canais vinculados da pessoa
        const d = await req.json().catch(() => ({})), id = Number(d.conversa) || 0, texto = String(d.texto || '').trim().slice(0, 1000);
        if (!texto) return J({ ok: false, erro: 'Escreva a nota antes de salvar.' }, 400);
        const conv = await env.DB.prepare('SELECT id, ' + MSG_IDENTIDADE_SQL_ + ' AS pessoa FROM msg_conversa WHERE id=?').bind(id).first();   // mesma identidade da leitura (canais vinculados)
        if (!conv) return J({ ok: false, erro: 'Conversa não encontrada.' }, 404);
        const quem = (req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(0, 20), autor = (quem && (await cfgGet(env, 'msg_atendente_' + quem))) || 'Equipe', em = agora();
        const r = await env.DB.prepare('INSERT INTO msg_nota (alvo, texto, autor, em) VALUES (?,?,?,?)').bind(conv.pessoa ? String(conv.pessoa) : 'c:' + id, texto, String(autor).slice(0, 30), em).run();
        await env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE '+MSG_NOTAS_ALVO_SQL_+'=?').bind(em,conv.pessoa?String(conv.pessoa):'c:'+id).run();
        return J({ ok: true, nota: { id: r.meta && r.meta.last_row_id, texto: texto, autor: autor, em: em } });
      }
      if (p === '/msg/ficha' && req.method === 'GET') {   // v7.40.14: ficha do cliente
        const [st, conv] = await convFicha_(env, Number(url.searchParams.get('conversa')) || 0);
        if (st) return J({ ok: false, erro: conv }, st);
        return J(Object.assign({ ok: true }, await fichaDaConversa_(env, conv)));
      }
      if (p === '/msg/ficha' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));
        const [st, conv] = await convFicha_(env, Number(d.conversa) || 0);
        if (st) return J({ ok: false, erro: conv }, st);
        const nome = 'nome' in d ? String(d.nome || '').trim() : null;
        if (nome !== null && (!nome || nome.length > 120)) return J({ok:false,erro:'Informe o nome do cliente com até 120 letras.'},400);
        const [erro, v] = validarFicha_(d);
        if (erro) return J({ ok: false, erro: erro }, 400);
        const alvo = alvoDe_(conv), atual = (await env.DB.prepare('SELECT tamanhos, preferencias, cidade, perfil_json FROM msg_ficha WHERE alvo=?').bind(alvo).first()) || {};
        const n = Object.assign({ tamanhos: atual.tamanhos || '', preferencias: atual.preferencias || '', cidade: atual.cidade || '' }, v), em = agora();
        let perfil = perfilFichaJson_(atual.perfil_json);
        if (v.perfil) {
          const bruto = d.perfil || {};
          for (const k of ['cidade','municipio','bairro','localidade']) if (Object.prototype.hasOwnProperty.call(bruto,k)) perfil[k] = v.perfil[k];
          perfil.preferencias = perfil.preferencias && typeof perfil.preferencias === 'object' ? perfil.preferencias : {};
          const brutoPref = bruto.preferencias && typeof bruto.preferencias === 'object' ? bruto.preferencias : {};
          for (const grupo of FICHA_GRUPOS_) if (Object.prototype.hasOwnProperty.call(brutoPref,grupo)) perfil.preferencias[grupo] = v.perfil.preferencias[grupo];
          if(Object.prototype.hasOwnProperty.call(brutoPref,'tamanhos'))n.tamanhos=perfil.preferencias.tamanhos.join(' · ').slice(0,60);
          if(Object.prototype.hasOwnProperty.call(bruto,'cidade'))n.cidade=perfil.cidade.slice(0,60);
        }
        else if (Object.keys(perfil).length) {
          // Clientes antigos ainda podem editar os três campos legados; reflita só esses valores.
          if ('cidade' in v) perfil.cidade = v.cidade;
          if ('tamanhos' in v) { perfil.preferencias = perfil.preferencias || {}; perfil.preferencias.tamanhos = v.tamanhos ? v.tamanhos.split(/[·,;|]/).map(x=>x.trim()).filter(Boolean) : []; }
        }
        const pjson = JSON.stringify(perfil);
        const gravacoes = [env.DB.prepare('INSERT INTO msg_ficha (alvo, tamanhos, preferencias, cidade, atualizado_em, autor, perfil_json) VALUES (?,?,?,?,?,?,?) ON CONFLICT(alvo) DO UPDATE SET tamanhos=excluded.tamanhos, preferencias=excluded.preferencias, cidade=excluded.cidade, atualizado_em=excluded.atualizado_em, autor=excluded.autor, perfil_json=excluded.perfil_json').bind(alvo, n.tamanhos, n.preferencias, n.cidade, em, await meuNomeAtendente_(env, req), pjson)];
        if (nome !== null) {
          const key = conv.pessoa || 'c:' + conv.id;
          gravacoes.push(env.DB.prepare("INSERT INTO msg_pessoa (id,nome,whatsapp,segundo,em) VALUES (?,?,?,'',?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,em=excluded.em").bind(key,nome,conv.canal==='instagram'?'':conv.contato,em));
          if (!conv.pessoa) gravacoes.push(env.DB.prepare('UPDATE msg_conversa SET pessoa=? WHERE id=?').bind(key,conv.id));
          gravacoes.push(env.DB.prepare('UPDATE msg_conversa SET nome=?,atualizada_em=? WHERE id=? OR '+MSG_IDENTIDADE_SQL_+'=?').bind(nome,em,conv.id,key));
          conv.nome = nome; conv.pessoa = key;
        }
        await env.DB.batch(gravacoes);
        return J(Object.assign({ ok: true }, await fichaDaConversa_(env, conv)));
      }
      if (p === '/msg/novidades' && req.method === 'GET') {
        const cursorConsulta=agora();
        /* Consulta leve para a tela ao vivo: só o que mudou desde o último cursor (com folga de 3 s; a tela ignora repetidos). */
        const d0 = Date.parse(url.searchParams.get('desde') || ''), desde = new Date((isNaN(d0) ? Date.now() - 60000 : d0) - 3000).toISOString();
        const conv = Number(url.searchParams.get('conversa')) || 0, depois = Number(url.searchParams.get('depois')) || 0, st0 = Date.parse(url.searchParams.get('st') || ''), st = new Date((isNaN(st0) ? Date.now() - 60000 : st0) - 3000).toISOString();
        const cs = await env.DB.prepare('SELECT ' + MSG_COLS_CONVERSA_ + ' FROM msg_conversa WHERE atualizada_em>=? AND total>0 ORDER BY atualizada_em DESC LIMIT 100').bind(desde).all();
        let mensagens = [];
        if (conv) mensagens = (await env.DB.prepare('SELECT ' + MSG_COLS_MSG_ + ' FROM msg_mensagem WHERE conversa_id=? AND (id>? OR status_em>=?) ORDER BY enviada_em, id LIMIT 200').bind(conv, depois, st).all()).results;
        const saude = url.searchParams.get('cont') === '1' ? await saudeAvisos_(env) : undefined;
        let notas;if(conv){const c=await env.DB.prepare('SELECT id,'+MSG_IDENTIDADE_SQL_+' AS pessoa FROM msg_conversa WHERE id=?').bind(conv).first();if(c)notas=(await env.DB.prepare("SELECT id,texto,autor,em FROM msg_nota WHERE alvo=? AND length(excluida_em)=0 ORDER BY em,id LIMIT 200").bind(c.pessoa?String(c.pessoa):'c:'+conv).all()).results;}
        const agendadas=conv&&direitos.agenda&&(cs.results.some(c=>c.id===conv)||url.searchParams.get('cont')==='1')?(await agendasDaConversa_(env,conv)).pendentes:undefined;
        return J({ ok: true, cursor: cursorConsulta, saude: saude, notas:notas,agendadas, acompanhamento:conv&&direitos.agenda?await acompanhamentoDaConversa_(env,conv):undefined, conversas: cs.results, mensagens: mensagens, contagens: (cs.results.length || url.searchParams.get('cont') === '1') ? await msgContagens_(env) : undefined });
      }
      if (p === '/msg/diagnostico' && req.method === 'GET') {
        const out = {}; for (const n of [1, 2]) { try { out['whatsapp' + n] = JSON.parse((await cfgGet(env, 'msg_ligar_diag_' + n)) || 'null'); } catch (e) { out['whatsapp' + n] = null; } }
        const forma = {}; for (const c of ['whatsapp1', 'whatsapp2']) { try { forma[c] = JSON.parse((await cfgGet(env, 'msg_ult_forma_' + c)) || 'null'); } catch (e) { forma[c] = null; } }
        return J({ ok: true, ligar: out, forma: forma });
      }
      if (p === '/msg/anexo' && req.method === 'POST') { const [cod, corpo] = await receberAnexo_(env, req, url); return J(corpo, cod); }
      if (p === '/msg/stories' && req.method === 'GET') {
        const conv = await env.DB.prepare('SELECT canal FROM msg_conversa WHERE id=?').bind(Number(url.searchParams.get('conversa'))).first();
        if (!conv) return J({ ok: false, erro: 'Conversa não encontrada.' }, 404);
        const t = Date.parse(url.searchParams.get('em') || ''), em = new Date(isNaN(t) ? Date.now() : Math.min(t, Date.now())).toISOString();
        return J({ ok: true, stories: await storiesNoAr_(env, conv.canal, em), em: em });
      }
      if (p === '/msg/midia' && req.method === 'GET') {
        const id = Number(url.searchParams.get('id')), ctx = url.searchParams.get('ctx') === '1', post = Number(url.searchParams.get('post')) || 0;
        const m = post ? { id: 0, midia_mime: '' } : (id ? await env.DB.prepare('SELECT id, canal, tipo, texto, midia_chave, midia_mime, midia_url, ctx_post, ctx_chave FROM msg_mensagem WHERE id=?').bind(id).first() : null);
        if (!m) return J({ ok: false, erro: 'Mídia não encontrada.' }, 404);
        if (m.tipo === 'documento' && !direitos.arquivos) return J({ok:false,erro:'Seu acesso não permite baixar arquivos.'},403);
        let chave = '';
        if (post) {
          const ok = await env.DB.prepare("SELECT 1 AS x FROM postagem WHERE id=? AND status='publicado' AND canal IN ('whatsapp','ambos','whatsapp2')").bind(post).first();
          if (ok) chave = await chaveMidiaPostagem_(env, post, Math.max(0, Math.min(9, Number(url.searchParams.get('n')) || 0)));
        } else if (ctx) {
          if (m.ctx_chave) chave = m.ctx_chave;
          else if (m.ctx_post) {
            chave = await chaveMidiaPostagem_(env, m.ctx_post, 0);
          }
        } else {
          chave = m.midia_chave || '';
          if (!chave && m.midia_url) {
            const x = await copiarMidiaRemota_(env, m.midia_url, m.midia_mime,m.tipo==='documento');
            if (x) { chave = x.chave; await env.DB.prepare("UPDATE msg_mensagem SET midia_chave=?, midia_mime=?, midia_url='' WHERE id=?").bind(x.chave, x.mime, m.id).run(); }
          }
        }
        if (!chave || chave.includes('..')) return J({ ok: false, erro: 'A mídia não está mais disponível (o link expirou).' }, 404);
        const obj = await env.MIDIA.get(chave);
        if (!obj) return J({ ok: false, erro: 'A mídia não está mais disponível.' }, 404);
        const mime = mimeLimpo_((obj.httpMetadata && obj.httpMetadata.contentType) || m.midia_mime), seguro = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm|3gpp)|audio\/[a-z0-9.+-]+|application\/pdf)$/.test(mime);
        const baixar=url.searchParams.get('baixar')==='1'||m.tipo==='documento';
        if (m.tipo === 'documento' && !direitos.arquivos) return J({ok:false,erro:'Seu acesso não permite baixar arquivos.'},403);
        const nome=String(m.texto||'').split('\n').map(x=>x.trim()).find(x=>/\.[a-z0-9]{1,12}$/i.test(x))||('arquivo-'+m.id+'.'+(MSG_MIME_EXT_[mime]||'bin'));
        const limpo=Array.from(nome.toWellFormed().replace(/[\x00-\x1f\x7f/\\]/g,'_')).slice(0,180).join('');
        const ascii=limpo.normalize('NFD').replace(/[^a-zA-Z0-9._ -]/g,'_');
        const h2=new Headers(h);h2.set('Content-Type',seguro?mime:'application/octet-stream');h2.set('Cache-Control','private, no-store');h2.set('X-Content-Type-Options','nosniff');
        h2.set('Content-Disposition',baixar||!seguro?'attachment; filename="'+ascii+'"; filename*=UTF-8\'\''+encodeURIComponent(limpo).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()):'inline');h2.set('Access-Control-Expose-Headers','Content-Disposition,Content-Length');
        return new Response(obj.body, { status: 200, headers: h2 });
      }
      if (p === '/msg/contagem' && req.method === 'GET') return J({ ok: true, contagens: await msgContagens_(env) });
      if (p === '/msg/enviar' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));delete d._acompanhamento;delete d._janelaAutomatica;
        if(!perms.includes('gerir_acessos') && String(d.texto||'').trim()){const c=await env.DB.prepare('SELECT canal FROM msg_conversa WHERE id=?').bind(Number(d.conversa)||0).first();if(c)d.texto=await textoAssinadoEquipe_(env,req,c.canal,d.texto);}
        const [cod, corpo] = await responderMensagem_(env, req.headers.get('X-TK-Whats') || '', d);
        if (cod === 200 && corpo && corpo.ok && Number(d.conversa)) { try { await env.DB.prepare("UPDATE msg_conversa SET dono=? WHERE id=? AND (dono IS NULL OR dono='')").bind(await meuNomeAtendente_(env, req), Number(d.conversa)).run(); } catch (e) { /* dono é conforto */ } }   // v7.40.6: quem responde primeiro vira o responsável
        return J(corpo, cod);
      }
      if(p==='/msg/acompanhamento'&&req.method==='GET'){
        const id=Number(url.searchParams.get('conversa'))||0;
        if(!id)return J({ok:false,erro:'Escolha uma conversa.'},400);
        return J({ok:true,acompanhamento:await acompanhamentoDaConversa_(env,id)});
      }
      if(p==='/msg/acompanhamento'&&req.method==='POST'){
        const d=await req.json().catch(()=>({}));
        if(d.ligado===true&&!direitos.responder)return J({ok:false,erro:'Seu acesso não permite enviar mensagens.'},403);
        const r=await alterarAcompanhamento_(env,req,d),cod=r.cod||200;delete r.cod;return J(r,cod);
      }
      if (p === '/msg/agendar' && req.method === 'POST') {
        if(!direitos.responder)return J({ok:false,erro:'Seu acesso não permite enviar mensagens.'},403);
        const d=await req.json().catch(()=>({})),id=Number(d.conversa)||0;
        const conv=id?await env.DB.prepare('SELECT id,canal,ult_entrada_em FROM msg_conversa WHERE id=?').bind(id).first():null;
        if(!conv)return J({ok:false,erro:'Conversa não encontrada.'},404);
        if(!perms.includes('gerir_acessos')&&String(d.texto||'').trim())d.texto=await textoAssinadoEquipe_(env,req,conv.canal,d.texto);
        const [erro,v]=validarAgenda_(d);if(erro)return J({ok:false,erro},400);
        if(conv.canal==='instagram'&&(!conv.ult_entrada_em||Date.parse(v.quando)>=Date.parse(conv.ult_entrada_em)+24*3600000))return J({ok:false,erro:'Escolha um horário dentro das 24 horas da última mensagem recebida no Instagram.'},400);
        let mime='',nome='';
        if(v.anexo){
          const head=await env.MIDIA.head(v.anexo);mime=mimeLimpo_(head?.httpMetadata?.contentType||'');
          if(!head||!MSG_TIPO_DE_MIME_(mime))return J({ok:false,erro:'O anexo não está disponível. Escolha de novo.'},400);
          if(conv.canal==='instagram'&&v.texto)return J({ok:false,erro:'No Instagram, agende o arquivo e o texto em mensagens separadas.'},400);
          nome=String(d.anexoNome||'Anexo').replace(/[\/\\\r\n\u0000-\u001f]/g,' ').trim().slice(0,120)||'Anexo';
        }
        const whats=(req.headers.get('X-TK-Whats')||'').replace(/\D/g,'').slice(0,20),autor=await meuNomeAtendente_(env,req),em=agora();
        const nonce=d.idLocal==null?hex(16):String(d.idLocal);
        if(!/^[A-Za-z0-9_-]{8,64}$/.test(nonce))return J({ok:false,erro:'Atualize a conversa e tente novamente.'},400);
        const chave=await sha(whats+'|agenda|'+nonce);
        let nova=await env.DB.prepare('SELECT '+AGENDA_COLS_+' FROM msg_agenda WHERE chave=?').bind(chave).first();
        if(nova)return J({ok:true,agendada:nova,...await agendasDaConversa_(env,id)});
        const n=await env.DB.prepare("SELECT COUNT(*) n FROM msg_agenda WHERE conversa_id=? AND status='pendente'").bind(id).first();
        if(Number(n?.n)>=20)return J({ok:false,erro:'Esta conversa já tem 20 mensagens agendadas. Cancele alguma antes.'},409);
        const auth=await guardarAutorizacaoAgenda_(env,req);
        await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO msg_agenda(conversa_id,texto,quando,autor,whats,status,criado_em,anexo,anexo_nome,anexo_mime,auth_ref,chave) VALUES(?,?,?,?,?,'pendente',?,?,?,?,?,?)").bind(id,v.texto,v.quando,autor,whats,em,v.anexo,nome,mime,auth,chave),env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=? AND changes()=1').bind(em,id)]);
        nova=await env.DB.prepare('SELECT '+AGENDA_COLS_+' FROM msg_agenda WHERE chave=?').bind(chave).first();
        return J({ok:true,agendada:nova,...await agendasDaConversa_(env,id)});
      }
      if (p === '/msg/agendadas' && req.method === 'GET') {
        const id = Number(url.searchParams.get('conversa')) || 0;
        if (!id) return J(await painelAgenda_(env,req,url));
        return J(Object.assign({ ok: true }, await agendasDaConversa_(env, id)));
      }
      if (p === '/msg/agendar/cancelar' && req.method === 'POST') {
        const d = await req.json().catch(() => ({})), id = Number(d.id) || 0;
        const a = id ? await env.DB.prepare('SELECT conversa_id, status,acompanhamento FROM msg_agenda WHERE id=?').bind(id).first() : null;
        if (!a) return J({ ok: false, erro: 'Agendamento não encontrado.' }, 404);
        if(a.acompanhamento){const r=await alterarAcompanhamento_(env,req,{conversa:a.conversa_id,ligado:false});return J({...r,...await agendasDaConversa_(env,a.conversa_id)});}
        const [r] = await env.DB.batch([env.DB.prepare("UPDATE msg_agenda SET status='cancelada' WHERE id=? AND status='pendente'").bind(id),env.DB.prepare('UPDATE msg_conversa SET atualizada_em=? WHERE id=? AND changes()=1').bind(agora(),a.conversa_id)]);
        if (!r.meta || r.meta.changes !== 1) return J({ ok: false, erro: a.status === 'cancelada' ? 'Este agendamento já estava cancelado.' : 'Não dá mais para cancelar: a mensagem já ' + (a.status === 'enviando' ? 'está saindo' : a.status === 'enviada' ? 'foi enviada' : 'foi processada') + '.' }, 409);
        return J(Object.assign({ ok: true }, await agendasDaConversa_(env, a.conversa_id)));
      }
      if (p === '/msg/dono' && req.method === 'POST') {
        const d = await req.json().catch(() => ({})), id = Number(d.conversa) || 0, nome = d.assumir === false ? '' : await meuNomeAtendente_(env, req);
        /* v7.40.35: `atender: true` marca atendido_em — é o gesto "Atender" que tira a conversa de
           Pendentes. Sem ele (só assumir), a conversa continua na fila, como manda a regra do #305.
           Liberar (assumir:false) limpa os dois. */
        const atendeu = d.atender === true && d.assumir !== false;
        const r = await env.DB.prepare(atendeu ? 'UPDATE msg_conversa SET dono=?, atendido_em=?, atualizada_em=? WHERE id=?' : 'UPDATE msg_conversa SET dono=?, atualizada_em=? WHERE id=?').bind(...(atendeu ? [nome, agora(), agora(), id] : [nome, agora(), id])).run();
        if (!r.meta || !r.meta.changes) return J({ ok: false, erro: 'Conversa não encontrada.' }, 404);
        return J({ ok: true, dono: nome });
      }
      if (p === '/msg/lida' && req.method === 'POST' && (await req.clone().json().catch(() => ({}))).conversas) {
        /* v2.12: marcar várias como lidas/não lidas de uma vez. Lidas também no celular quando o canal está com a opção ligada (só as que estavam não lidas). */
        const d = await req.json().catch(() => ({})), ids = [...new Set((Array.isArray(d.conversas) ? d.conversas : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 50);
        if (!ids.length) return J({ ok: false, erro: 'Escolha ao menos uma conversa.' }, 400);
        const naoLida = d.naoLida === true, marca = ids.map(() => '?').join(','), t = agora();
        const antes = (await env.DB.prepare('SELECT id, canal, contato, grupo, nao_lidas FROM msg_conversa WHERE id IN (' + marca + ')').bind(...ids).all()).results;
        await env.DB.prepare('UPDATE msg_conversa SET nao_lidas=?, atualizada_em=? WHERE id IN (' + marca + ')').bind(naoLida ? 1 : 0, t, ...ids).run();
        const cel = { ok: 0, falhas: 0, desligado: 0 };
        if (!naoLida && d.celular === true) {
          const cfgL = (await msgCfg_(env)).lerCelular;
          for (const c of antes) {
            if (!(c.nao_lidas > 0)) continue;
            if (!cfgL[c.canal]) { cel.desligado++; continue; }
            try { const r = await confirmarLeituraCelular_(env, c); if (r && r.ok) cel.ok++; else cel.falhas++; } catch (e) { cel.falhas++; }
          }
        }
        return J({ ok: true, alteradas: antes.length, celular: cel, contagens: await msgContagens_(env) });
      }
      if (p === '/msg/lida' && req.method === 'POST') {
        const d = await req.json().catch(() => ({})), id = Number(d.conversa);
        if (!id) return J({ ok: false, erro: 'Escolha uma conversa.' }, 400);
        const r = await env.DB.prepare('UPDATE msg_conversa SET nao_lidas=?, atualizada_em=? WHERE id=?').bind(d.naoLida === true ? 1 : 0, agora(), id).run();
        let celular;
        if (d.naoLida !== true && d.celular === true) {
          const conv = await env.DB.prepare('SELECT id, canal, contato, grupo FROM msg_conversa WHERE id=?').bind(id).first();
          if (conv && (await msgCfg_(env)).lerCelular[conv.canal]) celular = await confirmarLeituraCelular_(env, conv);
          else celular = { ok: false, desligado: true };
        }
        return J({ ok: !!(r.meta && r.meta.changes), nao_lidas: d.naoLida === true ? 1 : 0, celular: celular });
      }
      if (p === '/msg/contatos/situacao' && req.method === 'GET') {
        const ligada = !!(await cfgGet(env, 'contatos_url')) && !!(await cfgGet(env, 'contatos_chave'));
        let backup = null, relatorio = null; try { backup = JSON.parse((await cfgGet(env, 'contatos_backup')) || 'null'); } catch (e) { backup = null; }
        if (url.searchParams.get('relatorio') === '1') { try { relatorio = JSON.parse((await cfgGet(env, 'contatos_relatorio')) || 'null'); } catch (e) { relatorio = null; } }
        let limpeza = null; try { limpeza = JSON.parse((await cfgGet(env, 'contatos_limpeza')) || 'null'); } catch (e) { limpeza = null; }
        const planoR2=await contatosR2TemPlano_(env); const plano=planoR2 ? planoR2.m.plano.dup+planoR2.m.plano.novos : (await env.DB.prepare('SELECT COUNT(*) n FROM msg_contatos_plano').first()).n;
        const fila = (await env.DB.prepare("SELECT SUM(estado='feito') feitos, SUM(estado='pendente' AND tentativas<5) pendentes, SUM(estado='pendente' AND tentativas>=5) falhas FROM msg_contatos_fila").first()) || {};
        return J({ ok: true, ligada: ligada, conta: (await cfgGet(env, 'contatos_conta')) || '', marcador: 'Tenkiter Clientes G', backup: backup, relatorio: relatorio, limpeza: limpeza, planoPronto: plano > 0, auto: (await cfgGet(env, 'contatos_auto')) === '1', fila: { feitos: fila.feitos || 0, pendentes: fila.pendentes || 0, falhas: fila.falhas || 0 } });
      }
      if (p === '/msg/contatos/config' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));
        if (d.desligar === true) { await cfgSet(env, 'contatos_url', null); await cfgSet(env, 'contatos_chave', null); await cfgSet(env, 'contatos_conta', null); return J({ ok: true, ligada: false }); }
        const u = String(d.url || '').trim(), k = String(d.chave || '').trim();
        if (!PONTE_URL_RE_.test(u)) return J({ ok: false, erro: 'Cole o endereço da implantação da ponte (começa com https://script.google.com/macros/s/ e termina em /exec).' }, 400);
        if (!/^[A-Za-z0-9]{32,128}$/.test(k)) return J({ ok: false, erro: 'Cole a chave que a função "configurar" mostrou no registro da ponte.' }, 400);
        const ping = await ponte_(env, { acao: 'ping' }, { url: u, chave: k });
        if (!ping.ok) return J({ ok: false, erro: ping.erro || 'A ponte não confirmou.' }, 400);
        await cfgSet(env, 'contatos_url', u); await cfgSet(env, 'contatos_chave', k); await cfgSet(env, 'contatos_conta', String(ping.conta || '').slice(0, 120));
        return J({ ok: true, ligada: true, conta: ping.conta || '', versao: ping.versao || '' });
      }
      if (p === '/msg/contatos/backup' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));
        if (d.partes === true) {
          /* v2.15: cópia em partes (ponte 1.1): o painel repete com "pagina" e "pasta" até "proxima" vir vazia */
          const pagina = typeof d.pagina === 'string' ? d.pagina.slice(0, 500) : '', pasta = typeof d.pasta === 'string' && /^[A-Za-z0-9_-]{10,120}$/.test(d.pasta) ? d.pasta : '';
          if (pagina && !pasta) return J({ ok: false, erro: 'Recomece a cópia de segurança.' }, 400);
          const r = await ponte_(env, { acao: 'backup_parte', pagina: pagina || undefined, pasta: pasta || undefined });
          if (!r.ok) return J({ ok: false, erro: r.erro === 'Ação desconhecida.' ? 'A ponte está na versão 1.0. Atualize para contatos-ponte-1.1 (cole o arquivo novo e implante uma nova versão) para copiar contas grandes.' : (r.erro || 'Não foi possível copiar esta parte.') }, 502);
          const and = pasta ? JSON.parse((await cfgGet(env, 'contatos_backup_and')) || '{"lidos":0}') : { lidos: 0 };
          and.lidos = (Number(and.lidos) || 0) + (Number(r.lidos) || 0); and.pasta = String(r.pasta || ''); await cfgSet(env, 'contatos_backup_and', JSON.stringify(and));
          const fim = !r.proxima, url = /^https:\/\/drive\.google\.com\//.test(String(r.url || '')) ? r.url : '';
          if (fim) { const b = { em: agora(), total: and.lidos, arquivo: String(r.pastaNome || '').slice(0, 120), url: url, partes: Number(r.parte) || 1 }; await cfgSet(env, 'contatos_backup', JSON.stringify(b)); await cfgSet(env, 'contatos_backup_and', null); }
          return J({ ok: true, fim: fim, lidos: and.lidos, totalPessoas: Number(r.totalPessoas) || 0, parte: Number(r.parte) || 1, pasta: String(r.pasta || ''), proxima: String(r.proxima || ''), url: url });
        }
        const r = await ponte_(env, { acao: 'backup' });
        if (!r.ok) return J({ ok: false, erro: r.erro || 'Não foi possível fazer a cópia agora.' }, 502);
        const b = { em: agora(), total: Number(r.total) || 0, arquivo: String(r.arquivo || '').slice(0, 120), url: /^https:\/\/drive\.google\.com\//.test(String(r.url || '')) ? r.url : '' };
        await cfgSet(env, 'contatos_backup', JSON.stringify(b));
        return J(Object.assign({ ok: true }, b));
      }
      if (p === '/msg/contatos/limpeza' && req.method === 'POST') {
        if (!(await cfgGet(env, 'contatos_url'))) return J({ ok: false, erro: 'A ponte do Google Contatos ainda não foi ligada.' }, 409);
        const r = await limpezaContatos_(env, await req.json().catch(() => ({})));
        const cod = r.cod || (r.ok ? 200 : 502); delete r.cod; return J(r, cod);
      }
      if (p === '/msg/contatos/auto' && req.method === 'POST') {
        const d = await req.json().catch(() => ({})); await cfgSet(env, 'contatos_auto', d.ligado === true ? '1' : '0');
        return J({ ok: true, auto: d.ligado === true });
      }
      if (p === '/msg/contatos/relatorio' && req.method === 'POST') {
        const b = await cfgGet(env, 'contatos_backup');
        if (!b) return J({ ok: false, erro: 'Faça a cópia de segurança dos contatos antes do relatório.' }, 409);
        const d = await req.clone().json().catch(() => ({}));
        const r = d && d.etapa ? await relatorioContatosEtapa_(env, d) : await relatorioContatos_(env);
        return J(r, r.ok ? 200 : (r.erro === 'Etapa do relatório inválida.' ? 400 : 502));
      }
      if (p === '/msg/encerrar' && req.method === 'POST') {
        /* v2.11: encerrar (uma ou várias) / reabrir. Encerrar zera o "não lida" só no painel; o celular não é tocado. */
        const d = await req.json().catch(() => ({})), ids = [...new Set((Array.isArray(d.conversas) ? d.conversas : [d.conversa]).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 200);
        if (!ids.length) return J({ ok: false, erro: 'Escolha ao menos uma conversa.' }, 400);
        const t = agora(), reabrir = d.reabrir === true, marca = ids.map(() => '?').join(',');
        // v2.13: motivo do encerramento (padrão "concluido"); cada encerramento fica no histórico
        const motivo = MSG_MOTIVOS_.includes(d.motivo) ? d.motivo : 'concluido', por = (req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(-4);
        const r = await env.DB.prepare(reabrir ? "UPDATE msg_conversa SET encerrada_em='', encerrada_motivo='', reaberta_em='', atualizada_em=? WHERE id IN (" + marca + ")" : "UPDATE msg_conversa SET encerrada_em=?, encerrada_motivo=?, nao_lidas=0, reaberta_em='', atualizada_em=? WHERE id IN (" + marca + ')').bind(...(reabrir ? [t] : [t, motivo, t]), ...ids).run();
        if (!reabrir) await env.DB.prepare('INSERT INTO msg_encerramento (conversa_id, canal, pessoa, contato, motivo, em, por) SELECT id, canal, pessoa, contato, ?, ?, ? FROM msg_conversa WHERE id IN (' + marca + ')').bind(motivo, t, por, ...ids).run();
        return J({ ok: true, alteradas: Number(r.meta && r.meta.changes) || 0, contagens: await msgContagens_(env) });
      }
      if (p === '/msg/config' && req.method === 'GET') {
        const diag = {}; for (const c of MSG_CANAIS) { try { diag[c] = JSON.parse((await cfgGet(env, 'msg_leitura_diag_' + c)) || 'null'); } catch (e) { diag[c] = null; } }
        const perfil = await perfilAtendente_(env, req, perms), config = await msgCfg_(env);
        config.assinatura = perfil.mostrarNome;
        return J(Object.assign({ok:true,config,ultimaLeitura:diag,respostas:await respostasRapidas_(env)},perfil));
      }
      if (p === '/msg/config' && req.method === 'POST') {
        const d = await req.json().catch(() => ({})), atual = await msgCfg_(env), perfil = await perfilAtendente_(env, req, perms);
        if (d && d.lerCelular && typeof d.lerCelular === 'object') {
          for (const c of MSG_CANAIS) if (typeof d.lerCelular[c] === 'boolean') atual.lerCelular[c] = d.lerCelular[c];
          await cfgSet(env, 'msg_cfg', JSON.stringify(atual));
        }
        if (typeof d.assinatura === 'boolean') await cfgSet(env,'msg_assinatura_'+perfil.chave,d.assinatura?'1':'0');
        if (typeof d.meuNome === 'string') {
          const nome = nomeAtendenteLimpo_(d.meuNome);
          // Sobrescreve também aliases legados para o nome apagado não reaparecer.
          const raw=(req.headers.get('X-TK-Whats')||'').replace(/\D/g,''), f=pessoaTelefone_(raw);
          for (const k of [...new Set([perfil.chave,raw,f&&f.d,f&&f.d.slice(2),f&&f.chave,f&&f.chave.slice(2)].filter(Boolean))]) await cfgSet(env,'msg_atendente_'+k,nome||null);
        }
        let respostas;
        if (Array.isArray(d.respostas)) {
          respostas = d.respostas.map(r=>({t:String(r&&r.t||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,40),x:String(r&&r.x||'').replace(/\r\n/g,'\n').replace(/[\u0000-\u0009\u000b-\u001f]/g,' ').trim().slice(0,1000)})).filter(r=>r.t&&r.x).slice(0,30);
          await cfgSet(env,'msg_respostas',JSON.stringify(respostas)); await cfgSet(env,'msg_resp_semeada','1');
        } else respostas = await respostasRapidas_(env);
        const novo=await perfilAtendente_(env,req,perms); atual.assinatura=novo.mostrarNome;
        return J(Object.assign({ok:true,config:atual,respostas},novo));
      }
      if (p === '/msg/auto' && (req.method === 'GET' || req.method === 'POST')) {   // v7.40.9: respostas automáticas (desligadas por padrão)
        const auto = req.method === 'POST' ? await salvarMsgAuto_(env, await req.json().catch(() => ({}))) : await msgAuto_(env);
        let diag = null; try { diag = JSON.parse((await cfgGet(env, 'msg_auto_diag')) || 'null'); } catch (e) { diag = null; }
        return J({ ok: true, auto: auto, agora: horarioLoja_(Date.now(), auto.feriados, auto.expediente), ultimo: diag });
      }
      if (p === '/msg/exportar' && req.method === 'GET') {
        const q = {}; for (const k of ['canal', 'conversa', 'formato', 'de', 'ate']) q[k] = url.searchParams.get(k) || '';
        const x = await exportarMensagens_(env, q);
        if (x.erro) return J({ ok: false, erro: x.erro }, 400);
        const h2 = new Headers(h); h2.set('Content-Type', x.tipo); h2.set('Cache-Control', 'no-store'); h2.set('Content-Disposition', 'attachment; filename="' + x.nome + '"'); h2.set('X-TK-Total', String(x.total)); h2.set('X-TK-Cortado', x.cortado ? '1' : '0'); h2.set('Access-Control-Expose-Headers', 'Content-Disposition, X-TK-Total, X-TK-Cortado');
        return new Response(x.corpo, { status: 200, headers: h2 });
      }
      if (p === '/msg/metricas' && req.method === 'GET') {
        const canal = url.searchParams.get('canal') === 'todos' ? '' : (url.searchParams.get('canal') || '');
        if (canal && !MSG_CANAIS.includes(canal)) return J({ ok: false, erro: 'Escolha Instagram, WhatsApp 1 ou WhatsApp 2.' }, 400);
        return J(await metricasMensagens_(env, canal, url.searchParams.get('dias'),url.searchParams.get('cache')==='1'));
      }
      if (p === '/msg/ligar' && req.method === 'POST') {
        const d = await req.json().catch(() => ({})), slot = Number(d.slot);
        if (slot !== 1 && slot !== 2) return J({ ok: false, erro: 'Escolha o WhatsApp 1 ou o WhatsApp 2.' }, 400);
        const r = await ligarWebhookWafly_(env, slot, url.origin);
        return J(r, r.ok ? 200 : 409);
      }
      if (p === '/msg/pausar' && req.method === 'POST') {
        const d = await req.json().catch(() => ({}));
        if (!MSG_CANAIS.includes(d.canal)) return J({ ok: false, erro: 'Canal inválido.' }, 400);
        await cfgSet(env, 'msg_pausa_' + d.canal, d.pausar === true ? '1' : null);
        return J({ ok: true, pausado: d.pausar === true });
      }
      if (p === '/post/wafly/config' && req.method === 'GET') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const slots={};
        for (const n of [1,2]) { const c=await cfgWafly_(env,n); let t=null; try{t=JSON.parse(await cfgGet(env,'wafly_ultimo_teste_'+n)||'null');}catch(e){} slots[n]={configurada:!!c,instancia:c?c.instance:'',origem:c?'gestao':(n===1?'appscript':'nenhuma'),ultimoTeste:t}; }
        return J({ok:true,slots:slots});
      }
      if (p === '/post/wafly/config' && req.method === 'POST') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const dados=await req.json().catch(()=>({})), slot=Number(dados.slot);
        if(slot!==1&&slot!==2) return J({ok:false,erro:'Escolha o Wafly 1 ou o Wafly 2.'},400);
        if(dados.apagar===true){await cfgSet(env,WAFLY_SLOTS_[slot].chave,null);return J({ok:true,configurada:false,origem:slot===1?'appscript':'nenhuma'});}
        const novo=validarWafly_(dados);
        if(!novo) return J({ok:false,erro:'Confira os três campos da Wafly: instância, token e Client-Token. Cole só o valor, sem espaços nem aspas.'},400);
        await cfgSet(env,WAFLY_SLOTS_[slot].chave,JSON.stringify(novo));
        return J({ok:true,configurada:true,origem:'gestao',instancia:novo.instance});
      }
      if (p === '/post/wafly/teste' && req.method === 'POST') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const dados=await req.json().catch(()=>({})), slot=Number(dados.slot);
        if(slot!==1&&slot!==2) return J({ok:false,erro:'Escolha o Wafly 1 ou o Wafly 2.'},400);
        return J(await testarWafly_(env,slot));
      }
      if (p === '/post/wame/config' && req.method === 'GET') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const g=await cfgGet(env,'wame_status_2'), cfgAtual=await cfgWameStatus_(env);
        return J({ok:true,configurada:!!cfgAtual,origem:g?'gestao':validarConfigWame_(env.WAME_STATUS_2)?'worker':'nenhuma',servidor:cfgAtual?cfgAtual.base.replace('https://',''):WAME_SERVIDORES[0],servidores:WAME_SERVIDORES});
      }
      if (p === '/post/wame/config' && req.method === 'POST') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        const dados=await req.json().catch(()=>({}));
        if(dados.apagar===true){await cfgSet(env,'wame_status_2',null);await cfgSet(env,'wame_status_2_servidor',null);return J({ok:true,configurada:!!validarConfigWame_(env.WAME_STATUS_2)});}
        const chave=String(dados.chave||'').trim(), servidor=String(dados.servidor||'').trim().replace(/^https:\/\//,'').replace(/\/+$/,'');
        if(!chave&&!servidor) return J({ok:false,erro:'Informe a chave ou o servidor do Wame.'},400);
        if(servidor&&!WAME_SERVIDORES.includes(servidor)) return J({ok:false,erro:'Servidor do Wame não reconhecido. Use '+WAME_SERVIDORES.join(', ')+'.'},400);
        if(chave&&!/^[A-Za-z0-9._-]{8,200}$/.test(chave))
          return J({ok:false,erro:'A chave do Wame parece inválida. Cole só a chave da instância, sem espaços nem aspas.'},400);
        await cfgSet(env,'wame_plano_bloqueio',null);
        if(chave)await cfgSet(env,'wame_status_2',chave);
        if(servidor)await cfgSet(env,'wame_status_2_servidor',servidor);
        return J({ok:true,configurada:!!(await cfgWameStatus_(env))});
      }
      if (p === '/post/wame/teste' && req.method === 'POST') {
        if(!perms.includes('gerir_acessos')) return J({ok:false,erro:'Somente administrador total.'},403);
        return J(await testarWame_(env));
      }
      if (p.startsWith('/post/freeconvert/')) return await freeconvertRota_(env,req,url,J,h);
      if (ehPost) { const rp = (await rotasFotoIA(env, ctx, req, url, J, perms)) || (await rotasFotos(env, ctx, req, url, J, perms)) || (await rotasPostagem(env, ctx, req, url, J, perms)); if (rp) return rp; }
      if (p === '/status' && req.method === 'GET') return J(await status(env));
      if (p === '/rascunhos' && req.method === 'GET') {
        const grupo = url.searchParams.get('grupo') || 'pendente';
        const lim = Math.min(60, Number(url.searchParams.get('limite')) || 30), antes = Number(url.searchParams.get('antes')) || 0;
        let sql = 'SELECT * FROM rascunho WHERE ', bind = [];
        if (grupo === 'descartado') sql += "status='descartado'"; else if (grupo === 'aceito') sql += "status='aceito'"; else if (grupo === 'pendente') sql += "status='pendente' AND grupo IN ('pendente','sem_id')"; /* Pendentes + Sem identificação (Stories etc.) numa lista só, ordenada por data */
        else if (GRUPOS.indexOf(grupo) !== -1) { sql += "status='pendente' AND grupo=?"; bind.push(grupo); } else return J({ ok: false, erro: 'Filtro inválido.' }, 400);
        /* mais recente primeiro pela data/hora do POST no Instagram (não pela ordem em que foi importado); o cursor `antes` é o id do último item da página anterior */
        const DH = "substr(COALESCE(NULLIF(publicado_em,''), criado_em), 1, 19)";
        if (antes) { sql += ' AND (' + DH + ' < (SELECT ' + DH + ' FROM rascunho WHERE id=?) OR (' + DH + ' = (SELECT ' + DH + ' FROM rascunho WHERE id=?) AND id < ?))'; bind.push(antes, antes, antes); }
        const q = await env.DB.prepare(sql + ' ORDER BY ' + DH + ' DESC, id DESC LIMIT ?').bind(...bind, lim + 1).all();
        const linhas = q.results || [], mais = linhas.length > lim;
        return J({ ok: true, rascunhos: await carregarRascunhos(env, linhas.slice(0, lim)), mais: mais, contagens: await contagens(env) });
      }
      if (p === '/acao' && req.method === 'POST') {
        let b; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
        const r = await acao(env, b || {});
        return J(Object.assign({ ok: true }, r, { contagens: await contagens(env) }));
      }
      if (p === '/buscar' && req.method === 'POST') {
        let b = {}; try { b = await req.json(); } catch (e) { /* sem corpo */ }
        if (b && b.todos) {
          /* importação total: o painel chama em sequência; a trava só impede duas importações ao mesmo tempo (vence sozinha em 60 s) */
          if (await env.CACHE.get('ig_hist_trava')) return J({ ok: false, erro: 'Já existe uma importação em andamento. Espere um instante.' }, 429);
          if (b.recomecar) { await cfgSet(env, 'ig_hist_depois', null); await cfgSet(env, 'ig_hist_fim', null); }
          await env.CACHE.put('ig_hist_trava', '1', { expirationTtl: 60 });
          try { return J(await ciclo(env, 'historico', { todos: true })); } finally { await env.CACHE.delete('ig_hist_trava'); }
        }
        if (await env.CACHE.get('ig_buscar_agora')) return J({ ok: false, erro: 'Espere um minuto antes de buscar de novo.' }, 429);
        await env.CACHE.put('ig_buscar_agora', '1', { expirationTtl: 60 });
        return J(await ciclo(env, 'manual', { ultimos: b && b.ultimos }));
      }
      if (p === '/token' && req.method === 'POST') {
        let b; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
        const token = String((b && b.token) || '').trim();
        if (token.length < 20 || /\s/.test(token)) return J({ ok: false, erro: 'Esse texto não parece um token do Instagram.' }, 400);
        let eu; try { eu = await graph(env, token, '/me?fields=id,username'); } catch (e) { return J({ ok: false, erro: 'O Instagram recusou esse token: ' + String(e.message || e).replace(token, '***').slice(0, 200) }, 400); }
        await cfgSet(env, 'ig_token', token); await cfgSet(env, 'ig_usuario', eu.username || eu.id || '');
        await cfgSet(env, 'ig_token_exp', Date.now() + 60 * 86400000);     // token de longa duração dura 60 dias; a renovação automática confere de novo
        if (!(await cfgGet(env, 'ig_desde'))) await cfgSet(env, 'ig_desde', agora());                // só o que for postado daqui para frente (histórico: botão "importar os últimos")
        await cfgSet(env, 'falhas', 0);
        return J({ ok: true, usuario: eu.username || eu.id || '' });
      }
      if (p === '/ia' && req.method === 'POST') {
        let b = {}; try { b = await req.json(); } catch (e) { /* sem corpo */ }
        const r = await analisarPendentes(env, Math.min(3, Math.max(1, Number(b && b.limite) || 2)));
        return J(Object.assign({ ok: !r.semChave }, r, r.semChave ? { erro: 'A IA ainda não foi ligada.' } : {}));
      }
      if (p === '/ia-chave' && req.method === 'POST') {
        let b; try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); }
        const chave = String((b && b.chave) || '').trim();
        if (!/^[A-Za-z0-9._\-]{20,200}$/.test(chave)) return J({ ok: false, erro: 'Essa chave parece incompleta ou com caracteres estranhos. Cole de novo, só a chave.' }, 400);
        let t; try { t = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': chave, 'User-Agent': UA } }); } catch (e) { return J({ ok: false, erro: 'Não consegui falar com o Google agora. Tente de novo.' }, 502); }
        if (!t.ok) return J({ ok: false, erro: 'O Google recusou essa chave (' + t.status + '). Confira se copiou a chave inteira.' }, 400);
        await cfgSet(env, 'gemini_key', chave);
        return J({ ok: true, fim: chave.slice(-4) });
      }
      if (p === '/ia-chave' && req.method === 'DELETE') { await cfgSet(env, 'gemini_key', null); return J({ ok: true }); }
      if (p === '/token' && req.method === 'DELETE') { await cfgSet(env, 'ig_token', null); await cfgSet(env, 'ig_token_exp', null); await cfgSet(env, 'ig_usuario', null); return J({ ok: true }); }
      return J({ ok: false, erro: 'Não encontrado.' }, 404);
    } catch (e) {
      return J({ ok: false, erro: e && e.codigo ? e.message : 'Algo deu errado. Tente de novo.' }, e && e.codigo ? e.codigo : 500);
    }
  }
};
