package br.com.tenkitermodas.mensagens

import android.content.Context
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

/**
 * 2.6.0 — Troca de pessoa no celular da loja (proposta app 2.6, decisões do Pablo de 26/11/2026).
 * Quantas pessoas precisar por celular (3, 5, 8…). Cada uma entra com a senha UMA vez no celular; o PIN de 4 dígitos é UM
 * por pessoa e fica na conta dela (servidor das Mensagens, /app/pin): criou num celular, nos outros não pede de novo.
 * O celular guarda uma cópia do hash para conferir na hora (sem esperar a rede) e manda cada tentativa para o registro
 * de segurança; a cada 3 erros seguidos o servidor alerta o Admin total no WhatsApp. Sem trava: pode continuar tentando.
 * O PIN só destrava a sessão já guardada neste celular; o servidor confere a sessão em todo pedido. Só o Admin total remove alguém.
 * Bloqueio por tempo parado: desligado por padrão (15 ou 30 min, escolha do Admin total).
 *
 * "Gerenciado" = existe ao menos uma pessoa na lista. Sem ninguém na lista o app se comporta exatamente como o 2.5.
 */
data class Pessoa(val owner: String, val session: String, val nome: String, val perms: List<String>, val sal: String = "", val pin: String = "", val desde: Long = 0L, val iter: Int = 6000) {
    val temPin get() = pin.isNotBlank()
    val primeiroNome get() = nome.trim().split(Regex("\\s+")).firstOrNull()?.takeIf { it.isNotBlank() } ?: "Pessoa"
    val iniciais get(): String { val p = nome.trim().split(Regex("\\s+")).filter { it.isNotBlank() }; return if (p.isEmpty()) "?" else (p.first().take(1) + (if (p.size > 1) p.last().take(1) else "")).uppercase() }
    fun pode(vararg chaves: String) = chaves.any { it in perms }
    val adminTotal get() = "gerir_acessos" in perms
    fun json(): JSONObject = JSONObject().put("owner", owner).put("session", session).put("nome", nome).put("perms", JSONArray(perms)).put("sal", sal).put("pin", pin).put("desde", desde).put("iter", iter)
    val auth get() = NativeAuth(owner, session, nome)
    companion object {
        fun ler(j: JSONObject) = Pessoa(j.getString("owner"), j.optString("session"), j.optString("nome"),
            j.optJSONArray("perms")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } } ?: emptyList(),
            j.optString("sal"), j.optString("pin"), j.optLong("desde"), j.optInt("iter", 6000).coerceIn(1000, 200000))
    }
}

object Pessoas {
    const val MUDOU = "br.com.tenkitermodas.mensagens.PESSOA_MUDOU"
    val BLOQUEIOS = listOf(0, 15, 30)
    private const val ALIAS = "tk-pessoas"

    @Volatile private var cache: JSONObject? = null
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("pessoas-celular", Context.MODE_PRIVATE)

    /** Testes (Robolectric não tem o cofre de chaves do Android). */
    internal var chaveTeste: javax.crypto.SecretKey? = null
    private fun chave(): javax.crypto.SecretKey {
        chaveTeste?.let { return it }
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? javax.crypto.SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    @Synchronized private fun estado(c: Context): JSONObject {
        cache?.let { return it }
        val salvo = prefs(c).getString("estado", null)
        val j = runCatching {
            val p = salvo!!.split(':'); val k = Cipher.getInstance("AES/GCM/NoPadding")
            k.init(Cipher.DECRYPT_MODE, chave(), GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)))
            JSONObject(String(k.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), Charsets.UTF_8))
        }.getOrNull() ?: JSONObject().put("lista", JSONArray()).put("ativa", "").put("bloqueio", 0)
        cache = j; return j
    }

    @Synchronized private fun gravar(c: Context, j: JSONObject) {
        val k = Cipher.getInstance("AES/GCM/NoPadding"); k.init(Cipher.ENCRYPT_MODE, chave())
        prefs(c).edit().putString("estado", Base64.encodeToString(k.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(k.doFinal(j.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).commit()
        cache = j
    }

    private fun avisar(c: Context) { runCatching { c.applicationContext.sendBroadcast(Intent(MUDOU).setPackage(c.packageName)) } }

    @Synchronized fun lista(c: Context): List<Pessoa> { val a = estado(c).optJSONArray("lista") ?: return emptyList(); return (0 until a.length()).mapNotNull { runCatching { Pessoa.ler(a.getJSONObject(it)) }.getOrNull() } }
    private fun gravarLista(c: Context, l: List<Pessoa>, ativa: String? = null) {
        val j = JSONObject(estado(c).toString()); j.put("lista", JSONArray(l.map { it.json() })); if (ativa != null) { j.put("ativa", ativa); j.put("desde", System.currentTimeMillis()) }
        gravar(c, j)
    }
    fun gerenciado(c: Context) = lista(c).isNotEmpty()
    @Synchronized fun ativa(c: Context): Pessoa? { val w = estado(c).optString("ativa"); return if (w.isBlank()) null else lista(c).firstOrNull { it.owner == w } }
    fun ativaDesde(c: Context): Long = estado(c).optLong("desde")

    /**
     * Para o site (ponte TKAndroid.pessoaAtiva): "" = celular não gerenciado (faz como sempre);
     * {"w":"…","s":"…"} = esta é a pessoa que deve estar no site; {"w":""} = ninguém (tela de escolher / entrar).
     */
    fun paraSite(c: Context): String {
        if (!gerenciado(c)) return ""
        val p = ativa(c) ?: return JSONObject().put("w", "").toString()
        return JSONObject().put("w", p.owner).put("s", p.session).toString()
    }

    /**
     * O site viu uma sessão (entrou, renovou ou soube o nome e os direitos). Guarda/atualiza a pessoa.
     * Só muda quem está usando quando ninguém está (ou é alguém novo que acabou de entrar com a senha): uma janela antiga
     * de outra pessoa nunca troca a pessoa de volta.
     */
    @Synchronized fun vista(c: Context, owner: String, session: String, nome: String?, perms: List<String>?): Boolean {
        val w = owner.filter { it.isDigit() }; if (w.length < 10 || session.isBlank()) return false
        val l = lista(c).toMutableList(); val i = l.indexOfFirst { it.owner == w }; val atual = estado(c).optString("ativa")
        if (i >= 0) {
            // Outra pessoa está usando: só troca se for um login NOVO (token novo = entrou com a senha agora).
            // Janela antiga com o token já guardado nunca troca a pessoa de volta.
            val muda = atual != w && (atual.isBlank() || l[i].session != session)
            if (atual.isNotBlank() && atual != w && !muda) return false
            val p = l[i]; l[i] = p.copy(session = session, nome = nome?.takeIf { it.isNotBlank() } ?: p.nome, perms = perms ?: p.perms)
            gravarLista(c, l, if (muda) w else null); if (muda) { destravar(c); avisar(c); buscarPin(c, w) }; return true
        }
        l.add(Pessoa(w, session, nome.orEmpty(), perms ?: emptyList(), desde = System.currentTimeMillis()))
        gravarLista(c, l, w); destravar(c); avisar(c); buscarPin(c, w); return true
    }
    /** Pessoa entrou com a senha neste celular: se ela já tem PIN na conta (criado em outro celular), não pede outro. */
    private fun buscarPin(c: Context, w: String) { val app = c.applicationContext; if (chaveTeste == null) Thread { sincronizarPins(app, w) }.start() }

    /** Ponte do site: {"w","s","nome","perms"} (conta.js). */
    fun vistaDoSite(c: Context, dados: String?): Boolean = runCatching {
        val j = JSONObject(dados ?: return false)
        val perms = j.optJSONArray("perms")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }.take(40) }
        vista(c, j.optString("w"), j.optString("s"), j.optString("nome").take(80), perms)
    }.getOrDefault(false)

    /** Sessão nova da mesma pessoa (renovada pelo app). Não muda quem está usando. */
    @Synchronized fun renovar(c: Context, owner: String, session: String, nome: String? = null) {
        val l = lista(c).toMutableList(); val i = l.indexOfFirst { it.owner == owner }; if (i < 0) return
        l[i] = l[i].copy(session = session, nome = nome?.takeIf { it.isNotBlank() } ?: l[i].nome); gravarLista(c, l)
    }

    fun pinValido(pin: String) = pin.length == 4 && pin.all { it.isDigit() }
    /** Mesmo cálculo do servidor (PBKDF2-SHA256, 256 bits, Base64): o celular confere na hora, sem rede. */
    internal fun hashPara(pin: String, sal: String, iter: Int): String {
        val f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return Base64.encodeToString(f.generateSecret(PBEKeySpec(pin.toCharArray(), Base64.decode(sal, Base64.NO_WRAP), iter, 256)).encoded, Base64.NO_WRAP)
    }

    /** Guarda a cópia do PIN que veio da conta (servidor). Hash vazio = a pessoa ainda não criou. */
    @Synchronized fun guardarPin(c: Context, owner: String, sal: String, hash: String, iter: Int) {
        val l = lista(c).toMutableList(); val i = l.indexOfFirst { it.owner == owner }; if (i < 0) return
        if (l[i].sal == sal && l[i].pin == hash && l[i].iter == iter) return
        l[i] = l[i].copy(sal = sal, pin = hash, iter = iter.coerceIn(1000, 200000)); gravarLista(c, l)
    }

    /** Cria/troca o PIN NA CONTA (vale em todo celular). Rede: chamar fora da tela principal. Devolve o erro em português ou null. */
    fun criarPinNaConta(c: Context, owner: String, pin: String): String? {
        if (!pinValido(pin)) return "O PIN tem 4 números."
        val p = lista(c).firstOrNull { it.owner == owner } ?: return "Pessoa não encontrada neste celular."
        return runCatching {
            val j = NativeApi().call("/app/pin", p.auth, JSONObject().put("pin", pin).put("aparelho", aparelho(c)).put("modelo", modelo()))
            if (!j.optBoolean("ok")) return j.optString("erro").ifBlank { "Não consegui salvar o PIN agora. Tente de novo." }
            guardarPin(c, owner, j.getString("sal"), j.getString("hash"), j.optInt("iter", 6000)); null
        }.getOrElse { if (it is AccessRevoked) "A sessão desta pessoa venceu. Entre com a senha de novo." else "Sem internet para salvar o PIN. Tente de novo quando a conexão voltar." }
    }

    /** Traz da conta o PIN de cada pessoa deste celular (criado ou trocado em outro celular). Rede: fora da tela principal. */
    fun sincronizarPins(c: Context, so: String? = null) {
        lista(c).filter { so == null || it.owner == so }.forEach { p ->
            runCatching {
                val j = NativeApi().call("/app/pin", p.auth, null, "GET")
                if (j.optBoolean("ok")) { if (j.optBoolean("temPin")) guardarPin(c, p.owner, j.getString("sal"), j.getString("hash"), j.optInt("iter", 6000)) else guardarPin(c, p.owner, "", "", 6000) }
            }
        }
    }

    fun aparelho(c: Context): String { val pr = prefs(c); pr.getString("aparelho", null)?.let { return it }; val n = java.util.UUID.randomUUID().toString().replace("-", "").take(10); pr.edit().putString("aparelho", n).apply(); return n }
    fun modelo(): String = (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim().take(60)

    /** Confere na hora com a cópia do PIN. Sem trava (pedido do Pablo): cada tentativa vai para o registro de segurança e
     * o servidor avisa o Admin total a cada 3 erros seguidos. */
    @Synchronized fun conferirPin(c: Context, owner: String, pin: String): Boolean {
        val p = lista(c).firstOrNull { it.owner == owner } ?: return false
        if (!p.temPin || !pinValido(pin)) return false
        val ok = MessageDigest.isEqual(hashPara(pin, p.sal, p.iter).toByteArray(), p.pin.toByteArray())
        val quem = ativa(c)?.takeIf { it.owner != owner }?.nome.orEmpty()
        val corpo = JSONObject().put("certo", ok).put("aparelho", aparelho(c)).put("modelo", modelo()).put("quemUsava", quem).put("nome", p.nome)
        Thread { runCatching { NativeApi().call("/app/pin/tentativa", p.auth, corpo) } }.start()
        return ok
    }

    /** Passa o celular para esta pessoa (o PIN já foi conferido). */
    @Synchronized fun trocarPara(c: Context, owner: String): Boolean {
        if (lista(c).none { it.owner == owner }) return false
        gravarLista(c, lista(c), owner); destravar(c); avisar(c); return true
    }

    /** Ninguém usando (Sair, "Outra pessoa"): a pessoa continua na lista, com o PIN. */
    @Synchronized fun ninguem(c: Context) { if (!gerenciado(c) || estado(c).optString("ativa").isBlank()) return; gravarLista(c, lista(c), ""); destravar(c); avisar(c) }

    /** Só o Admin total que está usando o celular remove alguém (nunca a si mesmo). */
    @Synchronized fun remover(c: Context, owner: String): Boolean {
        val quem = ativa(c) ?: return false; if (!quem.adminTotal || quem.owner == owner) return false
        val l = lista(c).filter { it.owner != owner }; gravarLista(c, l); avisar(c); return true
    }

    fun bloqueioMin(c: Context) = estado(c).optInt("bloqueio", 0)
    @Synchronized fun definirBloqueio(c: Context, min: Int): Boolean {
        if (min !in BLOQUEIOS || ativa(c)?.adminTotal != true) return false
        gravar(c, JSONObject(estado(c).toString()).put("bloqueio", min)); return true
    }
    /** Uso do celular (toda tela que sai da frente marca). Não destrava: só o PIN destrava. */
    fun marcarUso(c: Context) { prefs(c).edit().putLong("uso", System.currentTimeMillis()).apply() }
    fun travado(c: Context) = prefs(c).getBoolean("travado", false) && ativa(c)?.temPin == true
    fun destravar(c: Context) { prefs(c).edit().putBoolean("travado", false).putLong("uso", System.currentTimeMillis()).commit() }
    /** Ficou parado mais que o tempo escolhido (ou já estava travado): pede o PIN de quem estava usando. */
    fun precisaDesbloquear(c: Context): Boolean {
        if (travado(c)) return true
        val min = bloqueioMin(c); if (min <= 0) return false
        val p = ativa(c) ?: return false; if (!p.temPin) return false
        val uso = prefs(c).getLong("uso", 0L)
        if (uso > 0 && System.currentTimeMillis() - uso > min * 60_000L) { prefs(c).edit().putBoolean("travado", true).commit(); return true }
        return false
    }

    /** Áreas que esta pessoa pode usar (mesma regra da barra do site, nav.js). Sem direitos conhecidos: mostra tudo. */
    fun podeArea(p: Pessoa?, m: Modulo): Boolean {
        if (p == null || p.perms.isEmpty()) return true
        return when (m) {
            Modulo.MENSAGENS -> p.pode("catalogo_admin", "gerir_acessos")
            Modulo.GESTAO, Modulo.POSTAGENS -> p.pode("catalogo_admin")
            Modulo.RH -> p.pode("equipe_relatorio", "gerir_manuais", "gerir_acessos")
            Modulo.CURRICULOS -> p.pode("dados_pessoais", "gerir_acessos")
            Modulo.EQUIPE -> p.pode("gerir_acessos", "catalogo_admin", "catalogo_cadastrar", "esteira", "equipe_relatorio", "gerir_manuais", "dados_pessoais")
            else -> true
        }
    }

    internal fun limparCacheParaTeste() { cache = null }
}
