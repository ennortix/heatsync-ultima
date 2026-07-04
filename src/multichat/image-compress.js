// Image compress — client-side downscale/re-encode before media upload.
//
// Phone photos are routinely 4MB+ (~4000px). Re-encoding them to WebP at a
// sane resolution before upload makes posts land instantly, slashes bandwidth
// and server storage/CPU, and strips EXIF (incl. GPS) as a privacy bonus.
//
// Only JPEG/PNG are touched — the phone-photo case. GIF/SVG/WebP/video pass
// through untouched so nothing animated or vector is ever re-encoded.
//
// Mirrors client/utils/image-compress.js in the main heatsync repo (separate
// codebase, no shared code — keep both in sync by hand if the logic changes).

const MC_IMG_MAX_DIM = 2048 // longest edge; phone shots are ~4000px
const MC_IMG_QUALITY = 0.82
const MC_IMG_MIN_BYTES = 512 * 1024 // below this, not worth re-encoding
const MC_IMG_COMPRESSIBLE = new Set(['image/jpeg', 'image/png'])

// Downscale + re-encode a large JPEG/PNG to WebP. Non-compressible types,
// already-small files, and any failure return the original file unchanged —
// this never enlarges, corrupts, or drops an upload.
async function _compressImage(file) {
  if (!MC_IMG_COMPRESSIBLE.has(file.type) || file.size < MC_IMG_MIN_BYTES) return file

  let bitmap
  try {
    // imageOrientation: 'from-image' bakes EXIF rotation into the pixels so
    // the stripped-EXIF output still renders upright (server won't re-rotate).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file // decode failed → let the server handle the original
  }

  try {
    const scale = Math.min(1, MC_IMG_MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', MC_IMG_QUALITY))
    if (!blob || blob.size >= file.size) return file // no win → keep original

    const name = `${file.name.replace(/\.[^.]+$/, '')}.webp`
    return new File([blob], name, { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap.close?.()
  }
}
