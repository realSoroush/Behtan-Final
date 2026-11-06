import type { IncomingMessage, ServerResponse } from "node:http";
import { memberService } from "./service.ts";
export function memberHandler(factory = memberService) {
  return async (
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
  ) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let mealSchedule = false;
    try {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw Error("AUTH_REQUIRED");
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) throw Error("AUTH_REQUIRED");
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        res.statusCode = 415;
        res.end("{}");
        return;
      }
      let raw = req.body;
      if (raw === undefined) {
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const c of req) {
          const b = Buffer.from(c);
          size += b.length;
          if (size > 12000) throw Error("TOO_LARGE");
          chunks.push(b);
        }
        raw = Buffer.concat(chunks).toString();
      }
      if (
        Buffer.byteLength(typeof raw === "string" ? raw : JSON.stringify(raw)) >
        12000
      )
        throw Error("TOO_LARGE");
      const body = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).some((k) => !["action", "input"].includes(k)) ||
        !["preflight", "training", "training_history", "meal_schedule"].includes(body.action)
      )
        throw Error("INVALID_REQUEST");
      mealSchedule = body.action === "meal_schedule";
      const result = await factory()(token, body.action, body.input);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const status: Record<string, number> = {
        AUTH_REQUIRED: 401, TOO_LARGE: 413, TRAINING_LOCKED: 403,
        ACCESS_DENIED: 403, STALE_CONTEXT: 409, STALE_INTAKE: 409,
        STALE_PLAN: 409, REQUEST_CONFLICT: 409, MEAL_NOT_EDITABLE: 409,
        NO_FEASIBLE_PLAN: 422, MEDICAL_REVIEW_REQUIRED: 422, INVALID_INTAKE: 422,
        RATE_LIMITED: 429, MEAL_SCHEDULE_MIGRATION_REQUIRED: 503, TIMEOUT: 504,
      };
      const allowed = ["PROFILE_CHANGED", "INVALID_REQUEST", "INVALID_MEAL_DATE", "INVALID_PLAN"];
      const known = Object.prototype.hasOwnProperty.call(status, message) || allowed.includes(message) || /^TRAINING_[A-Z_]+$/.test(message);
      res.statusCode = Object.prototype.hasOwnProperty.call(status, message) ? status[message] : (mealSchedule && !known ? 503 : 400);
      res.end(
        JSON.stringify({
          error:
            known
              ? message
              : mealSchedule ? "MEAL_SCHEDULE_UNAVAILABLE" : "ساخت برنامه با اطلاعات و محدودیت‌های فعلی ممکن نشد. هیچ پرداختی انجام نشده؛ برای بررسی با پشتیبانی تماس بگیر.",
        }),
      );
    }
  };
}
