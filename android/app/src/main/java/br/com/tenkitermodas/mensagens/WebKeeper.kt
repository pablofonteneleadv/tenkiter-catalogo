package br.com.tenkitermodas.mensagens
import android.content.Context
import android.content.MutableContextWrapper
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
/**
 * Mantém a tela Mensagens carregada enquanto o processo vive. Quando o Android acorda o app sem tela
 * (aviso que chegou, sincronização em segundo plano), a página já é aberta escondida; ao tocar no aviso
 * ou no ícone, ela aparece pronta, sem passar pelo carregamento inicial.
 */
object WebKeeper {
    const val HOME="https://tenkitermodas.com.br/admin.html?app=mensagens"
    var web:WebView?=null
    var context:MutableContextWrapper?=null
    @Volatile var attached=false
    private val handler=Handler(Looper.getMainLooper())
    private val pause=Runnable{if(!attached)web?.pauseTimers()}
    /** Ações pedidas pelo menu do site (Atualizar app, Permissões do app); a tela aberta no momento responde. */
    @Volatile var actions:((String)->Unit)?=null
    private val bridge=object{
        @JavascriptInterface fun atualizar(){handler.post{actions?.invoke("atualizar")}}
        @JavascriptInterface fun permissoes(){handler.post{actions?.invoke("permissoes")}}
        @JavascriptInterface fun versao()=BuildConfig.VERSION_NAME
    }
    fun configure(w:WebView){
        w.addJavascriptInterface(bridge,"TKAndroid")
        w.settings.apply{javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=true;javaScriptCanOpenWindowsAutomatically=false;setSupportMultipleWindows(true);mediaPlaybackRequiresUserGesture=true;mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;cacheMode=WebSettings.LOAD_DEFAULT
            if(!userAgentString.contains("TenkiterAndroid"))userAgentString+=" TenkiterAndroid/2.1"}
    }
    /** Abre a página escondida, uma vez por processo, só para quem já entrou no app. */
    fun preload(app:Context){
        handler.post{
            if(web!=null)return@post
            val auth=runCatching{NativeRepository.get(app).store.auth()}.getOrNull()?:return@post
            runCatching{
                val c=MutableContextWrapper(app.applicationContext);val w=WebView(c);configure(w)
                w.webViewClient=object:WebViewClient(){override fun onPageFinished(v:WebView,url:String){
                    val json=JSONObject().put("whatsapp",auth.owner).put("sessao",auth.session).toString()
                    v.evaluateJavascript("(function(){if(localStorage.getItem('tm_session'))return;localStorage.setItem('tm_session',${JSONObject.quote(json)});location.reload()})()",null)
                    handler.removeCallbacks(pause);handler.postDelayed(pause,45000)
                }}
                context=c;web=w;w.loadUrl(HOME)
            }
        }
    }
    /** A tela do app voltou: a página volta a atualizar sozinha. */
    fun attach(){attached=true;handler.removeCallbacks(pause);web?.resumeTimers()}
    /** O app saiu da tela: depois de um tempo a página para de consultar o servidor, mas continua carregada. */
    fun detach(){attached=false;handler.removeCallbacks(pause);handler.postDelayed(pause,120000)}
}
