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
        !["preflight", "training", "training_history"].includes(body.action)
      )
        throw Error("INVALID_REQUEST");
      const result = await factory()(token, body.action, body.input);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      res.statusCode =
        message === "AUTH_REQUIRED"
          ? 401
          : message === "TOO_LARGE"
            ? 413
            : message === "TRAINING_LOCKED"
              ? 403
              : 400;
      const allowed = [
        "PROFILE_CHANGED",
        "AUTH_REQUIRED",
        "TOO_LARGE",
        "INVALID_REQUEST",
        "TRAINING_LOCKED",
        "RATE_LIMITED",
      ];
      res.end(
        JSON.stringify({
          error:
            allowed.includes(message) || /^TRAINING_[A-Z_]+$/.test(message)
              ? message
              : "ساخت برنامه با اطلاعات و محدودیت‌های فعلی ممکن نشد. هیچ پرداختی انجام نشده؛ برای بررسی با پشتیبانی تماس بگیر.",
        }),
      );
    }
  };
}
