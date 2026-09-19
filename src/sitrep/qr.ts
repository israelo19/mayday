// QR of the handoff payload for the closing shot of the demo. Loaded on demand so the
// encoder never sits in the critical bundle, and a failure degrades to showing the JSON.
//
// `scale` (pixels per module), not `width`: a fixed pixel width forces the library to divide
// that width across however many modules the payload needs, and when it doesn't divide evenly
// each module gets rendered across a fractional number of pixels, so the qrcode library
// anti-aliases every module edge instead of drawing it crisp. At a longer demo session
// (more timeline entries, closer to handoffQrPayload's 2000-char cap) that reads as
// TV-static/blur, not a clean scannable code. `scale` guarantees an integer pixel count per
// module regardless of QR version, at the cost of the final image size varying with payload
// size -- fine here since `.live-qr` in live.css scales the <img> down to a fixed CSS size
// either way. `margin: 4` matches the QR spec's own recommended minimum quiet zone (`margin: 1`
// was too tight for reliable real-world scanning).
export async function qrDataUrl(payload: string): Promise<string | null> {
  try {
    const qrcode = await import('qrcode');
    return await qrcode.toDataURL(payload, { errorCorrectionLevel: 'L', margin: 4, scale: 8 });
  } catch {
    return null;
  }
}
