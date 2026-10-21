import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const directory = new URL("../dist/assets/", import.meta.url);
const chunks = readdirSync(directory)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    bytes: statSync(new URL(file, directory)).size,
    gzip: gzipSync(readFileSync(new URL(file, directory))).length,
  }));
const first = chunks.filter((chunk) => !chunk.file.startsWith("coach-3d"));
const lazy = chunks.filter((chunk) => chunk.file.startsWith("coach-3d"));
const report = [
  ...first.map(
    (c) => `First-load JS: ${c.file} | ${c.bytes} bytes | gzip ${c.gzip} bytes`,
  ),
  ...lazy.map(
    (c) => `Lazy 3D JS: ${c.file} | ${c.bytes} bytes | gzip ${c.gzip} bytes`,
  ),
];
console.log(report.join("\n"));
writeFileSync(
  new URL("../dist/size-report.txt", import.meta.url),
  report.join("\n") + "\n",
);
