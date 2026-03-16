const nav = document.getElementById('nav');
const year = document.getElementById('year');

window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 36);
});

if (year) {
  year.textContent = new Date().getFullYear();
}
