const pills = Array.from(document.querySelectorAll('.pill'));
const scenes = Array.from(document.querySelectorAll('.scene'));
const logNode = document.getElementById('event-log');
const replayRun = document.getElementById('replay-run');
const replayClear = document.getElementById('replay-clear');

const events = [];

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function renderLog(activeIndex = -1) {
  logNode.innerHTML = '';
  events.forEach((event, index) => {
    const li = document.createElement('li');
    li.textContent = `${event.time} - ${event.label}`;
    if (index === activeIndex) li.classList.add('live');
    logNode.appendChild(li);
  });
}

function logEvent(label) {
  events.push({ time: nowLabel(), label });
  if (events.length > 10) events.shift();
  renderLog();
}

function activateScene(target) {
  pills.forEach((pill) => {
    pill.classList.toggle('is-active', pill.dataset.target === target);
  });

  scenes.forEach((scene) => {
    scene.classList.toggle('is-active', scene.id === target);
  });

  logEvent(`Switched to ${target}`);
}

pills.forEach((pill) => {
  pill.addEventListener('click', () => activateScene(pill.dataset.target));
});

document.querySelectorAll('.action, .action-log').forEach((button) => {
  button.addEventListener('click', () => {
    const label = button.textContent.trim();
    logEvent(`Action: ${label}`);
  });
});

replayRun.addEventListener('click', () => {
  if (events.length === 0) {
    logEvent('Replay requested with no events');
    return;
  }

  let cursor = 0;
  const timer = window.setInterval(() => {
    renderLog(cursor);
    cursor += 1;
    if (cursor >= events.length) {
      window.clearInterval(timer);
      renderLog();
      logEvent('Replay completed');
    }
  }, 320);
});

replayClear.addEventListener('click', () => {
  events.length = 0;
  renderLog();
});

// Magnetic hover for high-energy feedback.
document.querySelectorAll('.magnetic').forEach((button) => {
  button.addEventListener('pointermove', (event) => {
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    button.style.transform = `translate(${x * 0.08}px, ${y * 0.08}px)`;
  });

  button.addEventListener('pointerleave', () => {
    button.style.transform = '';
  });
});

window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((node, index) => {
    window.setTimeout(() => node.classList.add('visible'), index * 80);
  });
  logEvent('Prototype loaded');
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.2 }
);

document.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));
