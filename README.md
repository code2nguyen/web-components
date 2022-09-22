# c2n/web-components

# Developement mode

- npm workspace:
- each package uses vitejs as a build tool

Develop components

```
npm run dev

npm run dev -w packages/checkbox
```

# Release

```
npm run build -ws --if-present
npx lerna publish patch  --no-private --exact --yes --no-push

# patch | major | minor | premajor | preminor | prepatch | prerelease
```
