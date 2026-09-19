// QR of the handoff payload for the closing shot of the demo. Loaded on demand so the
// encoder never sits in the critical bundle, and a failure degrades to showing the JSON.
export async function qrDataUrl(payload: string): Promise<string | null> {
  try {
    const qrcode = await import('qrcode');
    return await qrcode.toDataURL(payload, { errorCorrectionLevel: 'L', margin: 1, width: 512 });
  } catch {
    return null;
  }
}
