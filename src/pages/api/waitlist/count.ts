import type { APIRoute } from 'astro';

export const prerender = false;

// Runtime env (process.env) — not import.meta.env, which Vite inlines at build.
const env = (k: string): string | undefined => process.env[k];

export const GET: APIRoute = async () => {
  const cap = parseInt(env('WAITLIST_LIFETIME_CAP') ?? '5000', 10);

  const adapter = env('WAITLIST_STORE') ?? 'none';
  let count = 0;

  if (adapter === 'supabase') {
    const url = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (url && key) {
      try {
        const res = await fetch(`${url}/rest/v1/waitlist?select=count`, {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Prefer': 'count=exact',
          },
        });
        const raw = res.headers.get('content-range');
        if (raw) count = parseInt(raw.split('/')[1] ?? '0', 10);
      } catch { /* return 0 */ }
    }
  }

  return Response.json({ count, cap });
};

