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
class NativeTools(private val activity:Activity,private val scope:CoroutineScope,private val repo:NativeRepository,private val current:()->Long,private val canSend:()->Boolean,private val insert:(String)->Unit,private val refresh:()->Unit,private val open:(Long)->Unit,private val full:(Long)->Unit,private val batchDone:(Set<Long>,String)->Unit,private val advanced:(String,Long)->Unit={_,_->}){
    private var productConversation=0L;private val productSelection=linkedMapOf<String,JSONObject>()
    private val thumbs=android.util.LruCache<String,android.graphics.Bitmap>(20)
    private val loadingPhotos=mutableSetOf<String>()
    private val dialogs=mutableListOf<AlertDialog>()
    private fun builder():AlertDialog.Builder=object:AlertDialog.Builder(activity){
        override fun create():AlertDialog=super.create().also{dialogs.removeAll{d->!d.isShowing};dialogs.add(it)}
        override fun show():AlertDialog=create().also{it.show()}
    }
    fun close(){mediaThumbs.evictAll();productSelection.clear();productConversation=0;thumbs.evictAll();stopRecording(false);stopPlayback();dialogs.toList().forEach{it.dismiss()};dialogs.clear();pickedConversation=0}
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).toInt()
    private var pickedConversation=0L;private var attachmentBusy=false
    private var player:android.media.MediaPlayer?=null;private var playbackFile:File?=null
    private var recorder:android.media.MediaRecorder?=null;private var recordFile:File?=null;private var recordTarget=0L;private var recordDialog:AlertDialog?=null
    private fun toast(s:String){if(!activity.isFinishing)Toast.makeText(activity,s,Toast.LENGTH_LONG).show()}
    private fun form()=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(8),dp(20),dp(8))}
    private fun field(hint:String,value:String="",lines:Int=1)=EditText(activity).apply{this.hint=hint;contentDescription=hint;setText(value);minHeight=dp(48);minLines=lines;maxLines=if(lines==1)1 else 6;inputType=android.text.InputType.TYPE_CLASS_TEXT or if(lines>1)android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0}
    private fun button(label:String,click:()->Unit)=Button(activity).apply{text=label;isAllCaps=false;minHeight=dp(48);textSize=14f;setTextColor(android.graphics.Color.rgb(35,31,25));background=android.graphics.drawable.GradientDrawable().apply{setColor(android.graphics.Color.rgb(245,241,232));cornerRadius=dp(20).toFloat()};stateListAnimator=null;if(label=="Colocar na mensagem"){setTextColor(android.graphics.Color.WHITE);background=android.graphics.drawable.GradientDrawable().apply{setColor(android.graphics.Color.rgb(168,82,0));cornerRadius=dp(20).toFloat()}};setOnClickListener{click()}}
    private fun <T> work(task:()->T,done:(T)->Unit){
        val stamp=repo.store.stampedAuth();if(stamp.first==null)return
        scope.launch{
            try{val value=withContext(Dispatchers.IO){task()}
                if(!activity.isFinishing&&repo.store.auth()?.owner==stamp.first?.owner&&repo.store.generation==stamp.second)done(value)
            }catch(e:AccessRevoked){if(repo.store.generation==stamp.second&&repo.store.auth()?.owner==stamp.first?.owner){repo.logout();refresh();toast("Entre novamente para continuar.")}}
            catch(e:Exception){toast(if(e is java.io.IOException)"Não foi possível concluir. Confira sua conexão."else e.message?.take(200)?:"Não foi possível concluir. Tente novamente.")}
        }
    }
    fun show(id:Long,action:String){when{
        action.startsWith("stories:")->stories(id,action.substringAfter(':').toLongOrNull()?:0)
        action=="gravar"->record(id);action=="pessoa"->advanced("pessoa",id);action=="produtos"->products(id);action=="respostas"->responses(id);action=="anexo"->choose(id);action=="conversa"->conversationMenu(id)
    }}
    private fun conversationMenu(id:Long){
        val c=repo.store.conversation(id);val labels=mutableListOf("Contato e canais","Marcar não lida","Encerrar atendimento","Configurar leitura e assinatura","Copiar conversa para IA","Exportar esta conversa")
        if(c?.optString("encerrada_em")?.isNotBlank()==true)labels[1]="Reabrir atendimento"
        if((c?.optLong("outro_id")?:0)>0)labels.add("Abrir no outro WhatsApp")
        builder().setTitle(c?.optString("nome")?:"Conversa").setItems(labels.toTypedArray()){_,n->when(labels[n]){
            "Contato e canais"->advanced("pessoa",id)
            "Marcar não lida"->batch(setOf(id),"nao_lidas")
            "Encerrar atendimento"->batch(setOf(id),"encerrar")
            "Reabrir atendimento"->batch(setOf(id),"reabrir")
            "Configurar leitura e assinatura"->advanced("settings",id)
            "Copiar conversa para IA"->advanced("copy",id)
            "Exportar esta conversa"->advanced("export",id)
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
    private fun thumbnail(view:CheckedTextView,photo:String){
        view.tag=photo;if(photo.isBlank())return
        val generation=repo.store.generation
        fun show(bitmap:android.graphics.Bitmap){
            val ratio=minOf(dp(84).toFloat()/bitmap.width,dp(112).toFloat()/bitmap.height)
            val drawable=android.graphics.drawable.BitmapDrawable(activity.resources,bitmap).apply{setBounds(0,0,(bitmap.width*ratio).toInt(),(bitmap.height*ratio).toInt())}
            view.setCompoundDrawables(drawable,null,null,null);view.compoundDrawablePadding=dp(8)
        }
        thumbs.get(photo)?.let{show(it);return}
        val placeholder=android.graphics.drawable.ColorDrawable(android.graphics.Color.rgb(239,236,229)).apply{setBounds(0,0,dp(84),dp(112))};view.setCompoundDrawables(placeholder,null,null,null);view.compoundDrawablePadding=dp(8)
        if(!loadingPhotos.add(photo))return
        scope.launch{
            try{
                val bytes=withContext(Dispatchers.IO){repo.productPhoto(photo)}?:return@launch
                val image=withContext(Dispatchers.Default){val opt=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,opt);opt.inJustDecodeBounds=false;opt.inSampleSize=1;while(maxOf(opt.outWidth,opt.outHeight)/opt.inSampleSize>320)opt.inSampleSize*=2;BitmapFactory.decodeByteArray(bytes,0,bytes.size,opt)}?:return@launch
                if(repo.store.generation==generation){thumbs.put(photo,image);if(view.tag==photo)show(image)}else image.recycle()
            }finally{loadingPhotos.remove(photo)}
        }
    }
    private class ProductRow(c:android.content.Context,val label:CheckedTextView):LinearLayout(c),android.widget.Checkable{
        override fun setChecked(value:Boolean){label.isChecked=value};override fun isChecked()=label.isChecked;override fun toggle(){label.toggle()}
    }
    private fun productDraft(p:JSONObject)=listOf(p.optString("Nome"),ProductText.price(p),p.optString("Tamanhos").takeIf{it.isNotBlank()}?.let{"Tamanhos: $it"},p.optString("Cores").takeIf{it.isNotBlank()}?.let{"Cores: $it"},productLink(p)).filterNotNull().joinToString("\n")
    private fun products(id:Long){
        toast("Buscando catálogo…")
        work({repo.catalog()}){catalog->
            val products=catalog.sortedByDescending{it.optString("Codigo").substringAfterLast('-').toLongOrNull()?:0L}
            if(current()!=id)return@work
            val box=form();val search=field("Nome, código, cor, tamanho ou categoria");box.addView(search)
            val stocked=CheckBox(activity).apply{text="Só com estoque";minHeight=dp(48);isChecked=true};box.addView(stocked)
            val list=ListView(activity).apply{choiceMode=ListView.CHOICE_MODE_MULTIPLE}
            box.addView(list,LinearLayout.LayoutParams(-1,0,1f))
            if(productConversation!=id){productSelection.clear();productConversation=id}
            val selected=productSelection;selected.keys.retainAll(products.map{it.optString("ID")}.toSet());for(p in products)if(selected.containsKey(p.optString("ID")))selected[p.optString("ID")]=p
            lateinit var productDialog:AlertDialog
            var visible=products
            fun norm(value:String)=java.text.Normalizer.normalize(value,java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"").lowercase(java.util.Locale("pt","BR"))
            fun draw(){
                val terms=norm(search.text.toString()).split(Regex("\\s+")).filter{it.isNotBlank()}
                visible=products.filter{p->val words=norm(listOf("Nome","Codigo","Categoria","Cores","Tamanhos","Genero").joinToString(" "){p.optString(it)})
                    (!stocked.isChecked||p.optString("Estoque").toDoubleOrNull()?.let{it>0}!=false)&&terms.all{words.contains(it)}}
                val labels=visible.map{it.optString("Nome")+"\n"+ProductText.price(it)+" · "+it.optString("Codigo")+"\n"+(if(it.optString("Tamanhos").isBlank())""else" · "+it.optString("Tamanhos"))+(if(it.optString("Estoque").toDoubleOrNull()?.let{x->x<=0}==true)" · Esgotado"else"")}
                list.adapter=object:ArrayAdapter<String>(activity,android.R.layout.simple_list_item_multiple_choice,labels){
                    override fun getView(position:Int,convert:View?,parent:android.view.ViewGroup):View{
                        val p=visible[position];val label=(android.view.LayoutInflater.from(activity).inflate(android.R.layout.simple_list_item_multiple_choice,parent,false) as CheckedTextView).apply{text=android.text.SpannableString(labels[position]).apply{setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD),0,labels[position].indexOf('\n').coerceAtLeast(0),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)};textSize=16f;gravity=android.view.Gravity.CENTER_VERTICAL;minHeight=dp(120);setPadding(dp(8),dp(12),dp(8),dp(12));setTextColor(android.graphics.Color.rgb(30,28,24));isChecked=selected.containsKey(p.optString("ID"))}
                        thumbnail(label,p.optString("Foto_URL"))
                        val row=ProductRow(activity,label).apply{orientation=LinearLayout.VERTICAL;setPadding(0,0,0,dp(12));addView(label,LinearLayout.LayoutParams(-1,-2))}
                        val actions=LinearLayout(activity)
                        actions.addView(button("Colocar na mensagem"){if(current()==id&&canSend()){insert(productDraft(p));selected.clear();productDialog.dismiss()}else toast("Abra a conversa para responder.")},LinearLayout.LayoutParams(0,dp(48),1.4f))
                        actions.addView(button("Copiar link"){(activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("Produto TENKiTER",productLink(p)));toast("Link copiado.")},LinearLayout.LayoutParams(0,dp(48),1f));row.addView(actions)
                        label.setOnClickListener{val key=p.optString("ID");if(selected.containsKey(key))selected.remove(key)else if(selected.size<60)selected[key]=p;list.setItemChecked(position,selected.containsKey(key));label.isChecked=selected.containsKey(key)}
                        return row
                    }
                }
                visible.forEachIndexed{i,p->list.setItemChecked(i,selected.containsKey(p.optString("ID")))}
            }
            val copy=button("Copiar seleção"){};val clear=button("Limpar seleção"){}
            val links=LinearLayout(activity);links.addView(copy,LinearLayout.LayoutParams(0,dp(48),1f));links.addView(clear,LinearLayout.LayoutParams(0,dp(48),1f));box.addView(links)
            clear.setOnClickListener{selected.clear();draw()}
            stocked.setOnCheckedChangeListener{_,_->draw()}
            list.setOnItemClickListener{_,_,pos,_->val p=visible[pos];val key=p.optString("ID");if(list.isItemChecked(pos)){if(selected.size>=60){list.setItemChecked(pos,false);toast("Selecione até 60 peças.")}else selected[key]=p}else selected.remove(key)}
            search.addTextChangedListener(object:android.text.TextWatcher{override fun beforeTextChanged(s:CharSequence?,st:Int,c:Int,a:Int){};override fun onTextChanged(s:CharSequence?,st:Int,b:Int,c:Int){draw()};override fun afterTextChanged(e:android.text.Editable?) {}});draw()
            val d=builder().setTitle("Produtos · selecionar peças").setView(box).setPositiveButton("Colocar na mensagem",null).setNegativeButton("Voltar",null).create()
            productDialog=d
            d.setOnShowListener{
                copy.setOnClickListener{
                    if(selected.isEmpty()){toast("Selecione ao menos uma peça.");return@setOnClickListener}
                    val ps=selected.values.toList();val link=if(ps.size==1)productLink(ps[0])else BuildConfig.SITE_URL+"?sel="+ps.joinToString(","){Uri.encode(it.optString("Codigo").ifBlank{it.optString("ID")})}
                    (activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("Produtos TENKiTER",link));toast("Link copiado.")
                }
                d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{
                if(selected.isEmpty()){toast("Selecione ao menos uma peça.");return@setOnClickListener}
                if(current()!=id||!canSend()){toast("Abra a conversa para responder.");return@setOnClickListener}
                val values=selected.values.toList();val text=if(values.size==1){val p=values.first();listOf(p.optString("Nome"),ProductText.price(p),p.optString("Tamanhos").takeIf{it.isNotBlank()}?.let{"Tamanhos: $it"},p.optString("Cores").takeIf{it.isNotBlank()}?.let{"Cores: $it"},productLink(p)).filterNotNull().joinToString("\n")}
                    else "Olha as peças que separei na TENKiTER Modas (${values.size}):\n"+values.take(12).joinToString("\n"){"• "+it.optString("Nome")+" — "+ProductText.price(it)}+"\n\nVeja fotos, preços e disponibilidade:\n"+BuildConfig.SITE_URL+"?sel="+values.joinToString(","){Uri.encode(it.optString("Codigo").ifBlank{it.optString("ID")})}
                if(repo.store.conversation(id)?.optString("canal")=="instagram"&&text.toByteArray(Charsets.UTF_8).size>900){toast("Selecione menos peças para caber na mensagem do Instagram.");return@setOnClickListener}
                insert(text);selected.clear();d.dismiss()
            }};d.show();d.window?.setLayout(-1,-1);d.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.WHITE));d.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            d.window?.decorView?.addOnLayoutChangeListener{decor,_,_,_,_,_,_,_,_->
                val top=decor.findViewById<View>(activity.resources.getIdentifier("topPanel","id","android"))?.height?:dp(64)
                val bottom=decor.findViewById<View>(activity.resources.getIdentifier("buttonPanel","id","android"))?.height?:dp(52)
                val target=(decor.height-top-bottom-decor.paddingTop-decor.paddingBottom).coerceAtLeast(0)
                if(box.minimumHeight!=target)box.minimumHeight=target
            }
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
    private fun choose(id:Long){
        if(!canSend()||attachmentBusy)return
        builder().setTitle("Anexar à conversa").setItems(arrayOf("Escolher da galeria","Gravar vídeo","Gravar áudio")){_,i->when(i){0->chooseFile(id);1->{pickedConversation=id;try{activity.startActivityForResult(VisualMediaPicker.cameraIntent(activity),201)}catch(_:Exception){pickedConversation=0;toast("Não foi possível abrir a câmera.")}};else->record(id)}}.setNegativeButton("Cancelar",null).show()
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
        work({activity.contentResolver.openInputStream(uri)?.let{AppUpdater.limited(it,if(type=="imagem")8*1048576 else if(type=="vídeo")15_000_000 else 16*1048576)}?:throw Exception("Não foi possível ler o arquivo.")}){bytes->confirmAttachment(id,bytes,type)}
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
    private fun stories(id:Long,message:Long){
        val m=repo.store.messages(id).firstOrNull{it.optLong("id")==message}?:return
        val timestamp=m.optString("enviada_em")
        work({repo.administration("/msg/stories?conversa=$id&em="+Uri.encode(timestamp))}){r->
            val rows=NativeAdministration.array(r,"stories")
            if(rows.isEmpty()){toast("Nenhum story publicado pelo sistema nesse período.");return@work}
            builder().setTitle("Stories nas 26h anteriores").setItems(rows.map{NativeAdministration.stamp(it.optString("publicado_em"))+" · "+it.optString("legenda").take(100)}.toTypedArray()){_,i->media(0,false,rows[i].getLong("id"))}.setNegativeButton("Voltar",null).show()
        }
    }
    private val mediaThumbs=android.util.LruCache<String,android.graphics.Bitmap>(16)
    private val previews=kotlinx.coroutines.sync.Semaphore(2)
    fun preview(id:Long,context:Boolean,target:ImageView){
        val generation=repo.store.generation;val owner=repo.store.auth()?.owner?:return
        val key="$generation:$owner:$id:$context";target.tag=key
        mediaThumbs.get(key)?.let{target.setImageBitmap(it);return}
        fun load(){scope.launch{
            try{
                previews.acquire()
                try{
                    if(generation!=repo.store.generation||target.tag!=key)return@launch
                    val result=withContext(Dispatchers.IO){repo.media(id,context)}
                    val bitmap=withContext(Dispatchers.IO){
                        if(result.second.startsWith("image/")){
                            val o=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(result.first,0,result.first.size,o);o.inSampleSize=1;while(maxOf(o.outWidth,o.outHeight)/o.inSampleSize>480)o.inSampleSize*=2;o.inJustDecodeBounds=false;BitmapFactory.decodeByteArray(result.first,0,result.first.size,o)
                        }else if(result.second.startsWith("video/")){
                            val f=File.createTempFile("preview-",".mp4",activity.cacheDir);val reader=android.media.MediaMetadataRetriever()
                            try{f.writeBytes(result.first);reader.setDataSource(f.absolutePath);val frame=reader.getFrameAtTime(0);frame?.let{val ratio=480f/maxOf(it.width,it.height);if(ratio<1)android.graphics.Bitmap.createScaledBitmap(it,(it.width*ratio).toInt(),(it.height*ratio).toInt(),true).also{_->frame.recycle()}else it}}finally{reader.release();f.delete()}
                        }else null
                    }
                    if(bitmap!=null&&generation==repo.store.generation&&owner==repo.store.auth()?.owner){mediaThumbs.put(key,bitmap);if(target.tag==key)target.setImageBitmap(bitmap)}else bitmap?.recycle()
                }finally{previews.release()}
            }catch(_:Exception){if(target.tag==key)target.contentDescription="Prévia indisponível. Toque para abrir ou tentar novamente."}
        }
        }
        var started=false
        lateinit var listener:android.view.ViewTreeObserver.OnScrollChangedListener
        fun visible(){if(!started&&target.isAttachedToWindow&&target.getGlobalVisibleRect(android.graphics.Rect())){started=true;if(target.viewTreeObserver.isAlive)target.viewTreeObserver.removeOnScrollChangedListener(listener);load()}}
        listener=android.view.ViewTreeObserver.OnScrollChangedListener{visible()}
        target.addOnAttachStateChangeListener(object:View.OnAttachStateChangeListener{
            override fun onViewAttachedToWindow(v:View){v.viewTreeObserver.addOnScrollChangedListener(listener);v.post{visible()}}
            override fun onViewDetachedFromWindow(v:View){if(v.viewTreeObserver.isAlive)v.viewTreeObserver.removeOnScrollChangedListener(listener)}
        });if(target.isAttachedToWindow){target.viewTreeObserver.addOnScrollChangedListener(listener);target.post{visible()}}
    }
    fun media(id:Long,context:Boolean=false,post:Long=0){
        toast("Abrindo anexo…");val generation=repo.store.generation;val owner=repo.store.auth()?.owner?:return
        scope.launch{
            var file:File?=null
            try{
                val data=withContext(Dispatchers.IO){repo.media(id,context,post)}
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
                    if(data.second.startsWith("video/")){
                        val video=VideoView(activity);val controller=MediaController(activity);controller.setAnchorView(video);video.setMediaController(controller)
                        val frame=FrameLayout(activity);frame.addView(video,FrameLayout.LayoutParams(-1,-1,android.view.Gravity.CENTER))
                        val d=builder().setTitle(if(context)"Vídeo do story respondido"else"Vídeo").setView(frame).setPositiveButton("Fechar",null).create()
                        d.setOnDismissListener{video.stopPlayback();file?.delete()};d.show();d.window?.setLayout(-1,(activity.resources.displayMetrics.heightPixels*.85).toInt());video.setVideoURI(uri);video.setOnPreparedListener{controller.show(0)}
                        video.setOnErrorListener{_,_,_->toast("O Android não conseguiu reproduzir este vídeo. Abra em um visualizador compatível.");false}
                    }else activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri,data.second).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"Abrir anexo"))
                }
            }catch(e:AccessRevoked){file?.delete();if(repo.store.generation==generation&&repo.store.auth()?.owner==owner)repo.logout();refresh();toast("Entre novamente para continuar.")}
            catch(_:android.content.ActivityNotFoundException){file?.delete();toast("Não há um aplicativo instalado para abrir este tipo de anexo.")}
            catch(e:Exception){file?.delete();toast(if(e is java.io.IOException)"Não foi possível baixar o anexo. Confira sua conexão."else e.message?.take(200)?:"Não foi possível abrir este anexo.")}
        }
    }
}
