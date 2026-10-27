package br.com.tenkitermodas.mensagens

import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.floor

object ProductText {
    /** Preço à vista segue common.js/precoTerminacao; desconto vem do mesmo arquivo no build. */
    fun price(p:JSONObject):String {
        val value=p.optString("Preco").replace(',','.').toDoubleOrNull()?:return "Consulte valor"
        if(!value.isFinite()||value<=0)return "Consulte valor"
        val cents=floor(value*100+0.5)*(1-BuildConfig.CASH_DISCOUNT);val base=floor(cents/100)
        val target=listOf((base-1)*100+99,base*100+49,base*100+99).filter{it>=49}.minBy{abs(it-cents)}
        return "R$ "+String.format(java.util.Locale("pt","BR"),"%.2f",target/100)+" à vista"
    }
}
