import type { APIRoute } from 'astro';
import { countReserved } from '../../../lib/store.ts';
import { config } from '../../../lib/env.ts';

export const prerender = false;

export const GET: APIRoute = async () => {
  const { cap } = config();
  let reserved = 0;
  try {
    reserved = await countReserved();
  } catch {
    /* return 0 on error */
  }
  return Response.json(
    { reserved, cap },
    {
      // Public, non-sensitive aggregate. Edge-cache so an unauthenticated caller can't
      // force a DB count on every hit (cost/abuse guard); browsers revalidate.
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' },
    },
  );
};
