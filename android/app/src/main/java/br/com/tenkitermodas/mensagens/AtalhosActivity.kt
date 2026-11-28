package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 2.5.5 — Um ícone só na tela do celular (pedido do Pablo, 26/11/2026). Um toque abre na hora esta janelinha com as
 * áreas (nativa, sem carregar site); segurar o ícone mostra o menu do Android com as mesmas áreas (res/xml/atalhos.xml).
 * Tocar fora fecha. Cada área abre na sua própria janela, como antes.
 */
class AtalhosActivity : Activity() {
    private data class Area(val modulo: Modulo, val icone: Int)
    private val areas = listOf(
        Area(Modulo.MENSAGENS, R.drawable.ic_launcher),
        Area(Modulo.EQUIPE, R.drawable.ic_janela_equipe),
        Area(Modulo.GESTAO, R.drawable.ic_janela_gestao),
        Area(Modulo.ESTEIRA, R.drawable.ic_janela_esteira),
        Area(Modulo.POSTAGENS, R.drawable.ic_janela_postagens),
        Area(Modulo.TREINAMENTO, R.drawable.ic_janela_treinamento),
        Area(Modulo.RH, R.drawable.ic_janela_rh),
        Area(Modulo.CURRICULOS, R.drawable.ic_janela_curriculos),
        Area(Modulo.PRINCIPAL, R.drawable.ic_janela_principal),
    )

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        // 2.6.0: celular com pessoas salvas — ninguém usando ou parado demais: primeiro "Quem vai usar?" / PIN.
        if (Pessoas.gerenciado(this)) {
            val ativa = Pessoas.ativa(this)
            if (ativa == null) { PessoasActivity.abrir(this, voltaPainel = true); finish(); return }
            if (Pessoas.precisaDesbloquear(this)) { PessoasActivity.abrir(this, PessoasActivity.DESBLOQUEAR, voltaPainel = true); finish(); return }
            // Sem PIN guardado aqui: primeiro confere na conta (pode ter criado em outro celular); só pede para criar se não tiver.
            if (!ativa.temPin) { val app = applicationContext; Thread { Pessoas.sincronizarPins(app, ativa.owner); if (Pessoas.ativa(app)?.temPin == false) PessoasActivity.abrir(app, PessoasActivity.CRIAR) }.start() }
        }
        setFinishOnTouchOutside(true)
        window.setGravity(Gravity.BOTTOM)
        window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
        val caixa = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(22))
            background = GradientDrawable().apply { setColor(Color.parseColor("#10100E")); cornerRadii = floatArrayOf(dp(22).toFloat(), dp(22).toFloat(), dp(22).toFloat(), dp(22).toFloat(), 0f, 0f, 0f, 0f) }
        }
        val ativa = Pessoas.ativa(this)
        ativa?.let { pessoa -> Thread {
            val permitido = try { NativeApi().call("/msg/acesso", pessoa.auth).optBoolean("permitido", false) }
                catch (_: AccessRevoked) { false } catch (_: Exception) { return@Thread }
            val mudou = Pessoas.guardarAcessoMensagens(applicationContext, pessoa.auth, permitido)
            if (!permitido && NativeRepository.get(applicationContext).store.auth()?.owner == pessoa.owner) NativeRepository.get(applicationContext).logout(false)
            if (mudou) runOnUiThread { if (!isFinishing && Pessoas.ativa(this)?.owner == pessoa.owner) recreate() }
        }.start() }
        if (ativa == null) caixa.addView(TextView(this).apply {
            text = "TENKiTER Gestão"; setTextColor(Color.parseColor("#E67E22")); textSize = 18f; typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(6), 0, 0, dp(10))
        }) else caixa.addView(quemUsa(ativa))
        // Fase 2: "Continuar" leva para a última coisa que a pessoa estava fazendo (nas últimas 12 h).
        Ultima.ler(this)?.takeIf { Pessoas.podeArea(ativa, it.first) }?.let { (m, url, titulo) ->
            caixa.addView(TextView(this).apply {
                text = "↩ Continuar: " + m.rotulo + (if (titulo.isNotBlank() && !titulo.equals(m.rotulo, true)) " · " + titulo else "")
                setTextColor(Color.WHITE); textSize = 15f; maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END; gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), 0, dp(14), 0); minHeight = dp(48); isClickable = true; isFocusable = true
                background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.parseColor("#2B2A27")) }
                setOnClickListener { Modulo.abrir(this@AtalhosActivity, m, url.ifBlank { null }); finish(); overridePendingTransition(0, 0) }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { bottomMargin = dp(12) })
        }
        val grade = GridLayout(this).apply { columnCount = 4 }
        val guardados = Contadores.guardados(this)
        areas.filter { Pessoas.podeArea(ativa, it.modulo) }.forEach { a ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(4), dp(8), dp(4), dp(8)); isClickable = true; isFocusable = true
                contentDescription = a.modulo.rotulo
                val fundo = android.util.TypedValue(); context.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, fundo, true)
                if (fundo.resourceId != 0) foreground = context.getDrawable(fundo.resourceId)
                setOnClickListener { Modulo.abrir(this@AtalhosActivity, a.modulo); finish(); overridePendingTransition(0, 0) }
            }
            // Fase 3: o número do que espera pela pessoa nesta área (último guardado na hora; atualiza só se mudou).
            val icone = android.widget.FrameLayout(this)
            icone.addView(ImageView(this).apply {
                setImageResource(a.icone); scaleType = ImageView.ScaleType.CENTER_CROP
                clipToOutline = true; background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.parseColor("#10100E")) }
            }, android.widget.FrameLayout.LayoutParams(dp(56), dp(56)))
            val selo = TextView(this).apply {
                setTextColor(Color.WHITE); textSize = 11f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; minWidth = dp(20); setPadding(dp(5), 0, dp(5), 0)
                background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(Color.parseColor("#C62828")); setStroke(dp(2), Color.parseColor("#10100E")) }
            }
            icone.addView(selo, android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(20)).apply { gravity = Gravity.END or Gravity.TOP })
            selos[a.modulo] = selo to item; pintarSelo(a.modulo, guardados[a.modulo] ?: 0)
            item.addView(icone, LinearLayout.LayoutParams(dp(62), dp(62)))
            item.addView(TextView(this).apply {
                text = a.modulo.rotulo; setTextColor(Color.WHITE); textSize = 12f; gravity = Gravity.CENTER; maxLines = 1
                setPadding(0, dp(6), 0, 0)
            })
            grade.addView(item, GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply { width = 0; height = ViewGroup.LayoutParams.WRAP_CONTENT })
        }
        caixa.addView(grade)
        setContentView(caixa)
        Contadores.publicarAtalhos(this)
        // 2.6.4: liga os avisos da Equipe para quem está usando (uma vez por dia por pessoa; também quem não usa as Mensagens)
        ativa?.let { pa -> val pr = getSharedPreferences("contadores", MODE_PRIVATE); val hoje = java.time.LocalDate.now().toString(); if (pr.getString("eq_aviso_" + pa.owner, "") != hoje) { pr.edit().putString("eq_aviso_" + pa.owner, hoje).apply(); ligarAvisosEquipe(applicationContext, pa.auth) } }
        Thread {
            val novos = runCatching { Contadores.atualizar(this) }.getOrNull() ?: return@Thread
            runOnUiThread { if (!isFinishing) selos.keys.forEach { m -> if ((novos[m] ?: 0) != (guardados[m] ?: 0)) pintarSelo(m, novos[m] ?: 0) } }
        }.start()
    }

    private val selos = mutableMapOf<Modulo, Pair<TextView, LinearLayout>>()
    private fun pintarSelo(m: Modulo, n: Int) {
        val (selo, item) = selos[m] ?: return
        selo.text = if (n > 99) "99+" else n.toString(); selo.visibility = if (n > 0) android.view.View.VISIBLE else android.view.View.GONE
        item.contentDescription = m.rotulo + if (n > 0) ", $n esperando" else ""
    }

    /** Faixa de quem está usando: inicial, nome, desde quando e o botão Trocar (2 toques + PIN). */
    private fun quemUsa(p: Pessoa): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4), 0, 0, dp(12))
        addView(TextView(this@AtalhosActivity).apply {
            text = p.iniciais; textSize = 16f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#10100E"))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#E67E22")) }
        }, LinearLayout.LayoutParams(dp(40), dp(40)))
        val desde = Pessoas.ativaDesde(this@AtalhosActivity)
        addView(LinearLayout(this@AtalhosActivity).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(10), 0, dp(8), 0)
            addView(TextView(this@AtalhosActivity).apply { text = p.primeiroNome; setTextColor(Color.WHITE); textSize = 17f; typeface = Typeface.DEFAULT_BOLD; maxLines = 1 })
            if (desde > 0) addView(TextView(this@AtalhosActivity).apply { text = "usando este celular desde " + java.text.SimpleDateFormat("HH:mm", java.util.Locale("pt", "BR")).format(java.util.Date(desde)); setTextColor(Color.parseColor("#BBBBBB")); textSize = 12f; maxLines = 1 })
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(TextView(this@AtalhosActivity).apply {
            text = "🔄 Trocar"; setTextColor(Color.WHITE); textSize = 15f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
            setPadding(dp(14), 0, dp(14), 0); minHeight = dp(44); contentDescription = "Trocar de pessoa"
            background = GradientDrawable().apply { cornerRadius = dp(22).toFloat(); setColor(Color.parseColor("#2B2A27")) }
            isClickable = true; isFocusable = true
            setOnClickListener { PessoasActivity.abrir(this@AtalhosActivity, voltaPainel = true); finish(); overridePendingTransition(0, 0) }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)))
    }
}
