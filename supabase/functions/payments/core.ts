import { authorityValid, gatewayOrigin, uuidValid, type GatewayReply, type Mode } from './gateway.ts';

export interface Order {
  id: string; user_id: string; plan_code: string; plan_name: string;
  price_toman: number; amount_rial: number; duration_days: number; mode: Mode;
  status: 'creating' | 'pending' | 'paid' | 'failed'; authority: string | null;
  callback_token: string; ref_id: string | null; last_code: number | null;
  created_at: string; verified_at: string | null; is_new?: boolean;
}
export interface Subscription { mode: Mode; plan_code: string; starts_at: string; expires_at: string; revoked_at: string | null }
export interface Database {
  settings(): Promise<{mode: Mode; checkout_enabled: boolean}>;
  orders(query: string): Promise<Order[]>;
  subscriptions(userId: string): Promise<Subscription[]>;
  update(id: string, fields: Record<string, unknown>): Promise<void>;
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
}
export interface Dependencies {
  db: Database;
  authenticate(token: string): Promise<{id: string; phone?: string; phone_confirmed_at?: string} | null>;
  eligible(userId: string): Promise<boolean>;
  gateway(mode: Mode, method: 'request'|'verify'|'inquiry', body: Record<string, unknown>): Promise<GatewayReply>;
  site: string;
  reconcileSecret: string;
}

export async function verifyOrder(order: Order, deps: Dependencies, inquire = false): Promise<void> {
  if (order.status === 'paid' || !order.authority) return;
  const claimed = await deps.db.rpc<boolean>('billing_claim_verify', {p_order: order.id});
  if (!claimed) return;
  try {
    if (inquire) {
      const inquiry = await deps.gateway(order.mode, 'inquiry', {authority: order.authority});
      if (inquiry.code === 100 && ['FAILED','REVERSED'].includes(inquiry.status ?? '')) {
        await deps.db.update(order.id, {status:'failed',last_code:inquiry.status==='REVERSED' ? -1 : -51});
        return;
      }
      if (inquiry.code !== 100 || !['PAID','VERIFIED'].includes(inquiry.status ?? '')) return;
    }
    const result = await deps.gateway(order.mode, 'verify', {authority: order.authority, amount: order.amount_rial});
    if ((result.code === 100 || result.code === 101) && typeof result.ref_id === 'string' && /^[0-9]{1,30}$/.test(result.ref_id)) {
      await deps.db.rpc('billing_settle', {p_order: order.id, p_ref: result.ref_id, p_code: result.code});
    } else {
      await deps.db.update(order.id, {last_code: result.code});
    }
  } finally {
    // A DB outage after gateway verification is recovered by the next 101 response.
    await deps.db.update(order.id, {verify_lease_until: null});
  }
}

export function presentOrder(order: Order) {
  return { id: order.id, token: order.callback_token, planName: order.plan_name,
    priceToman: order.price_toman, mode: order.mode, status: order.status,
    refId: order.ref_id, lastCode: order.last_code, createdAt: order.created_at,
    paymentUrl: order.status === 'pending' && order.authority && Date.now()-Date.parse(order.created_at)<20*60*1000
      ? `${gatewayOrigin(order.mode)}/pg/StartPay/${order.authority}` : null };
}

export function paymentHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const allowed = !origin || [deps.site, 'https://www.behtan.fit', 'http://localhost:5173', 'http://localhost:4173'].includes(origin);
    const headers: Record<string,string> = { 'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin',
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, GET, OPTIONS' };
    if (origin && allowed) headers['Access-Control-Allow-Origin']=origin;
    const reply = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers});
    if (!allowed) return reply({error:'ORIGIN_DENIED'},403);
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    try {
      const url=new URL(req.url);
      if (req.method==='GET') {
        const token=url.searchParams.get('token'), authority=url.searchParams.get('Authority');
        if (!uuidValid(token) || !authorityValid(authority)) return reply({error:'INVALID_CALLBACK'},400);
        const [order]=await deps.db.orders(`callback_token=eq.${token}&authority=eq.${authority}&limit=1`);
        if (!order) return reply({error:'ORDER_NOT_FOUND'},404);
        if (url.searchParams.get('Status')==='OK') await verifyOrder(order,deps);
        return reply({received:true}); // Public callback reveals no user/order details.
      }
      if (req.method!=='POST') return reply({error:'METHOD_NOT_ALLOWED'},405);
      const raw=await req.text();
      if (raw.length>4096) return reply({error:'INVALID_REQUEST'},413);
      const body=JSON.parse(raw);
      const bearer=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') ?? '';
      if (body.action==='reconcile') {
        if (!deps.reconcileSecret || bearer!==deps.reconcileSecret) return reply({error:'UNAUTHORIZED'},401);
        const orders=await deps.db.orders('status=eq.pending&order=checked_at.asc.nullsfirst&limit=12');
        let checked=0;
        // Bounded batches; errors for one order never prevent recovery of another.
        for (let i=0;i<orders.length;i+=3) {
          await Promise.allSettled(orders.slice(i,i+3).map(async order=>{await verifyOrder(order,deps,true);checked++;}));
        }
        return reply({checked});
      }
      const user=await deps.authenticate(bearer);
      if (!user) return reply({error:'UNAUTHORIZED'},401);
      if (body.action==='status') {
        const [settings,subscriptions,orders]=await Promise.all([
          deps.db.settings(),deps.db.subscriptions(user.id),deps.db.orders(`user_id=eq.${user.id}&order=created_at.desc&limit=10`),
        ]);
        const now=Date.now();
        const active=subscriptions.find(s=>s.mode===settings.mode && !s.revoked_at && Date.parse(s.starts_at)<=now && Date.parse(s.expires_at)>now) ?? null;
        return reply({...settings,active,orders:orders.map(presentOrder)});
      }
      if (body.action==='verify') {
        if (!uuidValid(body.token)) return reply({error:'INVALID_REQUEST'},400);
        const [order]=await deps.db.orders(`callback_token=eq.${body.token}&user_id=eq.${user.id}&limit=1`);
        if (!order) return reply({error:'ORDER_NOT_FOUND'},404);
        await verifyOrder(order,deps,true);
        const [updated]=await deps.db.orders(`id=eq.${order.id}&limit=1`);
        return reply({order:presentOrder(updated)});
      }
      if (body.action!=='create' || typeof body.planCode!=='string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(body.planCode)
        || !Number.isSafeInteger(body.priceToman) || body.priceToman<0 || !Number.isInteger(body.durationDays)) return reply({error:'INVALID_REQUEST'},400);
      if (!await deps.eligible(user.id)) return reply({error:'PROFILE_INELIGIBLE'},403);
      const settings=await deps.db.settings();
      // Live charges require ownership proven by a completed Supabase phone OTP.
      if (settings.mode==='live' && (!user.phone_confirmed_at || !/^\+?989\d{9}$/.test(user.phone ?? ''))) return reply({error:'VERIFIED_PHONE_REQUIRED'},403);
      const order=await deps.db.rpc<Order>('billing_begin_order', {p_user:user.id,p_plan:body.planCode,p_price:body.priceToman,p_days:body.durationDays});
      // Check the authoritative order mode too, if an admin switched modes between reads.
      if (order.mode==='live' && (!user.phone_confirmed_at || !/^\+?989\d{9}$/.test(user.phone ?? ''))) {
        await deps.db.update(order.id,{status:'failed'});
        return reply({error:'VERIFIED_PHONE_REQUIRED'},403);
      }
      if (order.price_toman===0) {
        await deps.db.rpc('billing_settle',{p_order:order.id,p_ref:null,p_code:0});
        return reply({order:presentOrder({...order,status:'paid'})});
      }
      if (!order.is_new) return reply({order:presentOrder(order)});
      try {
        const result=await deps.gateway(order.mode,'request',{
          amount:order.amount_rial,currency:'IRR',description:`اشتراک ${order.plan_name} به‌تن`,
          callback_url:`${deps.site}/api/payment-callback?token=${order.callback_token}`,
          metadata:{order_id:order.id,auto_verify:false,...(user.phone ? {mobile:user.phone} : {})},
        });
        if (result.code!==100 || !authorityValid(result.authority) || result.authority[0] !== (order.mode==='live'?'A':'S')) {
          await deps.db.update(order.id,{status:'failed',last_code:result.code});
          return reply({error:'GATEWAY_REJECTED',code:result.code},502);
        }
        await deps.db.update(order.id,{authority:result.authority,status:'pending'});
        return reply({order:presentOrder({...order,authority:result.authority,status:'pending'})});
      } catch {
        // No checkout URL was handed to the client. A later creation can safely retry.
        await deps.db.update(order.id,{status:'failed'});
        return reply({error:'GATEWAY_UNAVAILABLE'},502);
      }
    } catch (error) {
      const message=error instanceof Error ? error.message : '';
      const code=['CHECKOUT_DISABLED','ALREADY_ACTIVE','PLAN_UNAVAILABLE','OFFER_CHANGED','CHECKOUT_BUSY','PENDING_ORDER_EXISTS','RATE_LIMITED'].find(c=>message.includes(c));
      return reply({error:code ?? 'PAYMENT_UNAVAILABLE'},code ? 409 : 503);
    }
  };
}
