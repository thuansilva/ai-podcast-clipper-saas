"use client";

import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "~/lib/utils";

interface CustomVideoPlayerProps {
  src: string;
  className?: string;
}

export function CustomVideoPlayer({ src, className }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false); // Can default to true if auto-playing on hover might be annoying, but keeping as false

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        void videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      setProgress((current / total) * 100);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setProgress(100);
  };

  const SEEK_STEP_SECONDS = 5;

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const clamped = Math.min(Math.max(seconds, 0), video.duration);
    video.currentTime = clamped;
    setProgress((clamped / video.duration) * 100);
  };

  // Barra de progresso acessível por teclado (WAI-ARIA slider):
  // setas ±5s, Home = início, End = fim.
  const handleProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        seekTo(video.currentTime + SEEK_STEP_SECONDS);
        break;
      case "ArrowLeft":
        e.preventDefault();
        seekTo(video.currentTime - SEEK_STEP_SECONDS);
        break;
      case "Home":
        e.preventDefault();
        seekTo(0);
        break;
      case "End":
        e.preventDefault();
        seekTo(video.duration);
        break;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation(); // prevent togglePlay
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      videoRef.current.currentTime = percentage * videoRef.current.duration;
      setProgress(percentage * 100);
    }
  };

  // O estado de reprodução/progresso não é resetado via useEffect quando
  // `src` muda: o componente pai deve passar `key={src}` (ver clip-card.tsx
  // e clip-details-modal.tsx), forçando uma nova instância sempre que o
  // vídeo trocar — o próprio useState já inicializa isPlaying/progress
  // zerados para essa nova instância, sem precisar de um efeito síncrono.

  return (
    <div 
      className={cn("relative w-full h-full group bg-black cursor-pointer overflow-hidden", className)}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        className="w-full h-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleVideoEnd}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        playsInline
      />

      {/* Controle central de play/pause: <button> nativo (WCAG 2.1.1 / 4.1.2).
          O clique no wrapper continua funcionando para mouse; este botão é o
          equivalente acessível por teclado. Quando o vídeo toca, o botão fica
          invisível mas continua focável, então o foco precisa ser visível. */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-all duration-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ouro)]",
          isPlaying ? "opacity-0 scale-110 pointer-events-none" : "opacity-100 scale-100 bg-black/30"
        )}
      >
        <span className="w-16 h-16 rounded-full bg-[var(--superficie)]/80 backdrop-blur-md border border-[var(--ouro)] flex items-center justify-center text-[var(--ouro)] shadow-lg transition-transform hover:scale-105">
          {isPlaying ? (
            <Pause className="w-8 h-8 fill-current" aria-hidden="true" />
          ) : (
            <Play className="w-8 h-8 fill-current ml-1" aria-hidden="true" />
          )}
        </span>
      </button>

      {/* Mute/Unmute Toggle (Moved to LEFT) */}
      <button
        onClick={toggleMute}
        aria-label={isMuted ? "Ativar som" : "Desativar som"}
        className="absolute bottom-3 left-3 p-1.5 rounded-full bg-black/50 text-[var(--marfim)] hover:text-[var(--ouro)] backdrop-blur-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity z-10"
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      {/* Progress Bar Container (Clickable) */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Progresso do vídeo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="absolute bottom-0 left-0 w-full h-1.5 bg-white/10 hover:h-2.5 focus-visible:h-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)] transition-all cursor-pointer z-10"
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
      >
        {/* Progress Fill */}
        <div 
          className="h-full bg-[var(--ouro)] transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
