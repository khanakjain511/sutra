import { isDay } from './attendance';
import { FaceRejected } from './face-error';

export function encodeTemplate(day: string, feature: ArrayLike<number>) {
  if (!isDay(day) || feature.length !== 128) {
    throw new FaceRejected('captureFailed');
  }
  const dayBytes = new TextEncoder().encode(day);
  const bytes = new Uint8Array(1 + dayBytes.length + 128 * 4);
  bytes[0] = dayBytes.length;
  bytes.set(dayBytes, 1);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < 128; index += 1) {
    const value = feature[index] ?? Number.NaN;
    if (!Number.isFinite(value)) throw new FaceRejected('captureFailed');
    view.setFloat32(1 + dayBytes.length + index * 4, value, true);
  }
  return bytes;
}

export function decodeTemplate(bytes: Uint8Array) {
  const dayLength = bytes[0];
  if (
    dayLength === undefined ||
    dayLength < 10 ||
    bytes.length !== 1 + dayLength + 128 * 4
  ) {
    throw new FaceRejected('captureFailed');
  }
  const day = new TextDecoder().decode(bytes.subarray(1, 1 + dayLength));
  if (!isDay(day)) throw new FaceRejected('captureFailed');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const feature = new Float32Array(128);
  for (let index = 0; index < 128; index += 1) {
    const value = view.getFloat32(1 + dayLength + index * 4, true);
    if (!Number.isFinite(value)) throw new FaceRejected('captureFailed');
    feature[index] = value;
  }
  return { enrolledOn: day, feature };
}
