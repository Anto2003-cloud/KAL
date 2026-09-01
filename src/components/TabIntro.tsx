import React from 'react';

interface TabIntroProps {
  title: string;
  subtitle?: string;
  bullets?: string[];
  warning?: string;
}

export const TabIntro: React.FC<TabIntroProps> = ({ title, subtitle, bullets, warning }) => (
  <div className="space-y-2">
    <div>
      <h2 className="text-base font-semibold text-white tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-neutral-500 mt-1 leading-relaxed max-w-2xl">{subtitle}</p>}
    </div>
    {bullets && bullets.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {bullets.map((b) => (
          <span
            key={b}
            className="text-[11px] text-neutral-400 bg-white/[0.03] border border-white/[0.06] rounded-full px-2.5 py-1"
          >
            {b}
          </span>
        ))}
      </div>
    )}
    {warning && <p className="text-[11px] text-neutral-500">{warning}</p>}
  </div>
);
