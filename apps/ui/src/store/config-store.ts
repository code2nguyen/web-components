import { map, computed } from 'nanostores'
import type { ComponentConfigState } from '../model/component-config-state.ts'

export const $configStore = map<ComponentConfigState>()

export const $componentConfig = computed($configStore, (configStore) => {
  return configStore.uid && configStore.configs ? configStore.configs.get(configStore.uid) : null
})
