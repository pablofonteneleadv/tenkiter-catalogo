package br.com.tenkitermodas.mensagens

import org.json.JSONObject
import java.time.Instant

/** Mesmas distinções do atendimento web: não lida não significa falta responder. */
object InboxRules {
    fun group(c:JSONObject)=c.optInt("grupo")==1
    fun waiting(c:JSONObject)=!group(c)&&c.optString("ult_dir")=="entrada"&&c.optString("encerrada_em").isBlank()
    fun channel(c:JSONObject)=when(c.optString("canal")){"whatsapp1"->"WhatsApp 1";"whatsapp2"->"WhatsApp 2";else->"Instagram"}
    fun waitLabel(c:JSONObject):String {
        if(!waiting(c))return ""
        val stamp=runCatching{Instant.parse(c.optString("ult_entrada_em")).toEpochMilli()}.getOrNull()?:return "Falta responder"
        val mins=((System.currentTimeMillis()-stamp)/60000).coerceAtLeast(0)
        return "Falta responder · "+when{mins<1->"agora";mins<60->"há $mins min";mins<1440->"há ${mins/60} h";else->"há ${mins/1440} d"}
    }
    fun contact(c:JSONObject):String {
        val raw=c.optString("contato");if(group(c))return "Grupo"
        val digits=raw.filter(Char::isDigit).let{if(it.startsWith("55")&&it.length in 12..13)it.drop(2)else it}
        return if(digits.length in 10..11)"("+digits.take(2)+") "+digits.drop(2).dropLast(4)+"-"+digits.takeLast(4)else raw
    }
    fun preview(c:JSONObject):String {
        val raw=c.optString("previa");val value=when(raw){"[audio]","[áudio]"->"Áudio";"[imagem]"->"Foto";"[video]","[vídeo]"->"Vídeo";else->raw.ifBlank{"Sem prévia da mensagem"}}
        return if(c.optString("ult_dir")=="saida")"Você: $value"else value
    }
    fun matches(c:JSONObject,mode:String,type:String):Boolean {
        if(type=="Mensagens"&&group(c)||type=="Grupos"&&!group(c))return false
        return when(mode){
            "Não lidas"->c.optInt("nao_lidas")>0
            "Falta responder"->waiting(c)
            "Nos 2 WhatsApp"->c.optLong("outro_id")>0
            "Encerradas"->c.optString("encerrada_em").isNotBlank()
            else->true
        }
    }
    fun signature(a:NativeAuth,c:JSONObject?,config:JSONObject,text:String):String {
        if(text.isBlank()||config.optJSONObject("config")?.optBoolean("assinatura",true)==false)return text
        val name=config.optString("meuNome").ifBlank{a.name.trim().substringBefore(' ').let{if(it==it.uppercase())it.lowercase().replaceFirstChar(Char::uppercaseChar)else it}}
            .replace(Regex("[\\p{Cntrl}*_~`]")," ").trim().take(30)
        return if(name.isBlank())text else if(c?.optString("canal")=="instagram")"$name:\n$text"else "*$name:*\n$text"
    }
}
