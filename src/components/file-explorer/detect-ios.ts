/**
 * iOS / iPadOS 识别。
 * 背景：iOS Safari（含所有 iOS 上的第三方浏览器内核）的内嵌 <iframe> PDF 只渲染第一页，
 * 无法滚动翻页，因此 PDF 预览在 iOS 上必须降级为“新标签页打开 / 下载”。
 * 纯函数便于单测；iPadOS 13+ 桌面模式 UA 伪装成 Macintosh，但 maxTouchPoints > 1 可识别。
 */
export function isIOSUserAgent(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh|Mac OS X/.test(userAgent) && maxTouchPoints > 1;
}

export function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIOSUserAgent(navigator.userAgent || "", navigator.maxTouchPoints ?? 0);
}
