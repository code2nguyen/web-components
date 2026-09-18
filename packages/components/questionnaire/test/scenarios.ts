import '../src/questionnaire'
import type { Questionnaire, QuestionnaireQuestion } from '../src/questionnaire'
import { html } from 'lit'

const questions: QuestionnaireQuestion[] = [
  {
    id: 'direction',
    title: 'What should the agent build next?',
    type: 'select',
    description: 'Choose a direction or describe another task.',
    otherPlaceholder: 'Describe another feature…',
    options: [
      { value: 'timeline', label: 'Tool call timeline', description: 'Show what the agent ran and what came back.' },
      { value: 'approvals', label: 'Approval checkpoints', description: 'Ask before sensitive or destructive actions.' },
      { value: 'handoffs', label: 'Sub-agent handoffs', description: 'Make delegated work and results easier to follow.' },
    ],
  },
  {
    id: 'updates',
    title: 'What should every progress update include?',
    description: 'Select all that apply, or skip this question.',
    type: 'choice',
    skippable: true,
    options: [
      { value: 'progress', label: 'Progress' },
      { value: 'decisions', label: 'Decisions' },
      { value: 'risks', label: 'Risks' },
      { value: 'next', label: 'Next step' },
    ],
  },
  {
    id: 'timing',
    title: 'When should work begin?',
    type: 'select',
    description: 'Choose when the agent should begin the work.',
    options: [
      { value: 'now', label: 'Start now' },
      { value: 'cycle', label: 'Next development cycle' },
      { value: 'backlog', label: 'Add it to the backlog' },
    ],
  },
]

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML =
  scenario === 'form' ? '<form><c2-questionnaire id="subject" name="plan"></c2-questionnaire></form>' : '<c2-questionnaire id="subject"></c2-questionnaire>'

const subject = document.querySelector<Questionnaire>('c2-questionnaire')!
subject.questions = questions
if (scenario === 'disabled') subject.disabled = true
if (scenario === 'custom-render') {
  subject.questionItemRender = ({ option, selected }) =>
    html`<span data-custom-item><strong>${option.label}</strong><small>${selected ? 'Selected' : 'Available'}</small></span>`
}
if (scenario === 'custom-actions') {
  subject.current = 1
  subject.insertAdjacentHTML(
    'beforeend',
    '<button slot="previous-button" type="button">Go back</button><button slot="skip-button" type="button">Not now</button><button slot="next-button" type="button">Continue</button><button slot="submit-button" type="button">Finish plan</button>',
  )
}
if (scenario === 'custom-summary') {
  subject.insertAdjacentHTML('beforeend', '<section slot="summary"><h2>Your plan</h2><output>Custom answer summary</output></section>')
}
for (const eventName of ['answer-change', 'step-change', 'skip', 'complete']) {
  subject.addEventListener(eventName, (event) => {
    const events = JSON.parse(subject.dataset.events ?? '[]') as unknown[]
    events.push({ type: event.type, detail: (event as CustomEvent).detail })
    subject.dataset.events = JSON.stringify(events)
  })
}

await subject.updateComplete
main.dataset.ready = 'true'
