package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.widget.Toast
import kotlinx.coroutines.*
import org.json.JSONTokener
import org.json.JSONObject
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Documento escolhido pelo usuário, sessão atual da página; nenhum acesso amplo ao armazenamento. */
class ReceivedFiles(private val activity:Activity,private val scope:CoroutineScope,private val web:()->WebView?) {
    data class Pending(val id:Long,val name:String,val auth:NativeAuth)
    private var pending:Pending?=null
    private var choosing=false
    companion object {
        const val REQUEST=202
        fun fileName(raw:String):String = raw.substringBefore('\n').replace(Regex("[\\p{Cntrl}/\\\\]"),"_").take(180).trim().ifBlank{"arquivo"}
        fun trusted(address:String?):Boolean = runCatching{val u=Uri.parse(address);u.scheme=="https"&&u.host=="tenkitermodas.com.br"&&u.path=="/admin.html"}.getOrDefault(false)
        fun transfer(auth:NativeAuth,id:Long,out:OutputStream) {
            require(id>0)
            val c=URL(BuildConfig.WORKER_URL+"/msg/midia?id=$id&baixar=1").openConnection() as HttpURLConnection
            try {
                c.connectTimeout=10000;c.readTimeout=45000;c.instanceFollowRedirects=false
                c.setRequestProperty("X-TK-Whats",auth.owner);c.setRequestProperty("X-TK-Sessao",auth.session)
                if(c.responseCode in listOf(401,403))throw Exception("Seu acesso não permite baixar este arquivo. Entre novamente se necessário.")
                if(c.responseCode!=200)throw Exception("Arquivo indisponível. A mídia pode ter expirado.")
                c.inputStream.use{it.copyTo(out,16384)}
            } finally { c.disconnect() }
        }
    }
    private fun message(text:String)=Toast.makeText(activity,text,Toast.LENGTH_LONG).show()
    private fun session(done:(NativeAuth?)->Unit) {
        val w=web();if(w==null||!trusted(w.url)){done(null);return}
        w.evaluateJavascript("JSON.stringify(typeof getSessao==='function'?getSessao():null)"){value->
            val auth=runCatching{
                val raw=JSONTokener(value).nextValue() as? String?:return@runCatching null
                val j=JSONObject(raw);val owner=j.getString("whatsapp");val token=j.getString("sessao")
                if(!token.matches(Regex("tk[123]\\..+")))null else NativeAuth(owner,token,"")
            }.getOrNull()
            done(auth)
        }
    }
    fun choose(id:Long,name:String) {
        if(id<=0||pending!=null||choosing)return
        choosing=true
        session{a->choosing=false;if(a==null){message("Entre na sua conta para baixar.");return@session}
            pending=Pending(id,fileName(name),a)
            try { activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type="application/octet-stream";putExtra(Intent.EXTRA_TITLE,fileName(name))},REQUEST) }
            catch(_:Exception){pending=null;message("Não foi possível abrir o local para salvar.")}
        }
    }
    fun result(result:Int,uri:Uri?) {
        val p=pending?:return;pending=null
        if(result!=Activity.RESULT_OK||uri==null)return
        session{current->
            scope.launch{
                var temporario:java.io.File?=null
                try{
                    val temp=java.io.File.createTempFile("arquivo-recebido-",".part",activity.cacheDir);temporario=temp
                    if(current==null||current.owner!=p.auth.owner||current.session!=p.auth.session)throw Exception("A conta mudou. Baixe novamente pela conta atual.")
                    message("Baixando arquivo…")
                    withContext(Dispatchers.IO){temp.outputStream().use{transfer(current,p.id,it)}}
                    val atual=suspendCancellableCoroutine<NativeAuth?>{c->session{if(c.isActive)c.resumeWith(Result.success(it))}}
                    if(atual==null||atual.owner!=p.auth.owner||atual.session!=p.auth.session)throw Exception("A conta mudou. Baixe novamente pela conta atual.")
                    withContext(Dispatchers.IO){activity.contentResolver.openOutputStream(uri,"w")?.use{out->temp.inputStream().use{it.copyTo(out,16384)}}?:throw Exception("Não foi possível salvar neste local.")}
                    message("Arquivo salvo.")
                }catch(e:Exception){if(e is CancellationException)throw e;message(when(e){is java.io.IOException->"Não foi possível baixar ou salvar. Confira a conexão e o espaço disponível.";is SecurityException->"Não foi possível salvar neste local. Escolha outro destino.";else->e.message?:"Não foi possível baixar o arquivo."})}finally{temporario?.delete()}
            }
        }
    }
}
