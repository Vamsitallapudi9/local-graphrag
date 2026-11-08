import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // A stray lockfile in the parent folder made Next pick it as the root,
  // so tailwindcss could not be resolved and the dev server hung.
  turbopack: { root: path.resolve(__dirname) },
}

export default nextConfig
