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

const ORIGENS_PADRAO = ['https://tenkitermodas.com.br', 'https://www.tenkitermodas.com.br', 'https://tenkiter-catalogo.onrender.com'];
const UA = 'Mozilla/5.0 (compatible; tenkiter-ig/1.0)';
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
  `CREATE INDEX IF NOT EXISTS ix_rasc ON rascunho (status, grupo, publicado_em)`,
  `CREATE INDEX IF NOT EXISTS ix_rm ON rascunho_midia (midia_id)`
];
/* colunas acrescentadas depois (v3.7: leitura das fotos por IA) */
const COLUNAS_NOVAS = ["ia_status TEXT DEFAULT ''", "ia_json TEXT DEFAULT ''", "ia_tent INTEGER DEFAULT 0", "ia_em TEXT DEFAULT ''", "preco_foto TEXT DEFAULT ''"];
let pronto = false;
async function iniciar(env) {
  if (pronto) return;
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  for (const col of COLUNAS_NOVAS) { try { await env.DB.prepare('ALTER TABLE rascunho ADD COLUMN ' + col).run(); } catch (e) { /* já existe */ } }
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
  if (!whats || !/^tk[12]\./.test(sessao)) return null;
  const chave = new Request('https://sessao.invalid/' + (await sha(whats + '|' + sessao)));
  const cache = caches.default, g = await cache.match(chave);
  if (g) return g.json();
  let lista = null;
  try {
    const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'sessao', whatsapp: whats, sessao: sessao }) });
    const j = await r.json();
    if (j && j.ok && j.usuario && Array.isArray(j.usuario.permissoes)) lista = j.usuario.permissoes;
  } catch (e) { return null; }
  if (lista) await cache.put(chave, new Response(JSON.stringify(lista), { headers: { 'Cache-Control': 'max-age=120' } }));
  return lista;
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
        const rr = await env.DB.prepare('INSERT INTO rascunho (grupo, status, origem, legenda, permalink, publicado_em, preco_sug, tamanhos_sug, codigo_dup, criado_em, atualizado_em) VALUES (?, \'pendente\', ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(grupo, origemDe(m, it.story), legenda, m.permalink || '', m.timestamp || inicio, precoDaLegenda(legenda), tamanhosDaLegenda(legenda), cod, inicio, inicio).run();
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
const MODELOS_IA = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];
const MAX_FOTOS_IA = 4, MAX_BYTES_FOTO_IA = 3 * 1024 * 1024, DESCONTO_AVISTA = 0.10;
const COND_IA_PENDENTE = "status='pendente' AND grupo != 'nao_produto' AND (ia_status IN ('', 'pendente') OR (ia_status='erro' AND ia_tent < 2) OR (ia_status='lendo' AND ia_em < ?))";

/** O preço escrito nas fotos já é o À VISTA (com 10% de desconto). ",99" no fim = arredonda para cima. O catálogo guarda o preço CHEIO
 *  e mostra o à vista (cheio × 0,90) — então: cheio = à vista ÷ 0,90, para cima no centavo (70,00 → 77,78 → à vista 70,00). */
export function precoDasFotos(v) {
  if (/^\s*-/.test(String(v == null ? '' : v))) return null;
  let n = Number(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!isFinite(n) || n <= 0 || n > 100000) return null;
  n = Math.round(n * 100) / 100;
  if (Math.round((n - Math.floor(n)) * 100) === 99) n = Math.floor(n) + 1;
  const cheio = Math.ceil(n / (1 - DESCONTO_AVISTA) * 100 - 1e-6) / 100;
  return { avista: n.toFixed(2), cheio: cheio.toFixed(2) };
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
async function chamarGemini(env, chave, payload) {
  let ultimo = '';
  for (const modelo of MODELOS_IA.slice(0, 3)) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(payload) });
      let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
      if (r.status === 200) {
        const partes = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const texto = partes.map((x) => x.text || '').join('').replace(/```json/gi, '').replace(/```/g, '').trim();
        if (texto) return { ok: true, texto: texto };
        ultimo = 'resposta vazia'; continue;
      }
      ultimo = ((j.error && j.error.message) || ('HTTP ' + r.status)).replace(/key=[^&\s]+/g, 'key=***').slice(0, 160);
      if (r.status === 429) return { ok: false, erro: 'A IA pediu para esperar um pouco (limite de uso).', espera: true };
      if (r.status === 400 || r.status === 401 || r.status === 403) break;
    } catch (e) { ultimo = 'sem conexão com a IA'; }
  }
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
      '- preco: SOMENTE se houver um valor em reais ESCRITO nas imagens ou na legenda (número, ex.: 69.99). Se não houver, null. NUNCA invente.\n' +
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
    await env.DB.prepare("UPDATE rascunho SET ia_status='ok', ia_json=?, ia_tent=0, preco_foto=?, preco_sug=CASE WHEN ? != '' THEN ? ELSE preco_sug END, tamanhos_sug=CASE WHEN tamanhos_sug='' AND ? != '' THEN ? ELSE tamanhos_sug END, atualizado_em=? WHERE id=?")
      .bind(JSON.stringify(ia), preco ? preco.avista : '', preco ? preco.cheio : '', preco ? preco.cheio : '', ia.tamanhos.join(', '), ia.tamanhos.join(', '), agora(), id).run();
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
          env.DB.prepare("UPDATE rascunho SET legenda=CASE WHEN legenda='' THEN ? ELSE legenda END, preco_sug=CASE WHEN preco_sug='' THEN ? ELSE preco_sug END, tamanhos_sug=CASE WHEN tamanhos_sug='' THEN ? ELSE tamanhos_sug END, grupo=CASE WHEN grupo='sem_id' THEN 'pendente' ELSE grupo END, ia_status='', ia_tent=0, atualizado_em=? WHERE id=?").bind(de.legenda || '', de.preco_sug || '', de.tamanhos_sug || '', agora(), para.id)]));
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

export default {
  async scheduled(ev, env, ctx) { if (await env.CACHE.get('ig_hist_trava')) return; ctx.waitUntil((async () => { await ciclo(env, 'cron'); try { await analisarPendentes(env, 5); } catch (e) { /* a IA é conforto: o ciclo não pode cair por causa dela */ } })()); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), h = cors(env, req), J = (c, s) => resp(c, s, h);
    if (req.method === 'OPTIONS') { h.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); h.set('Access-Control-Allow-Headers', 'Content-Type, X-TK-Whats, X-TK-Sessao'); h.set('Access-Control-Max-Age', '86400'); return new Response(null, { status: 204, headers: h }); }
    const perms = await permissoes(env, req);
    if (!perms) return J({ ok: false, erro: 'Entre na sua conta de administrador.' }, 401);
    if (perms.indexOf('gerir_acessos') === -1) return J({ ok: false, erro: 'Só o administrador total acessa o importador do Instagram.' }, 403);
    try {
      await iniciar(env);
      const p = url.pathname;
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
