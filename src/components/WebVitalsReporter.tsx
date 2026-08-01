"use client";

import { useReportWebVitals } from "next/web-vitals";

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

const reportWebVital: ReportWebVitalsCallback = (metric) => {
  const payload = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
    route: window.location.pathname,
  });
  const endpoint = "/api/metrics/web-vitals";

  try {
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
      if (queued) return;
    }
    void fetch(
      endpoint,
      {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
      },
    ).catch(() => undefined);
  } catch {
    // Telemetry must never affect the learning workflow.
  }
};

export function WebVitalsReporter() {
  useReportWebVitals(reportWebVital);
  return null;
}
