package expo.modules.attendanceface

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Mat
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import org.opencv.objdetect.FaceDetectorYN
import org.opencv.objdetect.FaceRecognizerSF
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sqrt

internal class ScanFailure(val status: String) : Exception(status)

internal data class FaceSample(val feature: FloatArray, val yaw: Double)

internal fun cachedPhoto(context: Context, source: String): File {
  val uri = Uri.parse(source)
  val path = uri.path ?: throw ScanFailure("captureFailed")
  val photo = File(path).canonicalFile
  val cachePath = context.cacheDir.canonicalPath + File.separator
  if (uri.scheme != "file" || !photo.path.startsWith(cachePath) || !photo.isFile)
    throw ScanFailure("captureFailed")
  return photo
}

internal class FaceScanner(private val context: Context) {
  private val detector: FaceDetectorYN
  private val recognizer: FaceRecognizerSF

  init {
    check(OpenCVLoader.initLocal())
    detector = FaceDetectorYN.create(modelFile("yunet.onnx"), "", Size(320.0, 320.0), 0.85f, 0.3f, 100)
    recognizer = FaceRecognizerSF.create(modelFile("sface.onnx"), "")
  }

  fun scan(photo: File): FaceSample {
    val rgba = Mat()
    val color = Mat()
    val faces = Mat()
    val aligned = Mat()
    val feature = Mat()
    try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(photo.path, bounds)
      val edge = max(bounds.outWidth, bounds.outHeight)
      if (edge <= 0) throw ScanFailure("captureFailed")
      var sampleSize = 1
      while (edge / sampleSize > 1200) sampleSize *= 2
      val bitmap = BitmapFactory.decodeFile(
        photo.path,
        BitmapFactory.Options().apply { inSampleSize = sampleSize }
      ) ?: throw ScanFailure("captureFailed")
      try {
        Utils.bitmapToMat(bitmap, rgba)
      } finally {
        bitmap.recycle()
      }
      Imgproc.cvtColor(rgba, color, Imgproc.COLOR_RGBA2BGR)
      val scale = 640.0 / max(color.cols(), color.rows())
      if (scale < 1) {
        Imgproc.resize(color, color, Size(color.cols() * scale, color.rows() * scale), 0.0, 0.0, Imgproc.INTER_AREA)
      }
      detector.setInputSize(color.size())
      detector.detect(color, faces)
      if (faces.empty()) throw ScanFailure("noFace")
      if (faces.rows() != 1) throw ScanFailure("multipleFaces")
      val landmarks = FloatArray(15)
      faces.get(0, 0, landmarks)
      val (left, top, width, height) = landmarks
      if (width < 105 || height < 105 || left < 4 || top < 4 ||
        left + width > color.cols() - 4 || top + height > color.rows() - 4
      ) throw ScanFailure("centerFace")
      val eyeX = (landmarks[4] + landmarks[6]) / 2.0
      val eyeDistance = hypot(
        (landmarks[4] - landmarks[6]).toDouble(),
        (landmarks[5] - landmarks[7]).toDouble()
      )
      if (eyeDistance < 25 || abs(landmarks[5] - landmarks[7]) > eyeDistance * 0.32)
        throw ScanFailure("keepLevel")
      val yaw = (landmarks[8] - eyeX) / eyeDistance
      if (!yaw.isFinite() || abs(yaw) > 0.72) throw ScanFailure("centerFace")
      recognizer.alignCrop(color, faces, aligned)
      recognizer.feature(aligned, feature)
      if (feature.total() != 128L) throw ScanFailure("captureFailed")
      val data = FloatArray(128)
      feature.get(0, 0, data)
      val length = sqrt(data.sumOf { it.toDouble() * it })
      if (!length.isFinite() || length == 0.0) throw ScanFailure("captureFailed")
      for (index in data.indices) data[index] = (data[index] / length).toFloat()
      return FaceSample(data, yaw)
    } finally {
      feature.release()
      aligned.release()
      faces.release()
      color.release()
      rgba.release()
    }
  }

  private fun modelFile(name: String): String {
    val directory = File(context.codeCacheDir, "attendance-face-v1")
    check(directory.isDirectory || directory.mkdirs())
    val model = File(directory, name)
    if (!model.isFile || model.length() == 0L) {
      val download = File(directory, "$name.tmp")
      try {
        context.assets.open("attendance-face/$name").use { asset ->
          download.outputStream().use { asset.copyTo(it) }
        }
        check(download.renameTo(model))
      } finally {
        download.delete()
      }
    }
    return model.path
  }
}
