import { describe, expect, it } from "vitest";
import { isIOSUserAgent } from "./detect-ios";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
// iPadOS 13+ 桌面模式：UA 伪装成 Mac，只能靠 maxTouchPoints 识别
const IPADOS_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const MAC_UA = IPADOS_DESKTOP_UA;
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("isIOSUserAgent", () => {
  it("识别 iPhone / iPad UA", () => {
    expect(isIOSUserAgent(IPHONE_UA, 5)).toBe(true);
    expect(isIOSUserAgent(IPAD_UA, 5)).toBe(true);
  });

  it("识别 iPadOS 桌面模式（Mac UA + 多点触控）", () => {
    expect(isIOSUserAgent(IPADOS_DESKTOP_UA, 5)).toBe(true);
  });

  it("真 Mac（无触控）不算 iOS", () => {
    expect(isIOSUserAgent(MAC_UA, 0)).toBe(false);
  });

  it("Android / Windows 不算 iOS", () => {
    expect(isIOSUserAgent(ANDROID_UA, 5)).toBe(false);
    expect(isIOSUserAgent(WINDOWS_UA, 0)).toBe(false);
    expect(isIOSUserAgent(WINDOWS_UA, 10)).toBe(false);
  });
});
