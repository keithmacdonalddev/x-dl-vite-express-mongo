const pages = Array.from(document.querySelectorAll('.page'));
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const modeButtons = Array.from(document.querySelectorAll('.mode-switch .chip'));
const toast = document.getElementById('toast');
const sourceUrl = document.getElementById('source-url');
const clarityModes = ['essential', 'standard', 'expert'];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600);
}

function setActivePage(pageId) {
  navButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.page === pageId);
  });

  pages.forEach((page) => {
    page.classList.toggle('is-active', page.id === pageId);
  });

  showToast(`Viewing ${pageId}`);
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => setActivePage(btn.dataset.page));
});

function setClarityMode(mode) {
  if (!clarityModes.includes(mode)) return;
  document.body.classList.remove('mode-essential', 'mode-standard', 'mode-expert');
  document.body.classList.add(`mode-${mode}`);
  modeButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === mode));
  showToast(`Clarity mode: ${mode}`);
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => setClarityMode(btn.dataset.mode));
});

function validateSourceUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

document.querySelectorAll('.primary-action, .hero .cta').forEach((button) => {
  button.addEventListener('click', () => {
    const url = sourceUrl.value.trim();
    if (!validateSourceUrl(url)) {
      showToast('Enter a valid URL to submit a job');
      sourceUrl.focus();
      return;
    }
    showToast('Job submitted successfully');
    sourceUrl.value = '';
  });
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  },
  { threshold: 0.22 }
);

document.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));

window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((node, index) => {
    setTimeout(() => node.classList.add('visible'), index * 70);
  });
  showToast('Command ready');
});
