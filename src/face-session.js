import { FaceRejected } from './face-error.js';

const straightLimit = 0.2;
const turnLimit = 0.19;
const turnDelta = 0.17;
const matchThreshold = 0.5;

function copySample(sample) {
  if (sample.feature.length !== 128 || !Number.isFinite(sample.yaw)) {
    throw new FaceRejected('captureFailed');
  }
  return { feature: Float32Array.from(sample.feature), yaw: sample.yaw };
}

function matches(reference, sample) {
  if (reference.length !== 128 || sample.length !== 128) return false;
  let sum = 0;
  for (let index = 0; index < 128; index += 1) {
    sum += (reference[index] ?? 0) * (sample[index] ?? 0);
  }
  return sum >= matchThreshold;
}

export function assessFace(width, height, face) {
  const left = face[0] ?? Number.NaN;
  const top = face[1] ?? Number.NaN;
  const boxWidth = face[2] ?? Number.NaN;
  const boxHeight = face[3] ?? Number.NaN;
  if (
    boxWidth < 105 ||
    boxHeight < 105 ||
    left < 4 ||
    top < 4 ||
    left + boxWidth > width - 4 ||
    top + boxHeight > height - 4
  ) {
    throw new FaceRejected('centerFace');
  }
  const rightEyeX = face[4] ?? Number.NaN;
  const rightEyeY = face[5] ?? Number.NaN;
  const leftEyeX = face[6] ?? Number.NaN;
  const leftEyeY = face[7] ?? Number.NaN;
  const noseX = face[8] ?? Number.NaN;
  const eyeDistance = Math.hypot(rightEyeX - leftEyeX, rightEyeY - leftEyeY);
  if (eyeDistance < 25 || Math.abs(rightEyeY - leftEyeY) > eyeDistance * 0.32) {
    throw new FaceRejected('keepLevel');
  }
  const yaw = (noseX - (rightEyeX + leftEyeX) / 2) / eyeDistance;
  if (!Number.isFinite(yaw) || Math.abs(yaw) > 0.72) {
    throw new FaceRejected('centerFace');
  }
  return yaw;
}

export function normalizeFeature(values) {
  if (values.length !== 128) throw new FaceRejected('captureFailed');
  const feature = new Float32Array(128);
  let sum = 0;
  for (let index = 0; index < 128; index += 1) {
    const value = values[index] ?? Number.NaN;
    if (!Number.isFinite(value)) throw new FaceRejected('captureFailed');
    feature[index] = value;
    sum += value * value;
  }
  const length = Math.sqrt(sum);
  if (!Number.isFinite(length) || length === 0) {
    throw new FaceRejected('captureFailed');
  }
  for (let index = 0; index < 128; index += 1) {
    feature[index] = (feature[index] ?? 0) / length;
  }
  return feature;
}

export class FaceSession {
  previous = null;
  pending = null;

  constructor(readEnrollment, writeEnrollment, now, today) {
    this.readEnrollment = readEnrollment;
    this.writeEnrollment = writeEnrollment;
    this.now = now;
    this.today = today;
  }

  cancel() {
    this.previous = null;
    this.pending = null;
  }

  async captureStraight(sample, enrollment) {
    this.cancel();
    const captured = copySample(sample);
    if (Math.abs(captured.yaw) > straightLimit) return 'lookStraight';
    const template = await this.readEnrollment();
    if (enrollment && template) return 'alreadyEnrolled';
    if (!enrollment && !template) return 'notEnrolled';
    if (template && !matches(template.feature, captured.feature)) {
      return 'noMatch';
    }
    this.previous = {
      enrollment,
      sample: captured,
      startedAt: this.now(),
    };
    return 'turn';
  }

  async captureTurn(sample) {
    const captured = copySample(sample);
    const anchor = this.previous;
    if (!anchor) return 'scanExpired';
    const time = this.now();
    if (time - anchor.startedAt > 60_000) {
      this.cancel();
      return 'scanExpired';
    }
    if (
      Math.abs(captured.yaw) < turnLimit ||
      Math.abs(captured.yaw - anchor.sample.yaw) < turnDelta
    ) {
      return 'turnMore';
    }
    if (!matches(anchor.sample.feature, captured.feature)) {
      this.cancel();
      return 'noMatch';
    }
    this.previous = null;
    this.pending = {
      scan: anchor,
      day: this.today(),
      expiresAt: time + 30_000,
    };
    return 'verified';
  }

  async confirm() {
    const confirmation = this.pending;
    this.cancel();
    if (!confirmation) return 'scanExpired';
    if (
      this.now() > confirmation.expiresAt ||
      confirmation.day !== this.today()
    ) {
      return 'scanExpired';
    }
    if (confirmation.scan.enrollment) {
      if (await this.readEnrollment()) return 'alreadyEnrolled';
      await this.writeEnrollment(
        confirmation.day,
        confirmation.scan.sample.feature,
      );
    }
    return confirmation.day;
  }
}
