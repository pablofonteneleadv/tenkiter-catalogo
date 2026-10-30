package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.provider.MediaStore
import android.os.Looper
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowApplication
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=android.app.Application::class,qualifiers="w390dp-h844dp-mdpi")
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@org.robolectric.annotation.LooperMode(org.robolectric.annotation.LooperMode.Mode.PAUSED)
class WebMediaTest {
 // FileProvider retains path strategies statically; Robolectric changes the app data directory per test.
 @org.junit.Before @org.junit.After fun resetProviderRoots(){
  val field=androidx.core.content.FileProvider::class.java.getDeclaredField("sCache");field.isAccessible=true
  @Suppress("UNCHECKED_CAST") val cache=field.get(null) as MutableMap<String,Any>;cache.clear()
 }
 private fun activity()=Robolectric.buildActivity(Activity::class.java).setup().get()
 private fun grant(a:Activity){shadowOf(a.application).grantPermissions(Manifest.permission.RECORD_AUDIO)}
 private class Fake(val file:File):WebAudioCapture.Recorder {
  var started=false;var released=false;var stopped=false
  override fun start(){started=true;file.writeBytes(byteArrayOf(0,1,2,3,4))}
  override fun stop(){stopped=true}
  override fun release(){released=true}
 }
 @Test fun onlyVisualFilesUseTheGallery(){assertTrue(VisualMediaPicker.visual(arrayOf("image/*,video/*")));assertTrue(VisualMediaPicker.visual(arrayOf("image/jpeg")));assertFalse(VisualMediaPicker.visual(arrayOf("audio/mp4")));assertFalse(VisualMediaPicker.visual(arrayOf("*/*")))}
 @Test fun recordedAudioAndExistingAudioFilesUseDifferentFlows(){assertTrue(VisualMediaPicker.recording(arrayOf("audio/mp4"),false));assertTrue(VisualMediaPicker.recording(arrayOf("audio/*"),true));assertFalse(VisualMediaPicker.recording(arrayOf("audio/*"),false));assertFalse(VisualMediaPicker.recording(arrayOf("image/*","video/*"),true))}
 @Test @Config(sdk=[33]) fun galleryAllowsMultiplePhotosAndVideos(){
  val multiple=VisualMediaPicker.galleryIntent(true)
  assertEquals(Intent.ACTION_GET_CONTENT,multiple.action)
  assertTrue(multiple.hasCategory(Intent.CATEGORY_OPENABLE))
  assertEquals("*/*",multiple.type)
  assertTrue(multiple.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false))
  assertArrayEquals(arrayOf("image/*","video/*"),multiple.getStringArrayExtra(Intent.EXTRA_MIME_TYPES))
  val single=VisualMediaPicker.galleryIntent(false)
  assertFalse(single.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false))
 }
 @Test fun gallerySupportsMultiplePhotosEvenWhenWebViewRequestsSingleFile(){
  // O catálogo web seleciona várias imagens, mas WebChromeClient pode informar MODE_OPEN.
  // A galeria nativa precisa permitir ClipData com todas as imagens.
  assertTrue(VisualMediaPicker.galleryIntent(true).getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false))
  val selected=Intent().apply {
   clipData=android.content.ClipData.newUri(activity().contentResolver,"foto 1",android.net.Uri.parse("content://test/photo1"))
   clipData!!.addItem(android.content.ClipData.Item(android.net.Uri.parse("content://test/photo2")))
  }
  assertEquals(2,selected.clipData!!.itemCount)
 }
 @Test fun videoCaptureUsesNativeCamera(){
  val camera=VisualMediaPicker.cameraIntent()
  assertEquals(MediaStore.ACTION_VIDEO_CAPTURE,camera.action)
  assertEquals(60,camera.getIntExtra(MediaStore.EXTRA_DURATION_LIMIT,0))
  assertEquals(0,camera.getIntExtra(MediaStore.EXTRA_VIDEO_QUALITY,-1))
  assertEquals(12L*1024*1024,camera.getLongExtra(MediaStore.EXTRA_SIZE_LIMIT,0))
 }
 @Test fun approvedAudioBecomesReadablePreviewOnly(){
  val a=activity();grant(a);var now=100L;lateinit var rec:Fake;var result:android.net.Uri?=null;var calls=0
  val capture=WebAudioCapture(a,{f->Fake(f).also{rec=it}},{now});capture.begin{result=it;calls++};assertTrue(rec.started);assertEquals(0,calls)
  now+=1500;assertNotNull("Provider ausente para "+a.packageName,a.packageManager.resolveContentProvider(a.packageName+".updates",android.content.pm.PackageManager.GET_META_DATA));androidx.core.content.FileProvider.getUriForFile(a,a.packageName+".updates",rec.file);org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();shadowOf(Looper.getMainLooper()).idle();assertEquals(1,calls);assertTrue(rec.released);assertNotNull(result)
  assertArrayEquals(byteArrayOf(0,1,2,3,4),a.contentResolver.openInputStream(result!!)?.use{it.readBytes()});capture.cancel();assertEquals(1,calls);rec.file.delete()
 }
 @Test fun permissionDenialNeverStartsRecorder(){
  val a=activity();shadowOf(a.application).denyPermissions(Manifest.permission.RECORD_AUDIO);var started=false;var calls=0
  val capture=WebAudioCapture(a,{f->started=true;Fake(f)});capture.begin{assertNull(it);calls++};assertFalse(started);assertEquals(0,calls);capture.permissionResult(false);assertFalse(started);assertEquals(1,calls)
 }
 @Test fun canceledPermissionRequestCannotStartLater(){val a=activity();shadowOf(a.application).denyPermissions(Manifest.permission.RECORD_AUDIO);var starts=0;var calls=0;val c=WebAudioCapture(a,{f->starts++;Fake(f)});c.begin{calls++};c.cancel();c.permissionResult(true);assertEquals(0,starts);assertEquals(1,calls)}
 @Test fun backgroundDiscardsAndReleasesRecording(){val a=activity();grant(a);lateinit var rec:Fake;var calls=0;val c=WebAudioCapture(a,{f->Fake(f).also{rec=it}});c.begin{assertNull(it);calls++};c.pause();assertTrue(rec.stopped);assertTrue(rec.released);assertFalse(rec.file.exists());assertEquals(1,calls)}
 @Test fun tooShortAudioIsDiscarded(){val a=activity();grant(a);lateinit var rec:Fake;var calls=0;val c=WebAudioCapture(a,{f->Fake(f).also{rec=it}},{100});c.begin{assertNull(it);calls++};c.finish(true);assertEquals(1,calls);assertFalse(rec.file.exists());assertTrue(rec.released)}
 @Test fun recorderFailureReturnsCancellationAndCleansFile(){val a=activity();grant(a);var target:File?=null;var calls=0;val c=WebAudioCapture(a,{f->target=f;throw java.io.IOException("fake failure")});c.begin{assertNull(it);calls++};assertEquals(1,calls);assertFalse(target!!.exists())}
 @Test fun recorderDialogAtLargeTextKeepsStopAndDiscardAccessible(){
  for((w,h)in listOf(320 to 700,390 to 844,412 to 915,1440 to 900)){
   org.robolectric.RuntimeEnvironment.setQualifiers("w${w}dp-h${h}dp-mdpi")
   val a=activity();grant(a);val cfg=android.content.res.Configuration(a.resources.configuration).apply{fontScale=1.3f};a.resources.updateConfiguration(cfg,a.resources.displayMetrics)
   val c=WebAudioCapture(a,{f->Fake(f)});c.begin{}
   val d=org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog();val view=d.window!!.decorView
   val width=minOf(w-32,520);view.measure(android.view.View.MeasureSpec.makeMeasureSpec(width,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(h-32,android.view.View.MeasureSpec.AT_MOST));view.layout(0,0,view.measuredWidth,view.measuredHeight)
   for(which in listOf(android.app.AlertDialog.BUTTON_POSITIVE,android.app.AlertDialog.BUTTON_NEGATIVE)){val b=d.getButton(which);assertTrue(b.height>=48);assertTrue(b.width>0)}
   val bitmap=android.graphics.Bitmap.createBitmap(view.width,view.height,android.graphics.Bitmap.Config.ARGB_8888);view.draw(android.graphics.Canvas(bitmap));val out=File("build/reports/native-ui/gravador-nativo-$w.png");out.parentFile!!.mkdirs();out.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle();c.cancel();a.finish()
  }
 }

}
