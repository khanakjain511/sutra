import CryptoKit
import ExpoModulesCore
import Security
import UIKit
import Vision

private struct ScanError: Error {
  let status: String
}

private struct FaceSample {
  let feature: Data
  let yaw: Double
}

private struct Scan {
  let enrollment: Bool
  let sample: FaceSample
  let startedAt: Double
}

private struct Confirmation {
  let scan: Scan
  let day: String
  let expiresAt: Double
}

private let service = "attendance-face-template-v1"
private let matchDistance: Float = 0.60

public class AttendanceFaceModule: Module {
  private let lock = NSLock()
  private let templates = FaceTemplateStore()
  private var previous: Scan?
  private var pending: Confirmation?

  public func definition() -> ModuleDefinition {
    Name("AttendanceFace")

    AsyncFunction("getEnrollment") { () throws -> String? in
      self.lock.lock()
      defer { self.lock.unlock() }
      return try self.templates.read()?.enrolledOn
    }

    AsyncFunction("captureStraight") { (uri: String, enrollment: Bool) -> String in
      self.run { try self.start(uri, enrollment) }
    }

    AsyncFunction("captureTurn") { (uri: String) -> String in
      self.run { try self.checkTurn(uri) }
    }

    AsyncFunction("confirm") { () -> String in
      self.run { try self.accept() }
    }

    AsyncFunction("cancel") {
      self.lock.lock()
      defer { self.lock.unlock() }
      self.clear()
    }
  }

  private func run(_ operation: () throws -> String) -> String {
    lock.lock()
    defer { lock.unlock() }
    do {
      return try operation()
    } catch let error as ScanError {
      return error.status
    } catch {
      return "captureFailed"
    }
  }

  private func start(_ uri: String, _ enrollment: Bool) throws -> String {
    clear()
    let sample = try scan(uri)
    if abs(sample.yaw) > 0.20 { return "lookStraight" }
    let template = try templates.read()
    if enrollment && template != nil { return "alreadyEnrolled" }
    if !enrollment && template == nil { return "notEnrolled" }
    if let template, try !matches(template.feature, sample.feature) { return "noMatch" }
    previous = Scan(enrollment: enrollment, sample: sample, startedAt: now())
    return "turn"
  }

  private func checkTurn(_ uri: String) throws -> String {
    let sample = try scan(uri)
    guard let anchor = previous else { return "scanExpired" }
    let time = now()
    if time - anchor.startedAt > 60_000 {
      clear()
      return "scanExpired"
    }
    if abs(sample.yaw) < 0.19 || abs(sample.yaw - anchor.sample.yaw) < 0.17 {
      return "turnMore"
    }
    if try !matches(anchor.sample.feature, sample.feature) {
      clear()
      return "noMatch"
    }
    previous = nil
    pending = Confirmation(scan: anchor, day: localDay(), expiresAt: time + 30_000)
    return "verified"
  }

  private func accept() throws -> String {
    guard let confirmation = pending else { return "scanExpired" }
    clear()
    if now() > confirmation.expiresAt || confirmation.day != localDay() {
      return "scanExpired"
    }
    if confirmation.scan.enrollment {
      if try templates.read() != nil { return "alreadyEnrolled" }
      try templates.write(
        FaceTemplate(enrolledOn: confirmation.day, feature: confirmation.scan.sample.feature)
      )
    }
    return confirmation.day
  }

  private func clear() {
    previous = nil
    pending = nil
  }

  private func matches(_ reference: Data, _ sample: Data) throws -> Bool {
    guard
      let stored = try NSKeyedUnarchiver.unarchivedObject(
        ofClass: VNFeaturePrintObservation.self, from: reference),
      let current = try NSKeyedUnarchiver.unarchivedObject(
        ofClass: VNFeaturePrintObservation.self, from: sample)
    else { throw ScanError(status: "captureFailed") }
    var distance: Float = 0
    try stored.computeDistance(&distance, to: current)
    return distance <= matchDistance
  }

  private func scan(_ uri: String) throws -> FaceSample {
    let file = try cachedPhoto(uri)
    defer { try? FileManager.default.removeItem(at: file) }
    guard let image = UIImage(data: try Data(contentsOf: file)) else {
      throw ScanError(status: "captureFailed")
    }
    let pixels = try uprightPixels(image)
    let handler = VNImageRequestHandler(cgImage: pixels, options: [:])
    let facesRequest = VNDetectFaceLandmarksRequest()
    let printRequest = VNGenerateImageFeaturePrintRequest()
    try handler.perform([facesRequest, printRequest])
    let faces = (facesRequest.results ?? []).filter { $0.confidence >= 0.7 }
    if faces.isEmpty { throw ScanError(status: "noFace") }
    if faces.count != 1 { throw ScanError(status: "multipleFaces") }
    guard let face = faces.first, let observation = printRequest.results?.first else {
      throw ScanError(status: "captureFailed")
    }
    let feature = try NSKeyedArchiver.archivedData(
      withRootObject: observation, requiringSecureCoding: true)
    return FaceSample(feature: feature, yaw: try yaw(of: face, image: pixels))
  }

  private func now() -> Double {
    ProcessInfo.processInfo.systemUptime * 1000
  }

  private func localDay() -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(identifier: "Asia/Kolkata")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
  }
}

private func cachedPhoto(_ uri: String) throws -> URL {
  guard let url = URL(string: uri), url.isFileURL else {
    throw ScanError(status: "captureFailed")
  }
  let file = url.standardizedFileURL
  let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .standardizedFileURL.path
  let prefix = caches.hasSuffix("/") ? caches : caches + "/"
  var isDirectory: ObjCBool = false
  guard
    file.path.hasPrefix(prefix),
    FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory),
    !isDirectory.boolValue
  else { throw ScanError(status: "captureFailed") }
  return file
}

private func uprightPixels(_ image: UIImage) throws -> CGImage {
  guard let source = image.cgImage else { throw ScanError(status: "captureFailed") }
  if image.imageOrientation == .up { return source }
  var width = source.width
  var height = source.height
  switch image.imageOrientation {
  case .left, .leftMirrored, .right, .rightMirrored:
    swap(&width, &height)
  default:
    break
  }
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  let rendered = UIGraphicsImageRenderer(
    size: CGSize(width: width, height: height), format: format
  ).image { _ in
    image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
  }
  guard let upright = rendered.cgImage else { throw ScanError(status: "captureFailed") }
  return upright
}

private func yaw(of face: VNFaceObservation, image: CGImage) throws -> Double {
  let pixelWidth = CGFloat(image.width)
  let pixelHeight = CGFloat(image.height)
  let scale = min(1, 640 / max(pixelWidth, pixelHeight))
  let width = pixelWidth * scale
  let height = pixelHeight * scale
  let box = face.boundingBox
  let left = box.origin.x * width
  let boxWidth = box.size.width * width
  let boxHeight = box.size.height * height
  let top = height - (box.origin.y * height + boxHeight)
  if boxWidth < 105 || boxHeight < 105 || left < 4 || top < 4 || left + boxWidth > width - 4
    || top + boxHeight > height - 4
  {
    throw ScanError(status: "centerFace")
  }
  guard
    let landmarks = face.landmarks,
    let leftEye = landmarks.leftEye,
    let rightEye = landmarks.rightEye,
    let nose = landmarks.nose
  else { throw ScanError(status: "centerFace") }
  let imageSize = CGSize(width: pixelWidth, height: pixelHeight)
  func center(_ region: VNFaceLandmarkRegion2D) throws -> CGPoint {
    let points = region.pointsInImage(imageSize: imageSize)
    guard !points.isEmpty else { throw ScanError(status: "centerFace") }
    let sum = points.reduce(CGPoint.zero) { CGPoint(x: $0.x + $1.x, y: $0.y + $1.y) }
    return CGPoint(
      x: sum.x / CGFloat(points.count) * scale, y: sum.y / CGFloat(points.count) * scale)
  }
  let rightPoint = try center(rightEye)
  let leftPoint = try center(leftEye)
  let nosePoint = try center(nose)
  let eyeDistance = hypot(rightPoint.x - leftPoint.x, rightPoint.y - leftPoint.y)
  if eyeDistance < 25 || abs(rightPoint.y - leftPoint.y) > eyeDistance * 0.32 {
    throw ScanError(status: "keepLevel")
  }
  let result = Double((nosePoint.x - (rightPoint.x + leftPoint.x) / 2) / eyeDistance)
  if !result.isFinite || abs(result) > 0.72 { throw ScanError(status: "centerFace") }
  return result
}

private struct FaceTemplate {
  let enrolledOn: String
  let feature: Data
}

private struct FaceTemplateStore {
  private var file: URL {
    let directory = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return directory.appendingPathComponent("attendance-face-v1")
  }

  func read() throws -> FaceTemplate? {
    guard FileManager.default.fileExists(atPath: file.path) else { return nil }
    let encrypted = try Data(contentsOf: file)
    guard encrypted.count > 28, encrypted.count < 262_144 else {
      throw ScanError(status: "captureFailed")
    }
    let sealed = try AES.GCM.SealedBox(combined: encrypted)
    let plain = try AES.GCM.open(sealed, using: key(create: false))
    guard let dayLength = plain.first, dayLength == 10, plain.count > 11 else {
      throw ScanError(status: "captureFailed")
    }
    let dayData = plain.subdata(in: 1..<11)
    guard let day = String(data: dayData, encoding: .utf8), isDay(day) else {
      throw ScanError(status: "captureFailed")
    }
    return FaceTemplate(enrolledOn: day, feature: plain.subdata(in: 11..<plain.count))
  }

  func write(_ template: FaceTemplate) throws {
    guard isDay(template.enrolledOn), let dayData = template.enrolledOn.data(using: .utf8) else {
      throw ScanError(status: "captureFailed")
    }
    var plain = Data([UInt8(dayData.count)])
    plain.append(dayData)
    plain.append(template.feature)
    let sealed = try AES.GCM.seal(plain, using: key(create: true))
    guard let encrypted = sealed.combined else { throw ScanError(status: "captureFailed") }
    let directory = file.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try encrypted.write(to: file, options: .atomic)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutable = file
    try mutable.setResourceValues(values)
  }

  private func key(create: Bool) throws -> SymmetricKey {
    if let existing = try existingKey() { return existing }
    if !create { throw ScanError(status: "captureFailed") }
    let created = SymmetricKey(size: .bits256)
    let raw = created.withUnsafeBytes { Data($0) }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: "aes-key",
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      kSecValueData as String: raw,
    ]
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
      throw ScanError(status: "captureFailed")
    }
    return created
  }

  private func existingKey() throws -> SymmetricKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: "aes-key",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = item as? Data, data.count == 32 else {
      throw ScanError(status: "captureFailed")
    }
    return SymmetricKey(data: data)
  }
}

private func isDay(_ value: String) -> Bool {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.timeZone = TimeZone(secondsFromGMT: 0)
  formatter.dateFormat = "yyyy-MM-dd"
  formatter.isLenient = false
  guard let date = formatter.date(from: value) else { return false }
  return formatter.string(from: date) == value
}
