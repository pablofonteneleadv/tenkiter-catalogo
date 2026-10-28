package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ListView
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowAlertDialog
import javax.crypto.spec.SecretKeySpec

@RunWith(org.robolectric.RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class,qualifiers="w390dp-h844dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
class NativeToolsTest {
    private fun all(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{all(v.getChildAt(it))}else emptyList()
    private fun waitFor(test:()->Boolean){val until=System.currentTimeMillis()+5000;while(System.currentTimeMillis()<until){Shadows.shadowOf(Looper.getMainLooper()).idle();if(test())return;Thread.sleep(15)};fail("A interface não respondeu no tempo do teste")}
    private fun dialog(title:String):AlertDialog {waitFor{ShadowAlertDialog.getLatestAlertDialog()?.let{it.isShowing&&Shadows.shadowOf(it).title.toString()==title}==true};return ShadowAlertDialog.getLatestAlertDialog()}
    private fun click(d:AlertDialog,n:Int){d.listView.performItemClick(d.listView.adapter.getView(n,null,d.listView),n,n.toLong());Shadows.shadowOf(Looper.getMainLooper()).idle()}
    private fun snapshot(d:AlertDialog,name:String,height:Int=720){
        val v=d.window!!.decorView;repeat(2){v.measure(View.MeasureSpec.makeMeasureSpec(390,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,if(name.startsWith("products"))View.MeasureSpec.EXACTLY else View.MeasureSpec.AT_MOST));v.layout(0,0,v.measuredWidth,v.measuredHeight)}
        val bitmap=android.graphics.Bitmap.createBitmap(v.width,v.height,android.graphics.Bitmap.Config.ARGB_8888);v.draw(android.graphics.Canvas(bitmap))
        val out=java.io.File("build/reports/native-ui/$name.png");out.parentFile!!.mkdirs();out.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    }
    @Test fun linkPreviewUsesOnlyTheFirstLinkAndCatalogMetadata(){
        assertFalse(LinkPreview.fields("Olá",emptyList()).has("previa"))
        val product=JSONObject().put("Codigo","TK-1").put("Nome","Vestido azul").put("Preco","50")
        val card=LinkPreview.fields(BuildConfig.SITE_URL.trimEnd('/')+"/p/TK-1",listOf(product));assertTrue(card.getBoolean("previa"));assertEquals("Vestido azul",card.getString("previaTitulo"));assertTrue(card.getString("previaDescricao").contains("à vista"))
        val selection=LinkPreview.fields(BuildConfig.SITE_URL.trimEnd('/')+"/?sel=A,B",emptyList());assertEquals("2 peças na TENKiTER Modas",selection.getString("previaDescricao"))
        assertFalse(LinkPreview.fields("https://example.invalid/primeiro "+BuildConfig.SITE_URL,emptyList()).has("previaTitulo"))
    }
    @Test fun productsAndQuickRepliesInsertDraftAndOnlySaveAfterExplicitAction(){
        val a=Robolectric.buildActivity(Activity::class.java).setup().get();a.setContentView(android.widget.FrameLayout(a))
        a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){1},"AES"));store.saveAuth(NativeAuth("88999990000","test","Pablo"))
        var config=JSONObject().put("ok",true).put("respostas",JSONArray().put(JSONObject().put("t","Saudação").put("x","Olá, como posso ajudar?")));var writes=0;var sends=0;var draft=""
        val api=object:NativeApi(){
            override fun catalog()=JSONObject().put("produtos",JSONArray().put(JSONObject().put("ID","p1").put("Codigo","TK-0001").put("Nome","Vestido azul feminino adulto de tecido leve com caimento solto").put("Preco","59.90").put("Tamanhos","Etiqueta M, Veste 36, Veste 38, Veste 40, Veste 42").put("Status","ativo")))
            override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{
                if(path=="/msg/enviar")sends++
                if(path=="/msg/config"&&body!=null){writes++;config=JSONObject(config.toString()).put("respostas",body.getJSONArray("respostas"))}
                return config
            }
        }
        val repo=NativeRepository(a,store,api);val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
        val tools=NativeTools(a,scope,repo,{1},{true},{draft=it},{},{},{},{_,_->})
        tools.show(1,"produtos");val products=dialog("Produtos · selecionar peças")
        snapshot(products,"products-native")
        all(products.window!!.decorView).filterIsInstance<EditText>().first().requestFocus();snapshot(products,"products-keyboard-native",480)
        val point=IntArray(2);products.getButton(AlertDialog.BUTTON_POSITIVE).getLocationInWindow(point);assertTrue(point[1]+products.getButton(AlertDialog.BUTTON_POSITIVE).height<=480)
        val list=all(products.window!!.decorView).filterIsInstance<ListView>().first();list.performItemClick(list.adapter.getView(0,null,list),0,0)
        products.getButton(AlertDialog.BUTTON_POSITIVE).performClick();assertTrue(draft.contains("p/TK-0001"));assertTrue(draft.contains("Vestido azul"));assertEquals(0,sends)
        tools.show(1,"respostas");val replies=dialog("Respostas rápidas da equipe");click(replies,0);assertEquals("Olá, como posso ajudar?",draft);assertEquals(0,writes)
        tools.show(1,"respostas");click(dialog("Respostas rápidas da equipe"),1)
        val edit=dialog("Editar resposta da equipe");snapshot(edit,"quick-reply-edit-native");val fields=all(edit.window!!.decorView).filterIsInstance<EditText>();fields[0].setText("Entrega");fields[1].setText("Vamos combinar os detalhes da entrega.")
        assertEquals(0,writes);edit.getButton(AlertDialog.BUTTON_POSITIVE).performClick();waitFor{writes==1};assertEquals(2,config.getJSONArray("respostas").length());assertEquals(0,sends)
        tools.close();scope.cancel();store.close()
    }
    @Test fun sendingRespectsPerChannelLinkPreviewChoiceAndNeverUsesItForAttachments(){
        val a=Robolectric.buildActivity(Activity::class.java).setup().get();a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit();a.getSharedPreferences("link-preview",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){2},"AES"));val auth=NativeAuth("88999990000","test","Pablo");store.saveAuth(auth);store.putConversation(auth,JSONObject().put("id",1).put("canal","whatsapp1"));val sent=mutableListOf<JSONObject>()
        val api=object:NativeApi(){override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{if(path=="/msg/enviar"){sent.add(JSONObject(body.toString()));return JSONObject().put("mensagem",JSONObject().put("id",sent.size).put("enviada_em","2026-10-27T00:00:00Z"))};return JSONObject().put("ok",true).put("config",JSONObject().put("assinatura",false))}}
        val repo=NativeRepository(a,store,api);val link=BuildConfig.SITE_URL.trimEnd('/')+"/?sel=A,B";repo.reply(1,link);assertFalse(sent.last().has("previa"));a.getSharedPreferences("link-preview",0).edit().putBoolean("whatsapp1",true).commit();repo.reply(1,link);assertTrue(sent.last().getBoolean("previa"));repo.reply(1,link,attachment="test",type="imagem");assertFalse(sent.last().has("previa"));store.close()
    }
    @Test fun attachmentKeepsIdempotentKeyAndSyncDoesNotReplayIt(){
        val a=Robolectric.buildActivity(Activity::class.java).setup().get();a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){2},"AES"));val auth=NativeAuth("88999990000","test","Pablo");store.saveAuth(auth)
        val c=JSONObject().put("id",1).put("canal","whatsapp1").put("ultima_em","2026-10-27T00:00:00Z").put("atualizada_em","2026-10-27T00:00:00Z")
        store.putConversation(auth,c);var uploads=0;val sent=mutableListOf<JSONObject>()
        val message=JSONObject().put("id",1).put("tipo","imagem").put("direcao","saida").put("texto","Legenda").put("enviada_em","2026-10-27T00:00:00Z")
        val api=object:NativeApi(){
            override fun upload(a:NativeAuth,bytes:ByteArray,type:String):JSONObject{uploads++;assertEquals("imagem",type);return JSONObject().put("ok",true).put("anexo","out/202610/aaaaaaaaaaaaaaaaaaaaaaaa.jpg")}
            override fun account(body:JSONObject)=JSONObject().put("ok",true).put("usuario",JSONObject().put("permissoes",JSONArray().put("gerir_acessos")))
            override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject=when{
                path=="/msg/config"->JSONObject().put("ok",true).put("config",JSONObject().put("assinatura",false))
                path=="/msg/enviar"->{sent.add(JSONObject(body.toString()));JSONObject().put("ok",true).put("mensagem",message)}
                path.startsWith("/msg/conversas")->JSONObject().put("ok",true).put("conversas",JSONArray().put(c))
                path.startsWith("/msg/mensagens")->JSONObject().put("ok",true).put("conversa",c).put("mensagens",JSONArray().put(message))
                else->JSONObject().put("ok",true)
            }
        }
        val repo=NativeRepository(a,store,api);repo.attachment(1,byteArrayOf(1,2,3),"imagem","Legenda","android-media-test")
        assertEquals(1,uploads);assertEquals(1,sent.size);assertEquals("android-media-test",sent[0].getString("idLocal"));assertTrue(sent[0].getString("anexo").startsWith("out/"));assertEquals("Legenda",sent[0].getString("texto"))
        repo.sync(1);assertEquals(1,uploads);assertEquals(1,sent.size);assertTrue(store.pending(1).isEmpty());store.close()
    }
    @Test fun productStockSearchAndCopyPreserveSelectionAcrossQueries(){
        val a=Robolectric.buildActivity(Activity::class.java).setup().get();a.setContentView(android.widget.FrameLayout(a));a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){4},"AES"));store.saveAuth(NativeAuth("88999990000","test","Pablo"));val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
        val api=object:NativeApi(){override fun catalog()=JSONObject().put("produtos",JSONArray().put(JSONObject().put("ID","a").put("Nome","Vestido viscose azul").put("Codigo","TK1").put("Estoque",2)).put(JSONObject().put("ID","b").put("Nome","Vestido viscose verde").put("Codigo","TK2").put("Estoque",0)))}
        val tools=NativeTools(a,scope,NativeRepository(a,store,api),{1},{true},{},{},{},{},{_,_->});tools.show(1,"produtos");val d=dialog("Produtos · selecionar peças")
        val list=all(d.window!!.decorView).filterIsInstance<ListView>().first();assertEquals(1,list.adapter.count);list.performItemClick(list.adapter.getView(0,null,list),0,0)
        all(d.window!!.decorView).filterIsInstance<android.widget.CheckBox>().first{it.text=="Só com estoque"}.performClick();assertEquals(2,list.adapter.count)
        all(d.window!!.decorView).filterIsInstance<EditText>().first().setText("víscose verde");assertEquals(1,list.adapter.count);list.performItemClick(list.adapter.getView(0,null,list),0,0)
        all(d.window!!.decorView).filterIsInstance<android.widget.Button>().first{it.text=="Copiar seleção"}.performClick()
        val clip=(a.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).primaryClip!!.getItemAt(0).text.toString();assertTrue(clip.endsWith("?sel=TK1,TK2"))
        all(d.window!!.decorView).filterIsInstance<android.widget.Button>().first{it.text=="Limpar seleção"}.performClick();assertFalse(list.isItemChecked(0));tools.close();scope.cancel();store.close()
    }
    @Test fun nativeProductPricesMatchTheCatalogFixtures(){
        val fixtures=JSONArray(javaClass.classLoader!!.getResourceAsStream("precos-common.json")!!.bufferedReader().readText())
        for(i in 0 until fixtures.length()){val f=fixtures.getJSONObject(i);assertEquals(f.getString("expected"),ProductText.price(JSONObject().put("Preco",f.getDouble("value"))))}
    }
    @Test fun permissionPromptAndDiscardNeverSendAudio(){
        val a=Robolectric.buildActivity(Activity::class.java).setup().get();a.setContentView(android.widget.FrameLayout(a));a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit()
        val store=NativeStore(a,SecretKeySpec(ByteArray(32){3},"AES"));store.saveAuth(NativeAuth("88999990000","test","Pablo"));var calls=0
        val api=object:NativeApi(){override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{calls++;return JSONObject().put("ok",true)}}
        val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main);val tools=NativeTools(a,scope,NativeRepository(a,store,api),{1},{true},{},{},{},{},{_,_->})
        tools.show(1,"anexo");click(dialog("Anexar à conversa"),1);assertEquals(0,calls);tools.audioPermission(false);tools.close();assertEquals(0,calls)
        scope.cancel();store.close()
    }
}
