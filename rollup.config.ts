import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default defineConfig([
    {
        input: "shim/shim.ts",
        output: {
            dir: "dist",
            format: "iife",
            sourcemap: true,
        },
        plugins: [nodeResolve(), resolve(), typescript()],
    },
    {
        input: "sw/sw.ts",
        output: {
            dir: "dist",
            format: "iife",
            sourcemap: true,
        },
        plugins: [nodeResolve(), resolve(), typescript()],
    },
    {
        input: "player/player.ts",
        output: {
            dir: "dist",
            format: "iife",
            sourcemap: true,
        },
        plugins: [nodeResolve(), resolve(), typescript()],
    },
]);
