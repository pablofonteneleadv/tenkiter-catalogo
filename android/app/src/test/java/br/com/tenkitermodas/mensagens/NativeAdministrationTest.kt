package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowAlertDialog
import javax.crypto.spec.SecretKeySpec

@RunWith(org.robolectric.RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class,qualifiers="w390dp-h844dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NativeAdministrationTest {
    private fun all(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{all(v.getChildAt(it))}else emptyList()
    private fun waitFor(test:()->Boolean){val until=System.currentTimeMillis()+5000;while(System.currentTimeMillis()<until){Shadows.shadowOf(Looper.getMainLooper()).idle();if(test())return;Thread.sleep(15)};fail("A interface não respondeu")}
    private fun dialog(title:String):AlertDialog{waitFor{ShadowAlertDialog.getLatestAlertDialog()?.let{it.isShowing&&Shadows.shadowOf(it).title.toString()==title}==true};return ShadowAlertDialog.getLatestAlertDialog()}
    private fun button(d:AlertDialog,value:String)=all(d.window!!.decorView).filterIsInstance<Button>().first{it.text==value}
    private class Fake:NativeApi(){
        val writes=java.util.concurrent.CopyOnWriteArrayList<Pair<String,JSONObject>>()
        val reads=java.util.concurrent.CopyOnWriteArrayList<String>()
        var instagramName="";var personGate:java.util.concurrent.CountDownLatch?=null;var personChannel="whatsapp1";var personFail=false;var linked=false;var backup=false;var exportQuery="";var revoked=false
        override fun call(path:String,a:NativeAuth,body:JSONObject?,method:String?):JSONObject{
            if(path.startsWith("/msg/pessoa")&&body==null){personGate?.await(30,java.util.concurrent.TimeUnit.SECONDS);if(personFail)throw java.io.IOException("offline")}
            if(revoked)throw AccessRevoked();if(body!=null){writes.add(path to JSONObject(body.toString()));if(path=="/msg/contatos/config")linked=true}else reads.add(path)
            return when{
                path.startsWith("/msg/pessoa")->JSONObject().put("instagramNome",instagramName).put("ok",true).put("nome","Contato do Google").put("whatsapp","5588989012345").put("segundo","").put("conversa",JSONObject().put("id",1).put("canal",personChannel)).put("canais",JSONArray().put(JSONObject().put("id",1).put("canal","whatsapp1").put("contato","5588989012345").put("nome","Contato do Google")))
                path.startsWith("/msg/conversas")->JSONObject().put("ok",true).put("conversas",JSONArray().put(JSONObject().put("id",2).put("nome","Perfil de teste").put("canal","instagram").put("contato","ig-test")))
                path=="/msg/config"->JSONObject().put("ok",true).put("meuNome","Clarice").put("config",JSONObject().put("assinatura",true).put("lerCelular",JSONObject().put("whatsapp1",true).put("whatsapp2",false).put("instagram",true)))
                path.startsWith("/msg/metricas")->JSONObject().put("ok",true).put("dias",if(path.contains("dias=7"))7 else 30).put("entradas",24).put("saidas",20).put("conversas",5).put("medianaMin",JSONObject.NULL).put("ate5min",70).put("aguardando",JSONObject().put("total",2).put("maisAntigas",JSONArray().put(JSONObject().put("id",1).put("nome","Cliente teste").put("desde","2026-10-27T00:00:00Z")))).put("porHora",JSONArray((0..23).map{JSONObject().put("hora",it).put("entradas",it).put("medianaMin",5)}))
                path.startsWith("/msg/contatos/situacao")->JSONObject().put("ok",true).put("ligada",linked).put("conta","teste@example.invalid").apply{if(backup){put("backup",JSONObject().put("em","2026-10-27T00:00:00Z").put("total",2));put("relatorio",JSONObject().put("total",2))}}
                path=="/msg/contatos/backup"->JSONObject().put("ok",true).put("fim",body?.optString("pagina")=="next").put("proxima",if(body?.optString("pagina")=="next")""else"next").put("pasta","folder-test-123").put("lidos",if(body?.optString("pagina")=="next")2 else 1).put("totalPessoas",2)
                path=="/msg/contatos/relatorio"&&body?.optString("etapa")=="inicio"->JSONObject().put("ok",true)
                path=="/msg/contatos/relatorio"&&body?.optString("etapa")=="parte"->JSONObject().put("ok",true).put("lidos",if(body.optString("pagina")=="next")2 else 1).put("total",2).put("proxima",if(body.optString("pagina")=="next")""else"next")
                path=="/msg/contatos/relatorio"->JSONObject().put("ok",true).put("total",2).put("semFone",1).put("duplicados",JSONObject().put("total",0).put("lista",JSONArray()))
                path=="/msg/resumo"->JSONObject().put("ok",true).put("canais",JSONObject().put("whatsapp1",JSONObject().put("ligadoEm","2026-10-27T00:00:00Z").put("pausado",false)))
                else->JSONObject().put("ok",true)
            }
        }
        override fun export(a:NativeAuth,query:String):Export{if(revoked)throw AccessRevoked();exportQuery=query;return Export("Conversa de demonstração".toByteArray(),"text/plain","conversas.txt",2,false)}
    }
    private class Fixture:AutoCloseable{
        val a=Robolectric.buildActivity(Activity::class.java).setup().get().apply{setContentView(FrameLayout(this))}
        val store:NativeStore
        val fake=Fake();val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main);val repo:NativeRepository;val ui:NativeAdministration
        init{a.deleteDatabase("mensagens-local.db");a.getSharedPreferences("native-auth",0).edit().clear().commit();store=NativeStore(a,SecretKeySpec(ByteArray(32){7},"AES"));store.saveAuth(NativeAuth("88999990000","test-auth","Atendente"));repo=NativeRepository(a,store,fake);ui=NativeAdministration(a,scope,repo,{},{})}
        override fun close(){ui.close();scope.cancel();store.close()}
    }
    @Test fun personEditorOpensOnceImmediatelyAndSavesFieldsWithoutLinkButtons(){Fixture().use{f->
        val gate=java.util.concurrent.CountDownLatch(1);f.fake.personGate=gate
        f.ui.person(1);val d=dialog("Editar contato");repeat(6){f.ui.person(1)}
        assertTrue("active immediately",f.ui.active);assertTrue("loading: "+all(d.window!!.decorView).filterIsInstance<TextView>().map{it.text.toString()},all(d.window!!.decorView).filterIsInstance<TextView>().any{it.text.toString()=="Carregando contato…"})
        gate.countDown();waitFor{all(d.window!!.decorView).filterIsInstance<EditText>().size==4}
        assertSame(d,ShadowAlertDialog.getLatestAlertDialog());waitFor{f.fake.reads.size==1}
        assertFalse(all(d.window!!.decorView).filterIsInstance<Button>().any{it.text.contains("Vincular")})
        val fields=all(d.window!!.decorView).filterIsInstance<EditText>();fields[0].setText("Nome confirmado");fields[3].setText("@cliente.teste")
        snapshot(d,"person-editor",390,780);button(d,"Salvar").performClick();button(d,"Salvar").performClick();waitFor{f.fake.writes.size==1}
        val body=f.fake.writes.single().second;assertEquals("@cliente.teste",body.getString("instagram"));assertFalse(body.has("vincular"));assertEquals("Nome confirmado",body.getString("nome"))
    }}
    @Test fun instagramEditorOnlyHasNameAndOnePhoneAndPreservesHiddenFields(){Fixture().use{f->
        f.fake.personChannel="instagram";f.ui.person(1);val d=dialog("Editar contato");waitFor{all(d.window!!.decorView).filterIsInstance<EditText>().size==2}
        val fields=all(d.window!!.decorView).filterIsInstance<EditText>();fields[1].setText("5588989012346")
        snapshot(d,"person-instagram",390,780);button(d,"Salvar").performClick();waitFor{f.fake.writes.size==1}
        val body=f.fake.writes.single().second;assertFalse(body.has("segundo"));assertFalse(body.has("instagram"));assertFalse(body.has("vincular"));assertEquals("5588989012346",body.getString("whatsapp"))
    }}
    @Test fun closingWhileLoadingDoesNotReopenAndLoadingErrorCanRetry(){Fixture().use{f->
        val gate=java.util.concurrent.CountDownLatch(1);f.fake.personGate=gate;f.ui.person(1);val first=dialog("Editar contato");first.dismiss();gate.countDown();Shadows.shadowOf(Looper.getMainLooper()).idle();assertFalse(first.isShowing)
        f.fake.personGate=null;f.fake.personFail=true;f.ui.person(1);val d=dialog("Editar contato");waitFor{button(d,"Tentar novamente").visibility==View.VISIBLE}
        f.fake.personFail=false;button(d,"Tentar novamente").performClick();waitFor{all(d.window!!.decorView).filterIsInstance<EditText>().size==4};assertSame(d,ShadowAlertDialog.getLatestAlertDialog())
    }}
    @Test fun linkedHistoricalInstagramDisplaysItsNameWithoutInventingAUsername(){Fixture().use{f->
        f.fake.instagramName="Perfil já associado";f.ui.person(1);val d=dialog("Editar contato");waitFor{all(d.window!!.decorView).filterIsInstance<EditText>().size==4}
        assertEquals("Perfil já associado",all(d.window!!.decorView).filterIsInstance<EditText>()[3].text.toString())
        button(d,"Salvar").performClick();waitFor{f.fake.writes.size==1};assertFalse(f.fake.writes.single().second.has("instagram"))
    }}
    @Test fun contactSaveRemainsReachableWithSmallHeightAndLargeText(){Fixture().use{f->
        for(channel in listOf("whatsapp1","instagram"))for((w,h)in listOf(320 to 480,390 to 844,412 to 915,1440 to 900)){
            f.fake.personChannel=channel;f.ui.person(1);val d=dialog("Editar contato");waitFor{all(d.window!!.decorView).filterIsInstance<EditText>().isNotEmpty()}
            all(d.window!!.decorView).filterIsInstance<EditText>().first().setText("Contato com nome muito longo para conferir edição e acesso ao botão de salvar")
            all(d.window!!.decorView).filterIsInstance<TextView>().forEach{it.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX,it.textSize*1.3f)}
            snapshot(d,"contact-$channel-$w",w,h,bottom=true)
            val save=button(d,"Salvar");val pos=IntArray(2);save.getLocationInWindow(pos)
            assertTrue(save.height>=48);assertTrue("save visible at $w/$h",pos[1]>=0&&pos[1]+save.height<=h)
            assertTrue(save.requestFocus());f.ui.close()
        }
    }}
    @Test fun settingsSaveTheSameChannelAndSignatureConfigurationOnlyOnSave(){Fixture().use{f->
        f.ui.settings();val d=dialog("Leitura e assinatura");assertTrue(f.fake.writes.isEmpty())
        val check=all(d.window!!.decorView).filterIsInstance<CheckBox>().first{it.text.startsWith("WhatsApp 2")};assertFalse(check.isChecked);check.performClick()
        button(d,"Salvar configurações").performClick();waitFor{f.fake.writes.size==1}
        val write=f.fake.writes.single();assertEquals("/msg/config",write.first);assertTrue(write.second.getJSONObject("lerCelular").getBoolean("whatsapp2"));assertEquals("Clarice",write.second.getString("meuNome"));assertTrue(write.second.getBoolean("assinatura"))
    }}
    @Test fun dashboardReadsActualMetricsAndLetsTheUserChangePeriod(){Fixture().use{f->
        f.ui.dashboard("whatsapp2");val d=dialog("Painel de atendimento");assertTrue(all(d.window!!.decorView).filterIsInstance<TextView>().any{it.text.toString()=="Esperando resposta agora: 2"});assertTrue(f.fake.writes.isEmpty())
        snapshot(d,"dashboard-native",390,780);snapshot(d,"dashboard-hours-native",390,780,bottom=true);button(d,"7 dias").performClick();waitFor{f.fake.reads.any{it.contains("canal=whatsapp2")&&it.contains("dias=7")}};dialog("Painel de atendimento")
    }}
    @Test fun copyConversationUsesAuthenticatedExportAndNeverCopiesSession(){Fixture().use{f->
        f.ui.copyConversation(42);waitFor{f.fake.exportQuery.isNotBlank()};waitFor{(f.a.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).hasPrimaryClip()}
        val clip=(f.a.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).primaryClip!!.getItemAt(0).text.toString()
        assertEquals("Conversa de demonstração",clip);assertFalse(clip.contains("test-auth"));assertEquals("formato=txt&conversa=42",f.fake.exportQuery)
    }}
    @Test fun exportFormValidatesDatesAndSharesOnlyAFileUri(){Fixture().use{f->
        f.ui.exportForm(42);val d=dialog("Exportar conversas");snapshot(d,"export-native",390,700)
        val fields=all(d.window!!.decorView).filterIsInstance<EditText>();fields[0].setText("2026-02-31");button(d,"Gerar e salvar/compartilhar").performClick();assertTrue(f.fake.exportQuery.isBlank())
        fields[0].setText("2026-10-01");fields[1].setText("2026-10-27");button(d,"Gerar e salvar/compartilhar").performClick()
        waitFor{Shadows.shadowOf(f.a).peekNextStartedActivity()!=null};val chooser=Shadows.shadowOf(f.a).nextStartedActivity
        @Suppress("DEPRECATION") val intent=chooser.getParcelableExtra<android.content.Intent>(android.content.Intent.EXTRA_INTENT)!!
        assertEquals(android.content.Intent.ACTION_SEND,intent.action)
        @Suppress("DEPRECATION") val uri=intent.getParcelableExtra<android.net.Uri>(android.content.Intent.EXTRA_STREAM)!!
        assertEquals("content",uri.scheme);assertTrue(uri.path!!.contains("/exports/"));assertFalse(uri.toString().contains("test-auth"));assertTrue(f.fake.exportQuery.contains("conversa=42"));assertTrue(f.fake.exportQuery.contains("de=2026-10-01"))
    }}
    @Test fun contactsReportStaysReadOnlyAndRequiresAnExplicitConfirmation(){Fixture().use{f->
        f.fake.linked=true;f.fake.backup=true;f.ui.contacts();val d=dialog("Google Contatos");assertTrue(f.fake.writes.isEmpty());snapshot(d,"contacts-native",390,780)
        button(d,"Gerar relatório da limpeza").performClick();val confirm=dialog("Gerar relatório?");assertTrue(f.fake.writes.isEmpty());confirm.getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        dialog("Relatório dos contatos");assertEquals(listOf("inicio","parte","parte","fim"),f.fake.writes.map{it.second.optString("etapa")});assertEquals("next",f.fake.writes[2].second.optString("pagina"));assertFalse(f.fake.writes.any{it.first.contains("config")})
    }}
    @Test fun backupContinuesWithTheExactPageAndFolderUntilFinished(){Fixture().use{f->
        f.fake.linked=true;f.ui.contacts();val d=dialog("Google Contatos");button(d,"Fazer cópia de segurança").performClick();assertTrue(f.fake.writes.isEmpty());dialog("Fazer cópia dos contatos?").getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        waitFor{f.fake.writes.size==2};dialog("Google Contatos")
        val first=f.fake.writes[0].second;val second=f.fake.writes[1].second;assertTrue(first.getBoolean("partes"));assertFalse(first.has("pagina"));assertEquals("next",second.getString("pagina"));assertEquals("folder-test-123",second.getString("pasta"));assertFalse(f.ui.active.not())
    }}
    @Test fun cleanupRequiresConfirmationAndMakesBackupAndReportBeforeMutations(){Fixture().use{f->
        f.fake.linked=true;f.fake.backup=true;f.ui.contacts();button(dialog("Google Contatos"),"Ver último relatório").performClick();val report=dialog("Relatório dos contatos")
        button(report,"Aplicar a limpeza aprovada").performClick();val confirm=dialog("Aplicar limpeza no Google?");assertTrue(f.fake.writes.isEmpty());confirm.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();assertTrue(f.fake.writes.isEmpty())
        button(report,"Aplicar a limpeza aprovada").performClick();dialog("Aplicar limpeza no Google?").getButton(AlertDialog.BUTTON_POSITIVE).performClick();waitFor{f.fake.writes.size==10};dialog("Google Contatos")
        assertEquals(listOf("/msg/contatos/backup","/msg/contatos/backup","/msg/contatos/relatorio","/msg/contatos/relatorio","/msg/contatos/relatorio","/msg/contatos/relatorio","/msg/contatos/limpeza","/msg/contatos/limpeza","/msg/contatos/limpeza","/msg/contatos/limpeza"),f.fake.writes.map{it.first});assertEquals(listOf("juntar","padronizar","criar","fim"),f.fake.writes.takeLast(4).map{it.second.getString("etapa")})
    }}
    @Test fun automaticContactsDoNotChangeUntilSavedAndConfirmed(){Fixture().use{f->
        f.fake.linked=true;f.ui.contacts();val d=dialog("Google Contatos");val check=all(d.window!!.decorView).filterIsInstance<CheckBox>().first{it.text.startsWith("Cadastrar números")};check.performClick();assertTrue(f.fake.writes.isEmpty());button(d,"Salvar cadastro automático").performClick();assertTrue(f.fake.writes.isEmpty());dialog("Alterar cadastro automático?").getButton(AlertDialog.BUTTON_POSITIVE).performClick();waitFor{f.fake.writes.size==1};assertEquals("/msg/contatos/auto",f.fake.writes.single().first);assertTrue(f.fake.writes.single().second.getBoolean("ligado"))
    }}
    @Test fun bridgeSetupMasksTheKeyAndDoesNotSaveBeforeTheUserChooses(){Fixture().use{f->
        f.ui.contacts();val d=dialog("Google Contatos");val fields=all(d.window!!.decorView).filterIsInstance<EditText>()
        fields[0].setText("https://script.google.com/macros/s/test-only/exec");fields[1].setText("A".repeat(32));assertNotNull(fields[1].transformationMethod);assertTrue(f.fake.writes.isEmpty())
        button(d,"Ligar ponte").performClick();waitFor{f.fake.writes.size==1};assertEquals("/msg/contatos/config",f.fake.writes.single().first);assertEquals(32,f.fake.writes.single().second.getString("chave").length)
    }}
    @Test fun pauseDoesNotChangeTheServerUntilConfirmed(){Fixture().use{f->
        f.ui.connections();val d=dialog("Conexões e gravação");button(d,"Pausar gravação").performClick();val confirm=dialog("Alterar recebimento?");assertTrue(f.fake.writes.isEmpty());confirm.getButton(AlertDialog.BUTTON_POSITIVE).performClick();waitFor{f.fake.writes.size==1};val call=f.fake.writes.single();assertEquals("/msg/pausar",call.first);assertEquals("whatsapp1",call.second.getString("canal"));assertTrue(call.second.getBoolean("pausar"))
    }}
    @Test fun revokedExportDoesNotShareOrCopyData(){Fixture().use{f->
        f.fake.revoked=true;f.ui.copyConversation(42);waitFor{f.store.auth()==null};assertNull(Shadows.shadowOf(f.a).peekNextStartedActivity());assertFalse((f.a.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).hasPrimaryClip())
    }}
    @Test fun exportAndSettingsRemainReachableAtMobileAndDesktopWidths(){Fixture().use{f->
        for((w,h)in listOf(320 to 480,390 to 780,412 to 820,1440 to 900)){
            f.ui.exportForm();val d=dialog("Exportar conversas");snapshot(d,"export-$w",w,h)
            val button=button(d,"Gerar e salvar/compartilhar");assertTrue(button.height>=48);val point=IntArray(2);button.getLocationInWindow(point);assertTrue(point[1]+button.height<=h);f.ui.close()
        }
        f.ui.settings();val settings=dialog("Leitura e assinatura");snapshot(settings,"settings-native",390,780)
    }}
    private fun snapshot(d:AlertDialog,name:String,w:Int,h:Int,bottom:Boolean=false){
        val v=d.window!!.decorView;v.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.AT_MOST));v.layout(0,0,v.measuredWidth,v.measuredHeight)
        if(bottom)all(v).filterIsInstance<ScrollView>().forEach{it.scrollTo(0,it.getChildAt(0).height)}
        val bitmap=android.graphics.Bitmap.createBitmap(v.width,v.height,android.graphics.Bitmap.Config.ARGB_8888);v.draw(android.graphics.Canvas(bitmap));val f=java.io.File("build/reports/native-ui/$name.png");f.parentFile!!.mkdirs();f.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    }
}
