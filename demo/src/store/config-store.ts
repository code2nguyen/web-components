import { map } from 'nanostores'
import type { ComponentConfigState } from '../model/component-config-state'

export const $configStore = map<ComponentConfigState>()
