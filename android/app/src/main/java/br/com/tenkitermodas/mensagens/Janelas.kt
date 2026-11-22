package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.ViewGroup
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * App único com janelas separadas (2.5.0). Cada área do site tem ícone próprio e abre na sua própria janela do Android
 * (tarefa separada nos "recentes"), todas ao mesmo tempo, com o mesmo login: as janelas compartilham o armazenamento
 * do site neste aparelho. Mensagens continua sendo a MainActivity.
 */
enum class Modulo(val id: String, val rotulo: String, val caminho: String) {
    MENSAGENS("mensagens", "Mensagens", "/admin.html?app=mensagens"),
    GESTAO("gestao", "Gestão", "/admin.html"),
    ESTEIRA("esteira", "Esteira", "/esteira.html"),
    PRINCIPAL("principal", "Principal", "/index.html"),
    POSTAGENS("postagens", "Postagens", "/admin.html?abrir=postagens"),
    RH("rh", "RH", "/treinamentos.html?painel=rh"),
    CURRICULOS("curriculos", "Currículos", "/curriculos.html");

    val url: String get() = SITE + caminho
    val classe: Class<out Activity>
        get() = when (this) {
            MENSAGENS -> MainActivity::class.java
            GESTAO -> JanelaGestao::class.java
            ESTEIRA -> JanelaEsteira::class.java
            PRINCIPAL -> JanelaPrincipal::class.java
            POSTAGENS -> JanelaPostagens::class.java
            RH -> JanelaRh::class.java
            CURRICULOS -> JanelaCurriculos::class.java
        }

    companion object {
        const val SITE = "https://tenkitermodas.com.br"
        const val EXTRA_URL = "br.com.tenkitermodas.mensagens.URL"

        /** Só https do próprio site. */
        fun doSite(endereco: String?): Boolean = runCatching {
            val u = java.net.URI(endereco ?: return false)
            u.scheme == "https" && u.host == "tenkitermodas.com.br"
        }.getOrDefault(false)

        private fun parametro(query: String?, nome: String): String? =
            query?.split('&')?.map { it.split('=', limit = 2) }?.firstOrNull { it[0] == nome }?.getOrNull(1)

        /** Em qual janela este endereço abre. null = página auxiliar: abre na própria janela em que a pessoa está. */
        fun paraUrl(endereco: String?): Modulo? {
            if (!doSite(endereco)) return null
            val u = runCatching { java.net.URI(endereco) }.getOrNull() ?: return null
            val p = u.rawPath ?: ""
            return when (p) {
                "/admin.html" -> when {
                    parametro(u.rawQuery, "app") == "mensagens" -> MENSAGENS
                    parametro(u.rawQuery, "abrir") == "postagens" -> POSTAGENS
                    else -> GESTAO
                }
                "/esteira.html" -> ESTEIRA
                "", "/", "/index.html" -> PRINCIPAL
                "/treinamentos.html" -> RH
                "/curriculos.html" -> CURRICULOS
                else -> null
            }
        }

        /** Endereço com mais do que a tela inicial da área (ex.: admin.html?caixaFotos=12) precisa ser carregado na janela. */
        fun pedeCarga(m: Modulo, endereco: String?): Boolean {
            if (endereco.isNullOrBlank() || !doSite(endereco)) return false
            val semFim = endereco.trimEnd('/', '#')
            return semFim != m.url && semFim != SITE + "/" + m.caminho.trimStart('/') && !(m == PRINCIPAL && (semFim == SITE || semFim == "$SITE/"))
        }

        /** Abre a janela da área (ou traz para a frente, como estava). */
        fun abrir(c: Context, m: Modulo, endereco: String? = null) {
            val i = Intent(c, m.classe).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (m != MENSAGENS && pedeCarga(m, endereco)) i.putExtra(EXTRA_URL, endereco)
            runCatching { c.startActivity(i) }
        }
    }
}

/** Sai da conta no app inteiro: Mensagens (sessão nativa e avisos). As janelas do site percebem sozinhas (conta.js). */
object ContaApp {
    fun sair(c: Context) {
        val repo = NativeRepository.get(c.applicationContext)
        val a = repo.store.auth() ?: return
        val inscricao = runCatching { com.onesignal.OneSignal.User.pushSubscription.id }.getOrDefault("")
        repo.logout()
        if (inscricao.isNotBlank()) CoroutineScope(Dispatchers.IO).launch { runCatching { NativeApi().removeSubscription(a, inscricao) } }
    }
}

/** Quantas janelas do site estão na frente agora (a tela das Mensagens não pausa o site enquanto houver alguma). */
object JanelasVisiveis {
    @Volatile var quantas = 0
}

/**
 * "Arrastar a tela para baixo atualiza", como no Chrome: só quando a página está no topo, sem lista ou janela própria
 * rolada embaixo do dedo, sem janela aberta (fundo travado) e sem gravação em andamento (TKOcupado).
 */
const val SCRIPT_PUXAR = """(function(){if(window.__tkPuxar)return;window.__tkPuxar=1;
function rolado(el){for(;el&&el.nodeType===1&&el!==document.body&&el!==document.documentElement;el=el.parentElement){if(el.scrollTop>0){var o=getComputedStyle(el).overflowY;if(o==='auto'||o==='scroll'||o==='overlay')return true}}return false}
function pode(t){try{var h=document.documentElement;if(h.classList.contains('tk-travado'))return false;if(getComputedStyle(h).overscrollBehaviorY==='contain')return false;if(document.body&&getComputedStyle(document.body).overscrollBehaviorY==='contain')return false;if(window!==window.top){var se=document.scrollingElement||h;if(se.scrollTop>0)return false}return !rolado(t)}catch(e){return true}}
addEventListener('touchstart',function(e){try{window.TKAndroid&&TKAndroid.podeAtualizar&&TKAndroid.podeAtualizar(pode(e.target))}catch(_){}},{capture:true,passive:true});})();"""

open class JanelaActivity(private val modulo: Modulo) : Activity() {
    private lateinit var web: WebView
    private lateinit var puxar: SwipeRefreshLayout
    @Volatile private var podePuxar = true
    private var chooser: ValueCallback<Array<Uri>>? = null
    private var pedidoMidia: PermissionRequest? = null
    private val handler = Handler(Looper.getMainLooper())
    private val pararGiro = Runnable { if (::puxar.isInitialized) puxar.isRefreshing = false }

    private inner class Ponte {
        @JavascriptInterface fun abrirModulo(endereco: String?): Boolean {
            val m = Modulo.paraUrl(endereco) ?: return false
            handler.post { if (m == modulo) web.loadUrl(endereco!!) else Modulo.abrir(this@JanelaActivity, m, endereco) }
            return true
        }
        @JavascriptInterface fun sairConta() { handler.post { if (Modulo.doSite(web.url)) ContaApp.sair(this@JanelaActivity) } }
        @JavascriptInterface fun podeAtualizar(v: Boolean) { podePuxar = v }
        @JavascriptInterface fun versao(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun atualizar() { handler.post { runCatching { startActivity(Intent(this@JanelaActivity, MainActivity::class.java).setAction(MainActivity.ACAO_ATUALIZAR).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } } }
    }

    @Suppress("DEPRECATION")
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        runCatching { setTaskDescription(ActivityManager.TaskDescription(modulo.rotulo)) }
        val raiz = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(raiz) { v, i ->
            val barras = i.getInsets(WindowInsetsCompat.Type.systemBars()); val teclado = i.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(barras.left, barras.top, barras.right, maxOf(barras.bottom, teclado.bottom)); i
        }
        web = WebView(this)
        configurar(web)
        puxar = SwipeRefreshLayout(this).apply {
            addView(web, ViewGroup.LayoutParams(-1, -1))
            setColorSchemeColors(Color.parseColor("#E67E22"))
            setOnChildScrollUpCallback { _, _ -> web.scrollY > 0 || !podePuxar }
            setOnRefreshListener { recarregar() }
        }
        raiz.addView(puxar, FrameLayout.LayoutParams(-1, -1))
        setContentView(raiz)
        if (state == null || web.restoreState(state) == null) web.loadUrl(enderecoDe(intent) ?: modulo.url)
    }

    private fun enderecoDe(i: Intent?): String? = i?.getStringExtra(Modulo.EXTRA_URL)?.takeIf { Modulo.doSite(it) && Modulo.paraUrl(it) == modulo }

    override fun onNewIntent(i: Intent) {
        super.onNewIntent(i); setIntent(i)
        enderecoDe(i)?.let { web.loadUrl(it) }   // sem endereço: só volta para a frente, do jeito que estava
    }

    private fun configurar(w: WebView) {
        w.addJavascriptInterface(Ponte(), "TKAndroid")
        w.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true; allowFileAccess = false; allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = false; setSupportMultipleWindows(true); mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW; cacheMode = WebSettings.LOAD_DEFAULT
            if (!userAgentString.contains("TenkiterAndroid")) userAgentString += " TenkiterAndroid/2.5"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, false)
        // O arrastar também funciona dentro das telas abertas por cima (iframes do site).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            runCatching { WebViewCompat.addDocumentStartJavaScript(w, SCRIPT_PUXAR, setOf(Modulo.SITE)) }
        w.setDownloadListener { url, _, _, _, _ -> if (url.startsWith("https://") || url.startsWith("http://")) externo(url) }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                if (!r.isForMainFrame) return false
                val u = r.url.toString()
                if (Modulo.doSite(u)) {
                    val m = Modulo.paraUrl(u)
                    if (m == null || m == modulo) return false
                    Modulo.abrir(this@JanelaActivity, m, u); return true
                }
                if (r.hasGesture()) externo(u)
                return true
            }
            override fun onPageStarted(v: WebView, url: String, icon: android.graphics.Bitmap?) { chooser?.onReceiveValue(null); chooser = null; podePuxar = true }
            override fun onPageFinished(v: WebView, url: String) {
                handler.removeCallbacks(pararGiro); puxar.isRefreshing = false
                if (Modulo.doSite(url)) v.evaluateJavascript(SCRIPT_PUXAR, null)
            }
            override fun onReceivedError(v: WebView, r: WebResourceRequest, e: WebResourceError) {
                if (r.isForMainFrame) { puxar.isRefreshing = false; Toast.makeText(this@JanelaActivity, "Sem conexão. Verifique a internet e arraste a tela para baixo para tentar de novo.", Toast.LENGTH_LONG).show() }
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                if (!Modulo.doSite(v.url)) { cb.onReceiveValue(null); return true }
                chooser?.onReceiveValue(null); chooser = cb
                val cancelar = { if (chooser === cb) { cb.onReceiveValue(null); chooser = null }; Unit }
                if (VisualMediaPicker.visual(p.acceptTypes) || p.acceptTypes.isEmpty() || p.acceptTypes.all { it.isBlank() || it == "*/*" }) { VisualMediaPicker.open(this@JanelaActivity, p, 100, cancelar); return true }
                return try { startActivityForResult(p.createIntent().apply { addCategory(Intent.CATEGORY_OPENABLE) }, 100); true } catch (_: Exception) { cancelar(); false }
            }
            override fun onPermissionRequest(r: PermissionRequest) {
                runOnUiThread {
                    if (!Modulo.doSite(r.origin.toString().trimEnd('/'))) { r.deny(); return@runOnUiThread }
                    val faltam = mutableListOf<String>()
                    if (r.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) faltam += Manifest.permission.CAMERA
                    if (r.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) faltam += Manifest.permission.RECORD_AUDIO
                    val pedidos = r.resources.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }.toTypedArray()
                    if (pedidos.isEmpty()) { r.deny(); return@runOnUiThread }
                    if (faltam.isEmpty()) r.grant(pedidos) else { pedidoMidia?.deny(); pedidoMidia = r; requestPermissions(faltam.toTypedArray(), 301) }
                }
            }
            // Link que abre "em outra aba" (ex.: Esteira → Abrir o cadastro): vai para a janela certa e esta continua como está.
            override fun onCreateWindow(v: WebView, dialog: Boolean, gesture: Boolean, msg: Message): Boolean {
                if (!gesture) return false
                val filho = WebView(this@JanelaActivity)
                filho.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(f: WebView, r: WebResourceRequest): Boolean {
                        val u = r.url.toString()
                        if (Modulo.doSite(u)) { val m = Modulo.paraUrl(u); if (m == null || m == modulo) web.loadUrl(u) else Modulo.abrir(this@JanelaActivity, m, u) } else externo(u)
                        f.destroy(); return true
                    }
                }
                (msg.obj as WebView.WebViewTransport).webView = filho; msg.sendToTarget(); return true
            }
            override fun onCloseWindow(w: WebView) { moveTaskToBack(true) }
        }
    }

    private fun recarregar() {
        web.evaluateJavascript("(function(){try{return !!(window.TKOcupado&&TKOcupado.pendentes()>0)}catch(e){return false}})()") { r ->
            if (r == "true") { puxar.isRefreshing = false; Toast.makeText(this, "Ainda estou salvando. Espere terminar para atualizar.", Toast.LENGTH_LONG).show() }
            else { web.reload(); handler.removeCallbacks(pararGiro); handler.postDelayed(pararGiro, 15000) }
        }
    }

    private fun externo(endereco: String) {
        val u = Uri.parse(endereco); if (u.scheme !in listOf("https", "http", "tel", "mailto", "whatsapp", "intent")) return
        runCatching { startActivity(if (u.scheme == "intent") Intent.parseUri(endereco, Intent.URI_INTENT_SCHEME).addCategory(Intent.CATEGORY_BROWSABLE).setComponent(null).setSelector(null) else Intent(Intent.ACTION_VIEW, u)) }
    }

    override fun onResume() {
        super.onResume(); JanelasVisiveis.quantas++
        web.onResume(); web.resumeTimers()   // o tempo das páginas é do app inteiro: volta a correr
    }
    override fun onPause() { JanelasVisiveis.quantas = maxOf(0, JanelasVisiveis.quantas - 1); web.onPause(); super.onPause() }
    override fun onSaveInstanceState(out: Bundle) { web.saveState(out); super.onSaveInstanceState(out) }
    override fun onDestroy() { chooser?.onReceiveValue(null); pedidoMidia?.deny(); (web.parent as? ViewGroup)?.removeView(web); web.destroy(); super.onDestroy() }

    @Deprecated("Legacy back API")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }

    @Deprecated("Activity result API")
    override fun onActivityResult(code: Int, result: Int, data: Intent?) {
        super.onActivityResult(code, result, data)
        if (code != 100) return
        val arquivos = if (result == RESULT_OK && data != null) {
            val escolhidos = linkedSetOf<Uri>()
            data.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let { escolhidos.add(it) } }
            data.data?.let { escolhidos.add(it) }
            if (escolhidos.isNotEmpty()) escolhidos.toTypedArray() else WebChromeClient.FileChooserParams.parseResult(result, data)
        } else null
        chooser?.onReceiveValue(arquivos); chooser = null
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<out String>, r: IntArray) {
        super.onRequestPermissionsResult(code, p, r)
        if (code != 301) return
        val pedido = pedidoMidia; pedidoMidia = null
        if (r.isNotEmpty() && r.all { it == PackageManager.PERMISSION_GRANTED }) pedido?.grant(pedido.resources.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }.toTypedArray()) else pedido?.deny()
    }
}

class JanelaGestao : JanelaActivity(Modulo.GESTAO)
class JanelaEsteira : JanelaActivity(Modulo.ESTEIRA)
class JanelaPrincipal : JanelaActivity(Modulo.PRINCIPAL)
class JanelaPostagens : JanelaActivity(Modulo.POSTAGENS)
class JanelaRh : JanelaActivity(Modulo.RH)
class JanelaCurriculos : JanelaActivity(Modulo.CURRICULOS)
