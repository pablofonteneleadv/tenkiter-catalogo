package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Distribuição pública do instalador assinado. Nunca contém credenciais da loja. */
class AppUpdater(private val activity:Activity,private val scope:CoroutineScope){
    private val prefs=activity.getSharedPreferences("apk-update",0)
    private var busy=false
    private val manifestUrl="https://tenkitermodas.com.br/android/latest.json"
    data class Release(val code:Long,val name:String,val url:String,val sha:String,val size:Long,val notes:String){
        fun json()=JSONObject().put("versionCode",code).put("versionName",name).put("url",url).put("sha256",sha).put("bytes",size).put("notes",notes)
        companion object{
            fun parse(j:JSONObject):Release {
                val r=Release(j.getLong("versionCode"),j.getString("versionName"),j.getString("url"),j.getString("sha256").lowercase(),j.getLong("bytes"),j.optString("notes").take(1500))
                require(r.code>0&&r.name.length<=50&&r.sha.matches(Regex("[a-f0-9]{64}"))&&r.size in 1..52428800)
                val u=Uri.parse(r.url)
                require(u.scheme=="https"&&u.host=="github.com"&&u.path?.startsWith("/pablofonteneleadv/tenkiter-catalogo/releases/download/")==true&&u.userInfo==null)
                return r
            }
        }
    }
    fun check(){
        if(busy)return;busy=true;Toast.makeText(activity,"Procurando atualização…",Toast.LENGTH_SHORT).show()
        scope.launch {
            try{
                val release=withContext(Dispatchers.IO){
                    val c=(URL(manifestUrl).openConnection() as HttpURLConnection).apply{connectTimeout=10000;readTimeout=10000;instanceFollowRedirects=false;setRequestProperty("Cache-Control","no-cache")}
                    try{if(c.responseCode!=200)throw Exception("Não foi possível consultar a versão.");val bytes=limited(c.inputStream,32768);Release.parse(JSONObject(String(bytes,Charsets.UTF_8)))}finally{c.disconnect()}
                }
                if(release.code<=BuildConfig.VERSION_CODE){dialog("Aplicativo atualizado","Você está usando a versão ${BuildConfig.VERSION_NAME}.");return@launch}
                AlertDialog.Builder(activity).setTitle("Nova versão ${release.name}")
                    .setMessage(release.notes+"\n\nDownload: "+String.format(java.util.Locale("pt","BR"),"%.1f MB",release.size/1048576.0)+". O Android pedirá confirmação para instalar.")
                    .setPositiveButton("Baixar atualização"){_,_->download(release)}.setNegativeButton("Agora não",null).show()
            }catch(_:Exception){dialog("Atualização","Não foi possível conferir agora. Verifique a conexão e tente novamente.")}
            finally{busy=false}
        }
    }
    private fun dialog(title:String,text:String){if(activity.isFinishing||activity.isDestroyed)return;AlertDialog.Builder(activity).setTitle(title).setMessage(text).setPositiveButton("OK",null).show()}
    private fun download(r:Release){
        if(busy)return;busy=true
        val progress=android.app.ProgressDialog(activity).apply{setTitle("Baixando versão ${r.name}");setMessage("Aguarde. Conferiremos o arquivo antes de instalar.");setCancelable(false);show()}
        scope.launch{
            try{
                val file=withContext(Dispatchers.IO){
                    val dir=File(activity.cacheDir,"updates").apply{mkdirs()};val tmp=File(dir,"download.part");val final=File(dir,"version-${r.code}.apk")
                    try{
                        var url=URL(r.url);var response:HttpURLConnection?=null
                        for(i in 0..5){
                            val c=(url.openConnection() as HttpURLConnection).apply{connectTimeout=10000;readTimeout=30000;instanceFollowRedirects=false}
                            val code=c.responseCode
                            if(code in listOf(301,302,303,307,308)){
                                val next=URL(url,c.getHeaderField("Location")?:throw Exception("Sem endereço."));c.disconnect()
                                require(next.protocol=="https"&&next.host in setOf("github.com","release-assets.githubusercontent.com","objects.githubusercontent.com")&&next.userInfo==null)
                                url=next
                            }else{if(code!=200){c.disconnect();throw Exception("Download indisponível.")};response=c;break}
                        }
                        val c=response?:throw Exception("Redirecionamento excessivo.")
                        try{
                            var total=0L
                            c.inputStream.use{input->tmp.outputStream().use{output->val buf=ByteArray(32768);while(true){val n=input.read(buf);if(n<0)break;total+=n;require(total<=r.size&&total<=52428800);output.write(buf,0,n)}}}
                        }finally{c.disconnect()}
                        verify(tmp,r);if(final.exists())final.delete();check(tmp.renameTo(final));final
                    }catch(e:Exception){tmp.delete();throw e}
                }
                prefs.edit().putString("pending",r.json().toString()).apply()
                progress.dismiss()
                AlertDialog.Builder(activity).setTitle("Atualização pronta").setMessage("Versão ${r.name} conferida. Instale para concluir; suas conversas e configurações serão preservadas.")
                    .setPositiveButton("Instalar"){_,_->install(file,r)}.setNegativeButton("Depois",null).show()
            }catch(_:Exception){progress.dismiss();dialog("Atualização não instalada","Não foi possível baixar ou validar o instalador. O aplicativo atual foi preservado. Tente novamente.")}
            finally{busy=false}
        }
    }
    @Suppress("DEPRECATION")
    internal fun verify(file:File,r:Release){
        require(file.length()==r.size)
        val digest=MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val buf=ByteArray(32768);while(true){val n=input.read(buf);if(n<0)break;digest.update(buf,0,n)}}
        require(digest.digest().joinToString(""){"%02x".format(it)}==r.sha)
        val flags=if(Build.VERSION.SDK_INT>=28)PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val pm=activity.packageManager;val archive=pm.getPackageArchiveInfo(file.absolutePath,flags)?:throw Exception("APK inválido.")
        require(archive.packageName==activity.packageName)
        val version=if(Build.VERSION.SDK_INT>=28)archive.longVersionCode else archive.versionCode.toLong()
        require(version==r.code&&version>BuildConfig.VERSION_CODE)
        val own=pm.getPackageInfo(activity.packageName,flags)
        val ownSign=if(Build.VERSION.SDK_INT>=28)own.signingInfo?.apkContentsSigners else own.signatures
        val apkSign=if(Build.VERSION.SDK_INT>=28)archive.signingInfo?.apkContentsSigners else archive.signatures
        require(!ownSign.isNullOrEmpty()&&!apkSign.isNullOrEmpty()&&ownSign.size==apkSign.size&&ownSign.all{s->apkSign.any{it==s}})
    }
    private fun install(file:File,r:Release){
        if(!activity.packageManager.canRequestPackageInstalls()){
            prefs.edit().putBoolean("installAfterPermission",true).apply()
            AlertDialog.Builder(activity).setTitle("Permitir esta atualização").setMessage("Na próxima tela, permita que TENKiTER Mensagens instale aplicativos. Depois volte para concluir a instalação.")
                .setPositiveButton("Abrir permissão"){_,_->activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.packageName)))}.setNegativeButton("Cancelar"){_,_->prefs.edit().remove("installAfterPermission").apply()}.show();return
        }
        scope.launch{
            try{
                withContext(Dispatchers.IO){verify(file,r)}
                prefs.edit().remove("installAfterPermission").apply()
                val uri=FileProvider.getUriForFile(activity,activity.packageName+".updates",file)
                @Suppress("DEPRECATION")
                val intent=Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                activity.startActivity(intent)
            }catch(_:Exception){dialog("Instalação","Não foi possível abrir o instalador. Toque em Atualizar app para tentar novamente.")}
        }
    }
    fun onResume(){
        if(prefs.getBoolean("installAfterPermission",false)&&activity.packageManager.canRequestPackageInstalls()){
            prefs.edit().remove("installAfterPermission").apply()
            runCatching{val r=Release.parse(JSONObject(prefs.getString("pending",null)?:return));install(File(activity.cacheDir,"updates/version-${r.code}.apk"),r)}
        }
    }
    companion object{
        internal fun limited(input:java.io.InputStream,limit:Int):ByteArray=input.use{val out=java.io.ByteArrayOutputStream();val buf=ByteArray(8192);while(true){val n=it.read(buf);if(n<0)break;if(out.size()+n>limit)throw Exception("Resposta grande demais.");out.write(buf,0,n)};out.toByteArray()}
    }
}
