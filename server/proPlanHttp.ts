import { randomUUID } from 'node:crypto';
import { PRO_PLAN_TIMEOUT } from './proPlanDeadline.ts';
import { proHealth } from './proHealth.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProServerError, processPlanRequest, type PlanDependencies } from './proPlanService.ts';
import { supabasePlanDependencies } from './proPlanSupabase.ts';
export function createPlanHandler(dependencies: (deadline: AbortSignal) => PlanDependencies = supabasePlanDependencies, health = proHealth) {
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
    const requestId=randomUUID(),started=Date.now();
    const budget = req.method === 'GET' ? 10_000 : 50_000;
    const deadline = AbortSignal.timeout(budget);
    const expiresAt = performance.now() + budget;
    let deps:PlanDependencies|undefined,actor:string|undefined,body:unknown;
    let operation: 'generate' | 'catalog' | 'save' | undefined;
    let menuCount: number | undefined;
    let catalogCacheHit: boolean | undefined;
    const timing: Record<string, number> = {};
    const responseTiming = () => {
      const phases = Object.entries(timing).map(([name, ms]) => `${name};dur=${ms}`);
      res.setHeader('Server-Timing', [...phases, `total;dur=${Date.now()-started}`].join(', '));
    };
    res.setHeader('X-Request-Id',requestId);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      if (req.method === 'GET') {
        const token=req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
        if(!token)throw new ProServerError('PRO_AUTH_REQUIRED',401);
        const state=await health(token, deadline, (phase, duration) => { timing[phase] = duration; });responseTiming();res.statusCode=200;res.end(JSON.stringify(state));return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); throw new ProServerError('PRO_METHOD_NOT_ALLOWED',405); }
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ProServerError('PRO_INVALID_REQUEST',415);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new ProServerError('PRO_ACCESS_DENIED',403);
      const auth = req.headers.authorization;
      if (!auth || !/^Bearer \S+$/i.test(auth)) throw new ProServerError('PRO_AUTH_REQUIRED',401);
      if (Number(req.headers['content-length'] || 0) > 8192) throw new ProServerError('PRO_REQUEST_TOO_LARGE',413);
      body = req.body;
      if (body === undefined) {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const c of req) {
          const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
          bytes += chunk.length;
          if (bytes > 8192) throw new ProServerError('PRO_REQUEST_TOO_LARGE',413);
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (typeof body === 'string') {
        if (Buffer.byteLength(body) > 8192) throw new ProServerError('PRO_REQUEST_TOO_LARGE',413);
        try { body = JSON.parse(body); } catch { throw new ProServerError('PRO_INVALID_REQUEST'); }
      } else if (Buffer.byteLength(JSON.stringify(body) ?? '') > 8192) throw new ProServerError('PRO_REQUEST_TOO_LARGE',413);
      const payload = body as Record<string, unknown> | null;
      if (payload?.action === 'generate' || payload?.action === 'catalog' || payload?.action === 'save') operation = payload.action;
      if (operation === 'generate' && typeof payload?.count === 'number' && Number.isInteger(payload.count) && payload.count >= 1 && payload.count <= 5) menuCount = payload.count;
      deps=dependencies(deadline);
      const originalVerify=deps.verifyToken;
      const requestDeps={...deps,verifyToken:async(token:string)=>{actor=await originalVerify(token);return actor;}};
      const result = await processPlanRequest(body, auth.slice(7), requestDeps, (phase, duration, details) => {
        timing[phase] = duration;
        if (phase === 'catalog') catalogCacheHit = details?.cacheHit;
      }, () => {
        // A synchronous solve can hold the event loop past the abort timer.
        if (performance.now() >= expiresAt || deadline.aborted) throw new ProServerError(PRO_PLAN_TIMEOUT, 504);
      });
      responseTiming();
      if (operation === 'generate') console.info(JSON.stringify({
        event:'pro_plan_generated', request_id:requestId, menus:menuCount,
        replayed:timing.solve === undefined, duration_ms:Date.now()-started, phases_ms:timing, catalog_cache_hit:catalogCacheHit,
      }));
      res.statusCode = 200; res.end(JSON.stringify(result));
    } catch (e) {
      const code=e instanceof ProServerError?e.code:'PRO_CONNECTION_ERROR';
      const b=body as Record<string,unknown>|undefined;
      if(!deadline.aborted && performance.now() < expiresAt && actor && deps?.reportFailure && b && typeof b.org==='string' && /^[0-9a-f-]{36}$/i.test(b.org) && (b.action==='generate'||b.action==='save')) {
        try {await deps.reportFailure({id:requestId,actor,org:b.org,operation:b.action,code});}catch{/* Logging must not change the original result. */}
      }
      // Metadata only. Never log the request, JWT, profile, notes or raw error.
      console.error(JSON.stringify({event:'pro_request_failed',request_id:requestId,code,duration_ms:Date.now()-started,operation,menus:menuCount,phases_ms:timing,catalog_cache_hit:catalogCacheHit}));
      responseTiming();
      res.statusCode = e instanceof ProServerError ? e.status : 503;
      res.end(JSON.stringify({ error:e instanceof ProServerError ? e.code : 'PRO_CONNECTION_ERROR' }));
    }
  };
}
