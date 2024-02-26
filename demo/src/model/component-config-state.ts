import type { ComponentManifest } from '../store/manifest-declaration-item'

export interface ComponentConfigState extends ComponentManifest {
  uid?: string
  showConfig?: boolean
}
