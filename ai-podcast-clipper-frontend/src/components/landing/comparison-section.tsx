import { CheckIcon, XIcon } from "lucide-react";

export function ComparisonSection() {
  const comparisons = [
    {
      metric: "Time Spent per Episode",
      manual: "3 to 5 hours scrubbing timelines manually",
      clipper: "Under 3 minutes fully automated",
    },
    {
      metric: "Cost per Viral Clip",
      manual: "$25 to $75+ per video with freelance editors",
      clipper: "Less than $0.20 per finalized 1080p clip",
    },
    {
      metric: "Smart 9:16 Reframe",
      manual: "Manual keyframing and pan-and-scan",
      clipper: "AI active speaker face tracking & instant crop",
    },
    {
      metric: "Word-by-Word Subtitles",
      manual: "Manual transcription, proofreading & sync",
      clipper: "99% accurate dynamic animated Hormozi presets",
    },
    {
      metric: "Publishing Velocity",
      manual: "2 to 3 clips per week with immense friction",
      clipper: "15 to 20 clips weekly across all 5 networks",
    },
  ];

  return (
    <section id="comparison" className="border-t border-[var(--linha)] py-20 bg-[#0b0a08]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-[var(--ouro)] uppercase">
            Production Efficiency & ROI
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--marfim)] sm:text-3xl">
            Manual Video Editing vs. Podcast Clipper
          </h2>
          <p className="mt-2 text-sm text-[var(--fumaca)]">
            Stop wasting days inside editing timelines. Multiply your organic views without increasing payroll.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-xl border border-[var(--linha)] bg-[#161310] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          <div className="grid grid-cols-1 md:grid-cols-12 border-b border-[var(--linha)] bg-[#1d1914] p-4 font-mono text-xs text-[var(--fumaca)]">
            <div className="md:col-span-4 font-semibold uppercase text-[var(--marfim)]">Dimension</div>
            <div className="hidden md:block md:col-span-4 uppercase text-[var(--fumaca)]">Traditional Manual Editing</div>
            <div className="hidden md:block md:col-span-4 uppercase text-[var(--ouro)] font-semibold">With Podcast Clipper Studio</div>
          </div>

          <div className="divide-y divide-[var(--linha)]">
            {comparisons.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 p-4 text-sm gap-2 md:gap-0 items-center hover:bg-[#1d1914]/50 transition-colors">
                <div className="md:col-span-4 font-medium text-[var(--marfim)]">{item.metric}</div>
                <div className="md:col-span-4 flex items-center gap-2 text-[var(--fumaca)]">
                  <XIcon className="h-4 w-4 text-[var(--cobre)]/80 shrink-0" />
                  <span className="text-xs sm:text-sm">{item.manual}</span>
                </div>
                <div className="md:col-span-4 flex items-center gap-2 text-[var(--marfim)] font-medium">
                  <CheckIcon className="h-4 w-4 text-[var(--patina)] shrink-0" />
                  <span className="text-xs sm:text-sm">{item.clipper}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
