package br.com.tenkitermodas.mensagens

import android.net.Uri
import org.json.JSONObject

/** A escolha é por canal; anexos/Instagram nunca usam a prévia de texto. */
object LinkPreview {
    fun fields(text:String,products:List<JSONObject>):JSONObject {
        val match=Regex("https?://[^\\s<>\"']+",RegexOption.IGNORE_CASE).find(text)?:return JSONObject()
        val url=runCatching{Uri.parse(match.value.trimEnd(')', '.', ',', ';', ':', '!', '?', '*', '_', '~'))}.getOrNull()?:return JSONObject()
        val result=JSONObject().put("previa",true)
        val site=Uri.parse(BuildConfig.SITE_URL)
        if(url.host!=site.host||url.scheme!=site.scheme)return result
        val code=url.pathSegments.let{if(it.size>=2&&it[0]=="p")it[1]else""}
        val product=products.firstOrNull{it.optString("Codigo").equals(code,true)||it.optString("ID")==code}
        if(code.isNotBlank()&&product!=null)return result.put("previaTitulo",product.optString("Nome","TENKiTER Modas").take(100)).put("previaDescricao",ProductText.price(product).take(200))
        val selected=url.getQueryParameter("sel")?.split(',')?.count{it.isNotBlank()}?:0
        return if(selected>0)result.put("previaTitulo","Peças separadas para você").put("previaDescricao","$selected "+if(selected==1)"peça na TENKiTER Modas"else"peças na TENKiTER Modas")else result.put("previaTitulo","TENKiTER Modas")
    }
}
