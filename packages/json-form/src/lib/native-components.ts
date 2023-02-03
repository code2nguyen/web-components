import { LibDefinition, UIDefinition } from '../types'

const inputComponentDefinition: UIDefinition = {
  tagName: 'input',
  componentName: 'input',
  formItemIdAttribute: 'name',
  valueAttribute: 'value',
  getValueAttribute: 'value',
  valueChangeEvent: 'change',
  variantComponents: [
    {
      componentName: 'checkbox',
      attributes: {
        type: 'checkbox',
      },
      dataAttribute: undefined,
      valueAttribute: undefined,
      selectedAttribute: 'checked',
      getValueAttribute: 'checked',
    },
    {
      componentName: 'passwordInput',
      attributes: {
        type: 'password',
      },
    },
    {
      componentName: 'emailInput',
      attributes: {
        type: 'email',
      },
    },
    {
      componentName: 'radioBox',
      attributes: {
        type: 'radio',
      },
      valueAttribute: undefined,
      selectedAttribute: 'checked',
      dataAttribute: 'value',
    },
  ],
}

const simpleTextComponentDefinition: UIDefinition = {
  tagName: 'simpleText',
  componentName: 'simpleText',
}

const optionComponentDefinition: UIDefinition = {
  tagName: 'option',
  componentName: 'selectOption',
  dataAttribute: 'value',
  selectedAttribute: 'selected',
  slot: 'simpleText',
}

const selectComponentDefinition: UIDefinition = {
  tagName: 'select',
  componentName: 'select',
  valueChangeEvent: 'change',
  formItemIdAttribute: 'name',
  getValueAttribute: 'value',
  slot: 'selectOption',
}

const labelComponentDefinition: UIDefinition = {
  componentName: 'label',
  tagName: 'label',
  slot: 'simpleText',
}

export const NativeComponentLib: LibDefinition = [
  simpleTextComponentDefinition,
  inputComponentDefinition,
  selectComponentDefinition,
  optionComponentDefinition,
  labelComponentDefinition,
]
