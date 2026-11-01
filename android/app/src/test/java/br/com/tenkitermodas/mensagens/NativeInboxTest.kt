package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.Application
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode
import java.io.File
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class,qualifiers="w390dp-h844dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NativeInboxTest {
    private val activity get()=Robolectric.buildActivity(Activity::class.java).setup().get()
    private fun conv(id:Long=1)=JSONObject().put("id",id).put("nome","Maria · Cliente").put("contato","5588999990000").put("previa","Tem esse vestido no tamanho M?").put("canal","whatsapp1").put("nao_lidas",2).put("ultima_em","2026-10-27T03:00:00Z").put("encerrada_em","")
    private fun msg(id:Long=1)=JSONObject().put("id",id).put("texto","Olá! Tem esse vestido no tamanho M?").put("direcao","entrada").put("tipo","texto").put("enviada_em","2026-10-27T03:00:00Z")
    private class Events:InboxView.Events{
        var interactions=0;override fun interaction(){interactions++}
        var updates=0;var selected=0L;var sent="";var full=0L;var media=0L;var peeked=0L;var bulkIds=emptySet<Long>();var bulkAction="";var syncs=0
        override fun peek(id:Long){peeked=id};override fun media(id:Long){media=id};override fun bulk(ids:Set<Long>,action:String){bulkIds=ids;bulkAction=action}
        override fun login(identifier:String,password:String){};override fun sync(){syncs++};override fun select(id:Long){selected=id};override fun back(){}
        override fun send(id:Long,text:String):Boolean{sent=text;return true};override fun retry(id:Long,key:String,text:String){};override fun full(id:Long){full=id};override fun update(){updates++};override fun menu(anchor:View){}
    }
    private fun all(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{all(v.getChildAt(it))}else emptyList()
    private fun layout(v:View,w:Int,h:Int){v.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));v.layout(0,0,w,h)}
    @Test fun presenceDoesNotReadMessagesOrChangeLocalConversation(){
        val c=activity;c.deleteDatabase("mensagens-local.db");c.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(c,SecretKeySpec(ByteArray(32){4},"AES"));val a=NativeAuth("88999990000","test","Ana");store.saveAuth(a);store.putConversation(a,conv())
        val paths=mutableListOf<String>()
        val api=object:NativeApi(){override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject {
            paths.add(path);assertEquals(1L,body!!.getLong("conversa"));assertTrue(body.getString("fonte").startsWith("apk_"));assertTrue(body.getLong("seq")>0);assertEquals("sem_detalhe",body.getString("estado"));return JSONObject().put("ok",true)
        }}
        val repo=NativeRepository(c,store,api);repo.presence(1)
        repo.presence(1,"lendo",true){false};assertEquals(listOf("/msg/presenca"),paths);assertEquals(2,store.conversation(1)!!.getInt("nao_lidas"))
        store.logout();repo.presence(1);assertEquals(1,paths.size);store.close()
    }
    @Test fun typingWithSoftKeyboardSignalsInteractionWithoutPassingTheText(){
        val a=activity;val e=Events();val v=InboxView(a,e);a.setContentView(v)
        v.render(NativeAuth("88999990000","test","Ana"),true,listOf(conv()),1,listOf(msg()),emptyList(),true,"Atualizado");layout(v,390,844)
        val input=all(v).filterIsInstance<EditText>().first{it.hint=="Mensagem"};input.requestFocus();input.setText("Rascunho não transmitido")
        assertTrue(e.interactions>0);assertEquals("",e.sent)
    }
    @Test fun listSectionsKeepLinkedChannelsTogetherAndAllowTheOriginalLayout(){
        val a=activity;val e=Events();val v=InboxView(a,e);a.setContentView(v);val auth=NativeAuth("88999990000","test","Ana")
        val replied=conv(1).put("pessoa","answered").put("aguarda_resposta",0).put("nao_lidas",0).put("ult_dir","saida").put("ultima_em","2026-10-31T15:00:00Z")
        val waiting=conv(2).put("pessoa","pending").put("aguarda_resposta",1).put("ultima_em","2026-10-31T14:00:00Z")
        val linked=conv(3).put("pessoa","pending").put("aguarda_resposta",0).put("ultima_em","2026-10-31T13:00:00Z")
        v.render(auth,true,listOf(replied,waiting,linked),0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844)
        fun ids()=all(v).filterIsInstance<android.widget.ListView>().first().adapter.let{ad->(0 until ad.count).map{ad.getItemId(it)}}
        assertEquals(listOf(-1L,2L,3L,-2L,1L),ids());assertFalse(all(v).filterIsInstance<android.widget.ListView>().first().adapter.isEnabled(0))
        v.toggleLayout();assertEquals(listOf(1L,2L,3L),ids());v.render(auth,true,listOf(replied,waiting,linked),0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844);assertEquals(listOf(1L,2L,3L),ids())
        v.toggleLayout();assertEquals(listOf(-1L,2L,3L,-2L,1L),ids())
    }
    @Test fun nativeScreensAndControls(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v)
        val auth=NativeAuth("88999990000","fake-session","Pablo")
        for((w,h)in listOf(390 to 844,412 to 915,320 to 700,1440 to 900)){
            layout(v,w,h)
            v.render(auth,true,(1L..30L).map{conv(it).put("contato","55889999"+it.toString().padStart(5,'0')).put("nome",if(it==1L)"Maria · Cliente"else"Cliente de demonstração $it").put("nao_lidas",if(it%3L==0L)0 else 2)},0,emptyList(),emptyList(),true,"Atualizado às 05:46")
            layout(v,w,h)
            val update=all(v).filterIsInstance<Button>().first{it.text=="Atualizar app"};assertTrue(update.height>=48);update.performClick()
            assertTrue(all(v).filterIsInstance<android.widget.TextView>().any{it.text=="Conversas"})
            snapshot(v,"inbox-$w",w,h)
            v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),false,"Sem conexão · mostrando conversas salvas");layout(v,w,h)
            assertFalse(all(v).filterIsInstance<Button>().first{it.text=="Enviar"}.isEnabled)
            assertTrue(all(v).filterIsInstance<android.widget.TextView>().any{it.text.contains("vestido")})
            snapshot(v,"conversation-offline-$w",w,h)
            v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),true,"Atualizado agora");layout(v,w,h)
            val input=all(v).filterIsInstance<EditText>().first{it.hint=="Mensagem"};input.setText("Temos sim!")
            val send=all(v).filterIsInstance<Button>().first{it.text=="Enviar"};assertTrue(send.isEnabled);send.performClick();assertEquals("Temos sim!",events.sent)
            snapshot(v,"conversation-online-$w",w,h)
            for(b in all(v).filterIsInstance<Button>().filter{it.isShown})assertTrue("Alvo pequeno: "+b.text,b.height>=48)
        }
        assertEquals(4,events.updates)
    }
    @Test fun linkPreviewChoiceAppearsOnlyForWhatsAppLinksAndIsRememberedPerChannel(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","test","Pablo");a.getSharedPreferences("link-preview",0).edit().clear().commit()
        v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),true,"Atualizado");layout(v,390,844)
        val input=all(v).filterIsInstance<EditText>().first{it.hint=="Mensagem"};val choice=all(v).filterIsInstance<android.widget.CheckBox>().first{it.text.toString().startsWith("Mostrar prévia")}
        assertEquals(View.GONE,choice.visibility);input.setText(BuildConfig.SITE_URL+"/p/TK-1");assertEquals(View.VISIBLE,choice.visibility);assertFalse(choice.isChecked);choice.performClick();assertTrue(a.getSharedPreferences("link-preview",0).getBoolean("whatsapp1",false));assertFalse(a.getSharedPreferences("link-preview",0).getBoolean("whatsapp2",false));layout(v,390,844);snapshot(v,"conversation-link-preview",390,844)
        input.setText("sem link");assertEquals(View.GONE,choice.visibility)
        v.render(auth,true,listOf(conv().put("canal","instagram")),1,listOf(msg()),emptyList(),true,"Atualizado");v.insert("https://example.invalid");assertFalse(all(v).filterIsInstance<android.widget.CheckBox>().any{it.isShown&&it.text.toString().startsWith("Mostrar prévia")})
    }
    @Test fun linkedChannelsMoveTogetherAndGroupsStartHidden(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","test","Pablo")
        val linked=(1L..3L).map{conv(it).put("pessoa","client-one").put("canal",listOf("whatsapp1","whatsapp2","instagram")[(it-1).toInt()]).put("ultima_em","2026-10-28T00:0${it}:00Z")}
        val unrelated=conv(4).put("pessoa","client-two").put("ultima_em","2026-10-28T00:02:30Z");val group=conv(5).put("grupo",1)
        v.render(auth,true,linked+unrelated+group,0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844)
        fun ids()=all(v).filterIsInstance<android.widget.ListView>().first().adapter.let{ad->(0 until ad.count).map{ad.getItemId(it)}.filter{it>0}}
        assertEquals(listOf(3L,2L,1L,4L),ids());assertFalse(all(v).filterIsInstance<Button>().any{it.tag=="Nos 2 WhatsApp"});assertTrue(all(v).filterIsInstance<Button>().first{it.tag=="Todas"}.text.startsWith("Todas · 2"));snapshot(v,"inbox-linked-channels",390,844)
        val newest=JSONObject(linked[0].toString()).put("ultima_em","2026-10-28T00:04:00Z");v.render(auth,true,listOf(newest)+linked.drop(1)+unrelated+group,0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844);assertEquals(listOf(1L,3L,2L,4L),ids())
        all(v).filterIsInstance<Button>().first{it.tag=="Grupos"}.performClick();assertTrue(ids().contains(5L))
    }
    @Test fun unreadIsAlwaysPartOfWaitingAndClosedNeverCounts(){
        val a=conv(1).put("nao_lidas",3).put("ult_dir","saida");val b=conv(2).put("nao_lidas",0).put("ult_dir","entrada");val closed=conv(3).put("encerrada_em","2026-10-28").put("nao_lidas",2)
        assertTrue(InboxRules.waiting(a));assertTrue(InboxRules.waiting(b));assertFalse(InboxRules.waiting(closed));assertFalse(InboxRules.matches(closed,"Não lidas","Todos"))
        assertEquals(2,InboxRules.people(listOf(a,b).mapIndexed{i,c->c.put("pessoa","person-$i")}))
    }
    @Test fun conversationUsesContactHeaderAndRealContextWithoutNullText(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","test","Pablo")
        val context=msg().put("ctx_tipo","story").put("ctx_midia",1).put("ctx_mtipo","video").put("ctx_texto",JSONObject.NULL)
        v.render(auth,true,listOf(conv()),1,listOf(context),emptyList(),true,"Atualizado");layout(v,390,844)
        assertFalse(all(v).filterIsInstance<android.widget.TextView>().any{it.isShown&&it.text.contains("null")});assertTrue(all(v).filterIsInstance<Button>().any{it.text=="▶ Ver vídeo do story"});assertTrue(all(v).filterIsInstance<android.widget.ImageView>().any{it.contentDescription=="Prévia do story respondido"});assertFalse(all(v).filterIsInstance<Button>().first{it.text=="Atualizar app"}.isShown);snapshot(v,"conversation-story-video",390,844)
    }
    @Test fun encryptedAuthAndDatabaseSurviveReopenAndLogout(){
        val c=activity;c.deleteDatabase("mensagens-local.db");c.getSharedPreferences("native-auth",0).edit().clear().commit()
        val key=SecretKeySpec(ByteArray(32){7},"AES");val a=NativeAuth("88999990000","tk-test-secret","Pablo")
        val first=NativeStore(c,key);first.saveAuth(a);first.putConversation(a,conv());first.putMessages(a,1,org.json.JSONArray().put(msg()))
        assertFalse(c.getSharedPreferences("native-auth",0).getString("credential","")!!.contains(a.session))
        first.close();val second=NativeStore(c,key);assertEquals(a,second.auth());assertEquals(1,second.messages(1).size)
        second.logout();assertNull(second.auth());assertTrue(second.messages(1).isEmpty());assertTrue(second.conversations().isEmpty())
        second.saveAuth(a);second.putConversation(a,conv());val old=a
        val next=NativeAuth("88000000000","new-session","Outra conta");val oldGeneration=second.generation;second.saveAuth(next);assertTrue(second.generation>oldGeneration);second.putConversation(old,conv(99))
        assertTrue(second.conversations().isEmpty());assertFalse(second.canReadLocal(a.copy(checked=System.currentTimeMillis()-86400001)));second.close()
    }
    @Test fun releaseManifestRejectsUntrustedSourcesAndInvalidHash(){
        val good=JSONObject().put("versionCode",3).put("versionName","3.0.0").put("url","https://github.com/pablofonteneleadv/tenkiter-catalogo/releases/download/android-v3.0.0/TENKiTER.apk").put("sha256","a".repeat(64)).put("bytes",1234)
        assertEquals(3,AppUpdater.Release.parse(good).code)
        for(bad in listOf("http://github.com/pablofonteneleadv/tenkiter-catalogo/releases/download/a/b.apk","https://example.com/evil.apk")){
            try{AppUpdater.Release.parse(JSONObject(good.toString()).put("url",bad));fail("Origem não confiável aceita") }catch(_:IllegalArgumentException){}
        }
        try{AppUpdater.Release.parse(JSONObject(good.toString()).put("sha256","x"));fail("Hash inválido") }catch(_:IllegalArgumentException){}
        val f=File(activity.cacheDir,"fake.apk");f.writeText("not-an-apk")
        try{AppUpdater(activity,kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main)).verify(f,AppUpdater.Release.parse(JSONObject(good.toString()).put("bytes",f.length())));fail("APK falso aceito") }catch(_:IllegalArgumentException){}
    }
    @Test fun syncWritesLocalBankAndRejectsLateResponseAfterLogout(){
        val c=activity;c.deleteDatabase("mensagens-local.db");c.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(c,SecretKeySpec(ByteArray(32){9},"AES"));val a=NativeAuth("88999990000","old-session","Pablo");store.saveAuth(a)
        var revokeDuringMessage=false
        val api=object:NativeApi(){
            override fun account(body:JSONObject)=JSONObject().put("ok",true).put("sessao","fresh-session").put("usuario",JSONObject().put("whatsapp",a.owner).put("name","Pablo").put("permissoes",org.json.JSONArray().put("gerir_acessos")))
            override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject {
                assertEquals("fresh-session",a.session)
                if(path.startsWith("/msg/conversas"))return JSONObject().put("ok",true).put("conversas",org.json.JSONArray().put(conv()))
                if(path.startsWith("/msg/mensagens")){
                    if(revokeDuringMessage)store.logout()
                    return JSONObject().put("ok",true).put("conversa",conv()).put("mensagens",org.json.JSONArray().put(msg()))
                }
                return JSONObject().put("ok",true)
            }
        }
        val repo=NativeRepository(c,store,api)
        assertTrue(repo.sync(1));assertEquals(1,store.messages(1).size);assertEquals("fresh-session",store.auth()?.session)
        revokeDuringMessage=true
        assertFalse(repo.sync(1));assertNull(store.auth());assertTrue(store.conversations().isEmpty());assertTrue(store.messages(1).isEmpty())
        store.close()
    }
    @Test fun repliesUseSameIdOnExplicitRetryAndNeverReplayBySync(){
        val c=activity;c.deleteDatabase("mensagens-local.db");c.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(c,SecretKeySpec(ByteArray(32){5},"AES"));val a=NativeAuth("88999990000","session","Pablo");store.saveAuth(a);store.putConversation(a,conv())
        val keys=mutableListOf<String>();var fail=true
        val api=object:NativeApi(){
            override fun account(body:JSONObject)=JSONObject().put("ok",true).put("usuario",JSONObject().put("permissoes",org.json.JSONArray().put("gerir_acessos")))
            override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject {
                if(path=="/msg/enviar"){
                    keys.add(body!!.getString("idLocal"))
                    if(fail)throw ApiFailure(JSONObject().put("erro","Tente mais tarde."),409)
                    return JSONObject().put("ok",true).put("mensagem",msg(2).put("direcao","saida").put("texto",body.getString("texto")))
                }
                if(path.startsWith("/msg/mensagens"))return JSONObject().put("ok",true).put("conversa",conv()).put("mensagens",org.json.JSONArray().put(msg()))
                if(path.startsWith("/msg/conversas"))return JSONObject().put("ok",true).put("conversas",org.json.JSONArray().put(conv()))
                return JSONObject().put("ok",true)
            }
        }
        val repo=NativeRepository(c,store,api);val id="android-explicit-retry-1"
        try{repo.reply(1,"Temos sim",id);fail("Recusa ignorada")}catch(_:ApiFailure){}
        assertTrue(store.pending(1).first().getString("state").startsWith("Não enviada:"))
        repo.sync(1);assertEquals(1,keys.size)
        fail=false;repo.reply(1,"Temos sim",id);assertEquals(listOf(id,id),keys);assertTrue(store.pending(1).isEmpty())
        store.close()
    }
    @Test fun loginAndKeyboardSizedViewRemainReachable(){
        val a=activity;val e=Events();val v=InboxView(a,e);a.setContentView(v)
        v.render(null,false,emptyList(),0,emptyList(),emptyList(),false,"Entre para sincronizar este aparelho")
        layout(v,390,480)
        assertEquals(2,all(v).filterIsInstance<EditText>().size)
        val enter=all(v).filterIsInstance<Button>().first{it.text=="Entrar"};assertTrue(enter.height>=48)
        snapshot(v,"login-keyboard",390,480)
    }
    @Test fun incomingRefreshPreservesDraft(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v)
        val auth=NativeAuth("88999990000","session","Pablo")
        v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),true,"Atualizado");layout(v,390,844)
        all(v).filterIsInstance<EditText>().last().setText("Estou conferindo seu tamanho")
        v.render(auth,true,listOf(conv()),1,listOf(msg(),msg(2).put("texto","Tem em azul?")),emptyList(),true,"Atualizado");layout(v,390,844)
        assertEquals("Estou conferindo seu tamanho",all(v).filterIsInstance<EditText>().last().text.toString())
        v.render(auth,true,listOf(conv()),1,listOf(msg(3).put("tipo","imagem")),emptyList(),true,"Atualizado");layout(v,390,844)
        all(v).filterIsInstance<android.widget.TextView>().first{it.text.contains("toque para abrir")}.performClick();assertEquals(3L,events.media)
    }
    @Test fun inboxExplainsOrderAndUnreadFilterPreservesChronology(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v)
        val auth=NativeAuth("88999990000","session","Pablo");a.getSharedPreferences("mensagens-visual",0).edit().putString("visual_"+auth.owner,"continua").commit()
        val old=conv(1).put("ultima_em","2026-10-26T03:00:00Z").put("nao_lidas",1)
        val recent=conv(2).put("ultima_em","2026-10-27T04:00:00Z").put("nao_lidas",0)
        val middle=conv(3).put("ultima_em","2026-10-27T03:00:00Z").put("nao_lidas",2).put("canal","whatsapp2")
        v.render(auth,true,listOf(old,recent,middle),0,emptyList(),emptyList(),true,"Atualizado")
        layout(v,390,844)
        val list=all(v).filterIsInstance<android.widget.ListView>().first()
        assertEquals(2L,list.adapter.getItemId(0));assertEquals(3L,list.adapter.getItemId(1))
        assertTrue(all(v).filterIsInstance<android.widget.TextView>().any{it.text.toString().contains("mais recentes primeiro",true)})
        all(v).filterIsInstance<Button>().first{it.tag=="Não lidas"}.performClick()
        assertEquals(2,list.adapter.count);assertEquals(3L,list.adapter.getItemId(0));assertEquals(1L,list.adapter.getItemId(1))
        val first=list.adapter.getView(1,null,list)
        assertTrue(all(first).filterIsInstance<android.widget.TextView>().any{it.text=="1 não lida"})
        all(v).filterIsInstance<Button>().first{it.tag=="WhatsApp 2"}.performClick()
        assertEquals(1,list.adapter.count);assertEquals(3L,list.adapter.getItemId(0))
        list.performItemClick(list.adapter.getView(0,null,list),0,3);assertEquals(3L,events.selected)
        layout(v,390,844);snapshot(v,"inbox-unread-channel",390,844)
    }
    @Test fun inboxAtLargeTextAndKeyboardHeightKeepsActionsVisible(){
        val a=activity;val cfg=android.content.res.Configuration(a.resources.configuration).apply{fontScale=1.3f}
        a.resources.updateConfiguration(cfg,a.resources.displayMetrics)
        val v=InboxView(a,Events());a.setContentView(v)
        v.render(NativeAuth("88999990000","session","Pablo"),true,listOf(conv()),0,emptyList(),emptyList(),false,"Sem conexão · conversas salvas")
        layout(v,320,480)
        for(b in all(v).filterIsInstance<Button>().filter{it.isShown}){
            val point=IntArray(2);b.getLocationOnScreen(point)
            assertTrue("Ação fora da área útil: "+b.text,point[1]+b.height<=480);assertTrue(b.height>=48)
        }
        val search=all(v).filterIsInstance<EditText>().first();search.requestFocus();search.setText("Nome inexistente")
        layout(v,320,480)
        assertEquals(0,all(v).filterIsInstance<android.widget.ListView>().first().adapter.count)
        snapshot(v,"inbox-large-text-empty-keyboard",320,480)
    }
    @Test fun peekKeepsReadStateAndRequiresOpeningBeforeReply(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","session","Pablo")
        val c=conv().put("ult_dir","entrada").put("ult_entrada_em","2026-10-27T03:00:00Z").put("outro_id",2)
        v.render(auth,true,listOf(c),0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844)
        all(v).filterIsInstance<Button>().first{it.text=="Espiar"}.performClick();assertEquals(1L,events.peeked);assertEquals(0L,events.selected)
        v.render(auth,true,listOf(c),1,listOf(msg()),emptyList(),true,"Atualizado",true);layout(v,390,844)
        assertFalse(all(v).filterIsInstance<Button>().any{it.text=="Enviar"})
        assertTrue(all(v).filterIsInstance<EditText>().isEmpty())
        snapshot(v,"peek-native",390,844)
        all(v).filterIsInstance<Button>().first{it.text=="Espiando · abrir para responder"}.performClick();assertEquals(1L,events.selected)
        v.render(auth,true,listOf(c),1,listOf(msg()),emptyList(),true,"Atualizado",false);layout(v,390,844)
        assertTrue(all(v).filterIsInstance<Button>().first{it.text=="Enviar"}.isEnabled)
    }
    @Test fun selectionAndWaitingGroupFiltersRemainDistinct(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","session","Pablo");a.getSharedPreferences("mensagens-visual",0).edit().putString("visual_"+auth.owner,"continua").commit()
        val waiting=conv(1).put("grupo",0).put("ult_dir","entrada").put("nao_lidas",0)
        val group=conv(2).put("grupo",1).put("ult_dir","entrada")
        val answered=conv(3).put("grupo",0).put("ult_dir","saida")
        v.render(auth,true,listOf(waiting,group,answered),0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844)
        val list=all(v).filterIsInstance<android.widget.ListView>().first()
        all(v).filterIsInstance<Button>().first{it.tag=="Falta responder"}.performClick();assertEquals(2,list.adapter.count);assertEquals(setOf(1L,3L),(0 until list.adapter.count).map{list.adapter.getItemId(it)}.toSet())
        all(v).filterIsInstance<Button>().first{it.tag=="Falta responder"}.performClick()
        layout(v,390,844)
        val child=list.getChildAt(0);assertNotNull(child)
        val now=android.os.SystemClock.uptimeMillis()
        list.dispatchTouchEvent(android.view.MotionEvent.obtain(now,now,android.view.MotionEvent.ACTION_DOWN,100f,child.top+20f,0))
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis((android.view.ViewConfiguration.getLongPressTimeout()+200).toLong()))
        list.dispatchTouchEvent(android.view.MotionEvent.obtain(now,android.os.SystemClock.uptimeMillis(),android.view.MotionEvent.ACTION_UP,100f,child.top+20f,0))
        layout(v,390,844);snapshot(v,"selection-native",390,844)
        assertEquals(0L,events.selected);assertTrue(all(v).filterIsInstance<android.widget.CheckBox>().any{it.isChecked})
        all(v).filterIsInstance<Button>().first{it.text=="Encerrar"&&it.isShown}.performClick()
        assertEquals(1,events.bulkIds.size);assertEquals("encerrar",events.bulkAction)
        all(v).filterIsInstance<Button>().first{it.text=="Lidas"&&it.isShown}.performClick()
        assertEquals(1,events.bulkIds.size);assertEquals("lidas",events.bulkAction)
        assertTrue(InboxRules.waiting(waiting));assertTrue(InboxRules.waiting(group));assertTrue(InboxRules.waiting(answered))
    }
    @Test fun readGuardAndBatchUseTheSameServerRoutesWithoutAutomaticReply(){
        val a=activity;a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){8},"AES"));val auth=NativeAuth("88999990000","session","Pablo");store.saveAuth(auth);store.putConversation(auth,conv())
        val calls=mutableListOf<Pair<String,JSONObject?>>()
        val api=object:NativeApi(){override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{calls.add(path to body);return JSONObject().put("ok",true)}}
        val repo=NativeRepository(a,store,api)
        repo.markRead(1){false};assertTrue(calls.isEmpty());assertEquals(2,store.conversation(1)?.optInt("nao_lidas"))
        repo.markRead(1){true};assertEquals("/msg/lida",calls.last().first);assertEquals(0,store.conversation(1)?.optInt("nao_lidas"))
        repo.batch(setOf(1),"nao_lidas");assertTrue(calls.last().second!!.getBoolean("naoLida"));assertEquals(1,store.conversation(1)?.optInt("nao_lidas"))
        repo.batch(setOf(1),"encerrar","vendeu");assertEquals("/msg/encerrar",calls.last().first);assertEquals("vendeu",calls.last().second!!.getString("motivo"));assertTrue(store.conversation(1)!!.optString("encerrada_em").isNotBlank())
        repo.batch(setOf(1),"reabrir");assertTrue(store.conversation(1)!!.optString("encerrada_em").isBlank());assertFalse(calls.any{it.first=="/msg/enviar"})
        store.close()
    }
    @Test fun replySignatureRespectsTeamSettingAndChannel(){
        val a=NativeAuth("88999990000","session","PABLO Fontenele")
        assertEquals("*Pablo:*\nOlá",InboxRules.signature(a,conv(),JSONObject(),"Olá"))
        val config=JSONObject().put("meuNome","Clarice").put("config",JSONObject().put("assinatura",true))
        assertEquals("Clarice:\nOlá",InboxRules.signature(a,conv().put("canal","instagram"),config,"Olá"))
        config.getJSONObject("config").put("assinatura",false);assertEquals("Olá",InboxRules.signature(a,conv(),config,"Olá"))
    }
    @Test fun fullSyncPagesThenUsesTheFirstCursorForDeltas(){
        val c=activity;c.deleteDatabase("mensagens-local.db");c.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(c,SecretKeySpec(ByteArray(32){4},"AES"));val auth=NativeAuth("88999990000","session","Pablo");store.saveAuth(auth);store.putConversation(auth,conv(999).put("ultima_em","2000-01-01T00:00:00Z"))
        var lists=0;var deltas=0;var accounts=0
        val api=object:NativeApi(){
            override fun account(body:JSONObject):JSONObject{accounts++;return JSONObject().put("ok",true).put("usuario",JSONObject().put("permissoes",org.json.JSONArray().put("gerir_acessos")))}
            override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{
                if(path.startsWith("/msg/conversas")){
                    lists++;val ids=when{!path.contains("antesId")->(51L..100L).reversed();path.contains("antesId=51")->(1L..50L).reversed();else->emptyList()}
                    return JSONObject().put("ok",true).put("cursor",if(lists==1)"2026-10-27T01:00:01Z"else"2026-10-27T01:00:09Z").put("conversas",org.json.JSONArray(ids.map{conv(it)}))
                }
                if(path.startsWith("/msg/novidades")){deltas++;assertTrue(path.contains("01%3A00%3A01Z"));return JSONObject().put("ok",true).put("cursor","2026-10-27T01:00:10Z").put("conversas",org.json.JSONArray())}
                if(path.startsWith("/msg/mensagens")){val id=path.substringAfter("conversa=").substringBefore('&').toLong();return JSONObject().put("ok",true).put("conversa",conv(id)).put("mensagens",org.json.JSONArray().put(msg()))}
                return JSONObject().put("ok",true)
            }
        }
        val repo=NativeRepository(c,store,api);assertTrue(repo.sync());assertEquals(3,lists);assertEquals(100,store.conversations().count{!it.optBoolean("local_hidden")});assertTrue(store.conversation(999)!!.optBoolean("local_hidden"))
        assertTrue(repo.sync());assertEquals(1,deltas);assertEquals(3,lists);assertEquals(1,accounts)
        val received=File(c.cacheDir,"received/test").apply{parentFile!!.mkdirs();writeText("fake-media")};val outgoing=File(c.cacheDir,"outgoing/test").apply{parentFile!!.mkdirs();writeText("fake-audio")};store.logout();assertFalse(received.exists());assertFalse(outgoing.exists());store.close()
    }
    @Test fun longPressOnPeekAndVisibleSelectionButtonBothAllowClosing(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","session","Pablo")
        v.render(auth,true,listOf(conv()),0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844)
        val peek=all(v).filterIsInstance<Button>().first{it.text=="Espiar"}
        val now=android.os.SystemClock.uptimeMillis();peek.dispatchTouchEvent(android.view.MotionEvent.obtain(now,now,android.view.MotionEvent.ACTION_DOWN,20f,20f,0))
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis((android.view.ViewConfiguration.getLongPressTimeout()+200).toLong()))
        peek.dispatchTouchEvent(android.view.MotionEvent.obtain(now,android.os.SystemClock.uptimeMillis(),android.view.MotionEvent.ACTION_UP,20f,20f,0));layout(v,390,844)
        assertEquals(0L,events.peeked);assertTrue(all(v).filterIsInstance<android.widget.CheckBox>().any{it.isChecked})
        all(v).filterIsInstance<Button>().first{it.text=="Encerrar"&&it.isShown}.performClick();assertEquals(setOf(1L),events.bulkIds)
        all(v).filterIsInstance<Button>().first{it.text=="Cancelar"&&it.isShown}.performClick();layout(v,390,844)
        all(v).filterIsInstance<Button>().first{it.text=="Selecionar"&&it.isShown}.performClick();layout(v,390,844)
        all(v).filterIsInstance<android.widget.CheckBox>().first().performClick();all(v).filterIsInstance<Button>().first{it.text=="Encerrar"&&it.isShown}.performClick();assertEquals(setOf(1L),events.bulkIds)
    }
    @Test fun olderHistoryCanContinuePastTheLocalCacheLimit(){
        val a=activity;a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){6},"AES"));val auth=NativeAuth("88999990000","session","Pablo");store.saveAuth(auth);store.putConversation(auth,conv())
        store.putMessages(auth,1,org.json.JSONArray((1001L..2000L).map{msg(it)}));var query=""
        val api=object:NativeApi(){override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{query=path;return JSONObject().put("ok",true).put("temMais",true).put("mensagens",org.json.JSONArray((901L..1000L).map{msg(it)}))}}
        val page=NativeRepository(a,store,api).older(1,msg(1001));assertEquals(100,page.size);assertEquals(901L,page.first().getLong("id"));assertTrue(query.contains("antesId=1001"));assertEquals(1000,store.messages(1).size);store.close()
    }
    @Test fun synchronizationWhileHoldingDoesNotCancelSelection(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","session","Pablo");a.getSharedPreferences("mensagens-visual",0).edit().putString("visual_"+auth.owner,"continua").commit();val c=conv()
        v.render(auth,true,listOf(c),0,emptyList(),emptyList(),true,"Atualizado");layout(v,390,844)
        val list=all(v).filterIsInstance<android.widget.ListView>().first();val now=android.os.SystemClock.uptimeMillis()
        list.dispatchTouchEvent(android.view.MotionEvent.obtain(now,now,android.view.MotionEvent.ACTION_DOWN,100f,20f,0))
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(200))
        v.render(auth,true,listOf(JSONObject(c.toString()).put("previa","Nova mensagem durante o gesto")),0,emptyList(),emptyList(),true,"Sincronizando…")
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(600))
        list.dispatchTouchEvent(android.view.MotionEvent.obtain(now,android.os.SystemClock.uptimeMillis(),android.view.MotionEvent.ACTION_UP,100f,20f,0));layout(v,390,844)
        assertEquals(0L,events.selected);assertTrue(all(v).filterIsInstance<android.widget.CheckBox>().any{it.isChecked});all(v).filterIsInstance<Button>().first{it.text=="Encerrar"&&it.isShown}.performClick();assertEquals(setOf(1L),events.bulkIds)
    }
    @Test fun incomingMessagesOfferAnExplicitWayToReturnToTheEnd(){
        val a=activity;val v=InboxView(a,Events());a.setContentView(v);val auth=NativeAuth("88999990000","session","Pablo")
        v.render(auth,true,listOf(conv()),1,(1L..30L).map{msg(it)},emptyList(),true,"Atualizado");layout(v,390,844);org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
        all(v).filterIsInstance<android.widget.ScrollView>().first().scrollTo(0,0)
        v.render(auth,true,listOf(conv()),1,(1L..31L).map{msg(it)},emptyList(),true,"Atualizado");layout(v,390,844)
        val jump=all(v).filterIsInstance<Button>().first{it.text=="1 nova mensagem ↓"};assertTrue(jump.isShown);jump.performClick();assertEquals(View.GONE,jump.visibility)
    }
    @Test fun relationshipIsCompactAndDetailsDoNotOpenOrSendConversation(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v);val auth=NativeAuth("88999990000","session","Pablo")
        val r=JSONObject("""{"pontos":35,"base":50,"totalEventos":15,"calculadoEm":"2026-11-01T10:00:00Z","historico":[{"motivo":"sem_resposta","total":15}],"motivos":[{"motivo":"sem_resposta","ocorrencias":15,"eventos":5,"pontos":-15,"validadeDias":14}]}""")
        val c=conv().put("relacionamento",r)
        for(w in listOf(320,390,412,1440)){
            v.render(auth,true,listOf(c),0,emptyList(),emptyList(),true,"Atualizado");layout(v,w,844)
            assertTrue(all(v).filterIsInstance<android.widget.TextView>().any{it.text=="Hist. 35"});snapshot(v,"relacionamento-lista-$w",w,844)
            v.render(auth,true,listOf(c),1,listOf(msg()),emptyList(),true,"Atualizado");layout(v,w,844)
            val badge=all(v).filterIsInstance<Button>().first{it.contentDescription=="Ver histórico de relacionamento"};assertEquals(v.dp(48),badge.height);assertEquals(v.dp(76),badge.width);badge.performClick()
            val d=org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog();assertTrue(d.isShowing);val texts=all(d.window!!.decorView).filterIsInstance<android.widget.TextView>();assertTrue(texts.any{it.text.contains("15 vezes")});assertEquals(0L,events.selected);d.dismiss();snapshot(v,"relacionamento-conversa-$w",w,844)
        }
        v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),true,"Atualizado");layout(v,390,844);all(v).filterIsInstance<Button>().first{it.contentDescription=="Ver histórico de relacionamento"}.performClick();assertTrue(all(org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog().window!!.decorView).filterIsInstance<android.widget.TextView>().any{it.text.contains("ainda não disponível")})
    }
    private fun snapshot(v:View,name:String,w:Int,h:Int){
        val bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);v.draw(Canvas(bitmap))
        val out=File("build/reports/native-ui/$name.png");out.parentFile!!.mkdirs();out.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    }
}
