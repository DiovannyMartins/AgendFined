"use client";

import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Renders the business's public booking link as a scannable QR code (INC-4).
// The origin is only known at runtime in the browser (dev vs production), so the
// component reads it via useSyncExternalStore: SSR matches with the empty server
// snapshot (renders nothing), then re-renders once the client origin is known —
// no hydration mismatch and no setState-in-effect cascades.
const emptySubscribe = () => () => {};
function getOrigin(): string {
  return window.location.origin;
}
function getServerOrigin(): string {
  return "";
}

export function PublicLinkQR({
  slug,
  size = 160,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const origin = useSyncExternalStore(emptySubscribe, getOrigin, getServerOrigin);

  if (!origin) return null;

  return (
    <QRCodeSVG
      value={`${origin}/${slug}`}
      size={size}
      level="M"
      marginSize={1}
      id={`public-link-qr-${slug}`}
      title={`Endereço público: ${origin}/${slug}`}
      className={cn("rounded-lg bg-white p-2", className)}
    />
  );
}

export function DownloadPublicLinkQRButton({ slug }: { slug: string }) {
  function downloadQrCode() {
    const svg = document.getElementById(`public-link-qr-${slug}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 800;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${slug}-qr-code.png`;
        anchor.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
  }

  return (
    <button
      type="button"
      onClick={downloadQrCode}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
    >
      <Download className="size-3.5" />
      Baixar QR Code
    </button>
  );
}
