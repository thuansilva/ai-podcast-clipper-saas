"use client";

import { useRef, useState, useEffect } from "react";
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

  const handleMouseEnter = () => {
    if (videoRef.current) {
      void videoRef.current.play();
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
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

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
  }, [src]);

  return (
    <div 
      className={cn("relative w-full h-full group bg-black cursor-pointer overflow-hidden", className)}
      onClick={togglePlay}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

      {/* Center Play/Pause Logo */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center transition-all duration-300",
        isPlaying ? "opacity-0 scale-110 pointer-events-none" : "opacity-100 scale-100 bg-black/30"
      )}>
        <div className="w-16 h-16 rounded-full bg-[var(--superficie)]/80 backdrop-blur-md border border-[var(--ouro)] flex items-center justify-center text-[var(--ouro)] shadow-lg transition-transform hover:scale-105">
          {isPlaying ? (
            <Pause className="w-8 h-8 fill-current" />
          ) : (
            <Play className="w-8 h-8 fill-current ml-1" />
          )}
        </div>
      </div>

      {/* Mute/Unmute Toggle (Moved to LEFT) */}
      <button 
        onClick={toggleMute}
        className="absolute bottom-3 left-3 p-1.5 rounded-full bg-black/50 text-[var(--marfim)] hover:text-[var(--ouro)] backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      {/* Progress Bar Container (Clickable) */}
      <div 
        className="absolute bottom-0 left-0 w-full h-1.5 bg-white/10 hover:h-2.5 transition-all cursor-pointer z-10"
        onClick={handleProgressClick}
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
