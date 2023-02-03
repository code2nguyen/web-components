import CheckboxMetadata from '@c2n/checkbox/custom-elements.json'
import type { CustomElement } from 'custom-elements-manifest'

import { LibDefinition } from '../model/lib-definition'

export const C2WebComponentLib: LibDefinition = {
  components: [
    {
      metadata: CheckboxMetadata.modules[0].declarations[0] as CustomElement,
      load: () => {
        return import('@c2n/checkbox/checkbox.js')
      },
    },
  ],
}
