// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

toggle?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

// Nav shadow on scroll
const header = document.querySelector('.nav-header');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 10
    ? '0 2px 20px rgba(61,53,48,0.12)'
    : 'none';
}, { passive: true });

// Fade-in on scroll — CSS handles the initial state
document.querySelectorAll('.fade-in').forEach(el => {
  new IntersectionObserver(([entry], obs) => {
    if (entry.isIntersecting) {
      el.classList.add('visible');
      obs.unobserve(el);
    }
  }, { threshold: 0.1 }).observe(el);
});
