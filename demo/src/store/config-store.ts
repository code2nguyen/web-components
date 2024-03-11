import { map } from 'nanostores'
import type { ComponentConfigState } from '../model/component-config-state.ts'

export const $configStore = map<ComponentConfigState>()
