import { readFile, writeFile, mkdir } from "node:fs/promises";
// Preserve the private React entry before making the approved public HTML primary.
const app = await readFile("dist/index.html", "utf8");
const marketing = await readFile("dist/site.html", "utf8");
const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const css = manifest["src/marketing/main.ts"]?.css;
if (!Array.isArray(css) || !css.length)
  throw Error("Marketing CSS missing from manifest");
const styles = css
  .map(
    (file) => '<link rel="stylesheet" data-marketing-css href="/' + file + '">',
  )
  .join("");
if (!app.includes('id="root"') || !marketing.includes('id="marketing-shell"'))
  throw Error("Invalid public/private build entry");
await writeFile(
  "dist/app.html",
  app.replace(
    "</head>",
    '<meta name="robots" content="noindex,nofollow"></head>',
  ),
);
const structured = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "به‌تن",
  url: "https://behtan.fit/",
  inLanguage: "fa-IR",
});
for (const pro of [false, true]) {
  const canonical = "https://behtan.fit/" + (pro ? "professionals" : "");
  const title = pro
    ? "به‌تن Pro | برنامه‌سازی با کنترل متخصص"
    : "به‌تن | برنامه غذایی و تمرین، به سبک زندگی تو";
  let html = marketing
    .replace(/<title>.*?<\/title>/, "<title>" + title + "</title>")
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${pro ? "پنل به‌تن برای ساخت و ویرایش برنامه تغذیه و تمرین، با کنترل کامل متخصص." : "به‌تن؛ برنامه غذایی و تمرین شخصی، با وعده‌های آشنا و پیگیری روند روزانه."}">`)
    .replace(
      /<link rel="canonical"[^>]*>/,
      '<link rel="canonical" href="' + canonical + '">',
    )
    .replace(
      "</head>",
      styles +
        '<meta property="og:title" content="' +
        title +
        '"><meta property="og:url" content="' +
        canonical +
        '"><meta property="og:type" content="website"><meta property="og:image" content="https://behtan.fit/behtan-logo.png"><script type="application/ld+json">' +
        structured +
        "</script></head>",
    );
  if (pro)
    html = html
      .replace('id="member-page"', 'id="member-page" hidden')
      .replace('id="pro-page" hidden', 'id="pro-page"');
  const dest = pro ? "dist/professionals" : "dist";
  await mkdir(dest, { recursive: true });
  await writeFile(dest + "/index.html", html);
}
console.log(
  "New public HTML generated for / and /professionals; private app retained at app.html and root auth/payment entry.",
);
