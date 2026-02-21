const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const panels = Array.from(document.querySelectorAll('.panel'));
const focusToggle = document.getElementById('focus-toggle');
const focusFlow = document.getElementById('focus-flow');
const flowDescription = document.getElementById('flow-description');
const flowSteps = document.getElementById('flow-steps');
const flowNext = document.getElementById('flow-next');
const flowClose = document.getElementById('flow-close');
const goalButtons = Array.from(document.querySelectorAll('.goal'));

const flows = {
  download: {
    description: 'Create one clean download from URL to stored output in three moves.',
    steps: ['Paste source URL', 'Confirm quality preset', 'Submit and track job completion'],
  },
  clean: {
    description: 'Reduce clutter and reclaim space in a single focused pass.',
    steps: ['Review stale jobs', 'Select low-value items', 'Delete in one batch'],
  },
  review: {
    description: 'Inspect signal quality without noise or context switching.',
    steps: ['Filter by latest errors', 'Inspect one trace chain', 'Document one action item'],
  },
};

let activeGoal = 'download';
let currentStep = 0;

function renderFlow() {
  const flow = flows[activeGoal];
  flowDescription.textContent = flow.description;
  flowSteps.innerHTML = '';

  flow.steps.forEach((step, index) => {
    const li = document.createElement('li');
    li.textContent = step;
    if (index < currentStep) li.classList.add('done');
    flowSteps.appendChild(li);
  });

  if (currentStep >= flow.steps.length) {
    flowNext.textContent = 'Restart flow';
  } else {
    flowNext.textContent = 'Mark next step complete';
  }
}

function activatePanel(target) {
  navButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.target === target);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === target);
  });
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => activatePanel(btn.dataset.target));
});

focusToggle.addEventListener('click', () => {
  focusFlow.hidden = false;
  document.body.classList.add('flow-active');
  currentStep = 0;
  renderFlow();
});

flowClose.addEventListener('click', () => {
  focusFlow.hidden = true;
  document.body.classList.remove('flow-active');
});

goalButtons.forEach((goal) => {
  goal.addEventListener('click', () => {
    activeGoal = goal.dataset.goal;
    currentStep = 0;
    goalButtons.forEach((btn) => btn.classList.toggle('is-active', btn === goal));
    renderFlow();
  });
});

flowNext.addEventListener('click', () => {
  const total = flows[activeGoal].steps.length;
  currentStep = currentStep >= total ? 0 : currentStep + 1;
  renderFlow();
});

window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((el, idx) => {
    window.setTimeout(() => el.classList.add('visible'), idx * 80);
  });
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.25 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

renderFlow();
