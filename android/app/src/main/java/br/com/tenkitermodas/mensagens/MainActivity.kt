package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.onesignal.OneSignal
import com.onesignal.notifications.INotificationClickEvent
import com.onesignal.notifications.INotificationClickListener
import kotlinx.coroutines.*
import org.json.JSONObject

class MainActivity:Activity(),InboxView.Events {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
    private lateinit var repo:NativeRepository
    private lateinit var inbox:InboxView
    private lateinit var updater:AppUpdater
    private lateinit var tools:NativeTools
    private lateinit var administration:NativeAdministration
    @Volatile private var peeking=false;@Volatile private var openGeneration=0;@Volatile private var activityVisible=false;@Volatile private var nativeVisible=true;private var pendingPeek=true;private var queryJob:Job?=null
    private lateinit var root:FrameLayout
    private var web:WebView?=null
    private var webPanel:LinearLayout?=null
    private val receivedFiles by lazy { ReceivedFiles(this,scope,{web}) }
    private var chooser:ValueCallback<Array<Uri>>?=null
    private var audioRequest:PermissionRequest?=null
    private var history=emptyList<JSONObject>();private var historyConversation=0L;private var historyBusy=false
    private var contextChecked=0L;private var namesChecked=false
    private var conversation=0L;private var online=false;private var syncing=false;private var sending=false
    private var displayOwner="";private var webTarget=0L;private var seededSession="";private var refreshSeq=0;private var pendingClick=0L
    private val handler=Handler(Looper.getMainLooper())
    private val home=WebKeeper.HOME
    private val ticker=object:Runnable{override fun run(){if(nativeVisible&&repo.store.auth()!=null&&!sending)sync();handler.postDelayed(this,4000)}}
    private val changes=object:BroadcastReceiver(){override fun onReceive(c:Context?,i:Intent?){render()}}
    private val clicks=object:INotificationClickListener{override fun onClick(event:INotificationClickEvent){runOnUiThread{pendingClick=event.notification.additionalData?.optLong("conversa",0)?:0;pendingPeek=event.result.actionId!="abrir";openGeneration++;if(::inbox.isInitialized){peeking=pendingPeek;conversation=pendingClick;pendingClick=0;if(setup==null)full(conversation);sync()}}}}
    private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    private fun trusted(url:String?)=try{val u=Uri.parse(url);u.scheme=="https"&&u.host=="tenkitermodas.com.br"&&u.path=="/admin.html"}catch(_:Exception){false}
    override fun onCreate(state:Bundle?){
        super.onCreate(state);repo=NativeRepository.get(this);conversation=state?.getLong("conversation",0)?:0;peeking=state?.getBoolean("peeking",false)?:false
        java.io.File(cacheDir,"received").deleteRecursively();java.io.File(cacheDir,"outgoing").deleteRecursively();java.io.File(cacheDir,"exports").deleteRecursively()
        updater=AppUpdater(this,scope)
        root=FrameLayout(this).apply{setBackgroundColor(Color.WHITE)}
        WindowCompat.setDecorFitsSystemWindows(window,false)
        ViewCompat.setOnApplyWindowInsetsListener(root){v,i->
            val bars=i.getInsets(WindowInsetsCompat.Type.systemBars());val ime=i.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left,bars.top,bars.right,maxOf(bars.bottom,ime.bottom));i
        }
        inbox=InboxView(this,this);administration=NativeAdministration(this,scope,repo,{select(it)},{render()});tools=NativeTools(this,scope,repo,{conversation},{online&&!peeking},{inbox.insert(it)},{render()},{select(it)},{full(it)},{ids,action->inbox.selectionDone();if(conversation in ids&&action in listOf("nao_lidas","encerrar"))back()},{action,id->when(action){"pessoa"->administration.person(id);"settings"->administration.settings();"copy"->administration.copyConversation(id);"export"->administration.exportForm(id,inbox.channelCode())}});root.addView(inbox,FrameLayout.LayoutParams(-1,-1));setContentView(root)
        ContextCompat.registerReceiver(this,changes,IntentFilter(NativeRepository.CHANGED),ContextCompat.RECEIVER_NOT_EXPORTED)
        OneSignal.Notifications.addClickListener(clicks)
        if(pendingClick>0){peeking=pendingPeek;conversation=pendingClick;pendingClick=0}
        WebKeeper.download={id,name->receivedFiles.choose(id,name)}
        WebKeeper.actions={a->if(a=="atualizar")updater.check() else if(a=="permissoes"){showSetup();setup?.reviewing=true;setup?.refresh()}}
        render();if(SetupGate.ok(this))full(conversation)else showSetup()
        if(repo.store.auth()!=null){BackgroundSync.periodic(this);sync();syncNames()}
    }
    private var setup:SetupGate?=null
    /** Tela obrigatória de configuração: avisos e segundo plano antes de abrir as mensagens. */
    private fun showSetup(){
        if(setup!=null)return
        val g=SetupGate(this,{checkSetup(true)}){scope.launch{OneSignal.Notifications.requestPermission(true);OneSignal.User.pushSubscription.optIn();setup?.refresh()}}
        setup=g;root.addView(g,FrameLayout.LayoutParams(-1,-1))
    }
    private fun checkSetup(close:Boolean=false){
        val g=setup?:return
        if(SetupGate.ok(this)&&(close||!g.reviewing)){root.removeView(g);setup=null;full(conversation)}else g.refresh()
    }
    private fun syncNames(){if(namesChecked)return;namesChecked=true;scope.launch{try{withContext(Dispatchers.IO){repo.googleNames()};sync()}catch(_:Exception){namesChecked=false}}}
    private fun render(){
        val seq=++refreshSeq;val id=conversation;val extra=if(historyConversation==id)history else emptyList()
        scope.launch{
            val data=withContext(Dispatchers.IO){
                val a=repo.store.auth();val canRead=repo.store.canReadLocal(a)
                Snapshot(a,canRead,if(canRead)repo.store.conversations()else emptyList(),if(canRead&&id>0)(extra+repo.store.messages(id)).distinctBy{it.optLong("id")}.sortedWith(compareBy<JSONObject>{it.optString("enviada_em")}.thenBy{it.optLong("id")})else emptyList(),if(canRead&&id>0)repo.store.pending(id)else emptyList())
            }
            if(seq!=refreshSeq||id!=conversation)return@launch
            if(displayOwner!=(data.a?.owner?:"")){val previous=displayOwner;tools.close();administration.close();displayOwner=data.a?.owner?:"";if(previous.isNotBlank()&&data.a!=null){history=emptyList();historyConversation=0;openGeneration++;conversation=0;peeking=false;render();return@launch}}
            if(data.a==null){online=false;conversation=0;history=emptyList();historyConversation=0}
            inbox.render(data.a,data.read,data.chats,if(data.read)conversation else 0,data.messages,data.pending,online,repo.status.ifBlank{if(data.a==null)"Entre para sincronizar este aparelho"else "Conversas salvas · verificando conexão…"},peeking)
        }
    }
    private data class Snapshot(val a:NativeAuth?,val read:Boolean,val chats:List<JSONObject>,val messages:List<JSONObject>,val pending:List<JSONObject>)
    override fun login(identifier:String,password:String){
        if(syncing)return;syncing=true;inbox.loginState(true);inbox.status("Conferindo seu acesso…")
        scope.launch{
            try{withContext(Dispatchers.IO){repo.login(identifier,password)};OneSignal.User.pushSubscription.optIn();inbox.reset();BackgroundSync.periodic(this@MainActivity);online=false;render()}
            catch(e:Exception){inbox.status(e.message?.take(200)?:"Não foi possível entrar agora.")}
            finally{syncing=false;inbox.loginState(false)}
            if(repo.store.auth()!=null){sync();syncNames()}
        }
    }
    override fun sync(){
        if(syncing||repo.store.auth()==null)return
        syncing=true;val focus=conversation;val generation=openGeneration;val sessionGeneration=repo.store.generation
        scope.launch{
            var again=false
            try{val ok=withContext(Dispatchers.IO){repo.sync(focus)};again=focus!=conversation||generation!=openGeneration;online=ok&&!again;if(ok&&focus>0&&!again&&!peeking)withContext(Dispatchers.IO){repo.markRead(focus){openGeneration==generation&&repo.store.generation==sessionGeneration&&!peeking&&activityVisible&&nativeVisible&&!administration.active}}}
            finally{syncing=false;render();if(again)sync()}
        }
    }
    override fun select(id:Long){if(contextChecked!=id){contextChecked=id;scope.launch{runCatching{withContext(Dispatchers.IO){repo.repairContext(id)}};sync()}};if(id!=conversation){history=emptyList();historyConversation=id};openGeneration++;peeking=false;conversation=id;online=false;showNative();sync()}
    override fun peek(id:Long){if(id!=conversation){history=emptyList();historyConversation=id};openGeneration++;peeking=true;conversation=id;online=false;showNative();sync()}
    override fun back(){history=emptyList();historyConversation=0;openGeneration++;peeking=false;conversation=0;render()}
    override fun send(id:Long,text:String):Boolean{
        if(!online||peeking||sending||id!=conversation)return false
        sending=true
        scope.launch{
            try{withContext(Dispatchers.IO){repo.reply(id,text)}}
            catch(_:Exception){online=false;inbox.status("Envio sem confirmação. Confira a conversa antes de tentar novamente.")}
            finally{sending=false;render()}
        }
        return true
    }
    override fun retry(id:Long,key:String,text:String){
        if(peeking||sending||id!=conversation||repo.store.auth()==null)return;sending=true
        scope.launch{try{withContext(Dispatchers.IO){repo.reply(id,text,key)}}catch(_:Exception){}finally{sending=false;render()}}
    }
    override fun tool(id:Long,action:String){if(id==conversation)tools.show(id,action)}
    override fun bulk(ids:Set<Long>,action:String){tools.batch(ids,action)}
    override fun older(id:Long){
        if(historyBusy||id!=conversation)return;historyBusy=true
        val generation=repo.store.generation;val earlier=if(historyConversation==id)history else emptyList()
        scope.launch{try{val rows=withContext(Dispatchers.IO){val oldest=(earlier+repo.store.messages(id)).minWithOrNull(compareBy<JSONObject>{it.optString("enviada_em")}.thenBy{it.optLong("id")});repo.older(id,oldest)};if(id==conversation&&generation==repo.store.generation){historyConversation=id;history=(rows+history).distinctBy{it.optLong("id")};render()}}
            catch(e:AccessRevoked){if(repo.store.generation==generation)repo.logout();render()}catch(e:Exception){inbox.status(e.message?:"Não foi possível buscar o histórico.")}
            finally{historyBusy=false}}
    }
    override fun media(id:Long){tools.media(id)}
    override fun context(id:Long){tools.media(id,true)}
    override fun preview(id:Long,context:Boolean,target:ImageView){tools.preview(id,context,target)}
    override fun search(query:String,closed:Boolean){
        queryJob?.cancel();if(query.isBlank()&&!closed){inbox.searchResults(null);return}
        val generation=repo.store.generation
        queryJob=scope.launch{
            delay(450)
            try{val ids=withContext(Dispatchers.IO){repo.find(query,closed)};if(repo.store.generation==generation){inbox.searchResults(ids);render()}}
            catch(e:CancellationException){throw e}
            catch(e:AccessRevoked){if(repo.store.generation==generation)repo.logout();render()}
            catch(_:Exception){inbox.status("Sem conexão para buscar no servidor · mostrando as conversas salvas")}
        }
    }
    override fun discard(key:String){scope.launch{withContext(Dispatchers.IO){repo.discard(key)};render()}}
    override fun update(){updater.check()}
    override fun menu(anchor:View){
        PopupMenu(this,anchor).apply{
            listOf("Selecionar conversas","Painel de atendimento","Configurações de leitura e nome","Conexões e gravação","Google Contatos","Exportar conversas","Sincronizar conversas","Atualizar aplicativo","Site da loja","Avisos","Atendimento completo","Sair da conta").forEach{menu.add(it)}
            setOnMenuItemClickListener{when(it.title.toString()){
                "Painel de atendimento"->administration.dashboard(inbox.channelCode());"Configurações de leitura e nome"->administration.settings();"Conexões e gravação"->administration.connections();"Google Contatos"->administration.contacts();"Exportar conversas"->administration.exportForm(conversation,inbox.channelCode());"Selecionar conversas"->{back();inbox.beginSelection()};"Sincronizar conversas"->sync();"Atualizar aplicativo"->updater.check();"Site da loja"->external("https://tenkitermodas.com.br/")
                "Avisos"->notificationSettings();"Atendimento completo"->full(conversation);"Sair da conta"->confirmLogout()
            };true};show()
        }
    }
    private fun confirmLogout(){AlertDialog.Builder(this).setTitle("Sair da conta?").setMessage("As conversas salvas neste aparelho serão removidas e os avisos serão desativados.").setPositiveButton("Sair"){_,_->
        OneSignal.User.pushSubscription.optOut()
        queryJob?.cancel()
        val a=repo.store.auth();val subscription=OneSignal.User.pushSubscription.id
        tools.close();administration.close();repo.logout();online=false;conversation=0;inbox.reset();web?.destroy();web=null;webPanel?.let{root.removeView(it)};webPanel=null;seededSession="";showNative();render()
        if(a!=null&&subscription.isNotBlank())scope.launch(Dispatchers.IO){runCatching{NativeApi().removeSubscription(a,subscription)}}
        CookieManager.getInstance().removeAllCookies(null);WebStorage.getInstance().deleteAllData()
    }.setNegativeButton("Cancelar",null).show()}
    private fun notificationSettings(){AlertDialog.Builder(this).setTitle("Avisos de mensagens").setMessage("Receba avisos com o aplicativo fechado. O Android também agenda a sincronização em segundo plano conforme a conexão e a bateria.")
        .setPositiveButton("Ativar"){_,_->scope.launch{OneSignal.Notifications.requestPermission(true);OneSignal.User.pushSubscription.optIn();sync()}}
        .setNeutralButton("Configurações"){_,_->startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName))}.setNegativeButton("Voltar",null).show()}
    override fun full(id:Long){
        nativeVisible=false;webTarget=id
        if(web==null)createWeb()
        inbox.visibility=View.GONE;webPanel?.visibility=View.VISIBLE
        val w=web?:return
        if(w.url==null)w.loadUrl(home)else deliverWeb()
    }
    private fun createWeb(){
        val panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.WHITE)}
        val kept=WebKeeper.web
        val w=if(kept!=null){WebKeeper.context?.baseContext=this;(kept.parent as? android.view.ViewGroup)?.removeView(kept);kept}else{val c=android.content.MutableContextWrapper(this);WebKeeper.context=c;WebView(c).also{WebKeeper.web=it}}
        web=w
        WebKeeper.configure(w)
        CookieManager.getInstance().setAcceptThirdPartyCookies(w,false)
        w.webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(v:WebView,r:WebResourceRequest):Boolean{if(!r.isForMainFrame)return false;val u=r.url.toString();if(trusted(u))return false;if(r.hasGesture())external(u);return true}
            override fun onPageFinished(v:WebView,url:String){if(trusted(url))deliverWeb()}
            override fun onReceivedError(v:WebView,r:WebResourceRequest,e:WebResourceError){if(r.isForMainFrame){Toast.makeText(this@MainActivity,"Sem conexão. Tentando abrir as mensagens de novo…",Toast.LENGTH_LONG).show();handler.postDelayed({web?.reload()},6000)}}
        }
        w.webChromeClient=object:WebChromeClient(){
            override fun onShowFileChooser(v:WebView,cb:ValueCallback<Array<Uri>>,p:FileChooserParams):Boolean{chooser?.onReceiveValue(null);chooser=cb;return try{startActivityForResult(p.createIntent().apply{addCategory(Intent.CATEGORY_OPENABLE)},100);true}catch(_:Exception){chooser?.onReceiveValue(null);chooser=null;false}}
            override fun onPermissionRequest(r:PermissionRequest){runOnUiThread{val origin=Uri.parse(r.origin.toString());if(origin.scheme!="https"||origin.host!="tenkitermodas.com.br"||!r.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)){r.deny();return@runOnUiThread};if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)r.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))else{audioRequest=r;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),101)}}}
            override fun onCreateWindow(v:WebView,dialog:Boolean,gesture:Boolean,msg:Message):Boolean{if(!gesture)return false;val child=WebView(this@MainActivity);child.webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(w:WebView,r:WebResourceRequest):Boolean{external(r.url.toString());w.destroy();return true}};(msg.obj as WebView.WebViewTransport).webView=child;msg.sendToTarget();return true}
        }
        panel.addView(w,LinearLayout.LayoutParams(-1,0,1f));webPanel=panel;root.addView(panel,FrameLayout.LayoutParams(-1,-1))
    }
    private fun deliverWeb(){
        val w=web?:return;if(!trusted(w.url))return
        val a=repo.store.auth()
        if(a!=null&&seededSession!=a.session){
            seededSession=a.session
            val json=JSONObject().put("whatsapp",a.owner).put("sessao",a.session).toString()
            w.evaluateJavascript("(function(){if(localStorage.getItem('tm_session'))return false;localStorage.setItem('tm_session',${JSONObject.quote(json)});location.reload();return true})()"){r->if(r!="true")deliverWeb()};return
        }
        if(webTarget>0){val id=webTarget;w.evaluateJavascript("(function(){if(!window.TKMobileOpenConversation)return false;window.TKMobileOpenConversation($id,$peeking);return true})()"){r->if(r=="true"&&webTarget==id)webTarget=0}}
        importWebSession()
    }
    private fun importWebSession(){
        val w=web?:return;if(!trusted(w.url))return
        w.evaluateJavascript("(function(){try{if(typeof usuarioAdmin==='undefined'||!usuarioAdmin||typeof temPermissao!=='function'||!(window.TKMensagensAcessos?TKMensagensAcessos.pode('acessar'):temPermissao(usuarioAdmin,'gerir_acessos')))return null;return JSON.stringify(getSessao());}catch(e){return null;}})()"){raw->
            if(raw==null||raw=="null")return@evaluateJavascript
            runCatching{val decoded=org.json.JSONTokener(raw).nextValue() as? String?:return@runCatching;val j=JSONObject(decoded);val a=NativeAuth(j.getString("whatsapp"),j.getString("sessao"),"")
                if(repo.store.auth()?.session==a.session)return@runCatching
                scope.launch{try{withContext(Dispatchers.IO){repo.importSession(a)};OneSignal.User.pushSubscription.optIn();BackgroundSync.periodic(this@MainActivity);render();sync()}catch(_:Exception){}}
            }
        }
    }
    private fun showNative(){nativeVisible=true;webPanel?.visibility=View.GONE;inbox.visibility=View.VISIBLE;render()}
    private fun external(address:String){val u=Uri.parse(address);if(u.scheme !in listOf("https","http","tel","mailto"))return;runCatching{startActivity(Intent(Intent.ACTION_VIEW,u))}}
    override fun onResume(){super.onResume();activityVisible=true;WebKeeper.attach();checkSetup();if(::updater.isInitialized)updater.onResume();if(::repo.isInitialized){handler.removeCallbacks(ticker);handler.post(ticker)}}
    override fun onPause(){activityVisible=false;WebKeeper.detach();if(::tools.isInitialized)tools.pauseRecording();handler.removeCallbacks(ticker);super.onPause()}
    override fun onDestroy(){handler.removeCallbacks(ticker);WebKeeper.actions=null;WebKeeper.download=null;runCatching{unregisterReceiver(changes)};OneSignal.Notifications.removeClickListener(clicks);scope.cancel();chooser?.onReceiveValue(null);audioRequest?.deny();tools.close();administration.close();web?.let{(it.parent as? android.view.ViewGroup)?.removeView(it)};WebKeeper.context?.baseContext=applicationContext;super.onDestroy()}
    override fun onSaveInstanceState(out:Bundle){out.putLong("conversation",conversation);out.putBoolean("peeking",peeking);super.onSaveInstanceState(out)}
    @Deprecated("Legacy back API") override fun onBackPressed(){
        val w=web
        if(webPanel?.visibility==View.VISIBLE&&w!=null&&trusted(w.url)){w.evaluateJavascript("window.TKMobileBack ? window.TKMobileBack() : false"){r->if(r!="true")moveTaskToBack(true)}}
        else if(conversation>0)back()else moveTaskToBack(true)
    }
    @Deprecated("Activity result API") override fun onActivityResult(code:Int,result:Int,data:Intent?){super.onActivityResult(code,result,data);if(code==ReceivedFiles.REQUEST)receivedFiles.result(result,data?.data);if(code==201&&result==RESULT_OK)data?.data?.let{tools.picked(it)};if(code==100){chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));chooser=null}}
    override fun onRequestPermissionsResult(code:Int,p:Array<out String>,r:IntArray){super.onRequestPermissionsResult(code,p,r);if(code==202)tools.audioPermission(r.firstOrNull()==PackageManager.PERMISSION_GRANTED);if(code==101){val request=audioRequest;audioRequest=null;if(r.firstOrNull()==PackageManager.PERMISSION_GRANTED)request?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))else request?.deny()}}
}
