// src/config/site.ts
// PUBLIC site config — safe to ship to the browser. Secrets never go here.
export const SITE = {
  name: 'Angel0x1',
  domain: 'https://angel0x1.com',
  cap: 1000,
  socials: {
    x: 'https://x.com/angel0x1_',
    instagram: 'https://instagram.com/angel0x1_',
    discord: '', // optional — omitted from UI if empty
  },
  copy: {
    reserveEyebrow: 'Early access',
    reserveHeadline: 'Be there at the start.',
    reserveSub:
      'The first 1,000 to reserve get 3 months of Angel free — a private place to think, on your device.',
    heroScarcity: 'First 1,000 get 3 months free',
  },
} as const;

export type SocialKey = 'instagram' | 'x' | 'discord';

export function activeSocials(): { key: SocialKey; label: string; href: string }[] {
  const s = SITE.socials;
  return [
    { key: 'instagram', label: 'Instagram', href: s.instagram },
    { key: 'x', label: 'X', href: s.x },
    { key: 'discord', label: 'Discord', href: s.discord },
  ].filter((x) => x.href.length > 0);
}
