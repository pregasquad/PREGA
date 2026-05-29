import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, cp, mkdir } from "fs/promises";
import path from "path";

async function buildAll() {
  console.log("Cleaning dist-electron folder...");
  await rm("dist-electron", { recursive: true, force: true });
  await mkdir("dist-electron", { recursive: true });

  console.log("Building client...");
  await viteBuild({
    build: {
      outDir: path.resolve("dist-electron/public"),
      emptyOutDir: true,
    },
  });

  console.log("Building server for Electron...");
  await esbuild({
    entryPoints: ["server/index-electron.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist-electron/server.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    external: [
      "better-sqlite3",
      "electron",
    ],
    logLevel: "info",
  });

  console.log("Building Electron main process...");
  await esbuild({
    entryPoints: ["electron/main.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist-electron/main.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    external: [
      "electron",
      "better-sqlite3",
    ],
    logLevel: "info",
  });

  console.log("Copying assets...");
  try {
    await cp("generated-icon.png", "dist-electron/generated-icon.png");
  } catch (e) {
    console.log("No icon found, skipping...");
  }

  console.log("Build complete!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
