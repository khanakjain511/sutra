package expo.modules.attendanceface

import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

class AttendanceFaceModule : Module() {
  private data class Scan(val enrollment: Boolean, val sample: FaceSample, val startedAt: Long)
  private data class Confirmation(val scan: Scan, val day: String, val expiresAt: Long)

  private val context get() = requireNotNull(appContext.reactContext)
  private val templates by lazy { FaceTemplateStore(context) }
  private val scanner by lazy { FaceScanner(context) }
  private var previous: Scan? = null
  private var pending: Confirmation? = null

  override fun definition() = ModuleDefinition {
    Name("AttendanceFace")

    AsyncFunction("getEnrollment") {
      synchronized(this@AttendanceFaceModule) { templates.read()?.enrolledOn }
    }

    AsyncFunction("captureStraight") { uri: String, enrollment: Boolean ->
      runScan { start(uri, enrollment) }
    }

    AsyncFunction("captureTurn") { uri: String ->
      runScan { checkTurn(uri) }
    }

    AsyncFunction("confirm") {
      runScan { accept() }
    }

    AsyncFunction("cancel") {
      synchronized(this@AttendanceFaceModule) { clear() }
    }
  }

  private fun start(uri: String, enrollment: Boolean): String {
    clear()
    val sample = scan(uri)
    if (abs(sample.yaw) > 0.20) return "lookStraight"
    val template = templates.read()
    if (enrollment && template != null) return "alreadyEnrolled"
    if (!enrollment && template == null) return "notEnrolled"
    if (template != null && !matches(template.feature, sample.feature)) return "noMatch"
    previous = Scan(enrollment, sample, SystemClock.elapsedRealtime())
    return "turn"
  }

  private fun checkTurn(uri: String): String {
    val sample = scan(uri)
    val anchor = previous ?: return "scanExpired"
    val now = SystemClock.elapsedRealtime()
    if (now - anchor.startedAt > 60000) {
      clear()
      return "scanExpired"
    }
    if (abs(sample.yaw) < 0.19 || abs(sample.yaw - anchor.sample.yaw) < 0.17) return "turnMore"
    if (!matches(anchor.sample.feature, sample.feature)) {
      clear()
      return "noMatch"
    }
    previous = null
    pending = Confirmation(anchor, localDay(), now + 30000)
    return "verified"
  }

  private fun accept(): String {
    val confirmation = pending ?: return "scanExpired"
    clear()
    if (SystemClock.elapsedRealtime() > confirmation.expiresAt || confirmation.day != localDay())
      return "scanExpired"
    if (confirmation.scan.enrollment) {
      if (templates.read() != null) return "alreadyEnrolled"
      templates.write(FaceTemplate(confirmation.day, confirmation.scan.sample.feature))
    }
    return confirmation.day
  }

  private fun clear() {
    previous = null
    pending = null
  }

  private fun scan(uri: String): FaceSample {
    val photo = cachedPhoto(context, uri)
    return try {
      scanner.scan(photo)
    } finally {
      photo.delete()
    }
  }

  private fun runScan(operation: () -> String): String = synchronized(this) {
    try {
      operation()
    } catch (error: ScanFailure) {
      error.status
    }
  }

  private fun matches(reference: FloatArray, sample: FloatArray): Boolean =
    reference.indices.sumOf { reference[it].toDouble() * sample[it] } >= 0.50

  private fun localDay(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("Asia/Kolkata")
  }.format(Date())
}
