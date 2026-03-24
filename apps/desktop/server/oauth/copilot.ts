import { spawn } from "node:child_process";

export const DEVICE_CODE_URL = "https://github.com/login/device/code";
export const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

export const openBrowser = async (url: string) => {
  const platform = process.platform;
  if (platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("open", [url], { stdio: "ignore" });
      proc.once("error", reject);
      proc.once("close", () => resolve());
    });
    return;
  }
  if (platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        windowsHide: true,
      });
      proc.once("error", reject);
      proc.once("close", () => resolve());
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("xdg-open", [url], { stdio: "ignore" });
    proc.once("error", reject);
    proc.once("close", () => resolve());
  });
};
