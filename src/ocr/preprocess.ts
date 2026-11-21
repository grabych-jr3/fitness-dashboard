/*
 * Image preprocessing for OCR of faint thermal receipts.
 *
 * The pixel algorithms are pure functions on typed arrays (unit-tested in
 * Node); `preprocessImage` glues them to the browser canvas APIs.
 */

export interface PreprocessOptions {
  /** Target length of the long image side, px. Default 2000. */
  targetLongSide?: number
  /** Binarise with an adaptive threshold. Default true. */
  threshold?: boolean
  /** Local window radius for the threshold, px. Default: long side / 80. */
  thresholdRadius?: number
  /** How much darker than the local mean a pixel must be to count as ink. Default 12. */
  thresholdOffset?: number
}

/** Output size that scales the long side to `target`, keeping the aspect ratio. */
export function fitLongSide(width: number, height: number, target = 2000): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = target / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** RGBA → one luminance byte per pixel (Rec. 601 weights). */
export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const n = rgba.length >> 2
  const out = new Uint8ClampedArray(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000 // Uint8ClampedArray rounds
  }
  return out
}

/**
 * Linear contrast stretch: the `low` and `high` percentiles of the histogram
 * are mapped to 0 and 255. Robust against a few specks of pure black/white.
 */
export function contrastStretch(gray: Uint8ClampedArray, low = 0.01, high = 0.99): Uint8ClampedArray {
  const n = gray.length
  const out = new Uint8ClampedArray(n)
  if (!n) return out
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) hist[gray[i]]++
  const lowCount = Math.floor(n * low)
  const highCount = Math.min(n - 1, Math.floor(n * high))
  let lo = 0
  let hi = 255
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v]
    if (acc > lowCount) {
      lo = v
      break
    }
  }
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v]
    if (acc > highCount) {
      hi = v
      break
    }
  }
  if (hi <= lo) {
    out.set(gray)
    return out
  }
  const k = 255 / (hi - lo)
  for (let i = 0; i < n; i++) out[i] = (gray[i] - lo) * k
  return out
}

/**
 * Adaptive local-mean threshold (Bradley–Roth style, via an integral image).
 * A pixel becomes ink (0) if it is darker than the mean of its
 * (2·radius+1)² neighbourhood by more than `offset`, otherwise paper (255).
 * Handles uneven lighting and faint thermal print better than a global threshold.
 */
export function adaptiveThreshold(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 15,
  offset = 12,
): Uint8ClampedArray {
  if (gray.length !== width * height) throw new Error('adaptiveThreshold: size mismatch')
  const out = new Uint8ClampedArray(gray.length)
  const w1 = width + 1
  // Integral image with a zero row/column; Float64 avoids overflow on big images.
  const integral = new Float64Array(w1 * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * w1 + x + 1] = integral[y * w1 + x + 1] + rowSum
    }
  }
  const r = Math.max(1, Math.round(radius))
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height, y + r + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width, x + r + 1)
      const sum = integral[y1 * w1 + x1] - integral[y0 * w1 + x1] - integral[y1 * w1 + x0] + integral[y0 * w1 + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      out[y * width + x] = gray[y * width + x] < mean - offset ? 0 : 255
    }
  }
  return out
}

/** One byte per pixel → opaque RGBA. */
export function grayToRgba(gray: Uint8ClampedArray, target?: Uint8ClampedArray): Uint8ClampedArray {
  const out = target ?? new Uint8ClampedArray(gray.length * 4)
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = gray[i]
    out[j + 3] = 255
  }
  return out
}

/** Whole pixel pipeline on RGBA data: grayscale → contrast stretch → (optional) adaptive threshold. */
export function processPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: PreprocessOptions = {},
): Uint8ClampedArray {
  let gray = contrastStretch(toGrayscale(rgba))
  if (options.threshold ?? true) {
    const radius = options.thresholdRadius ?? Math.max(8, Math.round(Math.max(width, height) / 80))
    gray = adaptiveThreshold(gray, width, height, radius, options.thresholdOffset ?? 12)
  }
  return grayToRgba(gray)
}

/**
 * Browser only. Decodes the photo (respecting EXIF orientation), scales the
 * long side to ~2000 px and returns a binarised canvas ready for Tesseract.
 */
export async function preprocessImage(file: Blob, options: PreprocessOptions = {}): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = fitLongSide(bitmap.width, bitmap.height, options.targetLongSide ?? 2000)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D недоступний')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const image = ctx.getImageData(0, 0, width, height)
    image.data.set(processPixels(image.data, width, height, options))
    ctx.putImageData(image, 0, 0)
    return canvas
  } finally {
    bitmap.close()
  }
}
