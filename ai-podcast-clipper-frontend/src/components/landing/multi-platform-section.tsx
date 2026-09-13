import {
  SparklesIcon,
  CheckCircle2Icon,
} from "lucide-react";

export function MultiPlatformSection() {
  const platforms = [
    {
      name: "TikTok",
      tag: "Maximum Reach",
      description: "Auto-margins ensure subtitles never overlap TikTok's right-side interaction icons.",
      ratio: "9:16 Vertical",
      highlight: "Safe-zone aligned",
    },
    {
      name: "Instagram Reels",
      tag: "Engagement",
      description: "Optimized for visual audio hooks and high-retention thumbnail frame selection.",
      ratio: "9:16 Vertical",
      highlight: "Clean caption bounds",
    },
    {
      name: "YouTube Shorts",
      tag: "Long-term Search",
      description: "Algorithmic 3-second hook detection tuned for YouTube Shorts feed retention.",
      ratio: "9:16 Vertical",
      highlight: "Hook-first pacing",
    },
    {
      name: "LinkedIn Video",
      tag: "B2B Authority",
      description: "Burned-in dynamic captions calibrated for silent autoplay in professional feeds.",
      ratio: "9:16 / 1:1",
      highlight: "Silent-play ready",
    },
    {
      name: "X (Twitter)",
      tag: "Fast Discussions",
      description: "High bit-rate compression preserving speaker clarity on desktop and mobile timelines.",
      ratio: "9:16 Vertical",
      highlight: "Instant playback",
    },
  ];

  return (
    <section id="platforms" className="border-t border-[var(--linha)] py-20 bg-[var(--tinta)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-[var(--ouro)] uppercase">
            Multi-Platform Distribution
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--marfim)] sm:text-3xl">
            One Click. Formatted for Every Major Feed.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--fumaca)]">
            Never crop twice or worry about text hidden behind UI buttons. Every clip is rendered with
            platform-accurate safe margins.
          </p>
        </div>

        {/* Platform Grid */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((p, idx) => (
            <div
              key={idx}
              className="relative flex flex-col justify-between rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-5 backdrop-blur-sm transition-all duration-200 hover:border-[var(--ouro)]/40 hover:bg-[var(--superficie-2)]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-[var(--marfim)]">{p.name}</span>
                  <span className="rounded-full border border-[var(--linha-2)] bg-[var(--tinta)] px-2.5 py-0.5 font-mono text-[10px] text-[var(--marfim-2)]">
                    {p.tag}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-[var(--fumaca)] leading-relaxed">{p.description}</p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[var(--linha)] pt-3 text-[11px] font-mono text-[var(--prata)]">
                <span>{p.ratio}</span>
                <span className="text-[var(--patina)] flex items-center gap-1">
                  <CheckCircle2Icon className="h-3 w-3" />
                  {p.highlight}
                </span>
              </div>
            </div>
          ))}

          {/* Master 6th Card: All-in-One Engine */}
          <div className="relative flex flex-col justify-between rounded-xl border border-[var(--ouro)]/40 bg-gradient-to-br from-[var(--superficie)] via-[var(--superficie-2)] to-[var(--superficie)] p-5 shadow-[0_0_25px_rgba(232,186,82,0.06)] sm:col-span-2 lg:col-span-1">
            <div>
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-4 w-4 text-[var(--ouro)]" />
                <span className="text-base font-semibold text-[var(--marfim)]">Universal Engine</span>
              </div>
              <p className="mt-2.5 text-xs text-[var(--marfim-2)] leading-relaxed">
                Export individual video files in 1080p 60FPS or download the complete batch archive with SRT
                transcripts and viral title suggestions included.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[var(--linha)] pt-3 font-mono text-[11px] text-[var(--fumaca)]">
              <span>Single or Batch Export</span>
              <span className="text-[var(--ouro)] font-semibold">100% Automated</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
