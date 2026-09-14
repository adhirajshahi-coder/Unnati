import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Both database drivers must stay outside the bundle. `pg` loads native-ish
   * internals by path, and PGlite ships a WASM binary plus its own filesystem shim —
   * bundling either one breaks at runtime rather than at build time, so this is not
   * an optimisation, it is a correctness requirement.
   */
  serverExternalPackages: ["pg", "@electric-sql/pglite", "drizzle-orm"],

  // Render builds in a container where a type or lint error should fail the deploy
  // loudly rather than being skipped.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
