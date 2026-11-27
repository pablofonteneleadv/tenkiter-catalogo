package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * 2.6.0 — "Quem vai usar?" e o teclado do PIN (proposta app 2.6). Tela nativa, abre na hora, sem carregar site.
 * Modos: escolher (padrão), desbloquear (tempo parado) e criar (PIN novo de quem está usando).
 * Trocar: toca na pessoa e digita o PIN de 4 dígitos; ao completar o 4º dígito já troca (sem botão de confirmar).
 */
class PessoasActivity : Activity() {
    companion object {
        const val MODO = "modo"
        const val ESCOLHER = "escolher"; const val DESBLOQUEAR = "desbloquear"; const val CRIAR = "criar"
        const val VOLTA_PAINEL = "volta_painel"
        fun abrir(c: Context, modo: String = ESCOLHER, voltaPainel: Boolean = false) {
            val i = Intent(c, PessoasActivity::class.java).putExtra(MODO, modo).putExtra(VOLTA_PAINEL, voltaPainel)
            if (c !is Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { c.startActivity(i) }
        }
    }

    private val laranja = Color.parseColor("#E67E22"); private val fundo = Color.parseColor("#10100E"); private val cartao = Color.parseColor("#22211E")
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var raiz: LinearLayout
    private var modo = ESCOLHER

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
    private fun redondo(cor: Int, raio: Int) = GradientDrawable().apply { setColor(cor); cornerRadius = dp(raio).toFloat() }
    private fun texto(t: String, tam: Float, cor: Int = Color.WHITE, negrito: Boolean = false) = TextView(this).apply { text = t; textSize = tam; setTextColor(cor); if (negrito) typeface = Typeface.DEFAULT_BOLD }
    private fun botao(t: String, principal: Boolean = false, acao: () -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; textSize = 16f; minHeight = dp(48); setTextColor(if (principal) fundo else Color.WHITE)
        background = redondo(if (principal) laranja else cartao, 12); setOnClickListener { acao() }
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        modo = intent.getStringExtra(MODO) ?: ESCOLHER
        window.statusBarColor = fundo; window.navigationBarColor = fundo
        raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(28), dp(20), dp(20)); setBackgroundColor(fundo) }
        setContentView(ScrollView(this).apply { isFillViewport = true; setBackgroundColor(fundo); addView(raiz) })
        when {
            modo == CRIAR -> Pessoas.ativa(this)?.let { telaCriar(it) } ?: telaLista()
            modo == DESBLOQUEAR -> Pessoas.ativa(this)?.let { telaPin(it, desbloquear = true) } ?: telaLista()
            else -> telaLista()
        }
    }

    // ---------- lista de pessoas ----------
    private fun telaLista() {
        raiz.removeAllViews()
        raiz.addView(texto("Quem vai usar?", 24f, Color.WHITE, true))
        val lista = Pessoas.lista(this); val ativa = Pessoas.ativa(this)
        raiz.addView(texto(if (lista.isEmpty()) "Entre com a sua senha uma vez neste celular. Depois é só tocar no seu nome e digitar o PIN." else "Toque no seu nome e digite o seu PIN de 4 dígitos.", 14f, Color.parseColor("#CCCCCC")).apply { setPadding(0, dp(6), 0, dp(18)) })
        val grade = GridLayout(this).apply { columnCount = 2 }
        lista.forEach { p -> grade.addView(cartaoPessoa(p, p.owner == ativa?.owner), celula()) }
        if (lista.size < Pessoas.MAX) grade.addView(cartaoOutra(), celula())
        raiz.addView(grade)
        if (lista.size >= Pessoas.MAX) raiz.addView(texto("Este celular já tem 4 pessoas. Para entrar outra, o Admin total remove alguém segurando o nome.", 13f, Color.parseColor("#CCCCCC")).apply { setPadding(0, dp(12), 0, 0) })
        val livre = !Pessoas.travado(this)
        if (livre && ativa != null && ativa.temPin) raiz.addView(botao("Mudar o meu PIN") { telaCriar(ativa) }.apply { layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) } })
        if (livre && ativa?.adminTotal == true) raiz.addView(blocoBloqueio())
    }

    private fun celula() = GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply { width = 0; height = ViewGroup.LayoutParams.WRAP_CONTENT; setMargins(dp(5), dp(5), dp(5), dp(5)) }

    private fun avatar(iniciais: String, destaque: Boolean) = TextView(this).apply {
        text = iniciais; textSize = 22f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        setTextColor(if (destaque) fundo else Color.WHITE); background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(if (destaque) laranja else Color.parseColor("#3A3936")) }
    }

    private fun cartaoPessoa(p: Pessoa, usando: Boolean): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(8), dp(16), dp(8), dp(14))
        background = redondo(cartao, 16).apply { if (usando) setStroke(dp(2), laranja) }
        isClickable = true; isFocusable = true; minimumHeight = dp(132)
        contentDescription = p.nome.ifBlank { p.primeiroNome } + if (usando) ", usando agora" else ""
        addView(avatar(p.iniciais, usando), LinearLayout.LayoutParams(dp(64), dp(64)))
        addView(texto(p.primeiroNome, 17f, Color.WHITE, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(8), 0, 0); maxLines = 1 })
        addView(texto(when { usando -> "usando agora"; !p.temPin -> "sem PIN"; else -> "" }, 12f, if (usando) laranja else Color.parseColor("#AAAAAA")).apply { gravity = Gravity.CENTER })
        setOnClickListener {
            when {
                usando && p.temPin -> if (Pessoas.travado(this@PessoasActivity)) telaPin(p, desbloquear = true) else fechar()
                usando -> telaCriar(p)
                !p.temPin -> semPin(p)
                else -> telaPin(p)
            }
        }
        setOnLongClickListener { removerPessoa(p); true }
    }

    private fun cartaoOutra(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(8), dp(16), dp(8), dp(14))
        background = redondo(cartao, 16); isClickable = true; isFocusable = true; minimumHeight = dp(132); contentDescription = "Outra pessoa: entrar com a senha"
        addView(avatar("+", false), LinearLayout.LayoutParams(dp(64), dp(64)))
        addView(texto("Outra", 17f, Color.WHITE, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(8), 0, 0) })
        addView(texto("entrar com a senha", 12f, Color.parseColor("#AAAAAA")).apply { gravity = Gravity.CENTER })
        setOnClickListener { entrarComSenha() }
    }

    /** Ninguém usando e abre a tela de entrar (a pessoa atual continua na lista, com o PIN). */
    private fun entrarComSenha() {
        Pessoas.ninguem(this); ContaApp.aplicarPessoa(this)
        Modulo.abrir(this, Modulo.GESTAO); finish()
    }

    private fun semPin(p: Pessoa) {
        AlertDialog.Builder(this).setTitle(p.primeiroNome + " ainda não criou o PIN")
            .setMessage("Entre com a senha uma vez; depois o celular pede para criar o PIN de 4 dígitos.")
            .setPositiveButton("Entrar com a senha") { _, _ -> entrarComSenha() }.setNegativeButton("Voltar", null).show()
    }

    private fun removerPessoa(p: Pessoa) {
        val quem = Pessoas.ativa(this)
        if (quem?.adminTotal != true) { aviso("Só o Admin total remove uma pessoa deste celular."); return }
        if (quem.owner == p.owner) { aviso("Você está usando o celular agora. Para remover você, outra pessoa Admin total faz isso."); return }
        AlertDialog.Builder(this).setTitle("Remover " + p.primeiroNome + " deste celular?")
            .setMessage("Ela sai da lista e o PIN dela é apagado. Para voltar, entra com a senha de novo.")
            .setPositiveButton("Remover") { _, _ -> if (Pessoas.remover(this, p.owner)) telaLista() else aviso("Não consegui remover agora.") }
            .setNegativeButton("Cancelar", null).show()
    }

    private fun blocoBloqueio(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(0, dp(24), 0, 0)
        addView(texto("Pedir o PIN de novo depois de parado", 15f, Color.WHITE, true))
        addView(texto("Só o Admin total muda. Vale para este celular.", 12f, Color.parseColor("#AAAAAA")).apply { setPadding(0, dp(2), 0, dp(8)) })
        val linha = LinearLayout(this@PessoasActivity).apply { orientation = LinearLayout.HORIZONTAL }
        val atual = Pessoas.bloqueioMin(this@PessoasActivity)
        Pessoas.BLOQUEIOS.forEach { min ->
            linha.addView(botao(if (min == 0) "Desligado" else "$min min", min == atual) {
                if (Pessoas.definirBloqueio(this@PessoasActivity, min)) telaLista() else aviso("Só o Admin total muda o bloqueio.")
            }.apply { contentDescription = (if (min == 0) "Bloqueio desligado" else "Bloquear depois de $min minutos") + if (min == atual) ", escolhido" else "" },
                LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginEnd = dp(6) })
        }
        addView(linha)
    }

    // ---------- teclado do PIN ----------
    private fun telaPin(p: Pessoa, desbloquear: Boolean = false) {
        raiz.removeAllViews()
        raiz.addView(avatar(p.iniciais, true), LinearLayout.LayoutParams(dp(72), dp(72)).apply { gravity = Gravity.CENTER_HORIZONTAL })
        raiz.addView(texto(if (desbloquear) "PIN de " + p.primeiroNome + " para continuar" else "PIN de " + p.primeiroNome, 20f, Color.WHITE, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(12), 0, dp(4)) })
        val msg = texto("", 14f, Color.parseColor("#FFB4A0")).apply { gravity = Gravity.CENTER; minHeight = dp(22) }
        teclado(4, msg) { pin, limpar ->
            val espera = Pessoas.esperaRestante(this, p.owner)
            if (espera > 0) { msg.text = "Muitas tentativas. Espere " + ((espera + 999) / 1000) + " s."; limpar(); return@teclado }
            if (Pessoas.conferirPin(this, p.owner, pin)) {
                if (!desbloquear) { Pessoas.trocarPara(this, p.owner); ContaApp.aplicarPessoa(this) } else Pessoas.destravar(this)
                fechar()
            } else {
                val e2 = Pessoas.esperaRestante(this, p.owner)
                msg.text = if (e2 > 0) "Muitas tentativas. Espere " + ((e2 + 999) / 1000) + " s." else "PIN errado. Tente de novo."
                raiz.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); limpar()
            }
        }
        raiz.addView(msg)
        raiz.addView(botao(if (desbloquear) "Outra pessoa" else "Voltar") { telaLista() }.apply { layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) } })
    }

    private fun telaCriar(p: Pessoa) {
        raiz.removeAllViews()
        raiz.addView(texto("Crie o seu PIN, " + p.primeiroNome, 22f, Color.WHITE, true))
        raiz.addView(texto("4 números que só você sabe. Com ele você troca de pessoa neste celular em 2 toques.", 14f, Color.parseColor("#CCCCCC")).apply { setPadding(0, dp(6), 0, dp(14)) })
        val msg = texto("", 14f, Color.parseColor("#FFB4A0")).apply { gravity = Gravity.CENTER; minHeight = dp(22) }
        var primeiro = ""
        val titulo = texto("Digite o PIN", 17f, laranja, true).apply { gravity = Gravity.CENTER }
        raiz.addView(titulo)
        teclado(4, msg) { pin, limpar ->
            if (primeiro.isEmpty()) {
                if (pin.toSet().size == 1 || pin == "1234" || pin == "4321") { msg.text = "Escolha um PIN menos óbvio."; limpar(); return@teclado }
                primeiro = pin; titulo.text = "Repita o PIN"; msg.text = ""; limpar()
            } else if (pin != primeiro) { primeiro = ""; titulo.text = "Digite o PIN"; msg.text = "Os dois não bateram. Comece de novo."; limpar() }
            else { if (Pessoas.criarPin(this, p.owner, pin)) { Pessoas.marcarUso(this); fechar() } else { msg.text = "Não consegui salvar. Tente de novo."; limpar() } }
        }
        raiz.addView(msg)
        raiz.addView(botao("Agora não") { fechar() }.apply { layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) } })
    }

    /** Pontos + teclado numérico grande (toque de 64 dp). Ao completar, chama [pronto] na hora. */
    private fun teclado(tamanho: Int, msg: TextView, pronto: (String, () -> Unit) -> Unit) {
        val digitado = StringBuilder()
        val pontos = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(0, dp(14), 0, dp(10)) }
        val bolas = (0 until tamanho).map { View(this).also { v -> pontos.addView(v, LinearLayout.LayoutParams(dp(16), dp(16)).apply { setMargins(dp(9), 0, dp(9), 0) }) } }
        fun pintar() { bolas.forEachIndexed { i, v -> v.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; if (i < digitado.length) setColor(laranja) else { setColor(Color.TRANSPARENT); setStroke(dp(2), Color.parseColor("#888888")) } } }; pontos.contentDescription = "${digitado.length} de $tamanho números digitados" }
        val limpar = { digitado.clear(); pintar() }
        pintar(); raiz.addView(pontos)
        val grade = GridLayout(this).apply { columnCount = 3; layoutParams = LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER_HORIZONTAL } }
        listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫").forEach { t ->
            val b = Button(this).apply {
                text = t; textSize = 26f; isAllCaps = false; setTextColor(Color.WHITE); background = if (t.isEmpty()) null else redondo(cartao, 40)
                isEnabled = t.isNotEmpty(); contentDescription = if (t == "⌫") "Apagar" else t
                setOnClickListener {
                    if (t == "⌫") { if (digitado.isNotEmpty()) digitado.deleteCharAt(digitado.length - 1); pintar(); return@setOnClickListener }
                    if (digitado.length >= tamanho) return@setOnClickListener
                    if (msg.text.isNotEmpty() && digitado.isEmpty()) msg.text = ""
                    digitado.append(t); pintar(); performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    if (digitado.length == tamanho) { val pin = digitado.toString(); handler.post { pronto(pin, limpar) } }
                }
            }
            grade.addView(b, GridLayout.LayoutParams().apply { width = dp(76); height = dp(76); setMargins(dp(8), dp(6), dp(8), dp(6)) })
        }
        raiz.addView(grade)
    }

    private fun aviso(t: String) { android.widget.Toast.makeText(this, t, android.widget.Toast.LENGTH_LONG).show() }
    private fun fechar() {
        if (intent.getBooleanExtra(VOLTA_PAINEL, false) && Pessoas.ativa(this) != null) runCatching { startActivity(Intent(this, AtalhosActivity::class.java)) }
        finish(); overridePendingTransition(0, 0)
    }

    @Deprecated("Legacy back API")
    override fun onBackPressed() {
        // Desbloqueio: voltar não passa por cima do PIN (manda para a tela inicial do celular).
        if (Pessoas.travado(this)) { moveTaskToBack(true); return }
        super.onBackPressed()
    }
}
