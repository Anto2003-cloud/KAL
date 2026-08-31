import React from 'react';

interface TabIntroProps {
  title: string;
  bullets: string[];
  warning?: string;
}

/** Explicación corta en español para pestañas técnicas */
export const TabIntro: React.FC<TabIntroProps> = ({ title, bullets, warning }) => (
  <div className="rounded-2xl border border-white/[0.08] bg-[#12141a] p-4 space-y-2">
    <h2 className="text-sm font-semibold text-white">{title}</h2>
    <ul className="space-y-1.5">
      {bullets.map((b) => (
        <li key={b} className="text-xs text-neutral-400 leading-relaxed flex gap-2">
          <span className="text-neutral-600 shrink-0">•</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
    {warning && (
      <p className="text-[11px] text-amber-400/90 pt-1 border-t border-white/[0.04] mt-2">
        {warning}
      </p>
    )}
  </div>
);
