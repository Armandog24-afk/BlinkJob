import "server-only";
import QRCode from "qrcode";

/** Genera un QR code come data URI PNG, lato server (nessuna API browser richiesta). */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240 });
}
