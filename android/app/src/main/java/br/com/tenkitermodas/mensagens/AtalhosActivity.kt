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
        setFinishOnTouchOutside(true)
        window.setGravity(Gravity.BOTTOM)
        window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
        val caixa = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(22))
            background = GradientDrawable().apply { setColor(Color.parseColor("#10100E")); cornerRadii = floatArrayOf(dp(22).toFloat(), dp(22).toFloat(), dp(22).toFloat(), dp(22).toFloat(), 0f, 0f, 0f, 0f) }
        }
        caixa.addView(TextView(this).apply {
            text = "TENKiTER"; setTextColor(Color.parseColor("#E67E22")); textSize = 18f; typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(6), 0, 0, dp(10))
        })
        val grade = GridLayout(this).apply { columnCount = 4 }
        areas.forEach { a ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(4), dp(8), dp(4), dp(8)); isClickable = true; isFocusable = true
                contentDescription = a.modulo.rotulo
                val fundo = android.util.TypedValue(); context.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, fundo, true)
                if (fundo.resourceId != 0) foreground = context.getDrawable(fundo.resourceId)
                setOnClickListener { Modulo.abrir(this@AtalhosActivity, a.modulo); finish(); overridePendingTransition(0, 0) }
            }
            item.addView(ImageView(this).apply {
                setImageResource(a.icone); scaleType = ImageView.ScaleType.CENTER_CROP
                clipToOutline = true; background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.parseColor("#10100E")) }
            }, LinearLayout.LayoutParams(dp(56), dp(56)))
            item.addView(TextView(this).apply {
                text = a.modulo.rotulo; setTextColor(Color.WHITE); textSize = 12f; gravity = Gravity.CENTER; maxLines = 1
                setPadding(0, dp(6), 0, 0)
            })
            grade.addView(item, GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply { width = 0; height = ViewGroup.LayoutParams.WRAP_CONTENT })
        }
        caixa.addView(grade)
        setContentView(caixa)
    }
}
