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
