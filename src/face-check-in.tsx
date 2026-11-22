import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Linking,
  Platform,
  Text,
  View,
} from 'react-native';
import { withUniwind } from 'uniwind';

import { attendanceFace } from './attendance-face';
import { isDay } from './attendance';
import { Button, Glyph, IconDisc, Loading, Status } from './ui';

const Camera = withUniwind(CameraView);

type Step = 'idle' | 'straight' | 'turn' | 'confirm';
type Feedback = { text: string; error?: boolean };

const scanMessages: Record<string, string> = {
  noFace: 'No face found. Use even lighting and look into the camera.',
  multipleFaces: 'Only one person should be in the frame.',
  centerFace: 'Move closer and keep your whole face inside the guide.',
  keepLevel: 'Hold your phone and head level.',
  lookStraight: 'Look straight at the camera for the first scan.',
  turnMore: 'Turn your head a little farther to one side, then capture again.',
  noMatch: 'The face did not match. Start a new scan.',
  scanExpired: 'The scan expired. Start a new scan.',
  captureFailed: 'The camera could not read the image. Try again.',
  alreadyEnrolled:
    'A face has already been enrolled on this device. Reload attendance.',
  notEnrolled: 'Set up your face before marking attendance.',
};

export function FaceCheckIn({
  enrolled,
  checkedIn,
  scheduled,
  subjectName,
  onConfirmed,
  onReveal,
}: {
  enrolled: boolean;
  checkedIn: boolean;
  scheduled: boolean;
  subjectName?: string;
  onConfirmed: (day: string, enrollment: boolean) => Promise<void>;
  onReveal: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('idle');
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const camera = useRef<CameraView>(null);
  const operation = useRef(0);
  const working = useRef(false);
  const confirming = useRef(false);
  const scanOpen = useRef(false);

  useEffect(() => {
    if (!attendanceFace) return;
    const module = attendanceFace;
    const invalidate = () => {
      operation.current++;
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' || confirming.current || !scanOpen.current) return;
      scanOpen.current = false;
      invalidate();
      working.current = false;
      setBusy(false);
      setStep('idle');
      setCameraReady(false);
      void module.cancel().catch(() => undefined);
    });
    return () => {
      subscription.remove();
      invalidate();
      void module.cancel().catch(() => undefined);
    };
  }, []);

  function report(status: string) {
    setFeedback({
      text:
        scanMessages[status] ?? 'Unable to complete the face scan. Try again.',
      error: true,
    });
  }

  async function begin() {
    if (
      !attendanceFace ||
      working.current ||
      (enrolled && (!subjectName || !scheduled || checkedIn))
    )
      return;
    working.current = true;
    setBusy(true);
    setFeedback(null);
    const id = ++operation.current;
    try {
      const access = permission?.granted
        ? permission
        : await requestPermission();
      if (id !== operation.current) return;
      if (!access.granted) {
        setFeedback({
          text: 'Allow camera access to scan your face.',
          error: true,
        });
        return;
      }
      scanOpen.current = true;
      setCameraReady(false);
      setStep('straight');
    } catch {
      if (id === operation.current) report('captureFailed');
    } finally {
      if (id === operation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  async function capture() {
    if (!attendanceFace || !camera.current || !cameraReady || working.current)
      return;
    if (step !== 'straight' && step !== 'turn') return;
    const id = operation.current;
    const module = attendanceFace;
    working.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const picture = await camera.current.takePictureAsync({
        quality: 0.78,
        imageType: 'jpg',
        shutterSound: false,
      });
      const status =
        step === 'straight'
          ? await module.captureStraight(picture.uri, !enrolled)
          : await module.captureTurn(picture.uri);
      if (id !== operation.current) {
        await module.cancel();
        return;
      }
      if (status === 'turn') {
        setStep('turn');
      } else if (status === 'verified') {
        setCameraReady(false);
        setStep('confirm');
      } else {
        if (
          status === 'scanExpired' ||
          status === 'noMatch' ||
          status === 'alreadyEnrolled' ||
          status === 'notEnrolled'
        ) {
          scanOpen.current = false;
          setStep('idle');
          setCameraReady(false);
        }
        report(status);
      }
    } catch {
      if (id === operation.current) report('captureFailed');
    } finally {
      if (id === operation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  async function confirm() {
    if (!attendanceFace || step !== 'confirm' || working.current) return;
    working.current = true;
    confirming.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const day = await attendanceFace.confirm();
      if (!isDay(day)) {
        report(day);
      } else {
        await onConfirmed(day, !enrolled);
        setFeedback({
          text: enrolled
            ? `Attendance marked for ${subjectName}.`
            : 'Face saved. You can now check in.',
        });
      }
    } catch {
      setFeedback({
        text: 'Could not save. Start a new scan and try again.',
        error: true,
      });
    } finally {
      scanOpen.current = false;
      setStep('idle');
      confirming.current = false;
      working.current = false;
      setBusy(false);
    }
  }

  function cancel() {
    if (working.current) return;
    scanOpen.current = false;
    operation.current++;
    setStep('idle');
    setCameraReady(false);
    setFeedback(null);
    void attendanceFace?.cancel().catch(() => undefined);
  }

  useEffect(() => {
    if (step === 'idle') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        cancel();
        return true;
      },
    );
    return () => subscription.remove();
  }, [step]);

  const isScanning = step === 'straight' || step === 'turn';
  const title = enrolled ? 'Face check-in' : 'Set up your face';
  const instruction =
    step === 'turn'
      ? 'Turn your head slightly to one side and capture again.'
      : 'Look straight at the camera with your face inside the guide.';
  const canStart =
    !!attendanceFace &&
    (!enrolled || (!!subjectName && scheduled && !checkedIn));

  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-[22px] font-semibold tracking-tight text-ink"
      >
        {title}
      </Text>
      {isScanning ? (
        <View onLayout={onReveal} className="gap-3 rounded-[22px] bg-white p-3">
          <Text
            accessibilityLiveRegion="polite"
            className="text-[15px] leading-5 font-medium text-ink"
          >
            {instruction}
          </Text>
          <View className="h-48 w-full overflow-hidden rounded-[20px] bg-shell sm:h-64">
            <Camera
              ref={camera}
              className="absolute inset-0"
              facing="front"
              mode="picture"
              mirror={false}
              onCameraReady={() => setCameraReady(true)}
              onMountError={() => {
                scanOpen.current = false;
                setStep('idle');
                setCameraReady(false);
                report('captureFailed');
              }}
            />
            <View
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center"
            >
              <View className="h-4/5 w-3/5 rounded-full border-2 border-white/80" />
            </View>
          </View>
          <View className="flex-row flex-wrap items-stretch gap-2">
            <View className="min-w-32 flex-1">
              <Button
                icon="camera-outline"
                disabled={!cameraReady || busy}
                onPress={() => {
                  void capture();
                }}
              >
                {step === 'straight' ? 'Capture face' : 'Capture head turn'}
              </Button>
            </View>
            <Button subtle disabled={busy} onPress={cancel}>
              Cancel
            </Button>
          </View>
        </View>
      ) : step === 'confirm' ? (
        <View
          onLayout={onReveal}
          className="gap-3 rounded-[22px] bg-lilac p-3.5"
        >
          <View className="flex-row items-center gap-3">
            <View className="size-10 items-center justify-center rounded-full bg-white">
              <Glyph name="checkmark-outline" />
            </View>
            <Text
              accessibilityLiveRegion="polite"
              className="flex-1 text-[15px] font-semibold text-ink"
            >
              {enrolled
                ? `Face matched. Confirm attendance for ${subjectName}.`
                : 'Scan complete. Save your face on this device?'}
            </Text>
          </View>
          <Button
            icon="checkmark-outline"
            disabled={busy}
            onPress={() => {
              void confirm();
            }}
          >
            {enrolled ? 'Confirm attendance' : 'Save my face'}
          </Button>
          <Button subtle disabled={busy} onPress={cancel}>
            Cancel
          </Button>
        </View>
      ) : (
        <View className="gap-3 rounded-[22px] bg-white p-3.5">
          <View className="flex-row items-center gap-3">
            <IconDisc name={checkedIn ? 'checkmark-outline' : 'scan-outline'} />
            <Text className="flex-1 text-[15px] leading-5 text-muted">
              {!attendanceFace
                ? 'This build cannot scan a face. Use a browser, or install the iOS or Android app.'
                : checkedIn
                  ? 'Attendance for this subject is recorded today.'
                  : !enrolled
                    ? 'Save a face template on this device to verify future check-ins.'
                    : !subjectName
                      ? 'Add a subject to start checking in.'
                      : !scheduled
                        ? 'No class is scheduled for this subject today.'
                        : 'Scan your face, then confirm to record this class.'}
            </Text>
          </View>
          {canStart ? (
            <Button
              icon="scan-outline"
              disabled={busy}
              onPress={() => {
                void begin();
              }}
            >
              {enrolled ? 'Scan my face' : 'Set up face scan'}
            </Button>
          ) : null}
          {attendanceFace &&
          Platform.OS !== 'web' &&
          permission &&
          !permission.granted &&
          !permission.canAskAgain ? (
            <Button
              subtle
              onPress={() => {
                void Linking.openSettings().catch(() =>
                  report('captureFailed'),
                );
              }}
            >
              Open camera settings
            </Button>
          ) : null}
        </View>
      )}
      {busy ? (
        <Loading text={step === 'confirm' ? 'Saving…' : 'Checking…'} />
      ) : null}
      {feedback ? (
        <View onLayout={onReveal}>
          <Status text={feedback.text} error={feedback.error} />
        </View>
      ) : null}
    </View>
  );
}
