"use client";

import type Hls from "hls.js";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const videoSrc =
  "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";

export function HeroVideo() {
  const reduceMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion) return;

    let hls: Hls | undefined;
    let cancelled = false;
    const playVideo = () => {
      video.play().catch(() => undefined);
    };

    const startVideo = async () => {
      const { default: HlsImplementation } = await import("hls.js");
      if (cancelled) return;

      if (HlsImplementation.isSupported()) {
        hls = new HlsImplementation({ enableWorker: true });
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
        hls.on(HlsImplementation.Events.MANIFEST_PARSED, playVideo);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoSrc;
        video.addEventListener("loadedmetadata", playVideo, { once: true });
      }
    };

    const startTimer = window.setTimeout(() => {
      void startVideo();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      hls?.destroy();
      video.removeEventListener("loadedmetadata", playVideo);
    };
  }, [reduceMotion]);

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden bg-black">
      <Image
        src="/images/hero.webp"
        alt=""
        fill
        priority
        fetchPriority="high"
        className="object-cover"
        sizes="100vw"
      />
      {!reduceMotion && (
        <video
          ref={videoRef}
          aria-hidden="true"
          autoPlay
          preload="none"
          muted
          loop
          playsInline
          poster="/images/hero.webp"
          className="absolute inset-0 size-full object-cover opacity-60 grayscale saturate-0"
        />
      )}
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reduceMotion;
}
