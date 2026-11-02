package br.com.tenkitermodas.mensagens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Deixa a foto da câmera pronta para o envio sem perder resolução à toa:
 * - mantém o arquivo original quando já está em pé e dentro do limite;
 * - quando precisa girar, grava JPEG 92 com a rotação aplicada (sem depender do EXIF no destino);
 * - acima do limite, reduz primeiro a qualidade e só depois o tamanho (PhotoQuality.next).
 * Os metadados (inclusive localização) não são copiados para o arquivo regravado.
 */
object PhotoNormalizer {
    const val MAX_DECODE_PIXELS=16_000_000L
    fun rotation(orientation:Int)=when(orientation){ExifInterface.ORIENTATION_ROTATE_90,ExifInterface.ORIENTATION_TRANSPOSE->90;ExifInterface.ORIENTATION_ROTATE_180,ExifInterface.ORIENTATION_FLIP_VERTICAL->180;ExifInterface.ORIENTATION_ROTATE_270,ExifInterface.ORIENTATION_TRANSVERSE->270;else->0}
    fun mirrored(orientation:Int)=orientation in listOf(ExifInterface.ORIENTATION_FLIP_HORIZONTAL,ExifInterface.ORIENTATION_FLIP_VERTICAL,ExifInterface.ORIENTATION_TRANSPOSE,ExifInterface.ORIENTATION_TRANSVERSE)
    /** Retorna true quando a foto ficou dentro do limite. */
    fun normalize(file:File,limit:Long=AttachLimits.PHOTO_LIMIT_BYTES):Boolean{
        val orientation=runCatching{ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val degrees=rotation(orientation);val mirror=mirrored(orientation)
        if(degrees==0&&!mirror&&file.length()<=limit)return true
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.absolutePath,bounds)
        if(bounds.outWidth<=0||bounds.outHeight<=0)return file.length()<=limit
        var sample=1
        while(bounds.outWidth.toLong()/sample*(bounds.outHeight.toLong()/sample)>MAX_DECODE_PIXELS)sample*=2
        repeat(3){
            try{return encode(file,sample,degrees,mirror,limit)}catch(_:OutOfMemoryError){sample*=2}
        }
        return file.length()<=limit
    }
    private fun encode(file:File,sample:Int,degrees:Int,mirror:Boolean,limit:Long):Boolean{
        val decoded=BitmapFactory.decodeFile(file.absolutePath,BitmapFactory.Options().apply{inSampleSize=sample})?:return file.length()<=limit
        val base=if(degrees!=0||mirror){val m=Matrix();if(mirror)m.postScale(-1f,1f);m.postRotate(degrees.toFloat());Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,m,true).also{if(it!==decoded)decoded.recycle()}}else decoded
        try{
            var step=PhotoQuality.Step(maxOf(base.width,base.height),PhotoQuality.NORMALIZED_JPEG)
            var bytes=compress(base,step)
            for(i in 0 until 10){val next=PhotoQuality.next(bytes.size.toLong(),step.longSide,step.quality,limit)?:break;step=next;bytes=compress(base,step)}
            val tmp=File(file.parentFile,file.name+".tmp");tmp.writeBytes(bytes)
            if(!tmp.renameTo(file)){file.writeBytes(bytes);tmp.delete()}
            return bytes.size<=limit
        }finally{base.recycle()}
    }
    private fun compress(source:Bitmap,step:PhotoQuality.Step):ByteArray{
        val long=maxOf(source.width,source.height)
        val scaled=if(step.longSide<long){val k=step.longSide.toDouble()/long;Bitmap.createScaledBitmap(source,maxOf(1,(source.width*k).toInt()),maxOf(1,(source.height*k).toInt()),true)}else source
        try{return ByteArrayOutputStream().use{scaled.compress(Bitmap.CompressFormat.JPEG,step.quality,it);it.toByteArray()}}finally{if(scaled!==source)scaled.recycle()}
    }
}
