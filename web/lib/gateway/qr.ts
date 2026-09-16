// QR encoding for deposit addresses, via the `qrcode` package. Preserves the original
// gateway/qr.py's self-verification invariant — never return a QR that doesn't decode
// back to the exact input — by independently re-decoding the rendered matrix with
// `jsqr` before returning, since `qrcode` has no decoder of its own.
import QRCode from "qrcode";
import jsQR from "jsqr";

const MODULE_PX = 4;
const QUIET_ZONE = 4; // modules of white border, standard QR quiet-zone width

function verifyRoundTrip(text: string): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const dim = size + QUIET_ZONE * 2;
  const width = dim * MODULE_PX;
  const height = width;
  const buf = new Uint8ClampedArray(width * height * 4).fill(255);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.get(row, col)) continue;
      const px0 = (col + QUIET_ZONE) * MODULE_PX;
      const py0 = (row + QUIET_ZONE) * MODULE_PX;
      for (let dy = 0; dy < MODULE_PX; dy++) {
        for (let dx = 0; dx < MODULE_PX; dx++) {
          const idx = ((py0 + dy) * width + (px0 + dx)) * 4;
          buf[idx] = 0;
          buf[idx + 1] = 0;
          buf[idx + 2] = 0;
          buf[idx + 3] = 255;
        }
      }
    }
  }

  const result = jsQR(buf, width, height);
  if (!result || result.data !== text) {
    throw new Error("QR encoding failed self-verification — refusing to return an unverified code");
  }
}

/** SVG markup for a QR code encoding `text`. Throws rather than return an unverified
 * code — a QR that sends money to the wrong place is the failure that matters. */
export async function encodeSvg(text: string): Promise<string> {
  verifyRoundTrip(text);
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M" });
}
