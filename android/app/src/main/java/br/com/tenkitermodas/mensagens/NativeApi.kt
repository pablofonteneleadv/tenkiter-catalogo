package br.com.tenkitermodas.mensagens

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiFailure(val data:JSONObject,val code:Int):Exception(data.optString("erro","Não foi possível concluir agora.").take(250))
class AccessRevoked:Exception("Entre novamente para continuar.")
open class NativeApi {
    open fun call(path:String,a:NativeAuth,body:JSONObject?=null,method:String?=null):JSONObject {
        require(path.startsWith("/msg/"))
        val j=request(BuildConfig.WORKER_URL+path,body,mapOf("X-TK-Whats" to a.owner,"X-TK-Sessao" to a.session),false,method)
        return j
    }
    fun removeSubscription(a:NativeAuth,id:String)=call("/msg/mobile/subscription",a,JSONObject().put("subscription",id),"DELETE")
    open fun account(body:JSONObject)=request(BuildConfig.LOGIN_URL,body,emptyMap(),true)
    private fun request(address:String,body:JSONObject?,headers:Map<String,String>,google:Boolean,method:String?=null):JSONObject {
        var url=URL(address);var payload=body;var credentials=headers
        repeat(4){
            require(url.protocol=="https")
            val c=(url.openConnection() as HttpURLConnection).apply{
                connectTimeout=10000;readTimeout=15000;instanceFollowRedirects=false
                requestMethod=method?:if(payload==null)"GET" else "POST"
                setRequestProperty("Accept","application/json");credentials.forEach{(k,v)->setRequestProperty(k,v)}
            }
            try{
                if(payload!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(payload.toString().toByteArray(Charsets.UTF_8))}}
                val code=c.responseCode
                if(code in listOf(301,302,303,307,308)){
                    val next=URL(url,c.getHeaderField("Location")?:throw Exception("Resposta sem endereço."))
                    if(!google||next.protocol!="https"||next.host !in setOf("script.google.com","script.googleusercontent.com"))throw Exception("Redirecionamento recusado.")
                    url=next;payload=null;credentials=emptyMap()
                }else{
                    if(code==401||code==403)throw AccessRevoked()
                    val stream=if(code in 200..299)c.inputStream else c.errorStream
                    val bytes=stream?.let{AppUpdater.limited(it,4*1024*1024)}?:byteArrayOf()
                    if(bytes.size>4*1024*1024)throw Exception("Resposta grande demais.")
                    val j=runCatching{JSONObject(String(bytes,Charsets.UTF_8))}.getOrElse{throw Exception("Não foi possível ler a resposta do servidor.")}
                    if(j.optBoolean("sessaoInvalida")||j.optBoolean("inativa")||j.optBoolean("exigeLogin")||j.optBoolean("semPermissao"))throw AccessRevoked()
                    if(!j.optBoolean("ok"))throw ApiFailure(j,code)
                    return j
                }
            }finally{c.disconnect()}
        }
        throw Exception("Não foi possível acessar o servidor.")
    }
}
