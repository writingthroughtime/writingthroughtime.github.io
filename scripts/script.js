const header = document.querySelector(".site-header");
const nav = document.querySelector(".site-nav");
const toggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
const sections = document.querySelectorAll("main section[id]");

function setHeaderHeightVar() {
  if (!header) return;
  document.documentElement.style.setProperty(
    "--header-height",
    `${header.offsetHeight}px`
  );
}

function toggleMenu() {
  const isOpen = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(isOpen));
}

function closeMenu() {
  nav.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
}

function updateActiveNav() {
  const headerOffset = header ? header.offsetHeight : 0;
  let bestSection = null;
  let bestDistance = Infinity;

  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    const distance = Math.abs(rect.top - headerOffset);

    if (rect.bottom > headerOffset && distance < bestDistance) {
      bestDistance = distance;
      bestSection = section;
    }
  });

  const currentId = bestSection ? `#${bestSection.id}` : "";

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === currentId);
  });
}

if (toggle && nav) {
  toggle.addEventListener("click", toggleMenu);
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    closeMenu();
  });
});

window.addEventListener("resize", () => {
  setHeaderHeightVar();
  updateActiveNav();
});

window.addEventListener(
  "scroll",
  () => {
    updateActiveNav();
  },
  { passive: true }
);

window.addEventListener("load", () => {
  setHeaderHeightVar();
  updateActiveNav();
});