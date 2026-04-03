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

// Modals
const overlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
const modalClose = document.querySelector('.modal-close');

const tplMap = {
  massage: 'tpl-massage',
  jeunes:  'tpl-jeunes',
  at:      'tpl-at',
  gestalt: 'tpl-gestalt',
};

document.querySelectorAll('.service-card[data-modal]').forEach(card => {
  card.addEventListener('click', () => {
    const key = card.dataset.modal;
    const tpl = document.getElementById(tplMap[key]);
    if (!tpl) return;
    modalBody.innerHTML = '';
    modalBody.appendChild(tpl.content.cloneNode(true));
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
});

function closeModal() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

modalClose?.addEventListener('click', closeModal);
overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Ferme le modal si on clique sur un lien interne (ex: #rdv)
modalBody?.addEventListener('click', e => {
  if (e.target.classList.contains('modal-link')) closeModal();
});

// Fade-in on scroll — CSS handles the initial state
document.querySelectorAll('.fade-in').forEach(el => {
  new IntersectionObserver(([entry], obs) => {
    if (entry.isIntersecting) {
      el.classList.add('visible');
      obs.unobserve(el);
    }
  }, { threshold: 0.1 }).observe(el);
});
