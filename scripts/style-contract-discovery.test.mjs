import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { discoverPublishableContracts } from './lib/style-contract-discovery.mjs'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'c2-style-discovery-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/components/*', 'packages/icons/*', 'open-packages/*'] }))
  const addPackage = (directory, name, tags, options = {}) => {
    const path = join(root, directory)
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, private: options.private ?? false, customElements: 'custom-elements.json' }))
    if (!options.noManifest) {
      writeFileSync(
        join(path, 'custom-elements.json'),
        JSON.stringify({ modules: tags.map((tag, i) => ({ path: `src/${i}.ts`, declarations: [{ tagName: tag, cssProperties: [] }] })) }),
      )
    }
  }
  try {
    run({ root, addPackage })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('discovers publishable component, open, and generated icon tags from workspace metadata', () => {
  fixture(({ root, addPackage }) => {
    addPackage('packages/components/button', '@c2n/button', ['c2-button'])
    addPackage('open-packages/chatbot', '@c2n/chatbot', ['c2-chatbot'])
    addPackage('packages/icons/feather-icons', '@c2n/feather-icons', ['c2-feather-icon', 'c2-feather-activity'])
    addPackage('packages/components/private', '@c2n/private', ['c2-private'], { private: true })
    let inventory = discoverPublishableContracts(root)
    assert.deepEqual(
      inventory.tags.map(({ tag }) => tag),
      ['c2-button', 'c2-chatbot', 'c2-feather-activity', 'c2-feather-icon'],
    )
    assert.equal(inventory.packages.length, 3)
    addPackage('packages/icons/feather-icons', '@c2n/feather-icons', ['c2-feather-icon', 'c2-feather-activity', 'c2-feather-new-icon'])
    inventory = discoverPublishableContracts(root)
    assert.ok(inventory.tags.some(({ tag }) => tag === 'c2-feather-new-icon'))
  })
})

test('missing manifest is an input error rather than silently skipped', () => {
  fixture(({ root, addPackage }) => {
    addPackage('packages/components/broken', '@c2n/broken', [], { noManifest: true })
    assert.throws(() => discoverPublishableContracts(root), /@c2n\/broken.*missing.*custom-elements\.json/i)
  })
})

test('duplicate tag names across publishable packages are rejected', () => {
  fixture(({ root, addPackage }) => {
    addPackage('packages/components/one', '@c2n/one', ['c2-duplicate'])
    addPackage('open-packages/two', '@c2n/two', ['c2-duplicate'])
    assert.throws(() => discoverPublishableContracts(root), /duplicate.*c2-duplicate/i)
  })
})
