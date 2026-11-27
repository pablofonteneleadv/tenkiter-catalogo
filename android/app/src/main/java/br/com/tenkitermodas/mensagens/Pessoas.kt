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
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

/**
 * 2.6.0 — Troca de pessoa no celular da loja (proposta app 2.6, decisões do Pablo de 26/11/2026).
 * Até 4 pessoas por celular. Cada uma entra com a senha UMA vez e cria um PIN de 4 dígitos; depois, trocar é escolher
 * a pessoa e digitar o PIN. O PIN só destrava a sessão que já está guardada neste celular (conferido só aqui, sem Apps Script);
 * o servidor continua conferindo a sessão em todo pedido. Só o Admin total (gerir_acessos) remove alguém do celular.
 * Bloqueio por tempo parado: desligado por padrão (15 ou 30 min, escolha do Admin total).
 *
 * "Gerenciado" = existe ao menos uma pessoa na lista. Sem ninguém na lista o app se comporta exatamente como o 2.5.
 */
data class Pessoa(val owner: String, val session: String, val nome: String, val perms: List<String>, val sal: String = "", val pin: String = "", val desde: Long = 0L) {
    val temPin get() = pin.isNotBlank()
    val primeiroNome get() = nome.trim().split(Regex("\\s+")).firstOrNull()?.takeIf { it.isNotBlank() } ?: "Pessoa"
    val iniciais get(): String { val p = nome.trim().split(Regex("\\s+")).filter { it.isNotBlank() }; return if (p.isEmpty()) "?" else (p.first().take(1) + (if (p.size > 1) p.last().take(1) else "")).uppercase() }
    fun pode(vararg chaves: String) = chaves.any { it in perms }
    val adminTotal get() = "gerir_acessos" in perms
    fun json(): JSONObject = JSONObject().put("owner", owner).put("session", session).put("nome", nome).put("perms", JSONArray(perms)).put("sal", sal).put("pin", pin).put("desde", desde)
    companion object {
        fun ler(j: JSONObject) = Pessoa(j.getString("owner"), j.optString("session"), j.optString("nome"),
            j.optJSONArray("perms")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } } ?: emptyList(),
            j.optString("sal"), j.optString("pin"), j.optLong("desde"))
    }
}

object Pessoas {
    const val MAX = 4
    const val MUDOU = "br.com.tenkitermodas.mensagens.PESSOA_MUDOU"
    val BLOQUEIOS = listOf(0, 15, 30)
    private const val ALIAS = "tk-pessoas"
    private const val ITERACOES = 6000   // PIN curto: o hash lento só atrasa adivinhação; a trava de tentativas faz o resto

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
            gravarLista(c, l, if (muda) w else null); if (muda) { destravar(c); avisar(c) }; return true
        }
        if (l.size >= MAX) return false
        l.add(Pessoa(w, session, nome.orEmpty(), perms ?: emptyList(), desde = System.currentTimeMillis()))
        gravarLista(c, l, w); destravar(c); avisar(c); return true
    }

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
    private fun hash(pin: String, sal: String): String {
        val f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return Base64.encodeToString(f.generateSecret(PBEKeySpec(pin.toCharArray(), Base64.decode(sal, Base64.NO_WRAP), ITERACOES, 256)).encoded, Base64.NO_WRAP)
    }

    @Synchronized fun criarPin(c: Context, owner: String, pin: String): Boolean {
        if (!pinValido(pin)) return false
        val l = lista(c).toMutableList(); val i = l.indexOfFirst { it.owner == owner }; if (i < 0) return false
        val sal = ByteArray(16).also { SecureRandom().nextBytes(it) }.let { Base64.encodeToString(it, Base64.NO_WRAP) }
        l[i] = l[i].copy(sal = sal, pin = hash(pin, sal)); gravarLista(c, l); zerarErros(c, owner); return true
    }

    /** Trava de tentativas: 5 erros seguidos = 30 s de espera (dobra a cada nova série, até 15 min). */
    fun esperaRestante(c: Context, owner: String): Long { val ate = prefs(c).getLong("trava_$owner", 0L); return maxOf(0L, ate - System.currentTimeMillis()) }
    private fun zerarErros(c: Context, owner: String) { prefs(c).edit().remove("erros_$owner").remove("trava_$owner").remove("series_$owner").apply() }

    @Synchronized fun conferirPin(c: Context, owner: String, pin: String): Boolean {
        if (esperaRestante(c, owner) > 0) return false
        val p = lista(c).firstOrNull { it.owner == owner } ?: return false
        if (!p.temPin || !pinValido(pin)) return false
        val ok = MessageDigest.isEqual(hash(pin, p.sal).toByteArray(), p.pin.toByteArray())
        if (ok) { zerarErros(c, owner); return true }
        val pr = prefs(c); val erros = pr.getInt("erros_$owner", 0) + 1
        if (erros >= 5) { val series = pr.getInt("series_$owner", 0) + 1; val ms = minOf(15 * 60_000L, 30_000L shl (series - 1)); pr.edit().putInt("erros_$owner", 0).putInt("series_$owner", series).putLong("trava_$owner", System.currentTimeMillis() + ms).apply() }
        else pr.edit().putInt("erros_$owner", erros).apply()
        return false
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
        val l = lista(c).filter { it.owner != owner }; gravarLista(c, l); zerarErros(c, owner); avisar(c); return true
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
            else -> true
        }
    }

    internal fun limparCacheParaTeste() { cache = null }
}
