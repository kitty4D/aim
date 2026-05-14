import { getFile, putFile } from "./github.js";

export interface AimConfig {
  server_name: string;
  rooms: string[];
  version: number;
  motd?: string;
}

const CONFIG_PATH = ".aim/config.json";
const DEFAULT_CONFIG: AimConfig = {
  server_name: "AIM Server",
  rooms: ["lobby"],
  version: 1,
  motd: "Welcome to AIM. You've got mail... sort of.",
};

const SYSTEM_AUTHOR = { name: "AIM", email: "system@aim.local" };

export async function readConfig(): Promise<AimConfig> {
  const file = await getFile(CONFIG_PATH);
  if (!file) {
    await putFile(
      CONFIG_PATH,
      JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
      "chore: bootstrap AIM config",
      SYSTEM_AUTHOR,
    );
    return DEFAULT_CONFIG;
  }
  try {
    return JSON.parse(file.content) as AimConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(next: AimConfig, by: { name: string; email: string }): Promise<void> {
  await putFile(
    CONFIG_PATH,
    JSON.stringify(next, null, 2) + "\n",
    `chore: update AIM config (by ${by.name})`,
    by,
  );
}
