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
    open fun catalog()=request(BuildConfig.LOGIN_URL+"?action=list",null,emptyMap(),true,acceptCatalog=true)
    open fun upload(a:NativeAuth,bytes:ByteArray,type:String):JSONObject {
        require(type in listOf("imagem","vídeo","áudio"));require(bytes.isNotEmpty()&&bytes.size<=if(type=="imagem")8*1048576 else 16*1048576)
        val c=(URL(BuildConfig.WORKER_URL+"/msg/anexo?tipo="+java.net.URLEncoder.encode(type,"UTF-8")).openConnection() as HttpURLConnection)
        try{
            c.connectTimeout=10000;c.readTimeout=65000;c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true
            c.setRequestProperty("X-TK-Whats",a.owner);c.setRequestProperty("X-TK-Sessao",a.session);c.setRequestProperty("Content-Type","application/octet-stream");c.setFixedLengthStreamingMode(bytes.size)
            c.outputStream.use{it.write(bytes)}
            if(c.responseCode in listOf(401,403))throw AccessRevoked()
            val body=(if(c.responseCode in 200..299)c.inputStream else c.errorStream)?:throw Exception("Sem resposta do envio.")
            val j=JSONObject(String(AppUpdater.limited(body,65536),Charsets.UTF_8))
            if(!j.optBoolean("ok"))throw ApiFailure(j,c.responseCode)
            return j
        }finally{c.disconnect()}
    }
    open fun media(a:NativeAuth,id:Long,context:Boolean=false,post:Long=0):Pair<ByteArray,String> {
        require(id>0||post>0)
        val c=(URL(BuildConfig.WORKER_URL+"/msg/midia?id=$id"+(if(post>0)"&post=$post"else"")+(if(context)"&ctx=1"else"")).openConnection() as HttpURLConnection)
        try{
            c.connectTimeout=10000;c.readTimeout=30000;c.instanceFollowRedirects=false
            c.setRequestProperty("X-TK-Whats",a.owner);c.setRequestProperty("X-TK-Sessao",a.session)
            if(c.responseCode in listOf(401,403))throw AccessRevoked()
            if(c.responseCode!=200)throw Exception("Não foi possível abrir esta mídia. Ela pode ter expirado.")
            val bytes=AppUpdater.limited(c.inputStream,32*1048576)
            return bytes to (c.contentType?:"application/octet-stream").substringBefore(';')
        }finally{c.disconnect()}
    }
    open fun publicPhoto(address:String):ByteArray? {
        return try{
            val url=URL(address)
            if(url.protocol!="https"||url.userInfo!=null||url.host !in setOf("lh3.googleusercontent.com","res.cloudinary.com","tenkiter-midia.distkrpconfeccoes.workers.dev","midia.tenkitermodas.com.br"))return null
            val c=url.openConnection() as HttpURLConnection
            try{c.connectTimeout=8000;c.readTimeout=10000;c.instanceFollowRedirects=false;if(c.responseCode!=200||!c.contentType.orEmpty().startsWith("image/"))null else AppUpdater.limited(c.inputStream,4*1048576)}finally{c.disconnect()}
        }catch(_:Exception){null}
    }
    data class Export(val bytes:ByteArray,val mime:String,val name:String,val total:Int,val cropped:Boolean)
    open fun export(a:NativeAuth,query:String):Export {
        require(query.length<1000&&!query.contains('#'))
        val c=URL(BuildConfig.WORKER_URL+"/msg/exportar?"+query).openConnection() as HttpURLConnection
        try{
            c.connectTimeout=10000;c.readTimeout=65000;c.instanceFollowRedirects=false
            c.setRequestProperty("X-TK-Whats",a.owner);c.setRequestProperty("X-TK-Sessao",a.session)
            if(c.responseCode in listOf(401,403))throw AccessRevoked()
            if(c.responseCode!=200)throw Exception("Não foi possível exportar agora. Confira o período e a conexão.")
            val bytes=AppUpdater.limited(c.inputStream,32*1048576)
            val name=c.getHeaderField("Content-Disposition")?.substringAfter("filename=","")?.substringBefore(';')?.trim()?.trim('"')?.replace(Regex("[^A-Za-z0-9._-]"),"_")?.take(120).orEmpty().ifBlank{"conversas.txt"}
            return Export(bytes,c.contentType?.substringBefore(';')?:"text/plain",name,c.getHeaderField("X-TK-Total")?.toIntOrNull()?:0,c.getHeaderField("X-TK-Cortado")=="1")
        }finally{c.disconnect()}
    }
    private fun request(address:String,body:JSONObject?,headers:Map<String,String>,google:Boolean,method:String?=null,acceptCatalog:Boolean=false):JSONObject {
        var url=URL(address);var payload=body;var credentials=headers
        repeat(4){
            require(url.protocol=="https")
            val c=(url.openConnection() as HttpURLConnection).apply{
                connectTimeout=10000;readTimeout=if(address.contains("/msg/enviar"))75000 else 15000;instanceFollowRedirects=false
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
                    if(!j.optBoolean("ok")&&!(acceptCatalog&&code in 200..299&&j.optJSONArray("produtos")!=null))throw ApiFailure(j,code)
                    return j
                }
            }finally{c.disconnect()}
        }
        throw Exception("Não foi possível acessar o servidor.")
    }
}
