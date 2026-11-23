# Pinned dependencies

Read this before upgrading Vite, Astro, esbuild, sharp, `@astrojs/lit` or `@lit-labs/ssr`, or when
`pnpm install --frozen-lockfile` or the UI build fails on a native binding. Paths are relative to the repository root.

## Pinned transitive dependency: `@lit-labs/ssr`

`pnpm-workspace.yaml` has `overrides: { '@lit-labs/ssr': 3.2.2 }`. `@astrojs/lit` (unmaintained since mid-2024) hand-builds the `renderInfo` object in its `server.js` with only `customElementInstanceStack`/`customElementHostStack`, but `@lit-labs/ssr` 3.3+ also reads `eventTargetStack`/`slotStack`. Its own `^3.2.2` range floats into those versions, and the UI app build then dies with `Cannot read properties of undefined (reading 'length')` inside `getLast`. Do not remove the override without first checking that `@astrojs/lit` has been updated.

## Native binaries and install scripts

The toolchain ships its native code as platform-gated optional dependencies (`@rolldown/binding-*`, `@esbuild/*`,
`lightningcss-*`, `@img/sharp-*`, `@parcel/watcher-*`, …). Unlike npm, pnpm records every platform's variant in
`pnpm-lock.yaml` and installs only the one the host needs, so a lockfile written on macOS installs on CI's Linux
runners as it is: no per-platform pins are needed, and an upgrade needs nothing beyond `pnpm install`.

pnpm runs a dependency's `install`/`postinstall` script only when the package is listed in `onlyBuiltDependencies`
in `pnpm-workspace.yaml` (`ignoredBuiltDependencies` silences the ones that are deliberately skipped). When an
upgrade or a new dependency brings a package with a build script, `pnpm install` prints "Ignored build scripts:
<name>". Add it to one of the two lists: allow it when the package needs the script to work (a native addon that
builds or downloads its binary), ignore it when the script is a banner or an optional speed-up.
