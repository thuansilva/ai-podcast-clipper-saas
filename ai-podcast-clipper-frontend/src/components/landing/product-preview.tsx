"use client";

import { useState, useRef } from "react";
import {
  PlayIcon,
  PauseIcon,
  Volume2Icon,
  VolumeXIcon,
  CheckCircle2Icon,
  SparklesIcon,
  FlameIcon,
} from "lucide-react";

type SubtitlePreset = "HORMOZI" | "MINIMAL" | "DEV";

interface CaptionWord {
  text: string;
  time: number;
}

export function ProductPreview() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [preset, setPreset] = useState<SubtitlePreset>("HORMOZI");
  const [currentTime, setCurrentTime] = useState(0);

  const video16x9Ref = useRef<HTMLVideoElement>(null);
  const video9x16Ref = useRef<HTMLVideoElement>(null);

  const sampleWords: CaptionWord[] = [
    { text: "THE", time: 0.2 },
    { text: "BIGGEST", time: 0.9 },
    { text: "SECRET", time: 1.6 },
    { text: "NOBODY", time: 2.3 },
    { text: "TELLS", time: 3.1 },
    { text: "YOU", time: 3.8 },
    { text: "ABOUT", time: 4.4 },
    { text: "GROWTH!", time: 5.0 },
  ];

  // Sync playback between both video elements
  const togglePlay = () => {
    if (isPlaying) {
      video16x9Ref.current?.pause();
      video9x16Ref.current?.pause();
      setIsPlaying(false);
    } else {
      void video16x9Ref.current?.play().catch(() => undefined);
      void video9x16Ref.current?.play().catch(() => undefined);
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    if (video9x16Ref.current) {
      video9x16Ref.current.muted = nextMute;
    }
    setIsMuted(nextMute);
  };

  const handleTimeUpdate = () => {
    if (video9x16Ref.current) {
      setCurrentTime(video9x16Ref.current.currentTime);
    }
  };

  // Find active word index
  const activeWordIndex = sampleWords.findIndex((w, idx) => {
    const nextTime = sampleWords[idx + 1]?.time ?? 6.0;
    return currentTime >= w.time && currentTime < nextTime;
  });

  return (
    <section id="demo" className="py-16 relative">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--linha-2)] bg-[var(--superficie)] px-3.5 py-1 font-mono text-xs text-[var(--ouro)] uppercase tracking-wider mb-2">
            <SparklesIcon className="h-3.5 w-3.5 text-[var(--ouro)]" />
            Live Engine Demonstration
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--marfim)] sm:text-3xl">
            See the Intelligent Reframe in Action
          </h2>
          <p className="mt-2 text-sm text-[var(--fumaca)]">
            Real-time active speaker tracking with automated 16:9 to 9:16 reframing and synced captions.
          </p>
        </div>

        {/* Studio Controls Header */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-t-2xl border border-b-0 border-[var(--linha)] bg-[var(--superficie)]/90 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="flex items-center gap-1.5 rounded-full border border-[var(--linha-2)] bg-[var(--superficie-2)] px-3.5 py-1.5 font-mono text-xs font-medium text-[var(--marfim)] hover:border-[var(--ouro)] hover:text-[var(--ouro)] transition-all cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <PauseIcon className="h-3.5 w-3.5" /> Pause
                </>
              ) : (
                <>
                  <PlayIcon className="h-3.5 w-3.5" /> Play
                </>
              )}
            </button>
            <button
              onClick={toggleMute}
              className="flex items-center gap-1.5 rounded-full border border-[var(--linha)] bg-[var(--tinta)] px-3 py-1.5 font-mono text-xs text-[var(--fumaca)] hover:text-[var(--marfim)] hover:border-[var(--linha-2)] transition-colors cursor-pointer"
              title={isMuted ? "Unmute audio" : "Mute audio"}
            >
              {isMuted ? (
                <VolumeXIcon className="h-3.5 w-3.5" />
              ) : (
                <Volume2Icon className="h-3.5 w-3.5 text-[var(--patina)]" />
              )}
            </button>
          </div>

          {/* Subtitle Style Switcher */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-[var(--fumaca)] mr-1 hidden sm:inline">Caption Style:</span>
            {(["HORMOZI", "MINIMAL", "DEV"] as SubtitlePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                  preset === p
                    ? "bg-[var(--ouro)] text-[var(--tinta)] font-bold shadow-[0_0_12px_rgba(232,186,82,0.3)]"
                    : "bg-[var(--tinta)] text-[var(--fumaca)] hover:text-[var(--marfim)] border border-[var(--linha)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Split Video Container */}
        <div className="overflow-hidden rounded-b-2xl border border-[var(--linha)] bg-[var(--superficie)] p-4 sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            {/* Left: 16:9 Raw Source with Face Tracking overlay */}
            {/* Left: 16:9 Raw Source with Face Tracking overlay */}
            <div className="space-y-4 lg:col-span-6">
              <div className="flex items-center justify-between border-b border-[var(--linha)] pb-3">
                <span className="font-mono text-xs text-[var(--fumaca)]">INPUT SOURCE (YOUTUBE 16:9)</span>
                <span className="font-mono text-xs text-[var(--fumaca)]">01:14:30 FULL EPISODE</span>
              </div>

              {/* 16:9 Video Canvas */}
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--linha)] bg-[var(--tinta)]">
                <video
                  ref={video16x9Ref}
                  src="/demo/podcast-source-16x9.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />

                {/* Speaker Active HUD Tag */}
                <div className="absolute top-3 left-3 rounded-full border border-[var(--linha-2)] bg-[var(--tinta)]/90 px-3 py-1 font-mono text-[10px] text-[var(--marfim)] backdrop-blur-sm">
                  Active Speaker Isolation • 1080p
                </div>
              </div>

              {/* AI Timeline Peak Analysis */}
              <div className="rounded-xl border border-[var(--linha)] bg-[var(--tinta)]/60 p-3.5 space-y-2">
                <div className="flex justify-between text-[11px] font-mono text-[var(--fumaca)]">
                  <span className="flex items-center gap-1.5 text-[var(--marfim-2)]">
                    <FlameIcon className="h-3.5 w-3.5 text-[var(--cobre)]" />
                    High Retention Segment Found
                  </span>
                  <span className="text-[var(--marfim)]">00:14:22 → 00:15:08</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--superficie-2)] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[var(--cobre)] via-[var(--ouro)] to-[var(--patina)] w-4/5 ml-[10%]" />
                </div>
                <p className="text-[11px] text-[var(--fumaca)]">
                  Hook Score 9.6/10: Rapid speech tempo, direct problem statement, zero dead air.
                </p>
              </div>
            </div>

            {/* Right: 9:16 Vertical Smartphone View with Dynamic Captions */}
            <div className="flex flex-col items-center lg:col-span-6">
              <div className="w-full max-w-[280px] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--linha)] pb-2">
                  <span className="font-mono text-xs text-[var(--fumaca)]">SMART CROP (9:16 VERTICAL)</span>
                  <span className="rounded-full bg-[var(--patina)]/15 border border-[var(--patina)]/40 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--patina)]">
                    Viral Score: 94/100
                  </span>
                </div>

                {/* Smartphone Device Mockup */}
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border-2 border-[var(--linha-2)] bg-[var(--tinta)] shadow-[0_0_50px_rgba(0,0,0,0.9),0_0_20px_rgba(232,186,82,0.1)]">
                  {/* Real Vertical Video Playback */}
                  <video
                    ref={video9x16Ref}
                    src="/demo/podcast-vertical-9x16.mp4"
                    autoPlay
                    loop
                    muted={isMuted}
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    className="absolute inset-0 h-full w-full object-cover"
                  />

                  {/* Overlaid UI Canvas */}
                  <div className="absolute inset-0 flex flex-col justify-between p-4 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none">
                    {/* Top Status */}
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-black/70 px-2.5 py-0.5 font-mono text-[10px] text-[var(--marfim-2)] backdrop-blur-sm border border-[var(--linha)]">
                        00:46s
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ouro)] flex items-center gap-1 font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ouro)] animate-ping" />
                        REC
                      </span>
                    </div>

                    {/* Dynamic Synchronized Captions */}
                    <div className="my-auto text-center px-1">
                      {preset === "HORMOZI" && (
                        <div className="inline-block bg-black/80 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-[var(--linha)] shadow-lg">
                          <p className="text-base font-black uppercase tracking-tight leading-tight">
                            {sampleWords.map((word, wIdx) => {
                              const isActive = wIdx === activeWordIndex;
                              return (
                                <span
                                  key={wIdx}
                                  className={`inline-block mx-0.5 transition-all duration-150 ${
                                    isActive
                                      ? "bg-[var(--ouro)] text-[var(--tinta)] px-1.5 py-0.5 rounded font-black scale-110 shadow-[0_0_10px_rgba(232,186,82,0.4)]"
                                      : "text-[var(--marfim)]"
                                  }`}
                                >
                                  {word.text}
                                </span>
                              );
                            })}
                          </p>
                        </div>
                      )}

                      {preset === "MINIMAL" && (
                        <div className="inline-block bg-black/70 px-3 py-1 rounded backdrop-blur-sm border border-[var(--linha)]">
                          <p className="text-xs font-medium text-[var(--marfim-2)] tracking-wide">
                            {sampleWords.map((word, wIdx) => (
                              <span
                                key={wIdx}
                                className={`mx-0.5 ${
                                  wIdx === activeWordIndex ? "text-[var(--ouro)] font-bold underline" : "text-[var(--fumaca)]"
                                }`}
                              >
                                {word.text}
                              </span>
                            ))}
                          </p>
                        </div>
                      )}

                      {preset === "DEV" && (
                        <div className="inline-block bg-[var(--tinta)]/95 border border-[var(--patina)]/50 px-3 py-1 rounded font-mono">
                          <p className="text-[11px] text-[var(--patina)]">
                            &gt; {sampleWords[activeWordIndex]?.text ?? sampleWords[0]!.text} _
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom Safe Zone Indicator */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--fumaca)]">
                        <span className="flex items-center gap-1 text-[var(--patina)]">
                          <CheckCircle2Icon className="h-3 w-3" />
                          TikTok & Reels Safe Margins
                        </span>
                        <span className="text-[var(--prata)]">60 FPS</span>
                      </div>
                      <div className="h-1 w-full bg-[var(--superficie-2)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--ouro)] transition-all duration-200"
                          style={{ width: `${(currentTime / 6.0) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
