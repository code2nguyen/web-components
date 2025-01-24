import type { ComponentManifest } from '../store/manifest-declaration-item.ts'

export interface ExtraComponentConfigState extends ComponentManifest {
  hideValues?: {
    [key: string]: string
  }
}
export interface ComponentConfigState {
  uid?: string
  showConfig?: boolean
  currentComponentTag?: string
  configs: Map<string, ExtraComponentConfigState>
}
