// Highlights the current page's nav link. No login state to fetch here —
// unlike ninja-bet, this is an ops console with no per-user session, so
// there's nothing else for the nav to reflect.
const path = window.location.pathname
document.querySelectorAll<HTMLAnchorElement>('.nav a[href]').forEach((a) => {
  if (a.getAttribute('href') === path) a.classList.add('nav-active')
})
