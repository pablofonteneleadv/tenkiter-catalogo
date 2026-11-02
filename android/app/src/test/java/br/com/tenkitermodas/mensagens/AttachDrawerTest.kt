package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.media.ExifInterface
import android.net.Uri
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=android.app.Application::class,qualifiers="w390dp-h844dp-mdpi")
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@org.robolectric.annotation.LooperMode(org.robolectric.annotation.LooperMode.Mode.PAUSED)
class AttachDrawerTest {
    private fun uri(n:Int)=Uri.parse("content://media/external/images/media/$n")

    @Test fun multipleSelectionKeepsTouchOrderAndRenumbers(){
        val s=AttachSelection(3)
        assertEquals(AttachSelection.Change.ADDED,s.toggle(10,uri(10)));s.toggle(20,uri(20));s.toggle(30,uri(30))
        assertEquals(listOf(1,2,3),listOf(s.order(10),s.order(20),s.order(30)))
        assertEquals(AttachSelection.Change.FULL,s.toggle(40,uri(40)));assertEquals(0,s.order(40))
        assertEquals(AttachSelection.Change.REMOVED,s.toggle(20,uri(20)))
        assertEquals(listOf(1,2),listOf(s.order(10),s.order(30)));assertEquals(listOf(uri(10),uri(30)),s.uris())
        s.toggle(20,uri(20));assertEquals(3,s.order(20));assertEquals(listOf(uri(10),uri(30),uri(20)),s.uris())
    }

    @Test fun videoPlansUseBestResolutionInsideTheSendLimit(){
        val high=VideoQuality.plan(VideoQuality.Tier.HIGH,supportsFullHd=true)
        assertTrue(high.fullHd);assertEquals(1920,high.width);assertEquals(1080,high.height)
        val estimate={p:VideoPlan->(p.videoBitrate+AttachLimits.AUDIO_BUDGET_BPS).toLong()*p.maxSeconds/8}
        assertTrue("Full HD cabe no limite",estimate(high)<=AttachLimits.VIDEO_TARGET_BYTES)
        assertTrue(AttachLimits.VIDEO_TARGET_BYTES<AttachLimits.VIDEO_SYSTEM_BYTES)
        assertEquals(15_000_000L,AttachLimits.VIDEO_SYSTEM_BYTES)
        assertTrue("Full HD grava pelo menos 35 s",high.maxSeconds>=35)
        val long=VideoQuality.plan(VideoQuality.Tier.LONG,supportsFullHd=true)
        assertFalse(long.fullHd);assertEquals(720,long.height);assertTrue("HD mantém 1min30s",long.maxSeconds>=90);assertTrue(estimate(long)<=AttachLimits.VIDEO_TARGET_BYTES)
        val noFhd=VideoQuality.plan(VideoQuality.Tier.HIGH,supportsFullHd=false)
        assertFalse(noFhd.fullHd);assertEquals(720,noFhd.height);assertTrue(noFhd.label.startsWith("Alta (HD)"))
        assertTrue(high.label.startsWith("Full HD · até 0:"))
        assertEquals("0:12 / ${VideoQuality.duration(high.maxSeconds*1000L)}",VideoQuality.counter(12_400,high))
        assertFalse(VideoQuality.warning(1000,high));assertTrue(VideoQuality.warning(high.maxSeconds*1000L-3000,high));assertFalse(VideoQuality.warning(high.maxSeconds*1000L,high))
        assertEquals("1:02:03",VideoQuality.duration(3_723_000));assertEquals("0:00",VideoQuality.duration(-5))
    }

    @Test fun photoKeepsQualityUntilTheLimitAndOnlyThenReduces(){
        assertNull(PhotoQuality.next(4_000_000,4000,92))
        val first=PhotoQuality.next(9_000_000,4000,92)!!;assertEquals(4000,first.longSide);assertTrue(first.quality in 85..91)
        // Modelo simples de tamanho: bytes ~ pixels × fator de qualidade. Precisa terminar dentro do limite.
        var step=PhotoQuality.Step(8000,92);var bytes=0L;var n=0
        fun size(s:PhotoQuality.Step)=(s.longSide.toLong()*s.longSide*3/4)*(s.quality)/100
        while(true){bytes=size(step);val next=PhotoQuality.next(bytes,step.longSide,step.quality)?:break;assertTrue(next.longSide<=step.longSide);assertTrue(next.longSide>=PhotoQuality.MIN_LONG_SIDE);step=next;n++;assertTrue(n<20)}
        assertTrue(bytes<=AttachLimits.PHOTO_LIMIT_BYTES)
        assertNull("Não reduz abaixo de 1600 px com qualidade mínima",PhotoQuality.next(9_000_000,1600,70))
    }

    @Test fun mediaPermissionsCoverAndroid13PartialAccessAndLegacy(){
        assertArrayEquals(arrayOf(Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO,Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED),MediaAccess.permissions(34))
        assertArrayEquals(arrayOf(Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO),MediaAccess.permissions(33))
        assertArrayEquals(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE),MediaAccess.permissions(30))
        assertEquals(MediaAccess.State.FULL,MediaAccess.state(34){it!=Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED})
        assertEquals(MediaAccess.State.PARTIAL,MediaAccess.state(34){it==Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED})
        assertEquals(MediaAccess.State.NONE,MediaAccess.state(33){it==Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED})
        assertEquals(MediaAccess.State.FULL,MediaAccess.state(29){it==Manifest.permission.READ_EXTERNAL_STORAGE})
        assertEquals(MediaAccess.State.NONE,MediaAccess.state(29){false})
    }

    @Test fun clipRequestIsOneShotAndExpires(){
        AttachRequest.set(1000,"{\"camera\":false}");assertEquals("{\"camera\":false}",AttachRequest.take(1500));assertNull(AttachRequest.take(1600))
        AttachRequest.set(1000,"{}");assertNull("Pedido antigo não sequestra outro seletor",AttachRequest.take(1000+AttachRequest.TTL_MS+1))
        AttachRequest.set(1000,"{}");AttachRequest.clear();assertNull(AttachRequest.take(1001))
        val o=AttachOptions.parse("{\"camera\":false,\"audio\":false,\"aviso\":\"Atenda antes\"}");assertFalse(o.camera);assertFalse(o.audio);assertEquals("Atenda antes",o.notice)
        val d=AttachOptions.parse("isto não é json");assertTrue(d.camera);assertTrue(d.audio);assertEquals(AttachOptions.DEFAULT_NOTICE,d.notice)
    }

    @Test fun resultForWebViewPreservesOrderLikeMainActivity(){
        val a=Robolectric.buildActivity(Activity::class.java).setup().get()
        val list=listOf(uri(3),uri(1),uri(2))
        val data=AttachResult.intent(a.contentResolver,list)!!
        assertEquals(3,data.clipData!!.itemCount);assertEquals(uri(3),data.data);assertTrue(data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION!=0)
        assertEquals(list,AttachResult.read(data))
        assertNull(AttachResult.intent(a.contentResolver,emptyList()))
        assertTrue(AttachResult.read(null).isEmpty())
    }

    private fun drawer(options:String="{}")=Robolectric.buildActivity(AttachDrawerActivity::class.java,AttachDrawerActivity.intent(org.robolectric.RuntimeEnvironment.getApplication(),options)).setup().get()
    private fun drain(a:Activity){while(shadowOf(a).nextStartedActivityForResult!=null){}}
    private fun rows()=(1..14).map{AttachDrawerActivity.Media(it*2L+(if(it%4==0)1 else 0),uri(it),it%4==0,if(it%4==0)12_000L*it else 0,1_000_000L,1000L-it)}

    @Test fun deniedAccessAsksOnceThenFallsBackToSystemGallery(){
        val app=org.robolectric.RuntimeEnvironment.getApplication();shadowOf(app).denyPermissions(*MediaAccess.permissions())
        val a=drawer()
        assertEquals(Activity.RESULT_CANCELED,shadowOf(a).resultCode)
        assertTrue(shadowOf(a).lastRequestedPermission.requestedPermissions.contains(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED))
        a.onRequestPermissionsResult(AttachDrawerActivity.REQ_PERMISSION,MediaAccess.permissions(),IntArray(3){-1})
        val next=shadowOf(a).nextStartedActivityForResult
        assertEquals(Intent.ACTION_GET_CONTENT,next.intent.action);assertTrue(next.intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false))
        assertEquals(AttachDrawerActivity.REQ_GALLERY,next.requestCode)
    }

    @Test fun cameraTileOpensInAppCameraAndBlockedOptionsDoNot(){
        val ok=drawer();drain(ok);ok.tapForTest(0)
        assertEquals(AttachCameraActivity::class.java.name,shadowOf(ok).nextStartedActivityForResult.intent.component?.className)
        val blocked=drawer("{\"camera\":false,\"audio\":false}");drain(blocked);blocked.tapForTest(0)
        assertNull("Câmera bloqueada enquanto espia",shadowOf(blocked).nextStartedActivityForResult)
    }

    @Test fun sendReturnsSelectedMediaInOrderWithoutSendingAnything(){
        val a=drawer();a.showForTest(rows())
        a.tapForTest(3);a.tapForTest(1);a.tapForTest(4)
        assertEquals(View.VISIBLE,(a.send.parent as View).visibility);assertEquals("Enviar (3)",a.send.text.toString())
        assertEquals(listOf(uri(3),uri(1),uri(4)),a.selectedForTest)
        a.send.performClick()
        assertEquals(Activity.RESULT_OK,shadowOf(a).resultCode)
        assertEquals(listOf(uri(3),uri(1),uri(4)),AttachResult.read(shadowOf(a).resultIntent))
        assertTrue(a.isFinishing)
    }

    @Test fun cameraCaptureOrGalleryResultGoesStraightBack(){
        val a=drawer();drain(a);a.tapForTest(0)
        val shadow=shadowOf(a);val started=shadow.peekNextStartedActivityForResult().intent
        shadow.receiveResult(started,Activity.RESULT_OK,Intent().setDataAndType(uri(99),"video/mp4"))
        assertEquals(Activity.RESULT_OK,shadow.resultCode);assertEquals(listOf(uri(99)),AttachResult.read(shadow.resultIntent))
    }

    @Test fun drawerScreenshotsKeepTargetsAndSendReachable(){
        for((w,h) in listOf(320 to 700,390 to 844,412 to 915)){
            org.robolectric.RuntimeEnvironment.setQualifiers("w${w}dp-h${h}dp-xxhdpi")
            val a=drawer();a.showForTest(rows());a.tapForTest(2);a.tapForTest(5);a.tapForTest(4)
            val cfg=android.content.res.Configuration(a.resources.configuration).apply{fontScale=1.3f};a.resources.updateConfiguration(cfg,a.resources.displayMetrics)
            val root=a.window.decorView;val d=a.resources.displayMetrics
            root.measure(View.MeasureSpec.makeMeasureSpec(d.widthPixels,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(d.heightPixels,View.MeasureSpec.EXACTLY));root.layout(0,0,d.widthPixels,d.heightPixels)
            shadowOf(Looper.getMainLooper()).idle()
            val buttons=mutableListOf<Button>();fun scan(v:View){if(v is Button&&v.visibility==View.VISIBLE)buttons.add(v);if(v is ViewGroup)for(i in 0 until v.childCount)scan(v.getChildAt(i))};scan(root)
            assertTrue(buttons.map{it.text.toString()}.containsAll(listOf("Fechar","Galeria completa","Áudio de arquivo","Enviar (3)")))
            for(b in buttons){assertTrue("${b.text} com alvo de 48 dp",b.height/d.density>=47.5f);val loc=IntArray(2);b.getLocationInWindow(loc);assertTrue("${b.text} dentro da tela",loc[0]>=0&&loc[0]+b.width<=d.widthPixels&&loc[1]+b.height<=d.heightPixels)}
            val first=a.grid.getChildAt(1);assertTrue("Miniatura quadrada e tocável",first.height>=first.width-2&&first.width/d.density>=88)
            val bitmap=Bitmap.createBitmap(root.width,root.height,Bitmap.Config.ARGB_8888);root.draw(Canvas(bitmap))
            val out=File("build/reports/native-ui/gaveta-anexo-$w.png");out.parentFile!!.mkdirs();out.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle();a.finish()
        }
    }

    @Test fun cameraWithoutPermissionAsksAndNeverReturnsOnOpening(){
        val app=org.robolectric.RuntimeEnvironment.getApplication();shadowOf(app).denyPermissions(Manifest.permission.CAMERA)
        val a=Robolectric.buildActivity(AttachCameraActivity::class.java).create().get()
        assertEquals(Activity.RESULT_CANCELED,shadowOf(a).resultCode)
        assertTrue(shadowOf(a).lastRequestedPermission.requestedPermissions.contains(Manifest.permission.CAMERA))
        a.finish()
    }

    @Test fun photoNormalizerRotatesAndFitsTheLimit(){
        val dir=File(org.robolectric.RuntimeEnvironment.getApplication().cacheDir,"t").apply{mkdirs()}
        val f=File(dir,"TENKiTER-foto-teste.jpg")
        val b=Bitmap.createBitmap(3000,2000,Bitmap.Config.ARGB_8888);val c=Canvas(b);val p=Paint().apply{shader=LinearGradient(0f,0f,3000f,2000f,Color.rgb(168,82,0),Color.rgb(35,31,25),Shader.TileMode.CLAMP)};c.drawRect(0f,0f,3000f,2000f,p)
        val dots=Paint();val rnd=java.util.Random(7);repeat(60000){dots.color=Color.rgb(rnd.nextInt(256),rnd.nextInt(256),rnd.nextInt(256));c.drawCircle(rnd.nextFloat()*3000,rnd.nextFloat()*2000,2f+rnd.nextFloat()*3,dots)}
        f.outputStream().use{b.compress(Bitmap.CompressFormat.JPEG,95,it)};b.recycle()
        ExifInterface(f.absolutePath).apply{setAttribute(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_ROTATE_90.toString());saveAttributes()}
        val original=f.length();val limit=original/3
        assertTrue(PhotoNormalizer.normalize(f,limit));assertTrue(f.length()<=limit)
        val o=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(f.absolutePath,o)
        assertTrue("Ficou em pé",o.outHeight>o.outWidth);assertTrue("Não reduz abaixo do necessário",maxOf(o.outWidth,o.outHeight)>=PhotoQuality.MIN_LONG_SIDE)
        assertEquals(ExifInterface.ORIENTATION_UNDEFINED,ExifInterface(f.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_UNDEFINED))
        // Já em pé e no limite: mantém os bytes originais.
        val small=File(dir,"TENKiTER-foto-pequena.jpg");Bitmap.createBitmap(800,600,Bitmap.Config.ARGB_8888).also{it.eraseColor(Color.GRAY);small.outputStream().use{s->it.compress(Bitmap.CompressFormat.JPEG,95,s)}}
        val before=small.readBytes();assertTrue(PhotoNormalizer.normalize(small));assertArrayEquals(before,small.readBytes())
    }
}
