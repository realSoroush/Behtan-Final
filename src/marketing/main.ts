import "./base.css";
import { createRefreshTask } from "./refreshTask";
import "./pro.css";
import "./navigation.css";
import "./navigation";
import "./member-demo.js";
import "./pro-demo.js";
import { createClient } from "@supabase/supabase-js";
import { parsePro, parseMember, type Offer, type MemberOffer } from "./catalog";
const $ = (id: string) => document.getElementById(id)!;
const fa = (n: number) => n.toLocaleString("fa-IR");
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  cls?: string,
) => {
  const x = document.createElement(tag);
  if (text) x.textContent = text;
  if (cls) x.className = cls;
  return x;
};
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Marketing never reads or writes the visitor's authenticated session.
const db =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
let offers: Offer[] = [],
  member: MemberOffer[] = [],
  month = 1,
  stopped = false;
function list(features: string[]) {
  const ul = el("ul");
  for (const f of features) ul.append(el("li", f));
  return ul;
}
function renderPro() {
  const grid = $("pro-price-grid");
  grid.replaceChildren();
  for (const o of offers) {
    const c = el(
      "article",
      undefined,
      "pro-price" + (o.code === "combined" ? " highlight" : ""),
    );
    const price = el("div", fa(o.prices[String(month)]) + " ", "pro-amount");
    price.append(el("small", "تومان"));
    const a = el("a", "انتخاب این اشتراک ←", "btn");
    a.href = "https://pro.behtan.fit/?plan=" + encodeURIComponent(o.code) + "&months=" + month;
    c.append(
      el("h3", o.title),
      el("small", o.subtitle),
      price,
      el("p", "مجموع دورهٔ " + fa(month) + " ماهه"),
      list(o.features),
      a,
    );
    grid.append(c);
  }
  if (!offers.length)
    grid.append(el("p", "در حال حاضر اشتراک فعالی منتشر نشده است."));
}
function renderMember() {
  const grid = $("member-price-grid");
  grid.replaceChildren();
  for (const o of member) {
    const c = el(
        "article",
        undefined,
        "plan" + (o.code === "silver" ? " highlight" : ""),
      ),
      p = el(
        "div",
        o.price_toman === 0 ? "رایگان" : fa(o.price_toman) + " ",
        "duration",
      );
    if (o.price_toman) p.append(el("small", "تومان"));
    const a = el("a", "شروع برنامهٔ من ←", "btn");
    a.href = "/app?plan=" + encodeURIComponent(o.code) ;
    c.append(
      el("h3", o.name),
      p,
      el("p", fa(o.duration_days) + " روز"),
      list(o.features),
      a,
    );
    grid.append(c);
  }
  if (!member.length)
    grid.append(el("p", "در حال حاضر اشتراک فعالی منتشر نشده است."));
}
function failure(id: string, again: () => void) {
  const target = $(id);
  target.replaceChildren(
    el("p", "دریافت اطلاعات ممکن نشد. مبلغ قدیمی نمایش داده نمی‌شود."),
  );
  const b = el("button", "تلاش دوباره", "btn");
  b.onclick = again;
  target.append(b);
}
async function loadPrices() {
  await Promise.allSettled(
    [
      [
        "pro_offer_catalog",
        "pro-price-grid",
        parsePro,
        (rows: Offer[]) => {
          offers = rows;
          renderPro();
        },
      ],
      [
        "public_subscription_catalog",
        "member-price-grid",
        parseMember,
        (rows: MemberOffer[]) => {
          member = rows;
          renderMember();
        },
      ],
    ].map(async (item) => {
      const [rpc, id, parse, render] = item as [
        string,
        string,
        (x: unknown) => unknown,
        (rows: never) => void,
      ];
      try {
        if (!db) throw Error("CONFIG");
        const { data, error } = await db
          .rpc(rpc)
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        const rows = parse(data);
        if (!stopped) render(rows as never);
      } catch {
        if (!stopped) failure(id, () => void refresh());
      }
    }),
  );
}
const refresh = createRefreshTask(
  loadPrices,
  () => !stopped && !document.hidden,
);
document.querySelectorAll<HTMLButtonElement>("[data-pro-month]").forEach(
  (b) =>
    (b.onclick = () => {
      month = Number(b.dataset.proMonth);
      document
        .querySelectorAll("[data-pro-month]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (offers.length && $("pro-price-grid").querySelector(".pro-price"))
        renderPro();
    }),
);
async function loadContent() {
  try {
    if (!db) throw Error("CONFIG");
    const [settings, reviews] = await Promise.all([
      db
        .from("marketing_settings")
        .select("video_url")
        .eq("id", true)
        .abortSignal(AbortSignal.timeout(10000))
        .single(),
      db
        .from("marketing_testimonials")
        .select("id,author_name,author_role,quote,sort_order")
        .eq("is_published", true)
        .eq("consent_confirmed", true)
        .order("sort_order")
        .order("id")
        .limit(12)
        .abortSignal(AbortSignal.timeout(10000)),
    ]);
    if (stopped) return;
    if (!settings.error) {
      const v = $("pro-video") as HTMLVideoElement;
      const src = settings.data?.video_url;
      if (src && /^https:\/\//.test(src) && v.dataset.publishedSrc !== src) {
        v.dataset.publishedSrc = src;
        v.src = src;
        v.style.display = "block";
        $("video-placeholder").hidden = true;
        v.load();
      } else if (!src && v.dataset.publishedSrc) {
        v.pause();
        v.removeAttribute("src");
        delete v.dataset.publishedSrc;
        v.load();
        v.style.display = "none";
        $("video-placeholder").hidden = false;
        for (const id of [
          "video-play",
          "video-mute",
          "video-full",
          "video-seek",
        ])
          ($(id) as HTMLButtonElement).disabled = true;
      }
    }
    const area = $("testimonials-list");
    area.replaceChildren();
    if (reviews.error) area.append(el("p", "دریافت تجربه‌ها فعلاً ممکن نیست."));
    else if (!reviews.data?.length)
      area.append(
        el("p", "تجربه‌های تأییدشدهٔ متخصصان به‌زودی اینجا منتشر می‌شوند."),
      );
    else
      for (const row of reviews.data) {
        const c = el("article", undefined, "testimonial-item");
        c.append(
          el("blockquote", row.quote),
          el(
            "strong",
            row.author_name + (row.author_role ? " · " + row.author_role : ""),
          ),
        );
        area.append(c);
      }
  } catch {
    if (!stopped)
      $("testimonials-list").textContent = "دریافت تجربه‌ها فعلاً ممکن نیست.";
  }
}
const content = createRefreshTask(
  loadContent,
  () => !stopped && !document.hidden,
);
function updateCanonical() {
  const pro =
    location.hash.startsWith("#pro") ||
    location.pathname.startsWith("/professionals");
  document
    .querySelector('link[rel="canonical"]')
    ?.setAttribute(
      "href",
      "https://behtan.fit/" + (pro ? "professionals" : ""),
    );
}
window.addEventListener("hashchange", updateCanonical);
updateCanonical();
// Subscribe to non-sensitive revision counters; the price tables remain private.
const channel = db
  ?.channel("public-marketing-revisions")
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "marketing_revisions",
    },
    (payload) => {
      if (payload.new.key === "catalog") void refresh();
      else void content();
    },
  )
  .subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void refresh();
      void content();
    }
  });
void refresh();
void content();
let timer = setInterval(() => {
  void refresh();
  void content();
}, 15000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void refresh();
    void content();
  }
});
window.addEventListener("online", () => {
  void refresh();
  void content();
});
window.addEventListener("pagehide", (event) => {
  stopped = true;
  if (channel && !event.persisted) void db?.removeChannel(channel);
  clearInterval(timer);
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    stopped = false;
    void refresh(); void content();
    timer = setInterval(() => { void refresh(); void content(); }, 15000);
  }
});
