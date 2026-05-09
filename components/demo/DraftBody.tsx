"use client";

import { useState } from "react";

export function DraftBody({
  body,
  citations,
  onCitationHover,
}: {
  body: string;
  citations: string[];
  onCitationHover?: (sourceId: string | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const parts = body.split(/(\[\d+\])/g);

  return (
    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-demo-foreground/90">
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return <span key={index}>{part}</span>;
        const citationNumber = parseInt(match[1], 10);
        const sourceId = citations[citationNumber - 1];
        const active = hover === citationNumber;
        return (
          <button
            key={index}
            type="button"
            onMouseEnter={() => {
              setHover(citationNumber);
              onCitationHover?.(sourceId ?? null);
            }}
            onMouseLeave={() => {
              setHover(null);
              onCitationHover?.(null);
            }}
            className={`mx-0.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-sm px-1 align-baseline text-[10px] font-medium transition-colors ${
              active
                ? "bg-demo-accent text-demo-accent-foreground"
                : "bg-demo-accent/15 text-demo-accent hover:bg-demo-accent/25"
            }`}
          >
            {citationNumber}
          </button>
        );
      })}
    </div>
  );
}
