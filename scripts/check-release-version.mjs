import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const tauri = JSON.parse(
  await readFile(new URL("src-tauri/tauri.conf.json", root), "utf8"),
);
const cargo = await readFile(new URL("src-tauri/Cargo.toml", root), "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const versions = [pkg.version, tauri.version, cargoVersion];

if (!versions.every((version) => version === versions[0])) {
  throw new Error(`버전 불일치: package=${versions[0]}, tauri=${versions[1]}, cargo=${versions[2]}`);
}
const tag = process.argv[2] ?? process.env.RELEASE_TAG;
if (tag && tag !== `v${versions[0]}`) {
  throw new Error(`태그 ${tag}와 앱 버전 v${versions[0]}이 일치하지 않음`);
}

console.log(`release version v${versions[0]} ok`);
