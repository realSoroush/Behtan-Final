const button = document.getElementById("menu-toggle") as HTMLButtonElement;
const nav = document.getElementById("site-nav")!;
function close() {
  button.setAttribute("aria-expanded", "false");
  nav.classList.remove("is-open");
}
button.onclick = () => {
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
};
nav.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) close();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
    close();
    button.focus();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!(e.target as HTMLElement).closest(".nav-inner")) close();
});
window.addEventListener("hashchange", close);
const img = document.getElementById("enamad-image") as HTMLImageElement;
img.addEventListener("error", () => {
  img.hidden = true;
});

if(img.complete&&!img.naturalWidth)img.hidden=true;

document.addEventListener('click', event => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link || event.defaultPrevented || (event as MouseEvent).button !== 0 || (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey || (event as MouseEvent).shiftKey || (event as MouseEvent).altKey) return;
  const href = link.getAttribute('href');
  if (!href || href === '#pro' || href === '#auth') return;
  const target = document.getElementById(href.slice(1));
  if (!target) return;
  event.preventDefault(); close();
  target.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
});
