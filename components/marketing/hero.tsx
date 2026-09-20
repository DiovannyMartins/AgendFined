"use client";

import Hls from "hls.js";
import { motion } from "motion/react";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

const videoSrc =
  "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";

export function Hero({ children }: { children?: React.ReactNode }) {
  return (
    <section id="top" className="relative isolate min-h-[calc(100svh-1px)] scroll-mt-20 overflow-hidden bg-black text-white">
      <HeroVideo />

      <div className="pointer-events-none absolute left-[20%] top-[-20%] -z-10 size-[600px] rounded-full bg-white/10 blur-[120px] mix-blend-screen" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[20%] -z-10 size-[500px] rounded-full bg-zinc-500/10 blur-[120px] mix-blend-screen" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black/65 backdrop-blur-[2px]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-background" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-32 text-center sm:pt-40 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-md"
        >
          <Sparkles className="size-3.5 text-white" />
          Agendamentos online para profissionais
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-9 font-display text-3xl leading-[1.1] text-white sm:text-5xl lg:text-[48px]"
        >
          Sua agenda trabalhando por você
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-4 max-w-5xl text-balance text-6xl font-semibold leading-[0.9] tracking-tighter text-transparent [background-image:linear-gradient(to_bottom,#fff_0%,#fff_52%,#a7a7a7_100%)] bg-clip-text sm:text-8xl lg:text-[136px]"
        >
          24 horas por dia
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.72 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mx-auto mt-8 max-w-xl text-pretty text-lg leading-[1.65] text-white sm:text-[20px]"
        >
          Receba agendamentos online, organize seus horários e ofereça uma
          experiência mais profissional aos seus clientes.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:gap-6"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/cadastro"
              className="group relative inline-flex items-center gap-4 overflow-hidden rounded-full bg-white py-2 pl-6 pr-2 text-lg font-medium text-[#111] shadow-[0_0_0_rgba(255,255,255,0)] transition-shadow hover:shadow-[0_0_28px_rgba(255,255,255,0.25)]"
            >
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/70 opacity-0 blur-md transition-all duration-700 group-hover:left-[115%] group-hover:opacity-100" />
              Começar grátis
              <span className="relative flex size-10 items-center justify-center rounded-full bg-[#202020] text-white transition-colors group-hover:bg-[#3b3b3b]">
                <ArrowRight className="size-5" />
              </span>
            </Link>
          </motion.div>

          <Link
            href="/#como-funciona"
            className="group inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/5 hover:text-white"
          >
            <Play className="size-4 fill-current" />
            Ver como funciona
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        {children ? (
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            className="mt-16 w-full max-w-3xl text-left"
          >
            {children}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}

function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | undefined;
    const playVideo = () => {
      video.play().catch(() => undefined);
    };

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(videoSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, playVideo);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoSrc;
      video.addEventListener("loadedmetadata", playVideo, { once: true });
    }

    return () => {
      hls?.destroy();
      video.removeEventListener("loadedmetadata", playVideo);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden bg-black">
      <Image
        src="/images/hero.png"
        alt=""
        fill
        priority
        className="object-cover"
        sizes="100vw"
      />
      <video
        ref={videoRef}
        aria-hidden="true"
        autoPlay
        muted
        loop
        playsInline
        poster="/images/hero.png"
        className="absolute inset-0 size-full object-cover opacity-60 grayscale saturate-0"
      />
    </div>
  );
}
