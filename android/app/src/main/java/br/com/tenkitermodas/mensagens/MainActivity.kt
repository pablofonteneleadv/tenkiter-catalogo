package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.webkit.*
import android.widget.*
import com.onesignal.OneSignal
import com.onesignal.notifications.INotificationClickEvent
import com.onesignal.notifications.INotificationClickListener
import kotlinx.coroutines.*
import org.json.JSONObject

class MainActivity: Activity() {
    private lateinit var web: WebView
    private lateinit var notice: TextView
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val handler = Handler(Looper.getMainLooper())
    private var chooser: ValueCallback<Array<Uri>>? = null
    private var audioRequest: PermissionRequest? = null
    private var pendingConversation = 0
    private val home = "https://tenkitermodas.com.br/admin.html?app=mensagens"
    private val clicks = object: INotificationClickListener {
        override fun onClick(event: INotificationClickEvent) { runOnUiThread { pendingConversation=event.notification.additionalData?.optInt("conversa",0) ?: 0;sendSubscription() } }
    }
    private val sync = object: Runnable {
        override fun run() { sendSubscription(); handler.postDelayed(this, 15000) }
    }
    private fun trusted(url: String?) = try { val u=Uri.parse(url); u.scheme=="https" && u.host=="tenkitermodas.com.br" } catch (_: Exception) { false }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setBackgroundColor(Color.WHITE) }
        // Keep system bars and keyboard outside the WebView on Android 15 edge-to-edge.
        layout.setOnApplyWindowInsetsListener { v, ins -> v.setPadding(ins.systemWindowInsetLeft,ins.systemWindowInsetTop,ins.systemWindowInsetRight,ins.systemWindowInsetBottom); ins.consumeSystemWindowInsets() }
        val bar=LinearLayout(this).apply { gravity=android.view.Gravity.CENTER_VERTICAL; setBackgroundColor(Color.rgb(16,16,14)) }
        val title=TextView(this).apply { text="TENKiTER"; setTextColor(Color.rgb(230,126,34)); textSize=16f; setPadding(12,0,4,0) }
        bar.addView(title,LinearLayout.LayoutParams(0,dp(48),1f))
        fun button(label:String, action:()->Unit) { val b=Button(this).apply { text=label; textSize=12f; isAllCaps=false; minWidth=dp(48); minimumHeight=dp(48); setOnClickListener { action() } };bar.addView(b) }
        button("Site ↗") { external("https://tenkitermodas.com.br/") }
        button("Avisos") { notificationSettings() }
        button("Sair") { OneSignal.User.pushSubscription.optOut();if(trusted(web.url)) web.evaluateJavascript("window.TKMobileLogout && window.TKMobileLogout()",null) }
        layout.addView(bar)
        notice=TextView(this).apply { visibility=View.GONE; textSize=14f;setPadding(dp(12),dp(8),dp(12),dp(8));setTextColor(Color.rgb(130,40,25));setBackgroundColor(Color.rgb(255,241,230)) }
        layout.addView(notice)
        web=WebView(this)
        web.settings.apply { javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=true;javaScriptCanOpenWindowsAutomatically=false;setSupportMultipleWindows(true);mediaPlaybackRequiresUserGesture=true;mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;userAgentString += " TenkiterAndroid/1.0" }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
        web.webViewClient=object:WebViewClient() {
            override fun shouldOverrideUrlLoading(v:WebView,r:WebResourceRequest):Boolean { if(!r.isForMainFrame)return false;val url=r.url.toString();if(trusted(url)&&r.url.path=="/admin.html")return false;if(r.hasGesture())external(url);return true }
            override fun onPageFinished(v:WebView,url:String) { if(trusted(url)){notice.visibility=View.GONE;sendSubscription()} }
            override fun onReceivedError(v:WebView,r:WebResourceRequest,e:WebResourceError) { if(r.isForMainFrame){notice.text="Sem conexão. Toque aqui para tentar novamente.";notice.visibility=View.VISIBLE;notice.setOnClickListener { web.loadUrl(home) }} }
        }
        web.webChromeClient=object:WebChromeClient() {
            override fun onShowFileChooser(v:WebView,callback:ValueCallback<Array<Uri>>,params:FileChooserParams):Boolean { chooser?.onReceiveValue(null);chooser=callback;return try { startActivityForResult(params.createIntent().apply { addCategory(Intent.CATEGORY_OPENABLE) },100);true } catch (_:Exception){chooser?.onReceiveValue(null);chooser=null;false} }
            override fun onPermissionRequest(r:PermissionRequest) { runOnUiThread { if(!trusted(r.origin.toString()) || !r.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)){r.deny();return@runOnUiThread};if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)r.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else {audioRequest=r;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),101)} } }
            override fun onCreateWindow(v:WebView,dialog:Boolean,gesture:Boolean,msg:android.os.Message):Boolean { if(!gesture)return false;val child=WebView(this@MainActivity);child.webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(w:WebView,r:WebResourceRequest):Boolean{external(r.url.toString());w.destroy();return true}};(msg.obj as WebView.WebViewTransport).webView=child;msg.sendToTarget();return true }
        }
        layout.addView(web,LinearLayout.LayoutParams(-1,0,1f));setContentView(layout)
        OneSignal.Notifications.addClickListener(clicks)
        web.loadUrl(home)
    }
    private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    private fun external(url:String) { val u=Uri.parse(url);if(u.scheme !in listOf("https","http","tel","mailto"))return;try{startActivity(Intent(Intent.ACTION_VIEW,u))}catch(_:Exception){Toast.makeText(this,"Não há aplicativo para abrir esse link.",Toast.LENGTH_SHORT).show()} }
    private fun sendSubscription() { if(!::web.isInitialized||!trusted(web.url))return;val id=OneSignal.User.pushSubscription.id;val allowed=OneSignal.Notifications.permission && OneSignal.User.pushSubscription.optedIn;web.evaluateJavascript("window.TKMobileSubscription && window.TKMobileSubscription(${JSONObject.quote(id)},$allowed)",null);if(pendingConversation>0){web.evaluateJavascript("window.TKMobileOpenConversation && window.TKMobileOpenConversation($pendingConversation)",null);pendingConversation=0} }
    private fun notificationSettings() { AlertDialog.Builder(this).setTitle("Avisos de novas mensagens").setMessage("Ative os avisos e entre na sua conta. A entrega com o app fechado também depende da configuração Android no servidor. Se você forçar a parada do app nas configurações do Android, abra-o novamente para voltar a receber.").setPositiveButton("Ativar") { _,_->scope.launch { OneSignal.Notifications.requestPermission(true);OneSignal.User.pushSubscription.optIn();sendSubscription() } }.setNeutralButton("Configurações") { _,_->startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName)) }.setNegativeButton("Voltar",null).show() }
    @Deprecated("Android legacy back API") override fun onBackPressed() { if(trusted(web.url))web.evaluateJavascript("window.TKMobileBack ? window.TKMobileBack() : false"){result->if(result!="true")moveTaskToBack(true)} else super.onBackPressed() }
    override fun onResume(){super.onResume();handler.post(sync)}
    override fun onPause(){handler.removeCallbacks(sync);super.onPause()}
    override fun onDestroy(){handler.removeCallbacks(sync);OneSignal.Notifications.removeClickListener(clicks);scope.cancel();chooser?.onReceiveValue(null);audioRequest?.deny();web.destroy();super.onDestroy()}
    @Deprecated("Activity result API") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode==100){chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));chooser=null}}
    override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray){super.onRequestPermissionsResult(code,permissions,results);if(code==101){val r=audioRequest;audioRequest=null;if(results.firstOrNull()==PackageManager.PERMISSION_GRANTED)r?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))else r?.deny()}}
}
