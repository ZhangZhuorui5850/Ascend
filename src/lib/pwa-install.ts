// beforeinstallprompt 只发一次且早于组件挂载，用模块级 store 捕获，
// 供 PwaLifecycle（根布局，保证早期加载）与设置页共享。
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  canPrompt: boolean;
  installed: boolean;
  /** iOS 设备（不分浏览器；iOS 上第三方浏览器也装不了，只能经 Safari 加主屏） */
  ios: boolean;
  /** iOS 上的 Safari 本尊，可直接引导「添加到主屏幕」 */
  iosSafari: boolean;
  supported: boolean;
};

const SERVER_STATE: InstallState = { canPrompt: false, installed: false, ios: false, iosSafari: false, supported: false };

let promptEvent: InstallPromptEvent | null = null;
let snapshot: InstallState = SERVER_STATE;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

function isIosDevice(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return isIosDevice() && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua);
}

function refresh() {
  snapshot = {
    canPrompt: promptEvent !== null,
    installed: isStandalone(),
    ios: isIosDevice(),
    iosSafari: isIosSafari(),
    supported: "onbeforeinstallprompt" in window,
  };
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    refresh();
  });
  snapshot = {
    canPrompt: false,
    installed: isStandalone(),
    ios: isIosDevice(),
    iosSafari: isIosSafari(),
    supported: "onbeforeinstallprompt" in window,
  };
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallSnapshot(): InstallState {
  return snapshot;
}

export function getServerInstallSnapshot(): InstallState {
  return SERVER_STATE;
}

export async function requestInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!promptEvent) return "unavailable";
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  // prompt() 在同一事件上只能调用一次，dismissed 也已消费——一律丢弃，等浏览器再次派发。
  promptEvent = null;
  refresh();
  return choice.outcome;
}
