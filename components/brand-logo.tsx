import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Approved vector artwork; keep the wordmark in curves rather than recreating it in text. */
export function BrandLogo({
  symbol = false,
  className,
  style,
}: {
  symbol?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Image
      src={symbol ? "/brand/agendfined-symbol-white.svg" : "/brand/agendfined-white.svg"}
      alt="AgendFined"
      width={symbol ? 100 : 530}
      height={100}
      className={cn("block shrink-0", symbol ? "size-9" : "h-auto w-[180px]", className)}
      style={style}
      unoptimized
    />
  );
}
