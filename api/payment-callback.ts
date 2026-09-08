import type { IncomingMessage, ServerResponse } from 'node:http';

/** Same-domain bank callback; verification continues even before the browser loads React. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='GET'){res.statusCode=405;res.end();return;}
  const url=new URL(req.url ?? '/', 'https://behtan.fit');
  const token=url.searchParams.get('token') ?? '';
  const authority=url.searchParams.get('Authority') ?? '';
  const status=url.searchParams.get('Status') ?? '';
  const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if(!valid){res.statusCode=400;res.end('Invalid callback');return;}
  try {
    const base=process.env.VITE_SUPABASE_URL;
    if(base && /^[AS][a-zA-Z0-9]{10,63}$/.test(authority) && status==='OK') {
      const callback=new URL('/functions/v1/payments',base);
      callback.search=new URLSearchParams({token,Authority:authority,Status:status}).toString();
      await fetch(callback,{redirect:'error',signal:AbortSignal.timeout(22000)});
    }
  } catch { /* Authenticated return page and scheduled reconciliation retry safely. */ }
  res.statusCode=303;
  res.setHeader('Location',`/?payment=${encodeURIComponent(token)}#auth`);
  res.end();
}
