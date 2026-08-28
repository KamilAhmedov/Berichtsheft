/**
 * Erzeugt resources/icon.png ohne externe Abhängigkeiten.
 * electron-builder leitet daraus die .ico für Windows ab.
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const BLUE = [37, 99, 235]
const BLUE_LIGHT = [96, 165, 250]
const WHITE = [255, 255, 255]

const pixels = new Uint8Array(SIZE * SIZE * 4) // RGBA

function set(x, y, [r, g, b], alpha = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  const a = alpha / 255
  // Über den vorhandenen Pixel legen, damit weiche Kanten funktionieren.
  pixels[i] = pixels[i] * (1 - a) + r * a
  pixels[i + 1] = pixels[i + 1] * (1 - a) + g * a
  pixels[i + 2] = pixels[i + 2] * (1 - a) + b * a
  pixels[i + 3] = Math.max(pixels[i + 3], alpha)
}

/** Abgerundetes Rechteck mit weicher Kante (einfaches Supersampling der Distanz). */
function roundedRect(x0, y0, w, h, radius, color) {
  for (let y = Math.floor(y0); y < y0 + h; y++) {
    for (let x = Math.floor(x0); x < x0 + w; x++) {
      const dx = Math.max(x0 + radius - x, x - (x0 + w - 1 - radius), 0)
      const dy = Math.max(y0 + radius - y, y - (y0 + h - 1 - radius), 0)
      const dist = Math.sqrt(dx * dx + dy * dy)
      const alpha = dist <= radius - 1 ? 255 : dist >= radius ? 0 : (radius - dist) * 255
      if (alpha > 0) set(x, y, color, Math.round(alpha))
    }
  }
}

// Hintergrund: blaue Kachel im Windows-Stil.
roundedRect(0, 0, SIZE, SIZE, 96, BLUE)

// Weiße Seite mit blauem Buchrücken.
const pageX = 128
const pageY = 96
const pageW = 256
const pageH = 320
roundedRect(pageX, pageY, pageW, pageH, 20, WHITE)
roundedRect(pageX, pageY, 44, pageH, 20, BLUE_LIGHT)

// Textzeilen.
const lines = [
  [pageX + 76, pageY + 74, 148],
  [pageX + 76, pageY + 138, 148],
  [pageX + 76, pageY + 202, 96],
]
for (const [x, y, w] of lines) roundedRect(x, y, w, 20, 10, BLUE)

// Häkchen als Zeichen für „erledigt“.
for (let i = 0; i < 46; i++) {
  roundedRect(pageX + 78 + i, pageY + 256 + i, 22, 22, 11, BLUE)
}
for (let i = 0; i < 78; i++) {
  roundedRect(pageX + 122 + i, pageY + 300 - i, 22, 22, 11, BLUE)
}

/* ------------------------------------------------------------ PNG-Encoder -- */

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // Bit-Tiefe
ihdr[9] = 6 // Farbtyp RGBA

// Jede Zeile bekommt ein Filter-Byte (0 = keiner) vorangestellt.
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(join(root, 'resources'), { recursive: true })
writeFileSync(join(root, 'resources', 'icon.png'), png)
console.log(`resources/icon.png geschrieben (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB)`)
