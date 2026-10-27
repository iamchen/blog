import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findProjectRoot(): string {
  const fromFile = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
  if (existsSync(path.join(fromFile, "package.json"))) return fromFile;
  return process.cwd();
}

export const projectRoot = findProjectRoot();

let fileEnv: Map<string, string> | undefined;

function parseEnvFile(text: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
}

function loadFileEnv(): Map<string, string> {
  if (fileEnv) return fileEnv;
  fileEnv = new Map();
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const names = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  for (const name of names) {
    const file = path.join(projectRoot, name);
    if (!existsSync(file)) continue;
    for (const [key, value] of parseEnvFile(readFileSync(file, "utf8"))) {
      fileEnv.set(key, value);
    }
  }
  return fileEnv;
}

export function readEnv(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim() !== "") {
    return fromProcess.trim();
  }
  const fromFile = loadFileEnv().get(name);
  if (typeof fromFile === "string" && fromFile.trim() !== "") {
    return fromFile.trim();
  }
  return undefined;
}
