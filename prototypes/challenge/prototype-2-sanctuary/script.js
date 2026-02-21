const views = Array.from(document.querySelectorAll('.view'));
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const note = document.getElementById('note');
const focusModal = document.getElementById('focus-modal');
const focusOpen = document.getElementById('focus-open');
const focusClose = document.getElementById('focus-close');
const focusNext = document.getElementById('focus-next');
const focusCopy = document.getElementById('focus-copy');
const focusSteps = document.getElementById('focus-steps');
const goalButtons = Array.from(document.querySelectorAll('.goal'));
const calmUrl = document.getElementById('calm-url');

const focusFlows = {
  download: {
    copy: 'Create one clean download from source URL to local output in one quiet sequence.',
    steps: ['Paste source URL', 'Confirm quality preset', 'Submit and wait for completion'],
  },
  cleanup: {
    copy: 'Remove cognitive clutter by clearing low-value jobs in one controlled pass.',
    steps: ['Filter stale items', 'Select removable jobs', 'Delete selected jobs'],
  },
  triage: {
    copy: 'Resolve critical telemetry signals quickly with a focused diagnosis loop.',
    steps: ['Filter error events', 'Inspect one trace chain', 'Log one corrective action'],
  },
};

let activeGoal = 'download';
let completed = 0;

function flash(message) {
  note.textContent = message;
  note.classList.add('show');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => note.classList.remove('show'), 1500);
}

function switchView(viewId) {
  navButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === viewId));
  views.forEach((view) => view.classList.toggle('is-active', view.id === viewId));
  flash(`Viewing ${viewId}`);
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function renderFocus() {
  const flow = focusFlows[activeGoal];
  focusCopy.textContent = flow.copy;
  focusSteps.innerHTML = '';

  flow.steps.forEach((step, index) => {
    const li = document.createElement('li');
    li.textContent = step;
    if (index < completed) li.classList.add('done');
    focusSteps.appendChild(li);
  });

  focusNext.textContent = completed >= flow.steps.length ? 'Restart Session' : 'Complete Next Step';
}

function setGoal(goal) {
  activeGoal = goal;
  completed = 0;
  goalButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.goal === goal));
  renderFocus();
}

goalButtons.forEach((button) => {
  button.addEventListener('click', () => setGoal(button.dataset.goal));
});

focusOpen.addEventListener('click', () => {
  focusModal.hidden = false;
  document.body.classList.add('focus-active');
  completed = 0;
  renderFocus();
  flash('Focus Session started');
});

focusClose.addEventListener('click', () => {
  focusModal.hidden = true;
  document.body.classList.remove('focus-active');
  flash('Focus Session closed');
});

focusNext.addEventListener('click', () => {
  const total = focusFlows[activeGoal].steps.length;
  completed = completed >= total ? 0 : completed + 1;
  renderFocus();
});

function validUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

document.querySelector('#do .primary').addEventListener('click', () => {
  if (!validUrl(calmUrl.value.trim())) {
    flash('Please enter a valid URL');
    calmUrl.focus();
    return;
  }
  flash('Job created');
  calmUrl.value = '';
});

window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((node, index) => {
    setTimeout(() => node.classList.add('visible'), index * 90);
  });
  renderFocus();
  flash('Sanctuary ready');
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  },
  { threshold: 0.25 }
);

document.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));
