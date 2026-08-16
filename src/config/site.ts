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
      'The first 1,000 to reserve get a free lifetime spot — every version, forever, no subscription.',
    heroScarcity: 'First 1,000 reserve a free lifetime spot',
  },
} as const;

export function activeSocials(): { label: string; href: string }[] {
  const s = SITE.socials;
  return [
    { label: 'Instagram', href: s.instagram },
    { label: 'X', href: s.x },
    { label: 'Discord', href: s.discord },
  ].filter((x) => x.href.length > 0);
}
