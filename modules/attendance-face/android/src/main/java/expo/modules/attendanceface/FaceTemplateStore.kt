package expo.modules.attendanceface

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class FaceTemplate(val enrolledOn: String, val feature: FloatArray)

internal class FaceTemplateStore(context: Context) {
  private val file = AtomicFile(File(context.noBackupFilesDir, "attendance-face-v1"))
  private val alias = "attendance-face-template-v1"

  fun read(): FaceTemplate? {
    if (!file.baseFile.exists()) return null
    val encrypted = file.readFully()
    require(encrypted.size in 30..1024)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(
      Cipher.DECRYPT_MODE,
      key() ?: error("Attendance encryption key is unavailable"),
      GCMParameterSpec(128, encrypted.copyOfRange(0, 12))
    )
    val plain = cipher.doFinal(encrypted, 12, encrypted.size - 12)
    return try {
      DataInputStream(ByteArrayInputStream(plain)).use { input ->
        val day = input.readUTF()
        val feature = FloatArray(128) { input.readFloat() }
        require(input.available() == 0 && day.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")))
        require(feature.all(Float::isFinite))
        FaceTemplate(day, feature)
      }
    } finally {
      plain.fill(0)
    }
  }

  fun write(template: FaceTemplate) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key() ?: createKey())
    require(cipher.iv.size == 12)
    val plain = ByteArrayOutputStream().also { buffer ->
      DataOutputStream(buffer).use { output ->
        output.writeUTF(template.enrolledOn)
        template.feature.forEach(output::writeFloat)
      }
    }.toByteArray()
    val encrypted = try {
      cipher.iv + cipher.doFinal(plain)
    } finally {
      plain.fill(0)
    }
    val output = file.startWrite()
    try {
      output.write(encrypted)
      file.finishWrite(output)
    } catch (error: Exception) {
      file.failWrite(output)
      throw error
    }
  }

  private fun key(): SecretKey? = KeyStore.getInstance("AndroidKeyStore").run {
    load(null)
    getKey(alias, null) as? SecretKey
  }

  private fun createKey(): SecretKey {
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }
}
