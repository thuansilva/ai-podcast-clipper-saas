"use client";

import { useEffect, useState } from "react";
import { PlayIcon, Wand2Icon, LayoutTemplateIcon, Volume2Icon } from "lucide-react";

export function ShowcaseCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  const showcases = [
    {
      title: "Artificial Intelligence in Action",
      description: "Our AI analyzes your podcast and finds the highest retention moments automatically.",
      icon: <Wand2Icon className="h-5 w-5" />,
      color: "var(--ouro)",
      bgImage: "https://images.unsplash.com/photo-1593697972672-005c935406d2?q=80&w=1600&auto=format&fit=crop",
    },
    {
      title: "Perfect Vertical Cuts",
      description: "Auto-framing of the active speaker. Perfect for TikTok, Reels, and Shorts.",
      icon: <LayoutTemplateIcon className="h-5 w-5" />,
      color: "var(--patina)",
      bgImage: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=1600&auto=format&fit=crop",
    },
    {
      title: "Dynamic Captions",
      description: "Viral styles with word highlighting and auto-generated emojis in one click.",
      icon: <Volume2Icon className="h-5 w-5" />,
      color: "var(--cobre)",
      bgImage: "https://images.unsplash.com/photo-1516280440502-0c9f13c6b245?q=80&w=1600&auto=format&fit=crop",
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % showcases.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [showcases.length]);

  return (
    <section className="py-24 bg-[var(--tinta)] relative overflow-hidden" id="showcase">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="font-mono text-xs tracking-wider text-[var(--ouro)] uppercase">
            Product Showcase
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-[var(--marfim)] sm:text-4xl">
            See the Magic Happen
          </h2>
          <p className="mt-4 text-sm text-[var(--fumaca)] max-w-2xl mx-auto">
            Dozens of hours of manual editing reduced to a few clicks. See how Podcast Clipper Studio turns your content into a viral machine.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Navigation Controls */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {showcases.map((showcase, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`text-left p-6 rounded-2xl transition-all duration-300 border ${
                  activeIndex === idx
                    ? "bg-[var(--superficie)] border-[var(--ouro)]/50 shadow-[0_0_30px_rgba(232,186,82,0.1)]"
                    : "bg-transparent border-transparent hover:bg-[var(--superficie-2)]"
                }`}
              >
                <div className="flex items-center gap-4 mb-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors`}
                    style={{
                      backgroundColor: activeIndex === idx ? showcase.color : "var(--superficie)",
                      color: activeIndex === idx ? "var(--tinta)" : "var(--marfim-2)",
                    }}
                  >
                    {showcase.icon}
                  </div>
                  <h3 className={`font-semibold text-lg ${activeIndex === idx ? "text-[var(--marfim)]" : "text-[var(--fumaca)]"}`}>
                    {showcase.title}
                  </h3>
                </div>
                <p className={`text-sm leading-relaxed transition-all ${activeIndex === idx ? "text-[var(--marfim-2)] h-auto opacity-100" : "h-0 opacity-0 overflow-hidden"}`}>
                  {showcase.description}
                </p>
              </button>
            ))}
          </div>

          {/* Visual Display */}
          <div className="lg:col-span-8 relative aspect-video rounded-3xl overflow-hidden border border-[var(--linha)] shadow-2xl bg-[var(--superficie)] group">
            {showcases.map((showcase, idx) => (
              <div
                key={idx}
                className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                  activeIndex === idx ? "opacity-100 z-10" : "opacity-0 z-0"
                }`}
              >
                {/* Mockup Overlay for context */}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--tinta)] via-transparent to-transparent opacity-80 z-20" />
                
                <img
                  src={showcase.bgImage}
                  alt={showcase.title}
                  className="w-full h-full object-cover opacity-60 scale-105 transition-transform duration-[10s] group-hover:scale-100"
                />

                {/* Fake UI Elements superimposed to look like the app */}
                <div className="absolute inset-0 z-30 p-8 flex flex-col justify-between pointer-events-none">
                  {/* Top bar fake */}
                  <div className="flex justify-between items-center opacity-70">
                    <div className="flex gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <div className="h-3 w-3 rounded-full bg-yellow-500" />
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                    </div>
                    <div className="px-4 py-1.5 rounded-full bg-[var(--tinta)]/50 backdrop-blur-md text-[10px] font-mono text-[var(--marfim)] border border-[var(--linha)]">
                      Rendering Clip #{idx + 1}...
                    </div>
                  </div>

                  {/* Center Play Button fake */}
                  <div className="self-center flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ouro)] text-[var(--tinta)] shadow-[0_0_40px_rgba(232,186,82,0.4)] backdrop-blur-md">
                    <PlayIcon className="h-6 w-6 ml-1" />
                  </div>

                  {/* Timeline Fake */}
                  <div className="w-full h-12 rounded-lg bg-[var(--tinta)]/60 backdrop-blur-md border border-[var(--linha)] flex items-center px-4 gap-2">
                    <div className="h-6 flex-1 bg-[var(--superficie-2)] rounded overflow-hidden flex">
                      <div className="h-full bg-[var(--patina)]/80 w-[15%]" />
                      <div className="h-full bg-[var(--ouro)] w-[10%] mx-1 shadow-[0_0_10px_rgba(232,186,82,0.5)]" />
                      <div className="h-full bg-[var(--patina)]/80 w-[45%]" />
                      <div className="h-full bg-[var(--ouro)] w-[8%] mx-1 shadow-[0_0_10px_rgba(232,186,82,0.5)]" />
                      <div className="h-full bg-[var(--patina)]/80 flex-1" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
