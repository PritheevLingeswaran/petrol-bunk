import QRCode from "qrcode";
import { businessDateToday } from "@/lib/date";
import { getPumpOptions, getSamples } from "@/server/pump/queries";
import { SamplesScreen } from "@/components/pump/samples";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [samples, options] = await Promise.all([getSamples(), getPumpOptions()]);

  // QR is rendered server-side as inline SVG so a sticker prints without any
  // network fetch — the print sheet has to work on a shop-floor machine.
  const qrBySample: Record<string, string> = {};
  for (const row of samples.rows) {
    qrBySample[row.id] = await QRCode.toString(`sample:${row.id}`, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  }

  return <SamplesScreen {...samples} options={options} today={businessDateToday().toISOString().slice(0, 10)} qrBySample={qrBySample} />;
}
