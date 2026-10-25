async function start() {
  // Public routes use static marketing HTML. Private entry keeps the existing React app.
  const params = new URLSearchParams(location.search);
  const path = location.pathname.replace(/\/$/, "");
  const publicOnly =
    path === "/site.html" ||
    path === "/professionals" ||
    path === "/professionals/index.html";
  let privateRoute =
    !publicOnly && (location.hash === "#auth" || params.has("payment"));
  if (!publicOnly && !privateRoute) {
    try {
      const { supabase } = await import("../lib/supabaseClient");
      const { data } = await supabase.auth.getSession();
      privateRoute = Boolean(data.session);
    } catch {
      /* Public content remains usable when auth is unavailable. */
    }
  }
  if (privateRoute) {
    document.getElementById("marketing-shell")?.remove();
    document
      .querySelectorAll("link[data-marketing-css]")
      .forEach((link) => link.remove());
    document.body.removeAttribute("id");
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    await import("../main");
  } else {
    await import("./main");
    // Legacy entry links and payment returns may use the root hash without a reload.
    window.addEventListener("hashchange", () => {
      if (location.hash === "#auth") location.reload();
    });
  }
}
void start();
export {};
