# Attendance (Sutra)

A clean, privacy-first personal attendance tracking application built with React Native and Expo, targeted specifically for **iOS** and the **browser**.

- **Overview**: Displays today's check-in status, overall attendance percentage, and total classes present vs. scheduled.
- **Subjects**: Set up subjects, configure recurring weekly schedules, and inspect subject-specific attendance statistics.
- **Check-in**: Interactive 2-step face verification (straight pose + natural head turn) to mark attendance securely.
- **History**: Monthly calendar breakdown of present and missed classes with interactive month navigation.

## Check-in Flow

1. Open **Subjects** and tap **Add subject** to enter a title and select recurring class days (Mon–Sun).
2. Open **Check-in** and tap **Set up face scan**. Capture a straight face followed by a slight head turn to establish a secure biometric template.
3. On a scheduled class day, select the subject and tap **Scan my face**.
4. Confirm attendance after a successful match. Scans automatically expire after 30 seconds for security.

## Local Data & Privacy

- **100% On-Device Processing**: Biometric computations and face matching never leave the device. No external APIs or cloud servers are required.
- **iOS Native Vision**: Uses Apple's native `Vision` framework (`VNDetectFaceLandmarksRequest` and `VNGenerateImageFeaturePrintRequest`) with secure hardware-backed storage via Apple **Keychain** (and `CryptoKit`).
- **Web Fallback**: Web deployment uses lightweight OpenCV ONNX models ([YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) + [SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)) accelerated via WebAssembly SIMD and IndexedDB encrypted with AES-256 GCM.
- **Liveness & Anti-Spoofing**: Requires a genuine angular head turn (yaw delta assessment) to prevent presentation attacks with static photos.
- **Zero Data Leakage**: Temporary captured camera frames are discarded immediately after processing.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- macOS with Xcode and CocoaPods (for iOS native development)

### Commands

```sh
# Install dependencies
npm install

# Run unit tests
npm test

# Check code formatting & linting
npm run format:check
npm run lint

# Run locally on iOS Simulator or connected iPhone
npm run ios

# Run web version locally (with cross-origin isolation headers)
npm run web
```
