import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";
import {
  makeBodyReport,
  validateMeasurements,
  views,
  type BodyReport,
} from "../src/professional/body/contracts.ts";
import { assessPhotos, type ScanPhoto } from "./proBodyProvider.ts";
import { ProServerError } from "./proPlanService.ts";
const uuid = (x: unknown) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
export interface BodyDeps {
  verify: (token: string) => Promise<string>;
  reserve: (
    args: Record<string, unknown>,
  ) => Promise<{
    id: string;
    report?: BodyReport;
    answers?: { height_cm: number; weight_kg: number };
  }>;
  finish: (args: Record<string, unknown>) => Promise<unknown>;
  assess: (photos: ScanPhoto[]) => ReturnType<typeof assessPhotos>;
  model: string;
  reportFailure?: (
    actor: string,
    org: string,
    id: string,
    code: string,
  ) => Promise<unknown>;
}
export function bodyDependencies(): BodyDeps {
  const url = process.env.VITE_SUPABASE_URL,
    anon = process.env.VITE_SUPABASE_ANON_KEY,
    secret = process.env.SUPABASE_SERVICE_ROLE_KEY,
    key = process.env.OPENAI_API_KEY,
    model = process.env.PRO_BODY_SCAN_MODEL || "gpt-4.1-2025-04-14";
  if (
    process.env.PRO_BODY_SCAN_ENABLED !== "true" ||
    !url ||
    !anon ||
    !secret ||
    !key
  )
    throw new ProServerError("PRO_SCAN_NOT_CONFIGURED", 503);
  const opts = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(12000),
        }),
    },
  };
  const admin = createClient(url, secret, opts),
    auth = createClient(url, anon, opts);
  async function call<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await admin.rpc(name, args);
    if (error) {
      const code = /PRO_[A-Z_]+/.exec(error.message)?.[0];
      throw new ProServerError(
        code ??
          (error.code === "PGRST202"
            ? "PRO_MIGRATION_REQUIRED"
            : "PRO_CONNECTION_ERROR"),
        code === "PRO_ACCESS_DENIED"
          ? 403
          : code === "PRO_SCAN_PROCESSING"
            ? 409
            : code === "PRO_SCAN_LIMIT"
              ? 429
              : 503,
      );
    }
    return data as T;
  }
  return {
    model,
    reportFailure: (actor, org, id, code) =>
      call("pro_report_failure", {
        p_actor: actor,
        p_org: org,
        p_id: id,
        p_operation: "scan",
        p_code: code,
      }),
    verify: async (token) => {
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user?.phone_confirmed_at || !data.user?.phone)
        throw new ProServerError("PRO_AUTH_REQUIRED", 401);
      return data.user.id;
    },
    reserve: (a) => call("pro_reserve_body_report", a),
    finish: (a) => call("pro_finish_body_report", a),
    assess: (p) => assessPhotos(p, model, key),
  };
}
export function createBodyHandler(
  dependencies: () => BodyDeps = bodyDependencies,
) {
  return async (
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
  ) => {
    const requestId = randomUUID(),
      started = Date.now();
    let actorForLog: string | undefined, orgForLog: string | undefined;
    let deps: BodyDeps | undefined, finish: Record<string, unknown> | undefined;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        throw new ProServerError("PRO_METHOD_NOT_ALLOWED", 405);
      }
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new ProServerError("PRO_ACCESS_DENIED", 403);
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) throw new ProServerError("PRO_AUTH_REQUIRED", 401);
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw new ProServerError("PRO_INVALID_REQUEST", 415);
      const max = 3_500_000;
      if (Number(req.headers["content-length"] ?? 0) > max)
        throw new ProServerError("PRO_REQUEST_TOO_LARGE", 413);
      let body = req.body;
      if (body === undefined) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const c of req) {
          const part = Buffer.from(c);
          size += part.length;
          if (size > max)
            throw new ProServerError("PRO_REQUEST_TOO_LARGE", 413);
          chunks.push(part);
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      if (
        Buffer.byteLength(
          typeof body === "string" ? body : (JSON.stringify(body) ?? ""),
        ) > max
      )
        throw new ProServerError("PRO_REQUEST_TOO_LARGE", 413);
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          throw new ProServerError("PRO_INVALID_REQUEST");
        }
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new ProServerError("PRO_INVALID_REQUEST");
      const b = body as Record<string, unknown>;
      if (
        Object.keys(b).some(
          (k) =>
            ![
              "org",
              "record",
              "revision",
              "key",
              "photos",
              "measurements",
              "consent",
            ].includes(k),
        ) ||
        !uuid(b.org) ||
        !uuid(b.record) ||
        !uuid(b.key) ||
        !Number.isInteger(b.revision) ||
        Number(b.revision) < 1 ||
        b.consent !== true
      )
        throw new ProServerError("PRO_INVALID_REQUEST");
      if (
        !Array.isArray(b.photos) ||
        b.photos.length < 1 ||
        b.photos.length > 3
      )
        throw new ProServerError("PRO_INVALID_REQUEST");
      const photos = b.photos as ScanPhoto[];
      if (
        new Set(photos.map((p) => p?.view)).size !== photos.length ||
        photos.some(
          (p) =>
            !p ||
            !views.includes(p.view) ||
            typeof p.data !== "string" ||
            p.data.length > 1_050_000 ||
            !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data) ||
            Object.keys(p).some((k) => !["view", "data"].includes(k)),
        )
      )
        throw new ProServerError("PRO_INVALID_REQUEST");
      for (const p of photos) {
        const bytes = Buffer.from(p.data.split(",")[1], "base64");
        if (
          bytes.length < 100 ||
          bytes[0] !== 255 ||
          bytes[1] !== 216 ||
          bytes[2] !== 255
        )
          throw new ProServerError("PRO_INVALID_REQUEST");
      }
      let measurements;
      try {
        measurements = validateMeasurements(b.measurements);
      } catch (e) {
        throw new ProServerError(
          e instanceof Error ? e.message : "PRO_INVALID_REQUEST",
        );
      }
      deps = dependencies();
      const actor = await deps.verify(token),
        lease = randomUUID();
      actorForLog = actor;
      orgForLog = String(b.org);
      const hash = createHash("sha256")
        .update(JSON.stringify({ photos, measurements }))
        .digest("hex");
      const reserved = await deps.reserve({
        p_actor: actor,
        p_org: b.org,
        p_record: b.record,
        p_revision: b.revision,
        p_key: b.key,
        p_hash: hash,
        p_lease: lease,
      });
      if (reserved.report) {
        res.statusCode = 200;
        res.end(JSON.stringify({ id: reserved.id, report: reserved.report }));
        return;
      }
      finish = { p_actor: actor, p_org: b.org, p_key: b.key, p_lease: lease };
      if (!reserved.answers)
        throw new ProServerError("PRO_CONNECTION_ERROR", 503);
      const assessments = await deps.assess(photos);
      const report = makeBodyReport(
        reserved.answers.height_cm,
        reserved.answers.weight_kg,
        Number(b.revision),
        measurements,
        assessments,
        deps.model,
      );
      await deps.finish({ ...finish, p_report: report });
      finish = undefined;
      res.statusCode = 200;
      res.end(JSON.stringify({ id: reserved.id, report }));
    } catch (e) {
      if (finish && deps)
        try {
          await deps.finish({ ...finish, p_report: null });
        } catch {
          /* preserve original failure */
        }
      const code =
        e instanceof ProServerError ? e.code : "PRO_CONNECTION_ERROR";
      if (actorForLog && orgForLog && deps?.reportFailure)
        try {
          await deps.reportFailure(actorForLog, orgForLog, requestId, code);
        } catch {
          /* metadata logging must not replace the response */
        }
      console.error(
        JSON.stringify({
          event: "pro_body_failed",
          request_id: requestId,
          code,
          duration_ms: Date.now() - started,
        }),
      );
      res.statusCode = e instanceof ProServerError ? e.status : 503;
      res.end(JSON.stringify({ error: code }));
    }
  };
}
