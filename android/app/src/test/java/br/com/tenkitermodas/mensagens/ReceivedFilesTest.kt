package br.com.tenkitermodas.mensagens
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
@RunWith(RobolectricTestRunner::class)
class ReceivedFilesTest {
 @Test fun preservesOriginalApkName(){assertEquals("TENKiTER-Mensagens-2.4.2.apk",ReceivedFiles.fileName("TENKiTER-Mensagens-2.4.2.apk"))}
 @Test fun sanitizesPathAndControlCharacters(){assertEquals(".._pasta_arquivo.apk",ReceivedFiles.fileName("../pasta\\arquivo.apk\nsegunda linha"));assertEquals("arquivo",ReceivedFiles.fileName("  "));assertEquals(180,ReceivedFiles.fileName("a".repeat(400)).length)}
 @Test fun bridgeOnlyUsesTrustedPage(){assertTrue(ReceivedFiles.trusted("https://tenkitermodas.com.br/admin.html?app=mensagens"));assertFalse(ReceivedFiles.trusted("https://tenkitermodas.com.br.evil.test/admin.html"));assertFalse(ReceivedFiles.trusted("http://tenkitermodas.com.br/admin.html"));assertFalse(ReceivedFiles.trusted("https://tenkitermodas.com.br/p/falso"))}
}
