import React, { useState } from 'react';

// Official MLB team ID for vector/high-res CDN logos
const MLB_TEAM_ID_MAP: Record<string, number> = {
  AZ: 109,
  ARI: 109,
  ATL: 144,
  BAL: 110,
  BOS: 111,
  CHC: 112,
  CWS: 145,
  CHW: 145,
  CIN: 113,
  CLE: 114,
  COL: 115,
  DET: 116,
  HOU: 117,
  KC: 118,
  LAA: 108,
  LAD: 119,
  MIA: 146,
  MIL: 158,
  MIN: 142,
  NYM: 121,
  NYY: 147,
  OAK: 133,
  ATH: 133,
  PHI: 143,
  PIT: 134,
  SD: 135,
  SF: 137,
  SEA: 136,
  STL: 138,
  TB: 139,
  TEX: 140,
  TOR: 141,
  WSH: 120,
  WAS: 120,
};

const ESPN_SLUG_MAP: Record<string, string> = {
  AZ: 'ari',
  ARI: 'ari',
  ATL: 'atl',
  BAL: 'bal',
  BOS: 'bos',
  CHC: 'chc',
  CWS: 'chw',
  CHW: 'chw',
  CIN: 'cin',
  CLE: 'cle',
  COL: 'col',
  DET: 'det',
  HOU: 'hou',
  KC: 'kc',
  LAA: 'laa',
  LAD: 'lad',
  MIA: 'mia',
  MIL: 'mil',
  MIN: 'min',
  NYM: 'nym',
  NYY: 'nyy',
  OAK: 'oak',
  ATH: 'oak',
  PHI: 'phi',
  PIT: 'pit',
  SD: 'sd',
  SF: 'sf',
  SEA: 'sea',
  STL: 'stl',
  TB: 'tb',
  TEX: 'tex',
  TOR: 'tor',
  WSH: 'wsh',
  WAS: 'wsh',
};

interface TeamLogoProps {
  abbr: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const TeamLogo: React.FC<TeamLogoProps> = ({ abbr, size = 'md', className = '' }) => {
  const [sourceIndex, setSourceIndex] = useState<number>(0);
  const cleanAbbr = (abbr || '').toUpperCase().trim();
  const teamId = MLB_TEAM_ID_MAP[cleanAbbr] || 119;
  const espnSlug = ESPN_SLUG_MAP[cleanAbbr] || cleanAbbr.toLowerCase();

  // Multi-tier CDN fallback: 1. Official MLB CDN SVG, 2. ESPN 500px transparent PNG, 3. MLB static PNG
  const logoUrls = [
    `https://www.mlbstatic.com/team-logos/${teamId}.svg`,
    `https://a.espncdn.com/i/teamlogos/mlb/500/${espnSlug}.png`,
    `https://midfield.mlbstatic.com/v1/team/${teamId}/spots/72`,
  ];

  const currentUrl = logoUrls[sourceIndex];

  const containerSizes = {
    sm: 'w-7 h-7 min-w-[28px]',
    md: 'w-9 h-9 min-w-[36px]',
    lg: 'w-12 h-12 min-w-[48px]',
  };

  const imageSizes = {
    sm: 'w-5 h-5 max-w-[20px] max-h-[20px]',
    md: 'w-7 h-7 max-w-[28px] max-h-[28px]',
    lg: 'w-10 h-10 max-w-[40px] max-h-[40px]',
  };

  if (sourceIndex >= logoUrls.length) {
    return (
      <div
        className={`${containerSizes[size]} rounded-xl bg-neutral-800 border border-white/[0.08] flex items-center justify-center font-bold text-[10px] text-neutral-300 shrink-0 ${className}`}
      >
        {cleanAbbr}
      </div>
    );
  }

  return (
    <div
      className={`${containerSizes[size]} rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center p-1 shrink-0 ${className}`}
    >
      <img
        key={`${cleanAbbr}-${sourceIndex}`}
        src={currentUrl}
        alt={`${cleanAbbr} logo`}
        className={`${imageSizes[size]} object-contain drop-shadow`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setSourceIndex((prev) => prev + 1)}
      />
    </div>
  );
};
