import { visit } from 'unist-util-visit';

// Inspiration from https://github.com/johnzanussi/astro-mdx-code-blocks/blob/main/src/remarkCodeBlock.ts
export const MDXCodeBlockRemark = () => {
    return function transformer(tree) {
        const visitor = function (node, index, parent) {
            if (node.lang && parent && index !== null) {
                const { lang, meta } = node;
                try {
                    let metaAttributes = {};
                    if (!meta) {
                        return;
                    }
                    const metaMatches = Array.from(
                        meta.matchAll(/([^=,;\s]+)=([^,;]+)/g)
                    );
                    metaAttributes = metaMatches.reduce(
                        (accum, match) => {
                            const [_, key, value] = match;
                            return {
                                ...accum,
                                [key]: value,
                            };
                        },
                        {}
                    );

                    if (metaAttributes.tag) {
                        const props = {
                            code: node.value,
                            lang,
                            ...metaAttributes,
                        };
                        const attributes = Object.entries(
                            props
                        ).map(([name, value]) => ({
                            type: 'mdxJsxAttribute',
                            name,
                            value,
                        }));

                        const codeSnippetWrapper = {
                            type: 'mdxJsxFlowElement',
                            name: metaAttributes.tag,
                            position: node.position,
                            children: [],
                            attributes,
                            data: {_mdxExplicitJsx: true}
                        };
                        parent.children.splice(index, 1, codeSnippetWrapper);
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        };
        visit(tree, 'code', visitor);
    }
}