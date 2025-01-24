# c2n/web-components

A monorepos contains all web components using lit. Each component is released in a separated package.

## Development mode

Each package is a npm package and will try to limit maximum cross dependencies.

All packages have `@c2n/config` as dev dependencies and maybe link with `@c2n/wc-utils` to reuse the sharing code.

- npm workspace:
- each package uses vitejs as a build tool

### Generate empty web component

```
npm run generate
```

### Demo

Demo application is a static web using [Astro Framework](https://astro.build/)

From root folder.

```

npm install

# Will build all web components first, then start demo dev server

npm run demo

# Will start demo dev server only

npm run demo:dev

```

### Develop components

```

npm run dev -w packages/checkbox

```

## Release

```

npm run build

npx lerna publish patch --no-private --exact --yes

# patch | major | minor | premajor | preminor | prepatch | prerelease

```

```

```

References:

- https://phosphoricons.com/?q=%22copy%22

- Icon: https://feathericons.com/?query=copy
