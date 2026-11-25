import { Asset } from 'expo-asset';
import * as ort from 'onnxruntime-web/wasm';

import yunetModel from '../assets/models/yunet.onnx';
import sfaceModel from '../assets/models/sface.onnx';
import wasmBinary from 'onnxruntime-web/dist/ort-wasm-simd-threaded.wasm';

import { currentDay } from './attendance.js';
import { landmarksFromFace, warpAlignedFace } from './face-align.js';
import { FaceRejected } from './face-error.js';
import { assessFace, FaceSession, normalizeFeature } from './face-session.js';
import { decodeTemplate, encodeTemplate } from './face-template.js';
import { decodeYuNet } from './yunet.js';

const modelSize = 640;
const databaseName = 'attendance-face-v1';

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('storage'));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('secrets')) {
        database.createObjectStore('secrets');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('storage'));
  });
}

function storedBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

async function encryptionKey(create) {
  const database = await openDatabase();
  const existing = await requestToPromise(
    database.transaction('secrets').objectStore('secrets').get('key'),
  );
  if (existing) return existing;
  if (!create) throw new FaceRejected('captureFailed');
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await requestToPromise(
    database
      .transaction('secrets', 'readwrite')
      .objectStore('secrets')
      .put(key, 'key'),
  );
  return key;
}

async function readStored() {
  const database = await openDatabase();
  const packed = storedBytes(
    await requestToPromise(
      database.transaction('secrets').objectStore('secrets').get('template'),
    ),
  );
  if (!packed) return null;
  if (packed.length < 30 || packed.length > 1024) {
    throw new FaceRejected('captureFailed');
  }
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(packed.subarray(0, 12)) },
      await encryptionKey(false),
      Uint8Array.from(packed.subarray(12)),
    ),
  );
  try {
    return decodeTemplate(plain);
  } finally {
    plain.fill(0);
  }
}

async function writeStored(day, feature) {
  if (await readStored()) throw new FaceRejected('alreadyEnrolled');
  const plain = encodeTemplate(day, feature);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(true),
      plain,
    ),
  );
  plain.fill(0);
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  const database = await openDatabase();
  await requestToPromise(
    database
      .transaction('secrets', 'readwrite')
      .objectStore('secrets')
      .put(packed, 'template'),
  );
}

async function assetBytes(moduleId) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const response = await fetch(asset.localUri ?? asset.uri);
  if (!response.ok) throw new FaceRejected('captureFailed');
  return response.arrayBuffer();
}

let models = null;

function loadModels() {
  models ??= (async () => {
    try {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmBinary = new Uint8Array(await assetBytes(wasmBinary));
      const [detector, recognizer] = await Promise.all([
        assetBytes(yunetModel),
        assetBytes(sfaceModel),
      ]);
      return {
        detect: await ort.InferenceSession.create(detector),
        recognize: await ort.InferenceSession.create(recognizer),
      };
    } catch (error) {
      models = null;
      throw error;
    }
  })();
  return models;
}

function bgrTensor(pixels) {
  const plane = modelSize * modelSize;
  const data = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    const offset = index * 4;
    data[index] = pixels[offset + 2] ?? 0;
    data[plane + index] = pixels[offset + 1] ?? 0;
    data[2 * plane + index] = pixels[offset] ?? 0;
  }
  return data;
}

async function decodePhoto(uri) {
  if (!uri.startsWith('data:image/')) throw new FaceRejected('captureFailed');
  const image = new Image();
  const loaded = new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new FaceRejected('captureFailed'));
  });
  image.src = uri;
  await loaded;
  const edge = Math.max(image.naturalWidth, image.naturalHeight);
  if (edge <= 0) throw new FaceRejected('captureFailed');
  const scale = edge > modelSize ? modelSize / edge : 1;
  const contentWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const contentHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = modelSize;
  canvas.height = modelSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new FaceRejected('captureFailed');
  context.drawImage(image, 0, 0, contentWidth, contentHeight);
  image.src = '';
  return {
    pixels: context.getImageData(0, 0, modelSize, modelSize).data,
    contentWidth,
    contentHeight,
  };
}

function tensors(outputs) {
  const mapped = {};
  for (const [name, value] of Object.entries(outputs)) {
    if (
      !(value instanceof ort.Tensor) ||
      !(value.data instanceof Float32Array)
    ) {
      throw new FaceRejected('captureFailed');
    }
    mapped[name] = { data: value.data, dims: value.dims };
  }
  return mapped;
}

async function readFace(uri) {
  const photo = await decodePhoto(uri);
  const session = await loadModels().catch(() => {
    throw new FaceRejected('captureFailed');
  });
  const detected = await session.detect.run({
    input: new ort.Tensor('float32', bgrTensor(photo.pixels), [
      1,
      3,
      modelSize,
      modelSize,
    ]),
  });
  const faces = decodeYuNet(tensors(detected));
  const face = faces.length === 1 ? faces[0] : undefined;
  if (!face) throw new FaceRejected(faces.length ? 'multipleFaces' : 'noFace');
  const recognized = await session.recognize.run({
    data: new ort.Tensor(
      'float32',
      warpAlignedFace(photo.pixels, modelSize, landmarksFromFace(face)),
      [1, 3, 112, 112],
    ),
  });
  const embedding = recognized.fc1;
  if (!(embedding instanceof ort.Tensor)) {
    throw new FaceRejected('captureFailed');
  }
  return {
    feature: normalizeFeature(embedding.data),
    yaw: assessFace(photo.contentWidth, photo.contentHeight, face),
  };
}

function statusFrom(error) {
  if (error instanceof FaceRejected) return error.status;
  return 'captureFailed';
}

const session = new FaceSession(
  readStored,
  writeStored,
  () => performance.now(),
  currentDay,
);

export const attendanceFace = {
  async getEnrollment() {
    return (await readStored())?.enrolledOn ?? null;
  },
  async captureStraight(uri, enrollment) {
    try {
      return await session.captureStraight(await readFace(uri), enrollment);
    } catch (error) {
      return statusFrom(error);
    }
  },
  async captureTurn(uri) {
    try {
      return await session.captureTurn(await readFace(uri));
    } catch (error) {
      return statusFrom(error);
    }
  },
  async confirm() {
    try {
      return await session.confirm();
    } catch (error) {
      if (error instanceof FaceRejected) return error.status;
      throw error;
    }
  },
  async cancel() {
    session.cancel();
  },
};
