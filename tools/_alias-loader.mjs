// Node ESM loader that resolves Vite's @ alias → <root>/src/
// Usage: node --experimental-loader ./tools/_alias-loader.mjs <script>
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve as resolvePath, dirname } from 'node:path'

// pathToFileURL strips trailing slash, so append it explicitly
const SRC = pathToFileURL(resolvePath(dirname(fileURLToPath(import.meta.url)), '../src')).href + '/'

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return { url: new URL(specifier.slice(2), SRC).href, shortCircuit: true }
  }
  return next(specifier, context)
}
