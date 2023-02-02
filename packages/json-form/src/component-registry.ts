import { NativeComponentLib } from './lib/native-components'
import { ComponentRegistryConfig, LibDefinition, UIDefinition } from './types'
import { mergeObject, mergeVariantUI } from './utils'

export class ComponentRegistry {
  private _registry = new Map<string, UIDefinition>()
  private _config: ComponentRegistryConfig = {
    defaultComponent: 'input',
    componentValueTypeMapping: {
      string: 'input',
    },
  }

  constructor() {
    this.addLibrary(NativeComponentLib)
  }

  getUIDefinition(componentName: string): UIDefinition | undefined {
    const ui = this._registry.get(componentName)
    if (!ui) {
      console.warn('Not found UIDefinition for ', componentName)
    }
    return ui
  }

  addLibrary(lib: LibDefinition) {
    for (const ui of lib) {
      if (!this._registry.has(ui.componentName)) {
        this._registry.set(ui.componentName, ui)

        if (ui.variantComponents) {
          ui.variantComponents.forEach((variantComponent) => {
            const variantUI = mergeVariantUI(variantComponent, ui)
            this._registry.set(variantUI.componentName, variantUI)
          })
        }
      }
    }
  }

  setConfig(config: Partial<ComponentRegistryConfig>) {
    const result = { ...this._config, ...config }
    result.componentValueTypeMapping = mergeObject(this._config.componentValueTypeMapping, config.componentValueTypeMapping)
    this._config = result
  }

  getDefaultUI(type: string): UIDefinition | undefined {
    const componentName = this._config.componentValueTypeMapping[type] || this._config.defaultComponent
    if (componentName) {
      return this.getUIDefinition(componentName)
    }
    return undefined
  }

  getDefaultGroupUI(): UIDefinition | undefined {
    const componentName = this._config.formGroupComponent
    if (componentName) {
      return this.getUIDefinition(componentName)
    }
    return undefined
  }

  getDefaultWrapperUI(): UIDefinition | undefined {
    const componentName = this._config.wrapperComponent
    if (componentName) {
      return this.getUIDefinition(componentName)
    }
    return undefined
  }
}

export const COMPONENT_REGISTRY = new ComponentRegistry()

export default COMPONENT_REGISTRY
