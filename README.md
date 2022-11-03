# c2n/web-components

# Developement mode

- npm workspace:
- each package uses vitejs as a build tool

Develop components

```
npm run dev ???

npm run dev -w packages/checkbox
```

# Documentation

Documentation app was build by 11ty.

# Release

```
npm run build -ws --if-present
npx lerna publish patch  --no-private --exact --yes

# patch | major | minor | premajor | preminor | prepatch | prerelease
```
