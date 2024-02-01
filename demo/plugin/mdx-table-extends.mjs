import { visit } from 'unist-util-visit'

export const MDXTableExtends = () => {
  return function transformer(tree) {
    let nodeLevel = 0
    const visitor = function (node) {
      if (node.children.length > 0) {
        for (const child of node.children) {
          if (child.children.length == 0) continue
          try {
            const firstChild = child.children[0]
            if (firstChild.type === 'text') {
              if (firstChild.value.startsWith('# ')) {
                const content = firstChild.value.substring(2)
                nodeLevel = 1
                child.children[0] = {
                  type: 'mdxJsxTextElement',
                  name: 'span',
                  attributes: [
                    {
                      type: 'mdxJsxAttribute',
                      name: 'class',
                      value: 't-h1',
                    },
                  ],
                  children: [
                    {
                      type: 'text',
                      value: content,
                    },
                  ],
                  data: {
                    _mdxExplicitJsx: true,
                  },
                }
                node.attributes = [
                  {
                    type: 'mdxJsxAttribute',
                    name: 'class',
                    value: 't-h1',
                  },
                  {
                    type: 'mdxJsxAttribute',
                    name: 'data-level',
                    value: nodeLevel,
                  },
                ]
                node.data = {
                  _mdxExplicitJsx: true,
                }
                node.name = 'tr'
                node.type = 'mdxJsxTextElement'
              }
              if (firstChild.value.startsWith('## ')) {
                const content = firstChild.value.substring(3)
                nodeLevel = 2
                child.children[0] = {
                  type: 'mdxJsxTextElement',
                  name: 'span',
                  attributes: [
                    {
                      type: 'mdxJsxAttribute',
                      name: 'class',
                      value: 't-h2',
                    },
                  ],
                  children: [
                    {
                      type: 'text',
                      value: content,
                    },
                  ],
                  data: {
                    _mdxExplicitJsx: true,
                  },
                }
                node.attributes = [
                  {
                    type: 'mdxJsxAttribute',
                    name: 'class',
                    value: 't-h2',
                  },
                  {
                    type: 'mdxJsxAttribute',
                    name: 'data-level',
                    value: nodeLevel,
                  },
                ]
                node.data = {
                  _mdxExplicitJsx: true,
                }
                node.name = 'tr'
                node.type = 'mdxJsxTextElement'
              } else if (firstChild.value.startsWith('.')) {
                const content = firstChild.value.substring(1)
                child.children[0] = {
                  type: 'mdxJsxTextElement',
                  name: 'span',
                  attributes: [
                    {
                      type: 'mdxJsxAttribute',
                      name: 'class',
                      value: 't-code',
                    },
                  ],
                  children: [
                    {
                      type: 'text',
                      value: content,
                    },
                  ],
                  data: {
                    _mdxExplicitJsx: true,
                  },
                }
              }
            }
          } catch (error) {
            console.error(error)
          }
        }
      }
    }
    visit(tree, 'tableRow', visitor)
  }
}
