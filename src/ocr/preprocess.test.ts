import { describe, expect, it } from 'vitest'
import { adaptiveThreshold, contrastStretch, fitLongSide, grayToRgba, processPixels, toGrayscale } from './preprocess'

describe('fitLongSide', () => {
  it('scales a portrait photo down to 2000 px on the long side', () => {
    expect(fitLongSide(3024, 4032)).toEqual({ width: 1500, height: 2000 })
  })
  it('scales small images up', () => {
    expect(fitLongSide(1000, 500)).toEqual({ width: 2000, height: 1000 })
  })
  it('handles a custom target and empty input', () => {
    expect(fitLongSide(400, 400, 100)).toEqual({ width: 100, height: 100 })
    expect(fitLongSide(0, 10)).toEqual({ width: 0, height: 0 })
  })
})

describe('toGrayscale', () => {
  it('uses luminance weights', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255])
    expect([...toGrayscale(rgba)]).toEqual([255, 0, 76, 150])
  })
})

describe('contrastStretch', () => {
  it('maps the darkest/brightest values to 0/255', () => {
    const gray = new Uint8ClampedArray([100, 110, 120, 130, 140, 150])
    const out = contrastStretch(gray, 0, 1)
    expect(out[0]).toBe(0)
    expect(out[5]).toBe(255)
    expect(out[2]).toBe(102) // (120-100)*255/50
  })
  it('ignores outliers below/above the percentiles', () => {
    const gray = new Uint8ClampedArray(200).fill(150)
    for (let i = 0; i < 100; i++) gray[i] = 100
    gray[0] = 0 // one speck of black
    gray[199] = 255 // one speck of white
    const out = contrastStretch(gray, 0.01, 0.99)
    expect(out[1]).toBe(0)
    expect(out[150]).toBe(255)
  })
  it('leaves a flat image unchanged', () => {
    const gray = new Uint8ClampedArray(10).fill(77)
    expect([...contrastStretch(gray)]).toEqual(Array(10).fill(77))
  })
})

describe('adaptiveThreshold', () => {
  it('finds faint ink on a gradient background that a global threshold would miss', () => {
    const w = 60
    const h = 20
    const gray = new Uint8ClampedArray(w * h)
    // Background brightens from 120 (left) to 240 (right); a faint vertical
    // stroke 20 levels darker than its surroundings sits at x=10 and x=50.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bg = 120 + (x * 120) / (w - 1)
        gray[y * w + x] = x === 10 || x === 50 ? bg - 30 : bg
      }
    }
    const out = adaptiveThreshold(gray, w, h, 5, 10)
    const row = (y: number) => [...out.slice(y * w, (y + 1) * w)]
    for (const y of [0, 10, 19]) {
      const r = row(y)
      expect(r[10]).toBe(0)
      expect(r[50]).toBe(0)
      expect(r.filter((v) => v === 0)).toHaveLength(2)
    }
    // A global mid threshold would mark the whole dark left half as ink.
    expect([...gray].filter((v) => v < 180).length).toBeGreaterThan(w * h * 0.4)
  })

  it('keeps a uniform page white', () => {
    const out = adaptiveThreshold(new Uint8ClampedArray(25).fill(200), 5, 5, 2, 10)
    expect([...out]).toEqual(Array(25).fill(255))
  })

  it('rejects a size mismatch', () => {
    expect(() => adaptiveThreshold(new Uint8ClampedArray(10), 3, 3)).toThrow()
  })
})

describe('grayToRgba / processPixels', () => {
  it('expands to opaque RGBA', () => {
    expect([...grayToRgba(new Uint8ClampedArray([0, 200]))]).toEqual([0, 0, 0, 255, 200, 200, 200, 255])
  })

  it('produces binary RGBA of the same size', () => {
    const w = 40
    const h = 40
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const v = i % w === 20 ? 150 : 210 // faint line on light paper
      rgba.set([v, v, v, 255], i * 4)
    }
    const out = processPixels(rgba, w, h)
    expect(out.length).toBe(rgba.length)
    const values = new Set<number>()
    for (let i = 0; i < out.length; i += 4) values.add(out[i])
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255])
    expect(out[20 * 4]).toBe(0)
    expect(out[0]).toBe(255)
  })
})
