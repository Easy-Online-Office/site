document.addEventListener("DOMContentLoaded", () => {
  const links = document.querySelectorAll("nav a");
  const current = location.pathname.split("/").pop();

  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("underline", "font-extrabold");
    }
  });

  // Favicon enforcement
  if (!document.querySelector("link[rel='icon']")) {
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.href = "icon.png";
    document.head.appendChild(favicon);
  }
});