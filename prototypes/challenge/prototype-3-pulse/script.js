const tabs = Array.from(document.querySelectorAll('.tab'));
const screens = Array.from(document.querySelectorAll('.screen'));
const replayLog = document.getElementById('replay-log');
const replayRun = document.getElementById('replay-run');
const replayClear = document.getElementById('replay-clear');
const pulseNote = document.getElementById('pulse-note');
const pulseUrl = document.getElementById('pulse-url');

const replayEvents = [];

function flash(message) {
  pulseNote.textContent = message;
  pulseNote.classList.add('show');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => pulseNote.classList.remove('show'), 1400);
}

function stamp() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function pushReplay(label) {
  replayEvents.push({ at: stamp(), label });
  if (replayEvents.length > 14) replayEvents.shift();
  renderReplay();
}

function renderReplay(activeIndex = -1) {
  replayLog.innerHTML = '';
  replayEvents.forEach((entry, index) => {
    const li = document.createElement('li');
    li.textContent = `${entry.at} - ${entry.label}`;
    if (index === activeIndex) li.classList.add('live');
    replayLog.appendChild(li);
  });
}

function activateScreen(screenId) {
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.screen === screenId));
  screens.forEach((screen) => screen.classList.toggle('is-active', screen.id === screenId));
  pushReplay(`screen:${screenId}`);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateScreen(tab.dataset.screen));
});

function validUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

document.querySelector('.launch-row .action').addEventListener('click', () => {
  if (!validUrl(pulseUrl.value.trim())) {
    flash('Enter a valid URL to launch');
    pulseUrl.focus();
    pushReplay('launch:invalid-url');
    return;
  }

  flash('Launch accepted');
  pushReplay('launch:job-submitted');
  pulseUrl.value = '';
});

document.querySelectorAll('.action-log').forEach((node) => {
  node.addEventListener('click', () => {
    const label = node.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    pushReplay(`action:${label}`);
  });
});

replayRun.addEventListener('click', () => {
  if (replayEvents.length === 0) {
    flash('No interactions to replay');
    return;
  }

  let i = 0;
  const timer = setInterval(() => {
    renderReplay(i);
    i += 1;
    if (i >= replayEvents.length) {
      clearInterval(timer);
      renderReplay();
      pushReplay('replay:complete');
    }
  }, 300);
});

replayClear.addEventListener('click', () => {
  replayEvents.length = 0;
  renderReplay();
  flash('Replay history cleared');
});

// Magnetic button effect for energetic tactile feel.
document.querySelectorAll('.magnetic').forEach((button) => {
  button.addEventListener('pointermove', (event) => {
    const rect = button.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    button.style.transform = `translate(${dx * 0.08}px, ${dy * 0.08}px)`;
  });

  button.addEventListener('pointerleave', () => {
    button.style.transform = '';
  });
});

window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((node, index) => {
    setTimeout(() => node.classList.add('visible'), index * 70);
  });
  pushReplay('system:ready');
  flash('Pulse online');
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
