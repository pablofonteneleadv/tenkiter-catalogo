package br.com.tenkitermodas.mensagens

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject

/**
 * 2.6.1 (fase 3 do app 2.6) — o que espera pela pessoa em cada área, no painel do ícone.
 * Mensagens: conversas não lidas guardadas neste celular (sem consulta). Esteira: o que falta fazer hoje + pedidos a conferir
 * (o mesmo resumo que a Esteira já usa, /esteira/menu?resumo=1). Postagens (2.6.3): postagens com erro esperando alguém agir
 * (contagem que a fila das Postagens já devolve, /posts). Currículos: fica sem número (a lista vem do Apps Script).
 * Regra "Sem troca ao carregar": o painel pinta na hora com o último número guardado (por pessoa) e só troca se mudou.
 */
object Contadores {
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("contadores", Context.MODE_PRIVATE)
    private fun chave(c: Context) = "c_" + (Pessoas.ativa(c)?.owner ?: NativeRepository.get(c).store.auth()?.owner ?: "")

    fun guardados(c: Context): Map<Modulo, Int> = runCatching {
        val j = JSONObject(prefs(c).getString(chave(c), null) ?: return emptyMap())
        Modulo.values().mapNotNull { m -> j.optInt(m.id, 0).takeIf { it > 0 }?.let { m to it } }.toMap()
    }.getOrDefault(emptyMap())

    /** Consulta (fora da tela principal). Devolve os números novos e guarda. */
    fun atualizar(c: Context): Map<Modulo, Int> {
        val out = mutableMapOf<Modulo, Int>()
        val repo = NativeRepository.get(c); val nativa = repo.store.auth()
        val p = Pessoas.ativa(c)
        if (nativa != null && repo.canReadLocal(nativa) && (p == null || p.owner == nativa.owner)) {
            val naoLidas = runCatching { repo.store.conversations().count { it.optInt("nao_lidas") > 0 } }.getOrDefault(0)
            if (naoLidas > 0) out[Modulo.MENSAGENS] = naoLidas
        }
        val auth = p?.let { NativeAuth(it.owner, it.session, it.nome) } ?: nativa
        if (auth != null && Pessoas.podeArea(p, Modulo.ESTEIRA)) runCatching {
            val j = NativeApi().call("/esteira/menu?resumo=1", auth)
            val r = j.optJSONObject("resumoHoje")
            if (r != null) {
                val falta = maxOf(0, r.optInt("total") - r.optInt("feitas"))
                val ped = r.optJSONObject("pedidos")
                val pedidos = if (ped == null) 0 else ped.optInt("conferir") + ped.optInt("aprovar") + ped.optInt("aplicar")
                if (falta + pedidos > 0) out[Modulo.ESTEIRA] = falta + pedidos
            }
        }
        if (auth != null && Pessoas.podeArea(p, Modulo.EQUIPE)) runCatching {   // 2.6.4: comunicados sem ler + conversas novas
            val n = NativeApi().call("/equipe/contagem", auth, null, "GET").optInt("total")
            if (n > 0) out[Modulo.EQUIPE] = n
        }
        if (auth != null && p?.pode("catalogo_admin") != false) runCatching {
            val erros = NativeApi().call("/posts?limite=1", auth, null, "GET").optJSONObject("contagens")?.optInt("erro") ?: 0
            if (erros > 0) out[Modulo.POSTAGENS] = erros
        }
        val j = JSONObject(); out.forEach { (m, n) -> j.put(m.id, n) }
        runCatching { prefs(c).edit().putString(chave(c), j.toString()).apply() }
        return out
    }

    // ---------- áreas mais usadas no menu de segurar o ícone ----------
    private fun usoPrefs(c: Context) = c.applicationContext.getSharedPreferences("uso-areas", Context.MODE_PRIVATE)
    fun usou(c: Context, m: Modulo) {
        val k = "u_" + (Pessoas.ativa(c)?.owner ?: "") + "_" + m.id
        runCatching { usoPrefs(c).edit().putInt(k, usoPrefs(c).getInt(k, 0) + 1).apply() }
    }

    private val icones = mapOf(Modulo.MENSAGENS to R.drawable.ic_launcher, Modulo.GESTAO to R.drawable.ic_janela_gestao, Modulo.ESTEIRA to R.drawable.ic_janela_esteira,
        Modulo.POSTAGENS to R.drawable.ic_janela_postagens, Modulo.TREINAMENTO to R.drawable.ic_janela_treinamento, Modulo.RH to R.drawable.ic_janela_rh,
        Modulo.CURRICULOS to R.drawable.ic_janela_curriculos, Modulo.PRINCIPAL to R.drawable.ic_janela_principal, Modulo.EQUIPE to R.drawable.ic_janela_equipe)

    /** Segurar o ícone: as áreas que a pessoa pode usar, as mais usadas por ela primeiro (no máximo 4). */
    fun publicarAtalhos(c: Context) = runCatching {
        val p = Pessoas.ativa(c); val dono = p?.owner ?: ""
        val ordem = listOf(Modulo.MENSAGENS, Modulo.EQUIPE, Modulo.ESTEIRA, Modulo.GESTAO, Modulo.POSTAGENS, Modulo.TREINAMENTO, Modulo.PRINCIPAL, Modulo.RH, Modulo.CURRICULOS)
        val areas = ordem.filter { Pessoas.podeArea(p, it) }
            .sortedByDescending { usoPrefs(c).getInt("u_" + dono + "_" + it.id, 0) }
            .take(minOf(4, ShortcutManagerCompat.getMaxShortcutCountPerActivity(c).coerceAtLeast(1)))
        val atalhos = areas.mapIndexed { i, m ->
            ShortcutInfoCompat.Builder(c, m.id).setShortLabel(m.rotulo).setLongLabel("Abrir " + m.rotulo).setRank(i)
                .setIcon(IconCompat.createWithResource(c, icones[m] ?: R.drawable.ic_launcher))
                .setIntent(Intent(c, m.classe).setAction(Intent.ACTION_VIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)).build()
        }
        ShortcutManagerCompat.setDynamicShortcuts(c, atalhos)
    }
}
