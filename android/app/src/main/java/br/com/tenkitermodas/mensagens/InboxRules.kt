package br.com.tenkitermodas.mensagens

import org.json.JSONObject
import java.time.Instant

/** Contadores medem pessoas; não lidas são subconjunto das que faltam responder. */
object InboxRules {
    fun group(c:JSONObject)=c.optInt("grupo")==1
    fun waiting(c:JSONObject)=c.optString("encerrada_em").isBlank()&&(if(c.has("aguarda_resposta"))c.optBoolean("aguarda_resposta",c.optInt("aguarda_resposta")==1)else c.optInt("nao_lidas")>0||c.optString("ult_dir")=="entrada")
    fun clean(c:JSONObject,key:String)=if(c.isNull(key))""else c.optString(key).takeUnless{it=="null"}.orEmpty()
    fun person(c:JSONObject)=if(group(c))"group:${c.optLong("id")}"else clean(c,"pessoa").ifBlank{if(c.optString("canal").startsWith("whatsapp"))c.optString("contato").filter(Char::isDigit).let{if(it.length==13&&it.startsWith("55")&&it[4]=='9')it.removeRange(4,5)else it}else"conversation:${c.optLong("id")}"}
    fun people(rows:List<JSONObject>)=rows.distinctBy(::person).size
    fun blocks(rows:List<JSONObject>):List<List<JSONObject>> = rows.groupBy(::person).values.map{it.sortedWith(compareByDescending<JSONObject>{it.optString("ultima_em")}.thenByDescending{it.optLong("id")})}.sortedWith(compareByDescending<List<JSONObject>>{it.first().optString("ultima_em")}.thenByDescending{it.first().optLong("id")})
    fun channel(c:JSONObject)=when(c.optString("canal")){"whatsapp1"->"WhatsApp 1";"whatsapp2"->"WhatsApp 2";else->"Instagram"}
    fun waitLabel(c:JSONObject):String {
        if(!waiting(c))return ""
        val stamp=runCatching{Instant.parse(c.optString("ult_entrada_em")).toEpochMilli()}.getOrNull()?:return "Falta responder"
        val mins=((System.currentTimeMillis()-stamp)/60000).coerceAtLeast(0)
        return "Falta responder · "+when{mins<1->"agora";mins<60->"há $mins min";mins<1440->"há ${mins/60} h";else->"há ${mins/1440} d"}
    }
    fun contact(c:JSONObject):String {
        val raw=c.optString("contato");if(c.optString("canal")=="instagram")return clean(c,"usuario").ifBlank{"Perfil do Instagram"};if(group(c))return "Grupo"
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
            "Não lidas"->c.optInt("nao_lidas")>0&&c.optString("encerrada_em").isBlank()
            "Falta responder"->waiting(c)
            "Nos 2 WhatsApp"->c.optLong("outro_id")>0
            "Encerradas"->c.optString("encerrada_em").isNotBlank()
            else->true
        }
    }
    fun relationshipLabel(c:JSONObject):String {val r=c.optJSONObject("relacionamento");return if(r!=null&&r.has("pontos"))"Hist. ${r.optInt("pontos")}"else"Histórico"}
    fun closureLabel(reason:String)=when(reason){"vendeu"->"Vendeu no atendimento";"concluido"->"Concluído";"sem_resposta"->"Cliente parou de responder";"engano"->"Engano ou spam";else->"Encerramento registrado"}
    fun signature(a:NativeAuth,c:JSONObject?,config:JSONObject,text:String):String {
        if(text.isBlank()||config.optJSONObject("config")?.optBoolean("assinatura",true)==false)return text
        val name=config.optString("meuNome").ifBlank{a.name.trim().substringBefore(' ').let{if(it==it.uppercase())it.lowercase().replaceFirstChar(Char::uppercaseChar)else it}}
            .replace(Regex("[\\p{Cntrl}*_~`]")," ").trim().take(30)
        return if(name.isBlank())text else if(c?.optString("canal")=="instagram")"$name:\n$text"else "*$name:*\n$text"
    }
}
