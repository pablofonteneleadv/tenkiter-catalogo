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
  `CREATE INDEX IF NOT EXISTS ix_fotoia ON fotoia (status, prox_em)`,
  `CREATE INDEX IF NOT EXISTS ix_fc ON foto_cliente (status, id)`,
  `CREATE INDEX IF NOT EXISTS ix_post ON postagem (status, agendado_em)`,
  `CREATE INDEX IF NOT EXISTS ix_rasc ON rascunho (status, grupo, publicado_em)`,
  `CREATE INDEX IF NOT EXISTS ix_rm ON rascunho_midia (midia_id)`
];
/* colunas acrescentadas depois (v3.7: leitura das fotos por IA) */
const COLUNAS_NOVAS = ["ia_status TEXT DEFAULT ''", "ia_json TEXT DEFAULT ''", "ia_tent INTEGER DEFAULT 0", "ia_em TEXT DEFAULT ''", "preco_foto TEXT DEFAULT ''"];
let pronto = false;
async function iniciar(env) {
  if (pronto) return;
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  try { await env.DB.prepare("ALTER TABLE postagem ADD COLUMN canal TEXT DEFAULT ''").run(); } catch (e) { /* ja existe */ }
  try { await env.DB.prepare('ALTER TABLE postagem ADD COLUMN seq INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* já existe */ }
  try { await env.DB.prepare('ALTER TABLE postagem ADD COLUMN urgente INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* já existe */ }
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
  pronto = true;
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
  const chave = new Request('https://sessao.invalid/' + (await sha(whats + '|' + sessao)));
  const cache = caches.default, g = await cache.match(chave);
  if (g) return g.json();
  let lista = null;
  try {
    const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'sessao', whatsapp: whats, sessao: sessao }) });
    const j = await r.json();
    if (j && j.ok && j.usuario && Array.isArray(j.usuario.permissoes)) lista = j.usuario.permissoes;
  } catch (e) { return 'indisponivel'; }         // backend fora do ar != "faca login"
  if (lista) await cache.put(chave, new Response(JSON.stringify(lista), { headers: { 'Cache-Control': 'max-age=120' } }));
  return lista || 'sem_sessao';                  // sessao que o backend nao reconhece
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
const CANAIS_POSTAGEM = ['instagram', 'whatsapp', 'ambos'];
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
async function enviarWhatsAppSo_(env, p) {
  const base = String(env.API_URL || '').trim();
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
  return { ok: false, erro: String((j && j.erro) || 'O WhatsApp recusou o envio.') };
}
async function enviarWhatsApp_(env, p) {
  const r = await enviarWhatsAppSo_(env, p);
  if (!r.ok) return marcarErroPost_(env, p, r.erro);
  await env.DB.prepare("UPDATE postagem SET status='publicado', ig_id=?, permalink='', erro='', publicado_em=?, atualizado_em=? WHERE id=?").bind(r.requestId, agora(), agora(), p.id).run();
  return { ok: true, canal: 'whatsapp' };
}
/** Marca a postagem com a frase do erro (o painel mostra e oferece "Tentar de novo"). Nunca lanca. */
async function marcarErroPost_(env, p, frase) {
  try { await env.DB.prepare("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=?").bind(String(frase || '').slice(0, 300), agora(), p.id).run(); } catch (e) { /* o proximo minuto tenta de novo */ }
  return { ok: false, erro: frase };
}
async function avancarPostagem(env, token, p) {
  const m = JSON.parse(p.midias || '[]');
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
export async function processarPostagens(env) {
  try {
    await iniciar(env);
    const t = agora();
    await env.DB.prepare("UPDATE postagem SET status='manual_pendente', atualizado_em=? WHERE modo='manual' AND status='agendado' AND agendado_em<=?").bind(t, t).run();
    const lin = (await env.DB.prepare("SELECT * FROM postagem WHERE modo='auto' AND ((status='agendado' AND agendado_em<=?) OR status='processando') ORDER BY agendado_em, id LIMIT 40").bind(t).all()).results || [];
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
    let feitas = 0, novas = usados, tentadas = 0;
    for (const p of lin) {
      if (tentadas >= 4) break;                                       // no máximo 4 por minuto; as que esperam o limite do canal não ocupam essas vagas
      if (p.status === 'agendado' && !p.urgente && cfgP.pausaAtiva && foraDaPausa(cfgP, Date.now()) > Date.now()) {          // agendada antes da regra: não sai na pausa, vai para o primeiro horário livre depois dela
        try { const r = ajustarHorario(cfgP, p.tipo, Date.now(), await ocupadosDoTipo_(env, p.tipo, p.id, gapDoTipoMs(cfgP, p.tipo))); await env.DB.prepare('UPDATE postagem SET agendado_em=?, atualizado_em=? WHERE id=?').bind(new Date(r.t).toISOString(), agora(), p.id).run(); } catch (e) { /* tenta de novo no próximo minuto */ }
        continue;
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
    }
    return { feitas: feitas };
  } catch (e) { return { feitas: 0, erro: true }; }
}
/** Quantas postagens deste canal já saíram nas últimas 24 h (Story, Feed… do Instagram; ou "status" do WhatsApp). */
async function contarUsados24h_(env, bucket, desde) {
  const doCanal = bucket === 'status' ? "canal IN ('whatsapp','ambos')" : "tipo=? AND (canal IS NULL OR canal='' OR canal IN ('instagram','ambos'))";
  const bind = bucket === 'status' ? [desde] : [bucket, desde];
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
export const CANAIS_FILA = ['story', 'status', 'feed', 'carrossel', 'reels'];
export const CANAL_FILA_PADRAO = {
  story: { max24h: 40, gapMin: 120, gapMax: 300 },        // 2 a 5 min (exemplo do Pablo)
  status: { max24h: 40, gapMin: 120, gapMax: 300 },
  feed: { max24h: 20, gapMin: 300, gapMax: 600 },
  carrossel: { max24h: 20, gapMin: 300, gapMax: 600 },
  reels: { max24h: 10, gapMin: 600, gapMax: 1200 },
};
export const CFG_POST_PADRAO = { pausaAtiva: true, pausaDe: '22:00', pausaAte: '06:30', max24h: 90, agoraIgnora: true, canais: CANAL_FILA_PADRAO };
/** Em quais "canais de contagem" uma postagem entra: o tipo dela (se vai ao Instagram) e/ou "status" (se vai ao WhatsApp). */
export function bucketsDoPost(tipo, canal) {
  const out = [];
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
    max24h: num(x.max24h, 1, 100, d.max24h), agoraIgnora: x.agoraIgnora === undefined ? d.agoraIgnora : !!x.agoraIgnora, canais: canais,
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
export function intervaloPedidoMs_(v) { const n = Math.round(Number(v)); return isFinite(n) && n >= 1 ? Math.min(1440, n) * 60000 : 0; }
/** Próximo horário da série: anterior + o intervalo escolhido (nunca menos que o mínimo de nenhum canal do post), respeitando pausa e o que já está na fila. */
export function intervaloEscolhido_(cfg, buckets, ocupMap, anteriorMs, intervaloMs) {
  let gap = intervaloMs; (buckets || []).forEach((b) => { gap = Math.max(gap, gapDoTipoMs(cfg, b)); });
  return ajustarHorarioMulti(cfg, buckets, anteriorMs + gap, ocupMap).t;
}
export function proximoLivre(cfg, tipo, ocupadosMs, desdeMs, sorteio) { return proximoLivreMulti(cfg, [tipo], { [tipo]: ocupadosMs }, desdeMs, sorteio); }
async function lerCfgPost(env) { let j = null; try { j = JSON.parse((await cfgGet(env, 'po_cfg')) || 'null'); } catch (e) { j = null; } return normalizarCfgPost(j); }
/** Horários já ocupados num canal de contagem (Story, Feed…, ou "status" do WhatsApp). `janelaMs` = quanto tempo para trás ainda importa. */
async function ocupadosDoTipo_(env, bucket, excluirId, janelaMs, semAgendadas) {
  const desde = new Date(Date.now() - janelaMs - 60000).toISOString();
  const doCanal = bucket === 'status' ? "canal IN ('whatsapp','ambos')" : "tipo=? AND (canal IS NULL OR canal='' OR canal IN ('instagram','ambos'))";
  const bind = bucket === 'status' ? [excluirId || 0, desde] : [bucket, excluirId || 0, desde];
  const q = (await env.DB.prepare('SELECT agendado_em, publicado_em, status FROM postagem WHERE ' + doCanal + " AND id!=? AND (status IN ('processando','manual_pendente'" + (semAgendadas ? '' : ",'agendado'") + ") OR (status IN ('publicado','manual_feito') AND publicado_em>=?))").bind(...bind).all()).results || [];
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
function linhaPostagem(r) {
  let m = []; try { m = JSON.parse(r.midias || '[]'); } catch (e) { m = []; }
  return { id: r.id, tipo: r.tipo, modo: r.modo, legenda: r.legenda, midias: m, produto: r.produto, template: r.template, link: r.link, agendadoEm: r.agendado_em, status: r.status, tentativas: r.tentativas, erro: r.erro, permalink: r.permalink, criadoPor: r.criado_por, criadoEm: r.criado_em, publicadoEm: r.publicado_em, grupo: r.grupo, canal: normalizarCanal_(r.canal) };
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
async function rotasPostagem(env, ctx, req, url, J, perms) {
  const p = url.pathname;
  if (p === '/posts' && req.method === 'GET') {
    const lim = Math.min(100, Number(url.searchParams.get('limite')) || 60);
    const q = (await env.DB.prepare("SELECT * FROM postagem WHERE status!='cancelado' ORDER BY CASE WHEN status IN ('agendado','processando','manual_pendente','erro') THEN 0 ELSE 1 END, CASE WHEN status IN ('agendado','processando','manual_pendente','erro') THEN agendado_em END ASC, publicado_em DESC, id DESC LIMIT ?").bind(lim).all()).results || [];
    const c = (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM postagem GROUP BY status").all()).results || [];
    const conta = {}; c.forEach((x) => { conta[x.status] = x.n; });
    return J({ ok: true, posts: q.map(linhaPostagem), contagens: conta, conectado: !!(await cfgGet(env, 'ig_token')), usuario: (await cfgGet(env, 'ig_usuario')) || '', regras: 1, config: await lerCfgPost(env), uso24h: await uso24hPorCanal_(env), podeRegras: (perms || []).indexOf('gerir_acessos') !== -1 });
  }
  let b = {}; if (req.method === 'POST') { try { b = await req.json(); } catch (e) { return J({ ok: false, erro: 'Pedido inválido.' }, 400); } }
  if (p === '/post' && req.method === 'POST') {
    const lista = Array.isArray(b.posts) ? b.posts.slice(0, 12) : [b];
    const pend = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE status IN ('agendado','processando','manual_pendente')").first()) || {}).n) || 0;
    if (pend + lista.length > 200) return J({ ok: false, erro: 'Há postagens demais na fila (200). Espere algumas saírem.' }, 429);
    const vs = []; for (const x of lista) { const r = validarPostagem(x); if (r.erro) return J({ ok: false, erro: r.erro }, 400); vs.push(r.v); }
    if (!(await cfgGet(env, 'ig_token')) && vs.some((v) => v.modo === 'auto' && canalUsaInstagram_(v.canal))) return J({ ok: false, erro: 'O Instagram ainda não está conectado (Produtos para aceitar → Conectar).' }, 409);
    const ids = [], quandos = [], por = String(b.por || '').slice(0, 60);
    const cfg = await lerCfgPost(env), ocup = {}, cursores = {}, ajustes = [], intervaloMs = intervaloPedidoMs_(b.intervalo);
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i], bs = bucketsDoPost(v.tipo, v.canal), ck = bs.join('+');
      for (const b of bs) if (!ocup[b]) ocup[b] = await ocupadosDoTipo_(env, b, 0, gapMaxDoTipoMs(cfg, b));
      let t;
      if (v.urgente && cfg.agoraIgnora) t = Date.now();                                  // urgência: sai já, sem pausa nem intervalo
      else if (v.sequencia && intervaloMs && cursores[ck] != null) t = intervaloEscolhido_(cfg, bs, ocup, cursores[ck], intervaloMs);   // v1.7: a pessoa escolheu "de X em X minutos" (nunca abaixo do mínimo do canal)
      else if (v.sequencia) t = proximoLivreMulti(cfg, bs, ocup, cursores[ck] == null ? Date.now() + 60000 : cursores[ck]).t;       // intervalo SORTEADO entre o mín. e o máx. do canal
      else {
        const pedido = Math.max(Date.parse(v.quando), Date.now()), aj = ajustarHorarioMulti(cfg, bs, pedido, ocup);
        t = aj.t; if (aj.ajustado) ajustes.push({ i: i, tipo: v.tipo, de: new Date(pedido).toISOString(), para: new Date(t).toISOString(), motivo: aj.motivo });
      }
      cursores[ck] = t; bs.forEach((b) => ocup[b].push(t)); v.quando = new Date(t).toISOString(); v.agora = t <= Date.now() + 1000;
      quandos.push(v.quando);


      const r = await env.DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, produto, template, link, agendado_em, status, criado_por, criado_em, atualizado_em, grupo, seq, canal, urgente) VALUES (?,?,?,?,?,?,?,?, 'agendado', ?,?,?,?,?,?,?)").bind(v.tipo, v.modo, v.legenda, JSON.stringify(v.midias), v.produto, v.template, v.link, v.quando, por, agora(), agora(), v.grupo, v.sequencia ? 1 : 0, v.canal, v.urgente ? 1 : 0).run();
      ids.push(r.meta && r.meta.last_row_id);
    }
    if (vs.some((v) => v.agora) && ctx && ctx.waitUntil) ctx.waitUntil(processarPostagens(env));
    return J({ ok: true, ids: ids, quandos: quandos, ajustes: ajustes });
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
    const lst = (await env.DB.prepare("SELECT id, tipo, canal, agendado_em FROM postagem WHERE status='agendado' AND urgente=0 ORDER BY agendado_em, id").all()).results || [];
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
    if (p === '/post/cancelar') {
      if (['agendado', 'erro', 'manual_pendente'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem já está sendo enviada ou foi publicada; não dá mais para cancelar.' }, 409);
      await env.DB.prepare("UPDATE postagem SET status='cancelado', atualizado_em=? WHERE id=?").bind(agora(), id).run(); return J({ ok: true });
    }
    if (p === '/post/reagendar') {
      if (['agendado', 'erro', 'manual_pendente'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem não pode ser reagendada.' }, 409);
      const r = validarPostagem(Object.assign({}, linhaPostagem(linha), { quando: b.quando }));
      if (r.erro) return J({ ok: false, erro: r.erro }, 400);
      const cfg = await lerCfgPost(env), bs = bucketsDoPost(linha.tipo, linha.canal);
      let t = Date.parse(r.v.quando), aj = { ajustado: false, motivo: '' };
      if (r.v.urgente && cfg.agoraIgnora) t = Date.now();
      else { aj = ajustarHorarioMulti(cfg, bs, Math.max(t, Date.now()), await ocupadosMulti_(env, cfg, bs, id)); t = aj.t; }
      await env.DB.prepare("UPDATE postagem SET status='agendado', agendado_em=?, tentativas=0, erro='', containers='', urgente=?, atualizado_em=? WHERE id=?").bind(new Date(t).toISOString(), r.v.urgente ? 1 : 0, agora(), id).run();
      if (t <= Date.now() + 1000 && ctx && ctx.waitUntil) ctx.waitUntil(processarPostagens(env));
      return J({ ok: true, quando: new Date(t).toISOString(), ajustado: aj.ajustado, motivo: aj.motivo });
    }
    if (p === '/post/proximo') {
      /* "Mandar para o próximo horário livre" da fila do tipo (respeita pausa e intervalo). */
      if (['agendado', 'erro', 'manual_pendente'].indexOf(linha.status) === -1) return J({ ok: false, erro: 'Essa postagem não pode ser reagendada.' }, 409);
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
      const lst = (normalizarCanal_(linha.canal) === 'whatsapp'
        ? (await env.DB.prepare("SELECT id, agendado_em FROM postagem WHERE canal='whatsapp' AND status='agendado' ORDER BY agendado_em, id").all())
        : (await env.DB.prepare("SELECT id, agendado_em FROM postagem WHERE tipo=? AND (canal IS NULL OR canal='' OR canal='instagram') AND status='agendado' ORDER BY agendado_em, id").bind(linha.tipo).all())).results || [];
      const i = lst.findIndex((x) => x.id === id), n = lst.length, alvo = { subir: i - 1, descer: i + 1, primeiro: 0, ultimo: n - 1 }[String(b.dir || '')];
      if (alvo === undefined) return J({ ok: false, erro: 'Direção inválida.' }, 400);
      if (i < 0 || alvo < 0 || alvo >= n || alvo === i) return J({ ok: false, erro: 'Já está na ponta da fila.' }, 409);
      const tempos = lst.map((x) => x.agendado_em), ordem = lst.map((x) => x.id); ordem.splice(i, 1); ordem.splice(alvo, 0, id);
      for (let k = 0; k < ordem.length; k++) if (lst[k].id !== ordem[k]) await env.DB.prepare('UPDATE postagem SET agendado_em=?, atualizado_em=? WHERE id=?').bind(tempos[k], agora(), ordem[k]).run();
      return J({ ok: true, ordem: ordem });
    }
    if (p === '/post/feito') {
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
  return { ok: true, plano: { v: 1, destino: destino, formato: DESTINOS_FOTOIA[destino].formato, seta: false, quem: quem, looks: looks.map((l) => ({ partes: l })), rotulos: rot } };
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
const resumoPlano_ = (x) => { try { const p = x.plano ? JSON.parse(x.plano) : null; return p && Array.isArray(p.looks) ? { looks: p.looks.length, destino: p.destino || '', seta: false, quem: p.quem || '' } : null; } catch (e) { return null; } };
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

export default {
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(processarPostagens(env));                                   // a cada minuto: publica o que está na hora
    ctx.waitUntil(processarFotoIA(env));                                      // a cada minuto: 1 imagem da fila de Fotos com IA (se já puder: cota/limite do dia)
    const min = ev && ev.scheduledTime ? new Date(ev.scheduledTime).getUTCMinutes() : 0;
    if (min === 7) ctx.waitUntil(limparTemporarios(env).catch(() => {}));      // 1x por dia: apaga do R2 o que é temporário (t/) com mais de 5 dias
    if (min % 30 !== 0) return;                                                // importar do Instagram só a cada 30 min (como antes)
    if (await env.CACHE.get('ig_hist_trava')) return;
    ctx.waitUntil((async () => { await ciclo(env, 'cron'); try { await analisarPendentes(env, 5); } catch (e) { /* a IA é conforto: o ciclo não pode cair por causa dela */ } })());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), h = cors(env, req), J = (c, s) => resp(c, s, h);
    if (req.method === 'OPTIONS') { h.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); h.set('Access-Control-Allow-Headers', 'Content-Type, X-TK-Whats, X-TK-Sessao'); h.set('Access-Control-Max-Age', '86400'); return new Response(null, { status: 204, headers: h }); }
    if (url.pathname === '/cliente/foto') { try { const rc = await rotasFotosCliente(env, req, url, J); if (rc) return rc; } catch (e) { return J({ ok: false, erro: 'Não foi possível enviar agora. Tente de novo.' }, 500); } }
    const perms = await permissoes(env, req);
    if (perms === 'sem_sessao') return J({ ok: false, erro: 'Entre na sua conta de administrador.' }, 401);
    if (perms === 'indisponivel') return J({ ok: false, erro: 'Nao consegui confirmar sua sessao agora. Tente de novo.' }, 503);
    const ehPost = url.pathname === '/posts' || url.pathname.indexOf('/post') === 0 || url.pathname.indexOf('/fotos') === 0 || url.pathname.indexOf('/fotoia') === 0;
    if (ehPost ? (perms.indexOf('gerir_acessos') === -1 && perms.indexOf('catalogo_cadastrar') === -1) : perms.indexOf('gerir_acessos') === -1) return J({ ok: false, erro: ehPost ? 'Você não tem permissão para postar no Instagram.' : 'Só o administrador total acessa o importador do Instagram.' }, 403);
    try {
      await iniciar(env);
      const p = url.pathname;
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
