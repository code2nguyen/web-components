import { visit } from 'unist-util-visit'
import { compileSync, nodeTypes } from '@mdx-js/mdx'
import * as changeCase from 'change-case'

// Inspiration from https://github.com/johnzanussi/astro-mdx-code-blocks/blob/main/src/remarkCodeBlock.ts
export const MDXCodeBlockRemark = () => {
  return function transformer(tree) {
    const visitor = function (node, index, parent) {
      if (node.lang && parent && index !== null) {
        const { lang, meta } = node
        try {
          let metaAttributes = {}
          if (!meta) {
            return
          }
          const metaMatches = Array.from(meta.matchAll(/([^=,;\s]+)=([^,;]+)/g))
          metaAttributes = metaMatches.reduce((accum, match) => {
            const [_, key, value] = match
            return {
              ...accum,
              [key]: value,
            }
          }, {})

          if (metaAttributes.tag) {
            const code = node.value
            const uid = 'c2n-' + crypto.randomUUID()
            const style = extractStyle(code, uid)
            const compiledCode = compileComponentCode(code, uid, metaAttributes.component)
            const props = {
              code: JSON.stringify(code),
              lang,
              uid,
              style,
              ...metaAttributes,
            }
            const attributes = Object.entries(props).map(([name, value]) => ({
              type: 'mdxJsxAttribute',
              name,
              value,
            }))

            const codeSnippetWrapper = {
              type: 'mdxJsxFlowElement',
              name: metaAttributes.tag,
              position: node.position,
              attributes,
              children: compiledCode,
              data: { _mdxExplicitJsx: true },
            }
            parent.children.splice(index, 1, codeSnippetWrapper)
          }
        } catch (error) {
          console.error(error)
        }
      }
    }
    visit(tree, 'code', visitor)
  }
}

function extractStyle(code, uid) {
  const reg = /<style>([^<]*)<\/style>/g
  const result = reg.exec(code)
  let style = result ? result[1] : ''
  return style
    ? `<style>
  ${style.replace(/\s*([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g, `.${uid}$1$2`)}
  </style>`
    : ''
}

function compileComponentCode(code, uid, componentName) {
  let ast
  compileSync(code.replace(/<style>([^<]*)<\/style>/g, ''), {
    format: 'mdx',
    outputFormat: 'program',
    jsx: false,
    development: false,
    remarkPlugins: [captureEsast],
  })

  function captureEsast() {
    return function (tree) {
      const clone = structuredClone(tree)
      ast = clone
    }
  }

  const hostComponent = changeComponentName(ast, uid, componentName)
  if (hostComponent) {
    hostComponent.attributes = hostComponent.attributes || []
    hostComponent.attributes.push({
      type: 'mdxJsxAttribute',
      name: 'data-target-uid',
      value: uid,
    })
  }

  return ast.children
}

function changeComponentName(vnode, uid, componentName) {
  let mainComponent = componentName && vnode.name == componentName ? vnode : null
  const classAttributeIndex = vnode.attributes?.findIndex((item) => item.name == 'class')
  if (classAttributeIndex > -1) {
    const classAttribute = vnode.attributes[classAttributeIndex]
    classAttribute.value = classAttribute.value + ` ${uid}`
  }
  if (vnode.name?.startsWith('c2-') && vnode.name != 'c2-tab') {
    vnode.name = changeCase.pascalCase(vnode.name.replace('c2-', ''))
    vnode.attributes = vnode.attributes || []

    const hasClientDirective = vnode.attributes.findIndex((item) => item.name.startsWith('client:')) > -1
    if (!hasClientDirective) {
      vnode.attributes.push({
        type: 'mdxJsxAttribute',
        name: 'client:load',
        value: null,
      })
    }
    if (!componentName) mainComponent = vnode
  }
  if (vnode.children) {
    for (const item of vnode.children) {
      const hostNode = changeComponentName(item, uid, componentName)
      if (!mainComponent && hostNode) {
        mainComponent = hostNode
      }
    }
  }
  return mainComponent
}
