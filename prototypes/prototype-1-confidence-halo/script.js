const tabs = Array.from(document.querySelectorAll('.tab'));
const pages = Array.from(document.querySelectorAll('.page'));
const clarity = document.getElementById('clarity');
const clarityLabel = document.getElementById('clarity-label');
const toast = document.getElementById('toast');

const clarityPresets = {
  0: { cls: 'density-minimal', label: 'Minimal' },
  1: { cls: 'density-standard', label: 'Balanced' },
  2: { cls: 'density-detailed', label: 'Detailed' },
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 1500);
}

function activateTab(targetId) {
  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.target === targetId);
  });

  pages.forEach((page) => {
    const active = page.id === targetId;
    page.classList.toggle('is-active', active);
  });

  showToast(`Viewing ${targetId}`);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.target));
});

clarity.addEventListener('input', () => {
  const preset = clarityPresets[clarity.value] || clarityPresets[1];
  document.body.classList.remove('density-minimal', 'density-standard', 'density-detailed');
  document.body.classList.add(preset.cls);
  clarityLabel.textContent = preset.label;
  showToast(`Clarity set to ${preset.label}`);
});

// First impression load choreography.
window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((el, index) => {
    window.setTimeout(() => {
      el.classList.add('visible');
    }, index * 70);
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.25 }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

document.querySelectorAll('.cta, .ghost, .contact-chip').forEach((button) => {
  button.addEventListener('pointerenter', () => {
    button.style.borderColor = '#88caef';
  });
  button.addEventListener('pointerleave', () => {
    button.style.borderColor = '';
  });
});
