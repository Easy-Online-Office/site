document.addEventListener("DOMContentLoaded", () => {
  const links = document.querySelectorAll("nav a");
  const current = location.pathname.split("/").pop() || "index.html";

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("underline", "font-extrabold");
    }
  });

  const brandLinks = document.querySelectorAll('nav a[href="index.html"], nav a[href="./"], nav a[href="/"]');
  brandLinks.forEach((link) => {
    if (!/easy\s*(suite|file)/i.test(link.textContent || "")) return;

    link.classList.add("inline-flex", "items-center", "gap-2");
    link.setAttribute("aria-label", "EasyFile home");
    link.innerHTML = [
      '<img src="icon.png" alt="" width="40" height="40" decoding="async"',
      ' class="h-10 w-10 rounded-xl object-contain bg-white bg-opacity-10" data-easyfile-logo>',
      '<span>EasyFile</span>'
    ].join("");
  });

  const ensureIconLink = (rel) => {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = "icon.png";
    if (rel === "icon") link.type = "image/png";
  };

  ensureIconLink("icon");
  ensureIconLink("apple-touch-icon");
});
