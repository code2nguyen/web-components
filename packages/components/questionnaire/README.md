# @c2n/questionnaire

A form-associated Lit questionnaire with single and multiple selection, free-text alternatives, validation, keyboard shortcuts and multi-step navigation.

```bash
npm install @c2n/questionnaire
```

```ts
import '@c2n/questionnaire'
import type { Questionnaire } from '@c2n/questionnaire'

const questionnaire = document.querySelector<Questionnaire>('c2-questionnaire')!
questionnaire.questions = [
  {
    id: 'direction',
    type: 'select',
    title: 'What should the agent build next?',
    options: [
      { value: 'timeline', label: 'Tool call timeline' },
      { value: 'approvals', label: 'Approval checkpoints' },
    ],
  },
  {
    id: 'updates',
    title: 'What should every progress update include?',
    type: 'choice',
    skippable: true,
    options: [
      { value: 'progress', label: 'Progress' },
      { value: 'decisions', label: 'Decisions' },
    ],
  },
  {
    id: 'timing',
    type: 'select',
    title: 'When should work begin?',
    options: [{ value: 'now', label: 'Start now' }],
  },
]
questionnaire.addEventListener('complete', ({ detail }) => console.log(detail.answers))
```

Use `type: 'select'` for a single answer and `type: 'choice'` for multiple answers (`single` and `multiple` are aliases). Add `skippable`, `required: false`, `otherPlaceholder`, option descriptions, custom shortcuts and disabled options as needed. Assign `questionItemRender` to customize option content while retaining the built-in native controls. The component exposes `answers`, `current`, `next()`, `previous()`, `skip()` and `reset()` and submits its answers as a JSON form value when `name` is set.

Replace navigation controls with `previous-button`, `skip-button`, `next-button` and `submit-button` slots. Successful submission sets `completed` and displays a default answer summary; provide a `summary` slot for a custom result view and read its data from `answers` or the `complete` event.
