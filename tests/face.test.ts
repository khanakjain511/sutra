import assert from 'node:assert/strict';
import test from 'node:test';

import { similarityMatrix, warpAlignedFace } from '../src/face-align';
import { FaceRejected } from '../src/face-error';
import {
  assessFace,
  FaceSession,
  normalizeFeature,
  type FaceSample,
} from '../src/face-session';
import { decodeTemplate, encodeTemplate } from '../src/face-template';
import { decodeYuNet, type FaceTensor } from '../src/yunet';

const template: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

function feature(index: number) {
  const values = new Float32Array(128);
  values[index] = 1;
  return values;
}

function memoryStore() {
  let stored: { enrolledOn: string; feature: Float32Array } | null = null;
  return {
    read: async () => stored,
    write: async (day: string, value: Float32Array) => {
      stored = { enrolledOn: day, feature: Float32Array.from(value) };
    },
  };
}

function zeros(cells: number, channels: number): FaceTensor {
  return {
    data: new Float32Array(cells * channels),
    dims: [1, cells, channels],
  };
}

function outputs() {
  const planes: Record<string, FaceTensor> = {};
  for (const stride of [8, 16, 32]) {
    const cells = (640 / stride) ** 2;
    planes[`cls_${stride}`] = zeros(cells, 1);
    planes[`obj_${stride}`] = zeros(cells, 1);
    planes[`bbox_${stride}`] = zeros(cells, 4);
    planes[`kps_${stride}`] = zeros(cells, 10);
  }
  return planes;
}

test('face session enrolls a straight view and a real head turn', async () => {
  let time = 1_000;
  const store = memoryStore();
  const session = new FaceSession(
    store.read,
    store.write,
    () => time,
    () => '2026-11-23',
  );
  const straight: FaceSample = { feature: feature(0), yaw: 0.02 };
  const turn: FaceSample = { feature: feature(0), yaw: 0.42 };
  assert.equal(await session.captureStraight(straight, true), 'turn');
  assert.equal(await session.captureTurn(turn), 'verified');
  assert.equal(await session.confirm(), '2026-11-23');
  assert.equal((await store.read())?.enrolledOn, '2026-11-23');
  assert.equal(await session.captureStraight(straight, false), 'turn');
  assert.equal(
    await session.captureStraight(straight, true),
    'alreadyEnrolled',
  );
});

test('face session rejects a still second frame, a mismatch, and an expired scan', async () => {
  let time = 5_000;
  let day = '2026-11-23';
  const store = memoryStore();
  await store.write('2026-11-20', feature(3));
  const session = new FaceSession(
    store.read,
    store.write,
    () => time,
    () => day,
  );
  assert.equal(
    await session.captureStraight({ feature: feature(3), yaw: 0.4 }, false),
    'lookStraight',
  );
  assert.equal(
    await session.captureStraight({ feature: feature(1), yaw: 0 }, false),
    'noMatch',
  );
  assert.equal(
    await session.captureStraight({ feature: feature(3), yaw: 0 }, false),
    'turn',
  );
  assert.equal(
    await session.captureTurn({ feature: feature(3), yaw: 0.05 }),
    'turnMore',
  );
  time += 61_000;
  assert.equal(
    await session.captureTurn({ feature: feature(3), yaw: 0.5 }),
    'scanExpired',
  );
  assert.equal(
    await session.captureStraight({ feature: feature(3), yaw: 0 }, false),
    'turn',
  );
  assert.equal(
    await session.captureTurn({ feature: feature(3), yaw: -0.4 }),
    'verified',
  );
  day = '2026-11-24';
  assert.equal(await session.confirm(), 'scanExpired');
});

test('face geometry keeps a level centered face and rejects the edges', () => {
  const face = [
    40, 30, 180, 200, 80, 90, 160, 92, 122, 130, 90, 170, 150, 172, 0.99,
  ];
  assert.ok(Math.abs(assessFace(320, 400, face)) < 0.2);
  assert.throws(
    () => assessFace(200, 220, face),
    (error: unknown) =>
      error instanceof FaceRejected && error.status === 'centerFace',
  );
  const tilted = [...face];
  tilted[5] = 40;
  assert.throws(
    () => assessFace(320, 400, tilted),
    (error: unknown) =>
      error instanceof FaceRejected && error.status === 'keepLevel',
  );
});

test('template codec round-trips one normalized face', () => {
  const values = normalizeFeature(
    Float32Array.from({ length: 128 }, (_, i) => i - 20),
  );
  const decoded = decodeTemplate(encodeTemplate('2026-11-23', values));
  assert.equal(decoded.enrolledOn, '2026-11-23');
  assert.ok(
    decoded.feature.every(
      (value, index) => Math.abs(value - (values[index] ?? 0)) < 1e-6,
    ),
  );
  assert.throws(() => decodeTemplate(Uint8Array.of(1, 2, 3)));
});

test('YuNet keeps one strong face and separates two', () => {
  const single = outputs();
  const cells = (640 / 8) ** 2;
  const cls = single.cls_8?.data as Float32Array;
  const obj = single.obj_8?.data as Float32Array;
  const bbox = single.bbox_8?.data as Float32Array;
  const index = 10 * 80 + 12;
  cls[index] = 1;
  obj[index] = 1;
  bbox[index * 4 + 2] = Math.log(10);
  bbox[index * 4 + 3] = Math.log(12);
  const [face] = decodeYuNet(single);
  assert.ok(Math.abs((face?.[0] ?? 0) - 56) < 1e-4);
  assert.ok(Math.abs((face?.[1] ?? 0) - 32) < 1e-4);
  assert.ok(Math.abs((face?.[2] ?? 0) - 80) < 1e-4);
  assert.ok(Math.abs((face?.[3] ?? 0) - 96) < 1e-4);
  assert.equal(cells, 6400);

  const pair = outputs();
  for (const cell of [index, 40 * 80 + 40]) {
    (pair.cls_8?.data as Float32Array)[cell] = 1;
    (pair.obj_8?.data as Float32Array)[cell] = 1;
    (pair.bbox_8?.data as Float32Array)[cell * 4 + 2] = Math.log(8);
    (pair.bbox_8?.data as Float32Array)[cell * 4 + 3] = Math.log(8);
  }
  assert.equal(decodeYuNet(pair).length, 2);
});

test('alignment maps the reference landmarks onto themselves', () => {
  const matrix = similarityMatrix(template);
  assert.ok(Math.abs(matrix[0] - 1) < 1e-3);
  assert.ok(Math.abs(matrix[4] - 1) < 1e-3);
  assert.ok(Math.abs(matrix[2]) < 1e-2);
  assert.ok(Math.abs(matrix[5]) < 1e-2);
  const pixels = new Uint8ClampedArray(112 * 112 * 4);
  const pixel = (50 * 112 + 40) * 4;
  pixels[pixel] = 10;
  pixels[pixel + 1] = 20;
  pixels[pixel + 2] = 30;
  const aligned = warpAlignedFace(pixels, 112, template);
  const output = 50 * 112 + 40;
  assert.ok(Math.abs((aligned[output] ?? 0) - 10) < 0.05);
  assert.ok(Math.abs((aligned[112 * 112 + output] ?? 0) - 20) < 0.05);
  assert.ok(Math.abs((aligned[2 * 112 * 112 + output] ?? 0) - 30) < 0.05);
});
