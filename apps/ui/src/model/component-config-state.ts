import type { ComponentManifest } from '../store/manifest-declaration-item.ts'

export interface ExtraComponentConfigState extends ComponentManifest {
  hideValues?: {
    [key: string]: string
  }
}
export type InspectorTab = 'design' | 'props' | 'presets' | 'code'

export interface ComponentConfigState {
  uid?: string
  showConfig?: boolean
  currentComponentTag?: string
  /** Inspector tab to show; lets the studio bar route to a tab (e.g. "Save preset" -> presets). */
  activeTab?: InspectorTab
  configs: Map<string, ExtraComponentConfigState>
}
