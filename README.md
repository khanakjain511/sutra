# Attendance

An attendance app for Android, iPhone, and the browser.

- **Overview** shows today's check-in status, the overall percentage, and confirmed classes out of total classes.
- **Subjects** lets you add subjects, set their weekly schedules, and see their individual attendance.
- **Check-in** lets you select a subject, verify your face, and confirm attendance.
- **History** shows present and missed classes by month.

## Check in

1. Open **Subjects** and tap **Add subject** to choose a name and the days that subject meets. Select its name to see its attendance and check-in status.
2. Open **Check-in** and tap **Set up face scan**. Capture a straight view and a second view with a slight head turn. Tap **Save my face** to enroll. Check in separately to mark a class present.
3. On a scheduled class day, tap **Scan my face** and capture both views. The app compares the frames with each other and checks the straight view against the enrolled face.
4. Tap **Confirm attendance** after a match. A confirmation expires after 30 seconds and records the selected subject once for that day. Cancel or switch tabs to discard an unfinished scan.

Schedules use India Standard Time. Each subject counts from the later of face enrollment and subject setup, with one class per selected day. A class enters the denominator after check-in or at midnight. The overall rate divides total confirmed classes by total counted classes across subjects. School holidays and multiple periods for the same subject on one day are outside this calendar.

## Local data

Face enrollment and matching stay on the device. Android uses the OpenCV scanner and an Android Keystore key. iPhone uses the system face recognizer and a Keychain key. A browser uses the same OpenCV models and a non-exportable key stored for this site. Captured scan photos are discarded after processing. The attendance history stays in local storage. Each device or browser profile stores one enrolled face. Clearing the app, or the site data in a browser, clears both enrollment and attendance.

The head-turn check helps reject still-image attempts. It has no certified liveness or presentation-attack detection. This personal tracker has no school roster, central audit trail or administrator enrollment. Its schedule and timestamps use the device clock.

Android and the browser use [OpenCV YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) and [SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface). iPhone uses the Vision framework. License notices are included alongside the bundled models. The app requires no API key or backend.

## Run and build

Use Node.js 22 or newer with npm, OpenJDK 21, Android SDK Platform 37.0, Build Tools 37.0.0 and 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Set `ANDROID_HOME` and `JAVA_HOME`.

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

The resulting `android/app/build/outputs/apk/release/app-release.apk` runs without Metro. It is a sideload build. Configure a release signing key for distribution.

Use `npm run web` for face check-in in a browser. That server sends the isolation headers the scanner needs. A hosted web build needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`. Use `npm run android` or `npm run ios` to launch a native development build with face scanning.
