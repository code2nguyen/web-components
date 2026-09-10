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
            // A plain CodeBlock only displays its `code` prop, so the body is not compiled as MDX: that lets snippets
            // contain `{`/`}` (JS objects, CSS rules) that MDX would otherwise parse as expressions.
            const compiledCode = metaAttributes.tag === 'CodeBlock' ? [] : compileComponentCode(code, uid, metaAttributes.component)
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
          // Fail the build instead of silently rendering the fence as plain code.
          const line = node.position?.start?.line
          throw new Error(`MdxCodeBlock fence${line ? ` at line ${line}` : ''} (${meta}) could not be compiled as MDX: ${error.message}`, { cause: error })
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
  const markup = code.replace(/<style>([^<]*)<\/style>/g, '')
  compileSync(markup, {
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

  unwrapParagraphs(ast)
  const hostComponent = changeComponentName(ast, uid, componentName, markup)
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

// Fence bodies are markup, not prose, but MDX parses text on its own line inside a JSX element as a markdown
// paragraph, which would render `<p>` inside the component's light DOM (and pick up the site's prose styles).
// Replace every paragraph with its own children so multi-line markup renders exactly as authored.
function unwrapParagraphs(node) {
  if (!node.children) return
  node.children = node.children.flatMap((child) => {
    unwrapParagraphs(child)
    return child.type === 'paragraph' ? child.children : [child]
  })
}

// Client-only children must bypass Astro's renderer entirely. Even plain custom-element tags can be picked up by
// the Lit SSR renderer, losing non-reflected attributes and gaining defer-hydration without a child island to
// restore them. Raw HTML also keeps the children directly slotted, without nested astro-island wrappers.
// The parent module registers its child elements (e.g. accordion imports details).
function changeComponentName(vnode, uid, componentName, markup) {
  let mainComponent = componentName && vnode.name == componentName ? vnode : null
  const classAttributeIndex = vnode.attributes?.findIndex((item) => item.name == 'class')
  if (classAttributeIndex > -1) {
    const classAttribute = vnode.attributes[classAttributeIndex]
    classAttribute.value = classAttribute.value + ` ${uid}`
  }
  if (vnode.name?.startsWith('c2-') && vnode.name != 'c2-tab') {
    vnode.name = changeCase.pascalCase(vnode.name.replace('c2-', ''))
    vnode.attributes = vnode.attributes || []

    const clientDirective = vnode.attributes.find((item) => item.name.startsWith('client:'))
    if (!clientDirective) {
      vnode.attributes.push({
        type: 'mdxJsxAttribute',
        name: 'client:load',
        value: null,
      })
    } else if (clientDirective.name === 'client:only') {
      const first = vnode.children?.[0]
      const last = vnode.children?.at(-1)
      if (first && last) {
        const children = markup.slice(first.position.start.offset, last.position.end.offset)
        vnode.attributes.push({
          type: 'mdxJsxAttribute',
          name: 'set:html',
          value: children.replace(/\bclass=(['"])(.*?)\1/g, (_, quote, classes) => `class=${quote}${classes} ${uid}${quote}`),
        })
        vnode.children = []
      }
    }
    if (!componentName) mainComponent = vnode
  }
  if (vnode.children) {
    for (const item of vnode.children) {
      const hostNode = changeComponentName(item, uid, componentName, markup)
      if (!mainComponent && hostNode) {
        mainComponent = hostNode
      }
    }
  }
  return mainComponent
}
