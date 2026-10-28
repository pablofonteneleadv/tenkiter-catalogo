package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.*
import org.json.JSONObject

/** UI nativa: o banco local é a primeira fonte; a rede só altera os dados depois. */
class InboxView(private val activity:Activity,private val events:Events):LinearLayout(activity){
    interface Events {
        fun login(identifier:String,password:String)
        fun sync()
        fun select(id:Long)
        fun back()
        fun send(id:Long,text:String):Boolean
        fun retry(id:Long,key:String,text:String)
        fun full(id:Long)
        fun update()
        fun menu(anchor:View)
        fun peek(id:Long) {}
        fun bulk(ids:Set<Long>,action:String) {}
        fun tool(id:Long,action:String) {}
        fun older(id:Long) {}
        fun media(id:Long) {}
        fun context(id:Long) {}
        fun preview(id:Long,context:Boolean,target:ImageView) {}
        fun discard(key:String) {}
        fun search(query:String,closed:Boolean) {}
    }
    private val ink=Color.rgb(20,20,18);private val orange=Color.rgb(168,82,0);private val cream=Color.rgb(245,241,232)
    private lateinit var appBar:LinearLayout
    private val body=LinearLayout(activity).apply{orientation=VERTICAL}
    private val info=TextView(activity)
    private var lastOwner="";private var auth:NativeAuth?=null
    private var chats=emptyList<JSONObject>();private var focus=0L;private var messages=emptyList<JSONObject>();private var pending=emptyList<JSONObject>()
    private var online=false;private var query="";private var channel="Todos";private var list:ListView?=null
    private var unreadOnly=false;private var mode="Todas";private var includeMessages=true;private var includeGroups=false;private var peeking=false
    private val selected=mutableSetOf<Long>();private var selecting=false;private var selectionBar:LinearLayout?=null;private var selectionLabel:Button?=null;private var closeSelection:Button?=null
    private var serverMatches:Set<Long>?=null;private val filterButtons=mutableListOf<Pair<Button,String>>();private val filterStrips=mutableListOf<View>()
    private var prependHeight:Int?=null;private var chatScroll:ScrollView?=null;private var restoreScroll:Int?=null;
    private var chatInput:EditText?=null;private var loginPassword:EditText?=null
    private val drafts=mutableMapOf<Long,String>()
    private var listDataKey=0;private var listTouching=false;private var deferList=false;private var newBelow=0
    private var viewKey="";private var loginBusy=false
    init{
        orientation=VERTICAL;setBackgroundColor(Color.WHITE)
        val bar=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),0,dp(4),0);setBackgroundColor(Color.rgb(16,16,14))}
        bar.addView(text("Conversas",20,true,Color.rgb(230,126,34)),LayoutParams(0,dp(52),1f))
        bar.addView(button("Atualizar app"){events.update()}.apply{setTextColor(Color.WHITE);background=rounded(Color.TRANSPARENT,0)},LayoutParams(-2,dp(48)))
        bar.addView(button("⋮"){events.menu(it)}.apply{contentDescription="Opções do aplicativo";setTextColor(Color.WHITE);textSize=24f;background=rounded(Color.TRANSPARENT,0)},LayoutParams(dp(48),dp(48)))
        appBar=bar;addView(bar)
        info.apply{setPadding(dp(12),dp(7),dp(12),dp(7));textSize=12f;setTextColor(Color.rgb(85,73,49));setBackgroundColor(cream);accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
        addView(info,LayoutParams(-1,-2));addView(body,LayoutParams(-1,0,1f))
    }
    fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    private fun rounded(color:Int,r:Int)=GradientDrawable().apply{setColor(color);cornerRadius=dp(r).toFloat()}
    private fun text(t:String,size:Int=15,bold:Boolean=false,color:Int=ink)=TextView(activity).apply{text=t;textSize=size.toFloat();setTextColor(color);if(bold)setTypeface(typeface,Typeface.BOLD);gravity=Gravity.CENTER_VERTICAL}
    private fun button(label:String,click:(View)->Unit)=Button(activity).apply{text=label;isAllCaps=false;textSize=14f;minimumHeight=dp(48);minWidth=0;setPadding(dp(12),0,dp(12),0);setTextColor(ink);background=rounded(cream,20);stateListAnimator=null;setOnClickListener{click(it)}}
    fun searchResults(ids:Set<Long>?){serverMatches=ids;if(focus==0L)refreshList()}
    fun insert(text:String){chatInput?.let{val old=it.text.toString();it.setText(if(old.isBlank())text else old.trimEnd()+"\n\n"+text);it.requestFocus();it.setSelection(it.length())}}
    fun status(t:String){info.text=(t.ifBlank{"Suas conversas neste aparelho"})+" · v"+BuildConfig.VERSION_NAME}
    fun loginState(busy:Boolean){loginBusy=busy;loginPassword?.isEnabled=!busy;body.findViewWithTag<Button>("login")?.isEnabled=!busy}
    fun reset(){drafts.clear();selected.clear();selecting=false;serverMatches=null;newBelow=0;listDataKey=0;lastOwner="";auth=null;focus=0;viewKey="";chatInput=null;loginPassword=null;body.removeAllViews()}
    fun render(a:NativeAuth?,canRead:Boolean,conversations:List<JSONObject>,id:Long,msgs:List<JSONObject>,outgoing:List<JSONObject>,connected:Boolean,state:String,peek:Boolean=false){
        if(a?.owner!=lastOwner){reset();lastOwner=a?.owner?:""}
        val oldIds=messages.map{it.optLong("id")}.toSet()
        if(id!=focus)newBelow=0
        val prepended=id==focus&&msgs.size>messages.size&&messages.isNotEmpty()&&msgs.firstOrNull()?.optLong("id")!=messages.first().optLong("id")&&msgs.any{it.optLong("id")==messages.first().optLong("id")}
        if(!prepended&&id==focus&&messages.isNotEmpty()&&chatScroll?.let{(it.getChildAt(0)?.height?:0)-it.scrollY-it.height>80}==true)newBelow+=msgs.count{it.optLong("id") !in oldIds}
        prependHeight=if(prepended)chatScroll?.getChildAt(0)?.height else null
        appBar.visibility=if(id>0&&a!=null&&canRead)View.GONE else View.VISIBLE;info.visibility=if(id>0&&connected)View.GONE else View.VISIBLE
        auth=a;peeking=peek;chats=conversations;focus=id;messages=msgs;pending=outgoing;online=connected
        status(state)
        if(a==null||!canRead){if(viewKey!="login"){viewKey="login";showLogin(a!=null)};return}
        val key=if(id>0)"chat:$id:${conversations.firstOrNull{it.optLong("id")==id}?.optString("canal")}:${conversations.firstOrNull{it.optLong("id")==id}?.optString("nome")}:${msgs.joinToString("|"){it.toString()}.hashCode()}:${outgoing.joinToString("|"){it.toString()}.hashCode()}:$connected:$peek:${conversations.firstOrNull{it.optLong("id")==id}?.optBoolean("local_has_more")}" else "list"
        if(viewKey!=key){
            val sameChat=viewKey.startsWith("chat:$id:")
            val keepFocus=chatInput?.hasFocus()==true&&sameChat
            val cursor=chatInput?.selectionStart?:0
            restoreScroll=if(prepended)chatScroll?.scrollY else if(sameChat)chatScroll?.let{if(it.getChildAt(0)!=null&&it.getChildAt(0).height-it.scrollY-it.height>80)it.scrollY else null}else null
            chatInput?.let{drafts[it.tag as? Long?:0L]=it.text.toString()};body.removeAllViews();chatInput=null;loginPassword=null;viewKey=key;if(id>0)showConversation()else showList();if(keepFocus)chatInput?.post{chatInput?.requestFocus();chatInput?.setSelection(cursor.coerceIn(0,chatInput?.text?.length?:0))}}
        else if(id==0L&&listDataKey!=chats.joinToString("|"){it.toString()}.hashCode()){if(listTouching)deferList=true else refreshList()}
    }
    private fun showLogin(expired:Boolean){
        val scroll=ScrollView(activity);val form=LinearLayout(activity).apply{orientation=VERTICAL;setPadding(dp(24),dp(24),dp(24),dp(16))}
        form.addView(text(if(expired)"Confirme seu acesso"else"Entre no atendimento",23,true),LayoutParams(-1,-2))
        form.addView(text(if(expired)"Entre novamente para abrir as conversas salvas."else"Use a mesma conta da TENKiTER.",14),LayoutParams(-1,dp(56)))
        val who=EditText(activity).apply{hint="WhatsApp ou e-mail";inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;setSingleLine();contentDescription=hint;minHeight=dp(52)}
        val pass=EditText(activity).apply{hint="Senha";inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD;setSingleLine();minHeight=dp(52);contentDescription=hint}
        loginPassword=pass
        form.addView(who,LayoutParams(-1,dp(56)));form.addView(pass,LayoutParams(-1,dp(56)))
        form.addView(button("Entrar"){if(who.text.isBlank()||pass.text.isBlank()){status("Preencha sua conta e senha.");return@button};events.login(who.text.toString(),pass.text.toString());pass.text.clear()}.apply{tag="login";setTextColor(Color.WHITE);background=rounded(orange,10)},LayoutParams(-1,dp(52)).apply{topMargin=dp(16)})
        form.addView(button("Entrar ou recuperar acesso pelo site"){events.full(0)},LayoutParams(-1,dp(52)).apply{topMargin=dp(8)})
        scroll.addView(form);body.addView(scroll,LayoutParams(-1,-1));loginState(loginBusy)
    }
    private fun showList(){
        val search=EditText(activity).apply{hint="Buscar nome, número ou mensagem";setSingleLine();textSize=15f;setText(query);contentDescription=hint}
        val searchRow=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(4),dp(8),dp(4))}
        searchRow.addView(search,LayoutParams(0,dp(48),1f))
        searchRow.addView(button("↻"){events.sync()}.apply{contentDescription="Sincronizar conversas";textSize=22f;background=rounded(Color.TRANSPARENT,0)},LayoutParams(dp(48),dp(48)));body.addView(searchRow)
        search.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){query=s.toString();serverMatches=null;refreshList();events.search(query,mode=="Encerradas")};override fun afterTextChanged(e:Editable?) {}})
        filterButtons.clear();filterStrips.clear()
        fun chips(labels:List<String>,click:(String)->Unit){
            val strip=LinearLayout(activity).apply{setPadding(dp(12),dp(2),dp(12),dp(2))}
            labels.forEach{label->val b=button(label){click(label)};b.tag=label;filterButtons.add(b to label);strip.addView(b,LayoutParams(-2,dp(48)).apply{rightMargin=dp(6)})}
            val scroll=HorizontalScrollView(activity).apply{isHorizontalScrollBarEnabled=false;addView(strip)};filterStrips.add(scroll);body.addView(scroll,LayoutParams(-1,dp(52)))
        }
        chips(listOf("Todas","WhatsApp 1","WhatsApp 2","Instagram")){channel=if(it=="Todas")"Todos"else it;refreshList()}
        chips(listOf("Mensagens","Grupos","Não lidas","Falta responder","Encerradas")){label->
            when(label){"Mensagens"->includeMessages=!includeMessages;"Grupos"->includeGroups=!includeGroups;else->{mode=if(mode==label)"Todas"else label;unreadOnly=mode=="Não lidas";serverMatches=null;events.search(query,mode=="Encerradas")}}
            refreshList()
        }
        val actions=LinearLayout(activity).apply{orientation=VERTICAL;minimumHeight=dp(104);setPadding(dp(12),0,dp(12),0);visibility=View.GONE}
        val counts=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL}
        selectionLabel=button("Selecionar visíveis"){val visible=chats.filter(::matches).take(50).map{it.optLong("id")};if(visible.all{it in selected})selected.removeAll(visible.toSet())else selected.addAll(visible.take(50-selected.size));refreshList()}
        counts.addView(selectionLabel,LayoutParams(0,dp(48),1f));counts.addView(button("Cancelar"){selectionDone()},LayoutParams(-2,dp(48)));actions.addView(counts)
        val ops=LinearLayout(activity)
        closeSelection=button("Encerrar"){if(selected.isNotEmpty())events.bulk(selected.toSet(),if(mode=="Encerradas")"reabrir"else"encerrar")}.apply{setTextColor(orange);background=rounded(cream,10)}
        ops.addView(closeSelection,LayoutParams(0,dp(48),1f))
        ops.addView(button("Lidas"){if(selected.isNotEmpty())events.bulk(selected.toSet(),"lidas")},LayoutParams(0,dp(48),1f))
        ops.addView(button("Mais ▾"){anchor->PopupMenu(activity,anchor).apply{
            listOf("Marcar não lidas","Reabrir","Encerrar","Cancelar seleção").forEachIndexed{i,label->menu.add(0,i+1,i,label)}
            setOnMenuItemClickListener{item->if(item.title=="Cancelar seleção"){selectionDone()}else if(selected.isNotEmpty())events.bulk(selected.toSet(),when(item.title){"Marcar não lidas"->"nao_lidas";"Reabrir"->"reabrir";else->"encerrar"});true};show()
        }},LayoutParams(0,dp(48),1f));actions.addView(ops);selectionBar=actions;body.addView(actions)
        val guide=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),0,dp(8),0)}
        guide.addView(text("Pessoas · mais recentes primeiro",12,false,Color.rgb(91,87,80)),LayoutParams(0,-2,1f))
        guide.addView(button("Selecionar"){beginSelection()}.apply{contentDescription="Selecionar conversas para encerrar ou marcar leitura";setTextColor(orange);background=rounded(Color.TRANSPARENT,0)},LayoutParams(-2,dp(48)));body.addView(guide)
        list=object:ListView(activity){override fun dispatchTouchEvent(e:android.view.MotionEvent):Boolean{
            if(e.actionMasked==android.view.MotionEvent.ACTION_DOWN)listTouching=true
            val handled=super.dispatchTouchEvent(e)
            if(e.actionMasked in listOf(android.view.MotionEvent.ACTION_UP,android.view.MotionEvent.ACTION_CANCEL)){listTouching=false;if(deferList){deferList=false;post{refreshList()}}}
            return handled
        }}.apply{setOnItemLongClickListener{_,_,pos,_->selecting=true;toggle((adapter as ChatAdapter).items[pos].optLong("id"));true};dividerHeight=dp(1);adapter=adapter();setOnItemClickListener{_,_,pos,_->val c=(adapter as ChatAdapter).items[pos];if(selecting){toggle(c.optLong("id"))}else events.select(c.optLong("id"))}}
        val empty=text("Nenhuma conversa nesta seleção.\nTroque o filtro ou toque em ↻ para sincronizar.",15).apply{gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24))}
        val frame=FrameLayout(activity);frame.addView(list,FrameLayout.LayoutParams(-1,-1));frame.addView(empty,FrameLayout.LayoutParams(-1,-1));list?.emptyView=empty
        body.addView(frame,LayoutParams(-1,0,1f));refreshList()
    }
    private fun matches(c:JSONObject):Boolean {
        if(query.isBlank()&&mode!="Encerradas"&&(c.optBoolean("local_hidden")||c.optString("encerrada_em").isNotBlank()))return false
        if(!InboxRules.matches(c,mode,if(includeMessages&&includeGroups)"Todos"else if(includeMessages)"Mensagens"else if(includeGroups)"Grupos"else"Nenhum"))return false
        if(!includeMessages&&!includeGroups)return false
        val name=when(c.optString("canal")){"whatsapp1"->"WhatsApp 1";"whatsapp2"->"WhatsApp 2";else->"Instagram"}
        return (!unreadOnly||c.optInt("nao_lidas")>0)&&(channel=="Todos"||channel==name)&&(query.isBlank()||((c.optString("nome")+" "+c.optString("contato")+" "+c.optString("previa")).contains(query,true)||serverMatches?.contains(c.optLong("id"))==true))
    }
    private fun refreshList(){
        filterStrips.forEach{it.visibility=if(selecting)View.GONE else View.VISIBLE}
        selectionBar?.visibility=if(selecting)View.VISIBLE else View.GONE;closeSelection?.text=if(mode=="Encerradas")"Reabrir"else"Encerrar";closeSelection?.isEnabled=selected.isNotEmpty();closeSelection?.setTextColor(if(selected.isEmpty())Color.GRAY else orange);selectionLabel?.text="${selected.size} "+(if(selected.size==1)"selecionada"else"selecionadas")+" · até 50"
        filterButtons.forEach{(b,label)->
            val base=chats.filter{!it.optBoolean("local_hidden")&&it.optString("encerrada_em").isBlank()}
            val picked=when(label){"Todas"->channel=="Todos";"WhatsApp 1","WhatsApp 2","Instagram"->channel==label;"Mensagens"->includeMessages;"Grupos"->includeGroups;else->mode==label}
            val byChannel=base.filter{channel=="Todos"||InboxRules.channel(it)==channel}
            val byType=byChannel.filter{if(InboxRules.group(it))includeGroups else includeMessages}
            val counts=when(label){"Todas"->base;"WhatsApp 1","WhatsApp 2","Instagram"->base.filter{InboxRules.channel(it)==label};else->emptyList()}.filter{if(InboxRules.group(it))includeGroups else includeMessages}
            val count=when(label){"Todas","WhatsApp 1","WhatsApp 2","Instagram"->InboxRules.people(counts);"Mensagens"->InboxRules.people(byChannel.filter{!InboxRules.group(it)});"Grupos"->InboxRules.people(byChannel.filter{InboxRules.group(it)});"Encerradas"->chats.count{it.optString("encerrada_em").isNotBlank()&&(channel=="Todos"||InboxRules.channel(it)==channel)};else->InboxRules.people(byType.filter{InboxRules.matches(it,label,"Todos")})}
            val unread=InboxRules.people(counts.filter{it.optInt("nao_lidas")>0})
            b.text=label+" · $count"+(if(label in listOf("Todas","WhatsApp 1","WhatsApp 2","Instagram"))"\n"+(if(unread==1)"1 não lida"else"$unread não lidas")else"");b.isSelected=picked
            b.setTextColor(if(picked)Color.WHITE else ink);b.background=rounded(if(picked)ink else cream,18)
            b.contentDescription=label+", $count atendimentos salvos"+if(picked)", selecionado"else""
        }
        listDataKey=chats.joinToString("|"){it.toString()}.hashCode()
        val pos=list?.firstVisiblePosition?:0;val offset=list?.getChildAt(0)?.top?:0
        list?.adapter=adapter();list?.setSelectionFromTop(pos,offset)
    }
    private fun timeOf(c:JSONObject):java.time.Instant?=runCatching{java.time.Instant.parse(c.optString("ultima_em"))}.getOrNull()
    private fun clock(c:JSONObject):String{
        val at=timeOf(c)?.atZone(java.time.ZoneId.systemDefault())?:return ""
        val today=java.time.LocalDate.now()
        return when(at.toLocalDate()){
            today->at.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
            today.minusDays(1)->"Ontem"
            else->at.format(java.time.format.DateTimeFormatter.ofPattern(if(at.year==today.year)"dd/MM"else"dd/MM/yy"))
        }
    }
    private fun adapter():ChatAdapter {
        val blocks=InboxRules.blocks(chats.filter(::matches))
        return ChatAdapter(blocks.flatMap{block->block.mapIndexed{i,c->JSONObject(c.toString()).put("_child",i>0).put("_linked",block.size).put("_last",i==block.lastIndex)}})
    }
    private fun toggle(id:Long){if(id in selected)selected.remove(id)else if(selected.size<50)selected.add(id);refreshList()}
    fun channelCode()=when(channel){"WhatsApp 1"->"whatsapp1";"WhatsApp 2"->"whatsapp2";"Instagram"->"instagram";else->""}
    fun beginSelection(){selecting=true;refreshList()}
    fun selectionDone(){selected.clear();selecting=false;refreshList()}
    private inner class ChatAdapter(val items:List<JSONObject>):BaseAdapter(){
        override fun getCount()=items.size;override fun getItem(position:Int)=items[position];override fun getItemId(position:Int)=items[position].optLong("id")
        override fun getView(position:Int,convert:View?,parent:android.view.ViewGroup?):View {
            val c=items[position];val id=c.optLong("id");val unread=c.optInt("nao_lidas");val compact=c.optBoolean("_child")
            fun choose(){if(selecting)toggle(id)else events.select(id)}
            fun hold():Boolean{selecting=true;toggle(id);return true}
            val row=LinearLayout(activity).apply{tag="conversation-$id";setOnClickListener{choose()};setOnLongClickListener{hold()};gravity=Gravity.CENTER_VERTICAL;minimumHeight=dp(if(compact)72 else 104);setPadding(dp(if(compact)40 else 12),dp(8),dp(8),dp(8));background=rounded(if(id in selected)cream else if(compact)Color.rgb(249,247,242)else Color.WHITE,0)}
            if(selecting)row.addView(CheckBox(activity).apply{isChecked=id in selected;contentDescription="Selecionar conversa";setOnClickListener{toggle(id)};setOnLongClickListener{hold()}},LayoutParams(dp(48),dp(48)))
            else if(!compact&&resources.displayMetrics.widthPixels/resources.displayMetrics.density>=360){
                val initials=c.optString("nome",c.optString("contato")).split(' ').filter{it.isNotBlank()}.take(2).joinToString(""){it.take(1)}.uppercase()
                row.addView(text(initials,14,true,Color.WHITE).apply{gravity=Gravity.CENTER;background=rounded(Color.rgb(96,82,35),24);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;setOnClickListener{selecting=true;toggle(id)};setOnLongClickListener{hold()}},LayoutParams(dp(40),dp(40)).apply{rightMargin=dp(10)})
            }
            val content=LinearLayout(activity).apply{orientation=VERTICAL;tag="conversation-content-$id";setOnClickListener{choose()};setOnLongClickListener{hold()};isFocusable=true}
            val top=LinearLayout(activity);val label=if(compact)"↳ "+InboxRules.channel(c)else c.optString("nome").ifBlank{c.optString("contato","Conversa")}
            top.addView(text(label,if(compact)14 else 17,unread>0||InboxRules.waiting(c)).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END},LayoutParams(0,-2,1f))
            top.addView(text(clock(c),11,false,Color.rgb(91,87,80)).apply{setPadding(dp(8),0,0,0)})
            content.addView(top);content.addView(text(InboxRules.preview(c),14,InboxRules.waiting(c),Color.rgb(75,71,65)).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END},LayoutParams(-1,-2))
            content.addView(text(InboxRules.channel(c)+if(InboxRules.group(c))" · Grupo"else" · "+InboxRules.contact(c),11,false,Color.rgb(91,87,80)).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END})
            if(InboxRules.waiting(c))content.addView(text(InboxRules.waitLabel(c),12,true,orange))
            if(!compact&&c.optInt("_linked")>1)content.addView(text("${c.optInt("_linked")} canais vinculados",11,true,orange))
            if(c.optString("encerrada_em").isNotBlank())content.addView(text("Encerrada · "+c.optString("encerrada_motivo"),11))
            row.addView(content,LayoutParams(0,-2,1f))
            if(!selecting){
                val side=LinearLayout(activity).apply{orientation=VERTICAL;gravity=Gravity.CENTER;setPadding(dp(6),0,0,0)}
                if(unread>0)side.addView(text(if(unread==1)"1 não lida"else"$unread não lidas",11,true,Color.rgb(18,104,67)))
                side.setOnLongClickListener{hold()}
                side.addView(button("Espiar"){events.peek(id)}.apply{setOnLongClickListener{hold()};setTextColor(orange);background=rounded(Color.TRANSPARENT,0);contentDescription="Espiar $label sem marcar como lida"},LayoutParams(dp(68),dp(48)))
                row.addView(side)
            }
            row.contentDescription=label+", "+InboxRules.channel(c)+", "+clock(c)+", "+InboxRules.preview(c)+", "+InboxRules.waitLabel(c)
            return row
        }
    }
    private fun showConversation(){
        val c=chats.firstOrNull{it.optLong("id")==focus};val row=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),0,dp(8),0)}
        row.addView(button("←"){events.back()}.apply{contentDescription="Voltar às conversas"},LayoutParams(dp(48),dp(52)))
        row.addView(text(c?.optString("nome")?.ifBlank{c.optString("contato")}?:"Conversa",17,true).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;setOnClickListener{events.tool(focus,"pessoa")};contentDescription="Configurar contato e canais vinculados"},LayoutParams(0,dp(52),1f))
        row.addView(button("⋮"){events.tool(focus,"conversa")}.apply{contentDescription="Opções da conversa";textSize=24f;background=rounded(Color.TRANSPARENT,0)},LayoutParams(dp(48),dp(48)));body.addView(row)
        val detail=LinearLayout(activity).apply{orientation=VERTICAL;setPadding(dp(12),0,dp(12),dp(4))}
        detail.addView(text("Canal atual: "+(c?.let{InboxRules.channel(it)}?:"")+" · "+(c?.let{InboxRules.contact(it)}?:""),12))
        if(peeking)detail.addView(button("Espiando · abrir para responder"){events.select(focus)}.apply{setTextColor(orange);background=rounded(cream,10)},LayoutParams(-1,dp(48)))
        if(c!=null&&!InboxRules.group(c)){
            val linked=chats.filter{it.optLong("id")!=focus&&InboxRules.person(it)==InboxRules.person(c)&&it.optString("encerrada_em").isBlank()}
            if(linked.isNotEmpty()){
                val channels=LinearLayout(activity);linked.forEach{item->channels.addView(button("Abrir conversa no "+InboxRules.channel(item)){events.select(item.optLong("id"))},LayoutParams(-2,dp(48)).apply{rightMargin=dp(6)})}
                detail.addView(HorizontalScrollView(activity).apply{isHorizontalScrollBarEnabled=false;addView(channels)})
            }
        }
        body.addView(detail)
        val scroll=ScrollView(activity).apply{setBackgroundColor(cream);isFillViewport=true}
        val bubbles=LinearLayout(activity).apply{orientation=VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12))}
        if(c?.optBoolean("local_has_more")==true)bubbles.addView(button("Mensagens anteriores"){events.older(focus)},LayoutParams(-1,dp(48)))
        if(messages.isEmpty())bubbles.addView(text("Ainda não há mensagens salvas. Sincronize para buscar esta conversa.",15))
        fun bubble(msg:JSONObject,state:String?=null){
            val outgoing=state!=null||msg.optString("direcao")=="saida"
            val box=LinearLayout(activity).apply{orientation=VERTICAL;background=rounded(if(outgoing)Color.rgb(216,243,227)else Color.WHITE,12);setPadding(dp(12),dp(8),dp(12),dp(8))}
            var value=InboxRules.clean(msg,"texto");val type=msg.optString("tipo","texto");val media=msg.optInt("midia")>0||type in listOf("imagem","vídeo","áudio","video","audio","figurinha","documento")
            if(media)value="[${type}] · toque para abrir o anexo"+(if(value.isBlank())""else"\n$value")
            if(!outgoing&&c!=null&&InboxRules.group(c))box.addView(text(msg.optString("autor_nome").ifBlank{msg.optString("autor_fone","Participante")},12,true,orange))
            if(InboxRules.clean(msg,"ctx_texto").isNotBlank())box.addView(text("Em resposta a: "+InboxRules.clean(msg,"ctx_texto").take(200),12,false,Color.rgb(91,87,80)))
            if(msg.optInt("ctx_midia")==0&&(msg.optString("ctx_tipo")=="story"||msg.optString("ctx_tipo")=="story_reply"))box.addView(button("Ver possíveis status publicados"){events.tool(focus,"stories:"+msg.optLong("id"))},LayoutParams(-1,dp(48)))
            if(msg.optInt("ctx_midia")>0){
                val context=LinearLayout(activity).apply{orientation=VERTICAL;background=rounded(Color.rgb(242,239,231),8);setPadding(dp(8),dp(8),dp(8),dp(8))}
                context.addView(text(if(msg.optInt("ctx_aprox")>0)"Status provável · confirme antes de responder"else"Respondeu ao seu story/status",13,true,orange))
                val image=ImageView(activity).apply{scaleType=ImageView.ScaleType.CENTER_CROP;contentDescription="Prévia do story respondido";setBackgroundColor(Color.rgb(227,222,211));setOnClickListener{events.context(msg.optLong("id"))}}
                context.addView(image,LayoutParams(dp(200),dp(132)));events.preview(msg.optLong("id"),true,image)
                box.addView(context)
            }
            if(media&&type in listOf("imagem","figurinha","vídeo","video")){
                val image=ImageView(activity).apply{scaleType=ImageView.ScaleType.CENTER_CROP;contentDescription=if(type=="imagem")"Foto recebida"else"Abrir vídeo";setBackgroundColor(Color.rgb(227,222,211));setOnClickListener{events.media(msg.optLong("id"))}}
                box.addView(image,LayoutParams(dp(200),dp(180)));events.preview(msg.optLong("id"),false,image)
            }
            if(msg.optInt("ctx_midia")>0)box.addView(button(if(msg.optInt("ctx_aprox")>0)"Ver status provável"else if(msg.optString("ctx_mtipo")=="video")"▶ Ver vídeo do story"else"Ver story respondido"){events.context(msg.optLong("id"))},LayoutParams(-1,dp(48)))
            box.addView(text(value,16).apply{maxWidth=minOf(dp(520),((if(width>0)width else resources.displayMetrics.widthPixels)*.82).toInt()-dp(24));setLineSpacing(dp(2).toFloat(),1f);setTextIsSelectable(!media);if(!media){autoLinkMask=android.text.util.Linkify.WEB_URLS;movementMethod=android.text.method.LinkMovementMethod.getInstance()};if(media)setOnClickListener{events.media(msg.optLong("id"))}})
            val stamp=runCatching{java.time.format.DateTimeFormatter.ofPattern("HH:mm").withZone(java.time.ZoneId.systemDefault()).format(java.time.Instant.parse(msg.optString("enviada_em")))}.getOrDefault("")
            box.addView(text(state?:stamp+if(outgoing&&msg.optString("status").isNotBlank())" · "+when(msg.optString("status")){"incerta"->"Sem confirmação";"enviada"->"Enviada";"entregue"->"Entregue";"lida"->"Lida";else->"Aguardando"}else"",11,false,Color.rgb(84,79,69)))
            if(media)box.setOnClickListener{events.media(msg.optLong("id"))}
            if(state!=null){
                box.addView(button("Conferir conversa"){events.select(focus)})
                box.addView(button("Descartar aviso local"){events.discard(msg.optString("key"))})
                if(state.startsWith("Não enviada:"))box.addView(button("Tentar novamente"){events.retry(focus,msg.optString("key"),msg.optString("texto"))})
            }
            bubbles.addView(box,LayoutParams(-2,-2).apply{gravity=if(outgoing)Gravity.END else Gravity.START;bottomMargin=dp(8)})
        }
        var previousDay=""
        messages.forEach{m->val date=InboxRules.clean(m,"enviada_em").take(10);if(date.isNotBlank()&&date!=previousDay){previousDay=date;val label=when(date){java.time.LocalDate.now().toString()->"Hoje";java.time.LocalDate.now().minusDays(1).toString()->"Ontem";else->runCatching{java.time.LocalDate.parse(date).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))}.getOrDefault(date)};bubbles.addView(text(label,12,false,Color.rgb(91,87,80)).apply{gravity=Gravity.CENTER;setPadding(0,dp(12),0,dp(12))},LayoutParams(-1,-2))};bubble(m)};pending.forEach{bubble(it,it.optString("state"))}
        chatScroll=scroll;scroll.addView(bubbles);body.addView(scroll,LayoutParams(-1,0,1f));val savedScroll=restoreScroll;val beforeHeight=prependHeight;scroll.post{if(beforeHeight!=null)scroll.scrollTo(0,(savedScroll?:0)+bubbles.height-beforeHeight)else if(savedScroll!=null)scroll.scrollTo(0,savedScroll)else scroll.fullScroll(View.FOCUS_DOWN)}
        if(newBelow>0){
            val jump=button(if(newBelow==1)"1 nova mensagem ↓"else"$newBelow novas mensagens ↓"){scroll.fullScroll(View.FOCUS_DOWN);newBelow=0;it.visibility=View.GONE}.apply{setTextColor(Color.WHITE);background=rounded(ink,10)}
            body.addView(jump,LayoutParams(-1,dp(48)));scroll.setOnScrollChangeListener(View.OnScrollChangeListener{_,_,_,_,_->if((scroll.getChildAt(0)?.height?:0)-scroll.scrollY-scroll.height<80){newBelow=0;jump.visibility=View.GONE}})
        }
        if(!peeking){
            val tools=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),0,dp(8),0)}
            listOf("Produtos" to "produtos","Respostas" to "respostas","Anexar" to "anexo").forEach{(label,action)->tools.addView(button(label){events.tool(focus,action)}.apply{isEnabled=online},LayoutParams(0,dp(48),1f))}
            body.addView(tools)
        }
        if(peeking)return
        val compose=LinearLayout(activity).apply{gravity=Gravity.BOTTOM;setPadding(dp(8),dp(6),dp(8),dp(8))}
        val input=EditText(activity).apply{hint=if(online)"Mensagem"else"Mensagem · envie após sincronizar";contentDescription="Mensagem para a conversa";setText(drafts[focus]?:"");minHeight=dp(48);setPadding(dp(16),dp(10),dp(16),dp(10));background=rounded(Color.WHITE,24).apply{setStroke(dp(1),Color.rgb(210,207,199))};maxLines=4;inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;tag=focus}
        input.isEnabled=!peeking;chatInput=input;compose.addView(input,LayoutParams(0,-2,1f))
        val channel=chats.firstOrNull{it.optLong("id")==focus}?.optString("canal").orEmpty()
        val preferences=activity.getSharedPreferences("link-preview",0)
        val preview=CheckBox(activity).apply{text="Mostrar prévia do link (miniatura)";minHeight=dp(48);textSize=14f;isChecked=preferences.getBoolean(channel,false);setOnCheckedChangeListener{_,checked->preferences.edit().putBoolean(channel,checked).apply()}}
        fun updatePreview(){preview.visibility=if(channel.startsWith("whatsapp")&&Regex("https?://[^\\s<>\"']+",RegexOption.IGNORE_CASE).containsMatchIn(input.text))View.VISIBLE else View.GONE}
        input.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){updatePreview()};override fun afterTextChanged(e:Editable?) {}})
        updatePreview();body.addView(preview,LayoutParams(-1,-2))
        compose.addView(ImageButton(activity).apply{setImageResource(android.R.drawable.ic_btn_speak_now);contentDescription="Gravar áudio";background=rounded(cream,24);isEnabled=online;setOnClickListener{events.tool(focus,"gravar")}},LayoutParams(dp(48),dp(48)))
        compose.addView(button("Enviar"){val t=input.text.toString().trim();if(t.isNotBlank()&&online&&!peeking){if(events.send(focus,t)){drafts[focus]="";input.text.clear()}}}.apply{isEnabled=online&&!peeking;setTextColor(if(online)Color.WHITE else Color.GRAY);background=rounded(if(online)orange else cream,24)},LayoutParams(-2,dp(48)));body.addView(compose)
    }
}
