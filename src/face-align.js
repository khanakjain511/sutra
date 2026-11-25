const template = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];
const destinationMean = [56.0262, 71.9008];
const floatMinimum = 1.17549435e-38;

function multiply(left, right) {
  return [
    left[0] * right[0] + left[1] * right[2],
    left[0] * right[1] + left[1] * right[3],
    left[2] * right[0] + left[3] * right[2],
    left[2] * right[1] + left[3] * right[3],
  ];
}

function determinant(matrix) {
  return matrix[0] * matrix[3] - matrix[1] * matrix[2];
}

function svd2(matrix) {
  const [a, b, c, d] = matrix;
  const symmetric = [
    a * a + c * c,
    a * b + c * d,
    a * b + c * d,
    b * b + d * d,
  ];
  const shift = symmetric[0] - symmetric[3];
  const angle = 0.5 * Math.atan2(2 * symmetric[1], shift);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const basis = [
    [cosine, -sine, sine, cosine],
    [-sine, -cosine, cosine, -sine],
  ];
  const columns = basis.map((rotation) => {
    const vx = rotation[0];
    const vy = rotation[2];
    const singular = Math.hypot(a * vx + b * vy, c * vx + d * vy);
    const inverse = singular > floatMinimum ? 1 / singular : 0;
    return {
      singular,
      v: [vx, vy],
      u: [(a * vx + b * vy) * inverse, (c * vx + d * vy) * inverse],
    };
  });
  columns.sort((left, right) => right.singular - left.singular);
  const first = columns[0];
  const second = columns[1];
  if (!first || !second) throw new Error('SVD failed');
  if (first.singular <= floatMinimum) {
    first.u = [1, 0];
    second.u = [0, 1];
  } else if (second.singular <= floatMinimum) {
    second.u = [-first.u[1], first.u[0]];
  }
  return {
    u: [first.u[0], second.u[0], first.u[1], second.u[1]],
    s: [first.singular, second.singular],
    vt: [first.v[0], first.v[1], second.v[0], second.v[1]],
  };
}

export function similarityMatrix(source) {
  if (source.length !== 5) throw new Error('Five landmarks are required');
  let sourceMeanX = 0;
  let sourceMeanY = 0;
  for (const [x, y] of source) {
    sourceMeanX += x;
    sourceMeanY += y;
  }
  sourceMeanX /= 5;
  sourceMeanY /= 5;
  const sourceDemean = source.map(([x, y]) => [
    x - sourceMeanX,
    y - sourceMeanY,
  ]);
  const destinationDemean = template.map(([x, y]) => [
    x - destinationMean[0],
    y - destinationMean[1],
  ]);
  const covariance = [0, 0, 0, 0];
  for (let index = 0; index < 5; index += 1) {
    const from = sourceDemean[index];
    const to = destinationDemean[index];
    if (!from || !to) continue;
    covariance[0] += (to[0] * from[0]) / 5;
    covariance[1] += (to[0] * from[1]) / 5;
    covariance[2] += (to[1] * from[0]) / 5;
    covariance[3] += (to[1] * from[1]) / 5;
  }
  const signs = [1, determinant(covariance) < 0 ? -1 : 1];
  const { u, s, vt } = svd2(covariance);
  const maximum = Math.max(s[0], s[1]);
  const tolerance = maximum * 2 * floatMinimum;
  const rank = Number(s[0] > tolerance) + Number(s[1] > tolerance);
  let rotation = multiply(u, vt);
  if (rank === 1) {
    if (determinant(u) * determinant(vt) <= 0) {
      signs[1] = -1;
      rotation = multiply(u, multiply([signs[0], 0, 0, signs[1]], vt));
      signs[1] = determinant(covariance) < 0 ? -1 : 1;
    }
  } else {
    rotation = multiply(u, multiply([signs[0], 0, 0, signs[1]], vt));
  }
  let variance = 0;
  for (const [x, y] of sourceDemean) variance += x * x + y * y;
  variance /= 5;
  const scale =
    variance === 0 ? 0 : (s[0] * signs[0] + s[1] * signs[1]) / variance;
  const translatedX = rotation[0] * sourceMeanX + rotation[1] * sourceMeanY;
  const translatedY = rotation[2] * sourceMeanX + rotation[3] * sourceMeanY;
  return [
    rotation[0] * scale,
    rotation[1] * scale,
    destinationMean[0] - scale * translatedX,
    rotation[2] * scale,
    rotation[3] * scale,
    destinationMean[1] - scale * translatedY,
  ];
}

function sample(pixels, size, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const read = (px, py) => {
    if (px < 0 || py < 0 || px >= size || py >= size) return [0, 0, 0];
    const offset = (py * size + px) * 4;
    return [
      pixels[offset + 2] ?? 0,
      pixels[offset + 1] ?? 0,
      pixels[offset] ?? 0,
    ];
  };
  const topLeft = read(x0, y0);
  const topRight = read(x0 + 1, y0);
  const bottomLeft = read(x0, y0 + 1);
  const bottomRight = read(x0 + 1, y0 + 1);
  return [0, 1, 2].map((channel) => {
    const top =
      (topLeft[channel] ?? 0) * (1 - dx) + (topRight[channel] ?? 0) * dx;
    const bottom =
      (bottomLeft[channel] ?? 0) * (1 - dx) + (bottomRight[channel] ?? 0) * dx;
    return top * (1 - dy) + bottom * dy;
  });
}

export function warpAlignedFace(pixels, size, source) {
  const [a, b, tx, c, d, ty] = similarityMatrix(source);
  const determinantValue = a * d - b * c;
  if (!Number.isFinite(determinantValue) || Math.abs(determinantValue) < 1e-8) {
    throw new Error('Face alignment failed');
  }
  const inverseA = d / determinantValue;
  const inverseB = -b / determinantValue;
  const inverseC = -c / determinantValue;
  const inverseD = a / determinantValue;
  const inverseX = -(inverseA * tx + inverseB * ty);
  const inverseY = -(inverseC * tx + inverseD * ty);
  const output = new Float32Array(3 * 112 * 112);
  for (let y = 0; y < 112; y += 1) {
    for (let x = 0; x < 112; x += 1) {
      const [blue, green, red] = sample(
        pixels,
        size,
        inverseA * x + inverseB * y + inverseX,
        inverseC * x + inverseD * y + inverseY,
      );
      const offset = y * 112 + x;
      output[offset] = red ?? 0;
      output[112 * 112 + offset] = green ?? 0;
      output[2 * 112 * 112 + offset] = blue ?? 0;
    }
  }
  return output;
}

export function landmarksFromFace(face) {
  const points = [];
  for (let index = 0; index < 5; index += 1) {
    points.push([
      face[4 + index * 2] ?? Number.NaN,
      face[5 + index * 2] ?? Number.NaN,
    ]);
  }
  return points;
}
