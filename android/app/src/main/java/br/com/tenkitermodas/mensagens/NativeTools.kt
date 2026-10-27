package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.graphics.BitmapFactory
import android.view.View
import android.widget.*
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Ferramentas do atendimento usam as mesmas rotas e configurações do site. */
class NativeTools(private val activity:Activity,private val scope:CoroutineScope,private val repo:NativeRepository,private val current:()->Long,private val canSend:()->Boolean,private val insert:(String)->Unit,private val refresh:()->Unit,private val open:(Long)->Unit,private val full:(Long)->Unit,private val batchDone:(Set<Long>,String)->Unit){
    private val dialogs=mutableListOf<AlertDialog>()
    private fun builder():AlertDialog.Builder=object:AlertDialog.Builder(activity){
        override fun create():AlertDialog=super.create().also{dialogs.removeAll{d->!d.isShowing};dialogs.add(it)}
        override fun show():AlertDialog=create().also{it.show()}
    }
    fun close(){stopRecording(false);stopPlayback();dialogs.toList().forEach{it.dismiss()};dialogs.clear();pickedConversation=0}
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).toInt()
    private var pickedConversation=0L;private var attachmentBusy=false
    private var player:android.media.MediaPlayer?=null;private var playbackFile:File?=null
    private var recorder:android.media.MediaRecorder?=null;private var recordFile:File?=null;private var recordTarget=0L;private var recordDialog:AlertDialog?=null
    private fun toast(s:String){if(!activity.isFinishing)Toast.makeText(activity,s,Toast.LENGTH_LONG).show()}
    private fun form()=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(8),dp(20),dp(8))}
    private fun field(hint:String,value:String="",lines:Int=1)=EditText(activity).apply{this.hint=hint;contentDescription=hint;setText(value);minHeight=dp(48);minLines=lines;maxLines=if(lines==1)1 else 6;inputType=android.text.InputType.TYPE_CLASS_TEXT or if(lines>1)android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0}
    private fun button(label:String,click:()->Unit)=Button(activity).apply{text=label;isAllCaps=false;minHeight=dp(48);setOnClickListener{click()}}
    private fun <T> work(task:()->T,done:(T)->Unit){
        val stamp=repo.store.stampedAuth();if(stamp.first==null)return
        scope.launch{
            try{val value=withContext(Dispatchers.IO){task()}
                if(!activity.isFinishing&&repo.store.auth()?.owner==stamp.first?.owner&&repo.store.generation==stamp.second)done(value)
            }catch(e:AccessRevoked){if(repo.store.generation==stamp.second&&repo.store.auth()?.owner==stamp.first?.owner){repo.logout();refresh();toast("Entre novamente para continuar.")}}
            catch(e:Exception){toast(if(e is java.io.IOException)"Não foi possível concluir. Confira sua conexão."else e.message?.take(200)?:"Não foi possível concluir. Tente novamente.")}
        }
    }
    fun show(id:Long,action:String){when(action){
        "produtos"->products(id);"respostas"->responses(id);"anexo"->choose(id);"conversa"->conversationMenu(id)
    }}
    private fun conversationMenu(id:Long){
        val c=repo.store.conversation(id);val labels=mutableListOf("Marcar não lida","Encerrar atendimento","Configurar assinatura","Atendimento completo")
        if(c?.optString("encerrada_em")?.isNotBlank()==true)labels[1]="Reabrir atendimento"
        if((c?.optLong("outro_id")?:0)>0)labels.add("Abrir no outro WhatsApp")
        builder().setTitle(c?.optString("nome")?:"Conversa").setItems(labels.toTypedArray()){_,n->when(labels[n]){
            "Marcar não lida"->batch(setOf(id),"nao_lidas")
            "Encerrar atendimento"->batch(setOf(id),"encerrar")
            "Reabrir atendimento"->batch(setOf(id),"reabrir")
            "Configurar assinatura"->signature()
            "Abrir no outro WhatsApp"->open(c!!.optLong("outro_id"))
            else->full(id)
        }}.setNegativeButton("Voltar",null).show()
    }
    fun batch(ids:Set<Long>,action:String){
        if(ids.isEmpty())return
        fun execute(reason:String="concluido"){work({repo.batch(ids,action,reason)}){batchDone(ids,action);refresh();toast("Alteração salva para ${ids.size} conversa(s).")}}
        if(action=="encerrar"){
            val reasons=listOf("Concluído" to "concluido","Vendeu" to "vendeu","Cliente parou de responder" to "sem_resposta","Engano ou spam" to "engano")
            // IDs vêm do contrato do Worker, também usado no painel web.
            builder().setTitle("Encerrar ${ids.size} atendimento(s)").setItems(reasons.map{it.first}.toTypedArray()){_,i->execute(reasons[i].second)}.setNegativeButton("Cancelar",null).show()
        }else builder().setTitle(when(action){"lidas"->"Marcar como lidas?";"nao_lidas"->"Marcar como não lidas?";else->"Reabrir atendimentos?"}).setMessage("Aplicar a ${ids.size} conversa(s).")
            .setPositiveButton("Confirmar"){_,_->execute()}.setNegativeButton("Cancelar",null).show()
    }
    private fun products(id:Long){
        toast("Buscando catálogo…")
        work({repo.catalog()}){products->
            if(current()!=id)return@work
            val box=form();val search=field("Buscar peça, código ou tamanho");box.addView(search)
            val list=ListView(activity).apply{choiceMode=ListView.CHOICE_MODE_MULTIPLE}
            box.addView(list,LinearLayout.LayoutParams(-1,dp(minOf(320,maxOf(80,products.size*64)))))
            val selected=linkedMapOf<String,JSONObject>();var visible=products
            fun draw(){visible=products.filter{(it.optString("Nome")+" "+it.optString("Codigo")+" "+it.optString("Tamanhos")+" "+it.optString("Cores")).contains(search.text.toString(),true)}
                list.adapter=ArrayAdapter(activity,android.R.layout.simple_list_item_multiple_choice,visible.map{it.optString("Nome")+" · "+it.optString("Codigo")+"\n"+ProductText.price(it)+(if(it.optString("Tamanhos").isBlank())""else" · "+it.optString("Tamanhos"))})
                visible.forEachIndexed{i,p->list.setItemChecked(i,selected.containsKey(p.optString("ID")))}
            }
            list.setOnItemClickListener{_,_,pos,_->val p=visible[pos];val key=p.optString("ID");if(list.isItemChecked(pos)){if(selected.size>=60){list.setItemChecked(pos,false);toast("Selecione até 60 peças.")}else selected[key]=p}else selected.remove(key)}
            search.addTextChangedListener(object:android.text.TextWatcher{override fun beforeTextChanged(s:CharSequence?,st:Int,c:Int,a:Int){};override fun onTextChanged(s:CharSequence?,st:Int,b:Int,c:Int){draw()};override fun afterTextChanged(e:android.text.Editable?) {}});draw()
            val d=builder().setTitle("Produtos · selecionar peças").setView(box).setPositiveButton("Colocar na mensagem",null).setNegativeButton("Voltar",null).create()
            d.setOnShowListener{d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{
                if(selected.isEmpty()){toast("Selecione ao menos uma peça.");return@setOnClickListener}
                if(current()!=id||!canSend()){toast("Abra a conversa para responder.");return@setOnClickListener}
                val values=selected.values.toList();val text=if(values.size==1){val p=values.first();listOf(p.optString("Nome"),ProductText.price(p),p.optString("Tamanhos").takeIf{it.isNotBlank()}?.let{"Tamanhos: $it"},p.optString("Cores").takeIf{it.isNotBlank()}?.let{"Cores: $it"},productLink(p)).filterNotNull().joinToString("\n")}
                    else "Olha as peças que separei na TENKiTER Modas (${values.size}):\n"+values.take(12).joinToString("\n"){"• "+it.optString("Nome")+" — "+ProductText.price(it)}+"\n\nVeja fotos, preços e disponibilidade:\n"+BuildConfig.SITE_URL+"?sel="+values.joinToString(","){Uri.encode(it.optString("Codigo").ifBlank{it.optString("ID")})}
                if(repo.store.conversation(id)?.optString("canal")=="instagram"&&text.toByteArray(Charsets.UTF_8).size>900){toast("Selecione menos peças para caber na mensagem do Instagram.");return@setOnClickListener}
                insert(text);d.dismiss()
            }};d.show()
        }
    }
    private fun productLink(p:JSONObject)=BuildConfig.SITE_URL+(if(p.optString("Codigo").isNotBlank())"p/"+Uri.encode(p.optString("Codigo"))else"?id="+Uri.encode(p.optString("ID")))
    private fun responses(id:Long){work({repo.config()}){config->
        if(current()!=id)return@work
        val rows=config.optJSONArray("respostas")?:JSONArray().put(JSONObject().put("t","Catálogo no site").put("x","Veja as peças no nosso catálogo: "+BuildConfig.SITE_URL))
        val labels=(0 until rows.length()).map{rows.getJSONObject(it).optString("t")}.toMutableList().apply{add("＋ Nova resposta");add("Editar ou excluir uma resposta")}
        builder().setTitle("Respostas rápidas da equipe").setItems(labels.toTypedArray()){_,i->
            when{ i<rows.length()->if(current()==id&&canSend())insert(rows.getJSONObject(i).optString("x"))
                i==rows.length()->editResponse(id,rows,-1)
                else->if(rows.length()>0)builder().setTitle("Escolha para editar").setItems((0 until rows.length()).map{rows.getJSONObject(it).optString("t")}.toTypedArray()){_,n->editResponse(id,rows,n)}.show()
            }
        }.setNegativeButton("Voltar",null).show()
    }}
    private fun editResponse(id:Long,rows:JSONArray,index:Int){
        if(index<0&&rows.length()>=30){toast("Limite de 30 respostas. Edite ou remova uma existente.");return}
        val row=rows.optJSONObject(index);val box=form();val title=field("Título",row?.optString("t")?:"");val text=field("Texto da resposta",row?.optString("x")?:"",3);box.addView(title);box.addView(text)
        val builder=builder().setTitle("Editar resposta da equipe").setView(box).setPositiveButton("Salvar",null).setNegativeButton("Cancelar",null)
        if(index>=0)builder.setNeutralButton("Excluir"){_,_->builder().setTitle("Excluir resposta da equipe?").setPositiveButton("Excluir"){_,_->val out=JSONArray();for(i in 0 until rows.length())if(i!=index)out.put(rows.getJSONObject(i));saveResponses(id,out)}.setNegativeButton("Cancelar",null).show()}
        val d=builder.create();d.setOnShowListener{d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{
            if(title.text.isBlank()||text.text.isBlank()||title.length()>40||text.length()>1000){toast("Preencha título (até 40 letras) e texto (até 1000).");return@setOnClickListener}
            val out=JSONArray(rows.toString());val value=JSONObject().put("t",title.text.toString()).put("x",text.text.toString());if(index>=0)out.put(index,value)else out.put(value)
            saveResponses(id,out);d.dismiss()
        }};d.show()
    }
    private fun saveResponses(id:Long,rows:JSONArray){work({repo.config(JSONObject().put("respostas",rows))}){toast("Respostas salvas para toda a equipe.");if(current()==id)responses(id)}}
    private fun signature(){work({repo.config()}){config->
        val box=form();val name=field("Seu nome nas respostas",config.optString("meuNome"));val enabled=CheckBox(activity).apply{text="Nome do atendente nas respostas (toda a equipe)";minHeight=dp(48);isChecked=config.optJSONObject("config")?.optBoolean("assinatura",true)!=false};box.addView(name);box.addView(enabled)
        builder().setTitle("Assinatura do atendente").setView(box).setPositiveButton("Salvar"){_,_->work({repo.config(JSONObject().put("meuNome",name.text.toString().take(30)).put("assinatura",enabled.isChecked))}){toast("Assinatura salva.")}}.setNegativeButton("Cancelar",null).show()
    }}
    private fun choose(id:Long){
        if(!canSend()||attachmentBusy)return
        builder().setTitle("Anexar à conversa").setItems(arrayOf("Foto, vídeo ou áudio do aparelho","Gravar áudio")){_,i->if(i==0)chooseFile(id)else record(id)}.setNegativeButton("Cancelar",null).show()
    }
    private fun chooseFile(id:Long){
        if(!canSend()||attachmentBusy){toast("Aguarde a conexão e abra a conversa para enviar.");return}
        pickedConversation=id
        try{activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("image/jpeg","image/png","image/webp","video/mp4","audio/*")).addCategory(Intent.CATEGORY_OPENABLE),201)}catch(_:Exception){toast("Não foi possível abrir o seletor de arquivos.")}
    }
    fun picked(uri:Uri){
        val id=pickedConversation;pickedConversation=0
        if(id==0L||id!=current()||!canSend()||uri.scheme!="content")return
        val mime=activity.contentResolver.getType(uri)?:"";val type=when{mime.startsWith("image/")->"imagem";mime.startsWith("video/")->"vídeo";mime.startsWith("audio/")->"áudio";else->{toast("Escolha foto, vídeo ou áudio.");return}}
        work({activity.contentResolver.openInputStream(uri)?.let{AppUpdater.limited(it,if(type=="imagem")8*1048576 else 16*1048576)}?:throw Exception("Não foi possível ler o arquivo.")}){bytes->confirmAttachment(id,bytes,type)}
    }
    private fun confirmAttachment(id:Long,bytes:ByteArray,type:String){
        if(id!=current()||!canSend())return
        val c=repo.store.conversation(id);val instagram=c?.optString("canal")=="instagram";val box=form();val caption=field("Legenda (opcional)","",2)
        box.addView(TextView(activity).apply{text="${c?.optString("nome")} · ${type} · ${bytes.size/1024} KB\nO arquivo só será enviado ao confirmar.";setPadding(0,0,0,dp(8))})
        if(!instagram&&type!="áudio")box.addView(caption)
        var confirmation:AlertDialog?=null
        if(type=="áudio")box.addView(button("Ouvir / parar áudio"){
            if(player!=null){stopPlayback();return@button}
            val generation=repo.store.generation
            scope.launch{
                var file:File?=null
                try{
                    file=withContext(Dispatchers.IO){File(activity.cacheDir,"outgoing/"+UUID.randomUUID()+".audio").apply{parentFile?.mkdirs();writeBytes(bytes)}}
                    if(generation!=repo.store.generation||confirmation?.isShowing!=true){file?.delete();return@launch}
                    playbackFile=file
                    val p=android.media.MediaPlayer();player=p;p.setDataSource(file!!.absolutePath);p.setOnPreparedListener{if(confirmation?.isShowing==true)it.start()else stopPlayback()};p.setOnCompletionListener{stopPlayback()};p.setOnErrorListener{_,_,_->stopPlayback();toast("Não foi possível tocar este áudio.");true};p.prepareAsync()
                }catch(_:Exception){file?.delete();stopPlayback();toast("Não foi possível tocar este áudio.")}
            }
        })
        val d=builder().setTitle("Enviar anexo?").setView(box).setPositiveButton("Enviar",null).setNegativeButton("Cancelar",null).create()
        confirmation=d;d.setOnDismissListener{stopPlayback()}
        d.setOnShowListener{d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{
            if(id!=current()||!canSend()||attachmentBusy){toast("A conversa ou a conexão mudou.");return@setOnClickListener}
            if(caption.length()>900){toast("Use uma legenda de até 900 letras.");return@setOnClickListener}
            attachmentBusy=true;val key="android-"+UUID.randomUUID();d.dismiss();toast("Enviando anexo…")
            scope.launch{try{withContext(Dispatchers.IO){repo.attachment(id,bytes,type,caption.text.toString(),key)};toast("Envio processado. Confira o estado na conversa.")}
                catch(e:AccessRevoked){toast("O envio foi interrompido. Confira seu acesso.")}
                catch(e:Exception){toast(e.message?.take(200)?:"Envio sem confirmação. Confira antes de tentar novamente.")}
                finally{attachmentBusy=false;refresh()}}
        }};d.show()
    }
    private fun record(id:Long){
        if(!canSend()||current()!=id||attachmentBusy)return
        recordTarget=id
        if(activity.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED){activity.requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO),202);return}
        try{
            stopRecording(false);recordTarget=id
            val file=File(activity.cacheDir,"outgoing/"+UUID.randomUUID()+".m4a").apply{parentFile?.mkdirs()};recordFile=file
            @Suppress("DEPRECATION") val r=if(android.os.Build.VERSION.SDK_INT>=31)android.media.MediaRecorder(activity)else android.media.MediaRecorder()
            recorder=r;r.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);r.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);r.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);r.setAudioEncodingBitRate(64000);r.setAudioSamplingRate(44100);r.setOutputFile(file.absolutePath);r.setMaxDuration(120000)
            r.setOnInfoListener{_,what,_->if(what==android.media.MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED)activity.runOnUiThread{stopRecording(true)}}
            r.prepare();r.start()
            val d=builder().setTitle("Gravando áudio").setMessage("Até 2 minutos. Nada será enviado antes de você revisar e confirmar.").setPositiveButton("Parar e revisar"){_,_->stopRecording(true)}.setNegativeButton("Descartar"){_,_->stopRecording(false)}.create()
            recordDialog=d;d.setOnCancelListener{stopRecording(false)};d.show()
        }catch(_:Exception){stopRecording(false);toast("Não foi possível gravar. Confira a permissão do microfone.")}
    }
    fun audioPermission(granted:Boolean){val id=recordTarget;if(granted&&id>0)record(id)else{recordTarget=0;toast("O microfone só é usado para gravar o áudio que você escolher.")}}
    private fun stopPlayback(){player?.run{runCatching{stop()};release()};player=null;playbackFile?.delete();playbackFile=null}
    fun pauseRecording(){stopPlayback();if(recorder!=null){stopRecording(false);toast("Gravação descartada ao sair da tela. Nenhum áudio foi enviado.")}}
    private fun stopRecording(review:Boolean){
        val r=recorder;recorder=null;val file=recordFile;recordFile=null;val id=recordTarget;recordTarget=0
        var good=false
        if(r!=null){try{r.stop();good=true}catch(_:Exception){}finally{r.release()}}
        val dialog=recordDialog;recordDialog=null;dialog?.dismiss()
        if(review&&good&&file!=null&&id==current()&&canSend()){
            work({try{file.inputStream().use{AppUpdater.limited(it,16*1048576)}}finally{file.delete()}}){confirmAttachment(id,it,"áudio")}
        }else file?.delete()
    }
    fun media(id:Long,context:Boolean=false){
        toast("Abrindo anexo…");val generation=repo.store.generation;val owner=repo.store.auth()?.owner?:return
        scope.launch{
            var file:File?=null
            try{
                val data=withContext(Dispatchers.IO){repo.media(id,context)}
                if(activity.isFinishing||generation!=repo.store.generation||owner!=repo.store.auth()?.owner)return@launch
                if(data.second.startsWith("image/")){
                    val bitmap=withContext(Dispatchers.Default){val options=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(data.first,0,data.first.size,options);options.inSampleSize=maxOf(1,maxOf(options.outWidth,options.outHeight)/1600);options.inJustDecodeBounds=false;BitmapFactory.decodeByteArray(data.first,0,data.first.size,options)?:throw Exception("Imagem indisponível.")}
                    if(generation!=repo.store.generation||owner!=repo.store.auth()?.owner){bitmap.recycle();return@launch}
                    val image=ImageView(activity).apply{adjustViewBounds=true;setImageBitmap(bitmap);contentDescription="Imagem recebida"};val d=builder().setTitle("Foto").setView(image).setPositiveButton("Fechar",null).create();d.setOnDismissListener{image.setImageDrawable(null);bitmap.recycle()};d.show()
                }else{
                    val ext=when{data.second.startsWith("audio/")->"audio";data.second.startsWith("video/")->"mp4";data.second=="application/pdf"->"pdf";else->"bin"}
                    val dir=File(activity.cacheDir,"received").apply{mkdirs()};dir.listFiles()?.filter{System.currentTimeMillis()-it.lastModified()>3600000}?.forEach{it.delete()}
                    if((dir.listFiles()?.sumOf{it.length()}?:0)+data.first.size>64*1048576)dir.listFiles()?.forEach{it.delete()}
                    file=File(dir,"${UUID.randomUUID()}.$ext");withContext(Dispatchers.IO){file!!.writeBytes(data.first)}
                    if(generation!=repo.store.generation||owner!=repo.store.auth()?.owner){file?.delete();return@launch}
                    val uri=FileProvider.getUriForFile(activity,activity.packageName+".updates",file!!)
                    activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri,data.second).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"Abrir anexo"))
                }
            }catch(e:AccessRevoked){file?.delete();if(repo.store.generation==generation&&repo.store.auth()?.owner==owner)repo.logout();refresh();toast("Entre novamente para continuar.")}
            catch(_:android.content.ActivityNotFoundException){file?.delete();toast("Não há um aplicativo instalado para abrir este tipo de anexo.")}
            catch(e:Exception){file?.delete();toast(if(e is java.io.IOException)"Não foi possível baixar o anexo. Confira sua conexão."else e.message?.take(200)?:"Não foi possível abrir este anexo.")}
        }
    }
}
