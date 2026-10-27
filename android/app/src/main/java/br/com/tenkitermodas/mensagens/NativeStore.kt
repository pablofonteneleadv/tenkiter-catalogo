package br.com.tenkitermodas.mensagens

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

data class NativeAuth(val owner:String,val session:String,val name:String,val checked:Long=System.currentTimeMillis()) {
    fun json()=JSONObject().put("owner",owner).put("session",session).put("name",name).put("checked",checked)
    companion object { fun read(j:JSONObject)=NativeAuth(j.getString("owner"),j.getString("session"),j.optString("name"),j.optLong("checked")) }
}
class NativeStore(context:Context,private val keyOverride:javax.crypto.SecretKey?=null):SQLiteOpenHelper(context,"mensagens-local.db",null,1) {
    private val mediaDir=java.io.File(context.cacheDir,"received")
    private val outgoingDir=java.io.File(context.cacheDir,"outgoing")
    private val prefs=context.getSharedPreferences("native-auth",Context.MODE_PRIVATE)
    override fun onCreate(db:SQLiteDatabase){
        db.execSQL("CREATE TABLE conv(id INTEGER PRIMARY KEY,data TEXT NOT NULL,updated TEXT NOT NULL)")
        db.execSQL("CREATE TABLE msg(cid INTEGER NOT NULL,id INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(cid,id))")
        db.execSQL("CREATE TABLE pending(k TEXT PRIMARY KEY,cid INTEGER NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL)")
    }
    override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){}
    private fun key():javax.crypto.SecretKey {
        keyOverride?.let{return it}
        val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
        (ks.getKey("tk-native-auth",null) as? javax.crypto.SecretKey)?.let{return it}
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
            init(KeyGenParameterSpec.Builder("tk-native-auth",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Synchronized fun auth():NativeAuth? {return try{
        val saved=prefs.getString("credential",null)?:return null
        val parts=saved.split(':');val c=Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)))
        NativeAuth.read(JSONObject(String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),Charsets.UTF_8)))
    }catch(_:Exception){null}}
    @Volatile var generation=0;private set
    @Synchronized fun stampedAuth():Pair<NativeAuth?,Int> = auth() to generation
    @Synchronized fun saveIfGeneration(expected:Int,a:NativeAuth):Boolean{if(generation!=expected)return false;saveAuth(a);return true}
    @Synchronized fun updateAuth(old:NativeAuth,next:NativeAuth):Boolean{if(!current(old))return false;saveAuth(next);return true}
    @Synchronized fun saveAuth(a:NativeAuth){
        if(auth()?.owner!=a.owner){generation++;clearData()}
        val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key())
        prefs.edit().putString("credential",Base64.encodeToString(c.iv,Base64.NO_WRAP)+":"+Base64.encodeToString(c.doFinal(a.json().toString().toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)).commit()
    }
    @Synchronized fun current(a:NativeAuth)=auth()?.let{it.owner==a.owner&&it.session==a.session}==true
    @Synchronized fun logout(){generation++;prefs.edit().clear().commit();clearData()}
    private fun clearData(){mediaDir.deleteRecursively();outgoingDir.deleteRecursively();writableDatabase.execSQL("DELETE FROM msg");writableDatabase.execSQL("DELETE FROM conv");writableDatabase.execSQL("DELETE FROM pending")}
    fun canReadLocal(a:NativeAuth?)=a!=null&&System.currentTimeMillis()-a.checked in 0..86400000L
    private fun clean(j:JSONObject):JSONObject {
        val copy=JSONObject(j.toString());copy.keys().asSequence().toList().filter{it.endsWith("url",true)||it.endsWith("chave",true)||it.contains("sessao",true)||it.contains("token",true)}.forEach{copy.remove(it)}
        return copy
    }
    @Synchronized fun putConversation(a:NativeAuth,j:JSONObject){if(!current(a))return;val value=clean(j);if(!value.has("local_has_more"))conversation(j.getLong("id"))?.let{old->if(old.has("local_has_more"))value.put("local_has_more",old.optBoolean("local_has_more"))};writableDatabase.insertWithOnConflict("conv",null,ContentValues().apply{put("id",j.getLong("id"));put("data",value.toString());put("updated",j.optString("ultima_em"))},SQLiteDatabase.CONFLICT_REPLACE)}
    @Synchronized fun putMessages(a:NativeAuth,id:Long,list:org.json.JSONArray){
        if(!current(a))return;val db=writableDatabase;db.beginTransaction()
        try {for(i in 0 until list.length()){val m=list.getJSONObject(i);db.insertWithOnConflict("msg",null,ContentValues().apply{put("cid",id);put("id",m.getLong("id"));put("data",clean(m).toString())},SQLiteDatabase.CONFLICT_REPLACE)}
            db.execSQL("DELETE FROM msg WHERE cid=? AND id NOT IN(SELECT id FROM msg WHERE cid=? ORDER BY id DESC LIMIT 1000)",arrayOf(id,id))
            db.execSQL("DELETE FROM msg WHERE cid NOT IN(SELECT id FROM conv ORDER BY updated DESC LIMIT 100)")
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
    }
    @Synchronized fun conversations():List<JSONObject>{val out=mutableListOf<JSONObject>();readableDatabase.rawQuery("SELECT data FROM conv ORDER BY updated DESC LIMIT 1000",null).use{while(it.moveToNext())runCatching{out.add(JSONObject(it.getString(0)))}};return out.sortedByDescending{it.optString("ultima_em")}}
    @Synchronized fun conversation(id:Long):JSONObject?=readableDatabase.rawQuery("SELECT data FROM conv WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())JSONObject(it.getString(0))else null}
    @Synchronized fun messages(id:Long):List<JSONObject>{val out=mutableListOf<JSONObject>();readableDatabase.rawQuery("SELECT data FROM msg WHERE cid=? ORDER BY id",arrayOf(id.toString())).use{while(it.moveToNext())out.add(JSONObject(it.getString(0)))};return out.sortedWith(compareBy<JSONObject>{it.optString("enviada_em")}.thenBy{it.optLong("id")})}
    @Synchronized fun pending(k:String,id:Long,text:String,state:String,a:NativeAuth?=null){if(a!=null&&!current(a))return;writableDatabase.insertWithOnConflict("pending",null,ContentValues().apply{put("k",k);put("cid",id);put("text",text);put("state",state)},SQLiteDatabase.CONFLICT_REPLACE)}
    @Synchronized fun pending(id:Long):List<JSONObject>{val out=mutableListOf<JSONObject>();readableDatabase.rawQuery("SELECT k,text,state FROM pending WHERE cid=?",arrayOf(id.toString())).use{while(it.moveToNext())out.add(JSONObject().put("key",it.getString(0)).put("texto",it.getString(1)).put("state",it.getString(2)))};return out}
    @Synchronized fun removePending(k:String){writableDatabase.delete("pending","k=?",arrayOf(k))}
}
