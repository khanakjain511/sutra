import { FaceRejected } from './face-error.js';

const inputSize = 640;
const strides = [8, 16, 32];
const scoreThreshold = 0.85;
const nmsThreshold = 0.3;
const topK = 100;

function readPlane(output, channels, cells) {
  if (!output || output.dims[1] !== cells || output.dims[2] !== channels) {
    throw new FaceRejected('captureFailed');
  }
  if (output.data.length !== cells * channels) {
    throw new FaceRejected('captureFailed');
  }
  return output.data;
}

function overlap(left, right) {
  const x1 = Math.max(left.values[0] ?? 0, right.values[0] ?? 0);
  const y1 = Math.max(left.values[1] ?? 0, right.values[1] ?? 0);
  const x2 = Math.min(
    (left.values[0] ?? 0) + (left.values[2] ?? 0),
    (right.values[0] ?? 0) + (right.values[2] ?? 0),
  );
  const y2 = Math.min(
    (left.values[1] ?? 0) + (left.values[3] ?? 0),
    (right.values[1] ?? 0) + (right.values[3] ?? 0),
  );
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.area + right.area - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function suppress(boxes) {
  const ordered = [...boxes].sort(
    (left, right) => (right.values[14] ?? 0) - (left.values[14] ?? 0),
  );
  const kept = [];
  for (const box of ordered.slice(0, topK)) {
    if (kept.every((chosen) => overlap(box, chosen) <= nmsThreshold)) {
      kept.push(box);
    }
  }
  return kept.map((box) => box.values);
}

export function decodeYuNet(outputs) {
  const faces = [];
  for (const stride of strides) {
    const columns = inputSize / stride;
    const cells = columns * columns;
    const cls = readPlane(outputs[`cls_${stride}`], 1, cells);
    const obj = readPlane(outputs[`obj_${stride}`], 1, cells);
    const bbox = readPlane(outputs[`bbox_${stride}`], 4, cells);
    const landmarks = readPlane(outputs[`kps_${stride}`], 10, cells);
    for (let index = 0; index < cells; index += 1) {
      const clsScore = Math.min(1, Math.max(0, cls[index] ?? 0));
      const objScore = Math.min(1, Math.max(0, obj[index] ?? 0));
      const score = Math.sqrt(clsScore * objScore);
      if (score < scoreThreshold) continue;
      const row = Math.floor(index / columns);
      const column = index % columns;
      const box = bbox[index * 4] ?? 0;
      const boy = bbox[index * 4 + 1] ?? 0;
      const bow = bbox[index * 4 + 2] ?? 0;
      const boh = bbox[index * 4 + 3] ?? 0;
      const centerX = (column + box) * stride;
      const centerY = (row + boy) * stride;
      const width = Math.exp(bow) * stride;
      const height = Math.exp(boh) * stride;
      const values = [centerX - width / 2, centerY - height / 2, width, height];
      for (let point = 0; point < 5; point += 1) {
        values.push(
          ((landmarks[index * 10 + point * 2] ?? 0) + column) * stride,
          ((landmarks[index * 10 + point * 2 + 1] ?? 0) + row) * stride,
        );
      }
      values.push(score);
      faces.push({ values, area: Math.max(0, width) * Math.max(0, height) });
    }
  }
  if (faces.length < 2) return faces.map((face) => face.values);
  return suppress(faces);
}
