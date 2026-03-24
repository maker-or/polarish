import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  getRuntimeInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      versions: {
        chrome: process.versions.chrome,
        electron: process.versions.electron,
        node: process.versions.node,
      },
    };
  },
  signInWithChatGPT() {
    return ipcRenderer.invoke("chatgpt:sign-in");
  },
  getChatGPTAuth() {
    return ipcRenderer.invoke("chatgpt:get-auth");
  },
  signInWithHax() {
    return ipcRenderer.invoke("hax:sign-in");
  },
  getHaxAuth() {
    return ipcRenderer.invoke("hax:get-auth");
  },
  signOutWithHax() {
    return ipcRenderer.invoke("hax:sign-out");
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
