import { access, mkdir, symlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const links = [
  [
    'node_modules/.pnpm/lru-cache@5.1.1/node_modules/yallist',
    'node_modules/.pnpm/yallist@3.1.1/node_modules/yallist',
  ],
  [
    'node_modules/.pnpm/lru-cache@6.0.0/node_modules/yallist',
    'node_modules/.pnpm/yallist@4.0.0/node_modules/yallist',
  ],
  [
    'node_modules/.pnpm/pkijs@3.4.0/node_modules/@noble/hashes',
    'node_modules/.pnpm/@noble+hashes@1.4.0/node_modules/@noble/hashes',
  ],
]

for (const [linkRelative, targetRelative] of links) {
  const link = resolve(root, linkRelative)
  try {
    await access(link)
    continue
  } catch {
    // The hoisted pnpm layout omitted this version-specific link.
  }
  const target = resolve(root, targetRelative)
  await access(target)
  await mkdir(dirname(link), { recursive: true })
  await symlink(target, link, 'junction')
}

console.log('Verified version-specific pnpm dependency links.')
