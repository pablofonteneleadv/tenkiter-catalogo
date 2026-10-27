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
        var updates=0;var selected=0L;var sent="";var full=0L;var syncs=0
        override fun login(identifier:String,password:String){};override fun sync(){syncs++};override fun select(id:Long){selected=id};override fun back(){}
        override fun send(id:Long,text:String):Boolean{sent=text;return true};override fun retry(id:Long,key:String,text:String){};override fun full(id:Long){full=id};override fun update(){updates++};override fun menu(anchor:View){}
    }
    private fun all(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{all(v.getChildAt(it))}else emptyList()
    private fun layout(v:View,w:Int,h:Int){v.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));v.layout(0,0,w,h)}
    @Test fun nativeScreensAndControls(){
        val a=activity;val events=Events();val v=InboxView(a,events);a.setContentView(v)
        val auth=NativeAuth("88999990000","fake-session","Pablo")
        for((w,h)in listOf(390 to 844,412 to 915,320 to 700,900 to 900)){
            layout(v,w,h)
            v.render(auth,true,listOf(conv()),0,emptyList(),emptyList(),true,"Atualizado às 05:46")
            layout(v,w,h)
            val update=all(v).filterIsInstance<Button>().first{it.text=="Atualizar app"};assertTrue(update.height>=48);update.performClick()
            assertTrue(all(v).filterIsInstance<android.widget.TextView>().any{it.text=="Mensagens"})
            snapshot(v,"inbox-$w",w,h)
            v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),false,"Sem conexão · mostrando conversas salvas");layout(v,w,h)
            assertFalse(all(v).filterIsInstance<Button>().first{it.text=="Enviar"}.isEnabled)
            assertTrue(all(v).filterIsInstance<android.widget.TextView>().any{it.text.contains("vestido")})
            snapshot(v,"conversation-offline-$w",w,h)
            v.render(auth,true,listOf(conv()),1,listOf(msg()),emptyList(),true,"Atualizado agora");layout(v,w,h)
            val input=all(v).filterIsInstance<EditText>().first{it.hint=="Mensagem"};input.setText("Temos sim!")
            val send=all(v).filterIsInstance<Button>().first{it.text=="Enviar"};assertTrue(send.isEnabled);send.performClick();assertEquals("Temos sim!",events.sent)
            for(b in all(v).filterIsInstance<Button>().filter{it.visibility==View.VISIBLE})assertTrue("Alvo pequeno: "+b.text,b.height>=48)
        }
        assertEquals(4,events.updates)
    }
    @Test fun encryptedAuthAndDatabaseSurviveReopenAndLogout(){
        val c=activity;c.deleteDatabase("mensagens-local.db");c.getSharedPreferences("native-auth",0).edit().clear().commit()
        val key=SecretKeySpec(ByteArray(32){7},"AES");val a=NativeAuth("88999990000","tk-test-secret","Pablo")
        val first=NativeStore(c,key);first.saveAuth(a);first.putConversation(a,conv());first.putMessages(a,1,org.json.JSONArray().put(msg()))
        assertFalse(c.getSharedPreferences("native-auth",0).getString("credential","")!!.contains(a.session))
        first.close();val second=NativeStore(c,key);assertEquals(a,second.auth());assertEquals(1,second.messages(1).size)
        second.logout();assertNull(second.auth());assertTrue(second.messages(1).isEmpty());assertTrue(second.conversations().isEmpty())
        second.saveAuth(a);second.putConversation(a,conv());val old=a
        val next=NativeAuth("88000000000","new-session","Outra conta");second.saveAuth(next);second.putConversation(old,conv(99))
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
        all(v).filterIsInstance<android.widget.TextView>().first{it.text.contains("toque para abrir")}.performClick();assertEquals(1L,events.full)
    }
    private fun snapshot(v:View,name:String,w:Int,h:Int){
        val bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);v.draw(Canvas(bitmap))
        val out=File("build/reports/native-ui/$name.png");out.parentFile!!.mkdirs();out.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    }
}
