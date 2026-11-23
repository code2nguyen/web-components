# Pinned dependencies

Read this before upgrading Vite, Astro, esbuild, sharp, `@astrojs/lit` or `@lit-labs/ssr`, or when `npm ci` or the
UI build fails on a native binding. Paths are relative to the repository root.

## Pinned transitive dependency: `@lit-labs/ssr`

The root `package.json` has `overrides: { "@lit-labs/ssr": "3.2.2" }`. `@astrojs/lit` (unmaintained since mid-2024) hand-builds the `renderInfo` object in its `server.js` with only `customElementInstanceStack`/`customElementHostStack`, but `@lit-labs/ssr` 3.3+ also reads `eventTargetStack`/`slotStack`. Its own `^3.2.2` range floats into those versions, and the UI app build then dies with `Cannot read properties of undefined (reading 'length')` inside `getLast`. Do not remove the override without first checking that `@astrojs/lit` has been updated.

## Linux native binaries in the lockfile

The root `package.json` declares nine Linux `optionalDependencies` that nothing imports directly:
`@rolldown/binding-linux-x64-gnu`, `@esbuild/linux-x64`, `lightningcss-linux-x64-gnu`,
`@astrojs/compiler-binding-linux-x64-gnu`, `@parcel/watcher-linux-x64-glibc`, `@img/sharp-linux-x64`,
`@img/sharp-libvips-linux-x64`, `@xn-sakina/rml-linux-x64-gnu` and `@bruits/satteri-linux-x64-gnu`.

They exist so CI can use `npm ci`. Each of those toolchain packages ships its native binary as a platform-gated
optional dependency, and npm resolves optional dependencies for the **host** platform only — a lockfile written on
macOS records `@rolldown/binding-darwin-arm64` and no Linux entry at all ([npm/cli#4828](https://github.com/npm/cli/issues/4828)).
`npm ci` then installs strictly from that lockfile, the install _succeeds_, and the build dies later with
`Cannot find native binding` / `Cannot find module '@rolldown/binding-linux-x64-gnu'`.

Regenerating the lockfile does not help (a fresh resolve still writes darwin only), and neither does
`npm install --os=linux --cpu=x64 --package-lock-only`. Declaring the Linux packages at the root is what puts them
in the lockfile; they carry `os: ["linux"]` so npm skips downloading them on macOS and Windows.

**Their versions must match their parent package.** After upgrading Vite, Astro, esbuild or sharp, re-read the
parent's `optionalDependencies` in `package-lock.json` and update these pins, or CI installs a binary that does not
match its loader.
