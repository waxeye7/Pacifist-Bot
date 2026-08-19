"use strict";

import clear from 'rollup-plugin-clear';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import screeps from 'rollup-plugin-screeps';

let cfg;
const dest = process.env.DEST;
if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if ((cfg = require("./screeps.json")[dest]) == null) {
  throw new Error("Invalid upload destination");
}

export default {
  input: "src/main.ts",
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: true
  },

  plugins: [
    clear({ targets: ["dist"] }),
    resolve({ rootDir: "src" }),
    commonjs(),
    // include as REGEX, not globs: the hoisted @rollup/pluginutils (3.x, per
    // the ancient lockfile) fails to glob-match absolute Windows paths, which
    // makes rpt2 silently skip every .ts file and rollup then chokes on raw
    // TypeScript ("new Map<string, number>"). Regexes bypass its glob matcher.
    typescript({tsconfig: "./tsconfig.json", include: [/\.tsx?$/]}),
    screeps({config: cfg, dryRun: cfg == null})
  ]
}
