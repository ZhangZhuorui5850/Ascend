import { notFound } from "next/navigation";
import { AlgorithmDevicePairingApproval } from "@/components/AlgorithmDevicePairingApproval";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getAlgorithmDevicePairingForApproval } from "@/lib/repo/algorithm-device-pairings";
import type { AlgorithmDevicePairing } from "@/lib/repo/algorithm-device-pairings";
import { requirePluginEnabled } from "@/lib/repo/plugins";

export const dynamic = "force-dynamic";

export default async function AlgorithmDeviceConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const query = await searchParams;
  const code = typeof query.code === "string" ? query.code : "";
  const access = await requirePageWorkspace(`/practice/algorithms/connect?code=${encodeURIComponent(code)}`);
  const db = getDb();
  let pairing: AlgorithmDevicePairing;
  try {
    requirePluginEnabled(db, access, "algorithms");
    pairing = getAlgorithmDevicePairingForApproval(db, code);
  } catch {
    notFound();
  }
  return (
    <main className="algorithmPairingPage">
      <AlgorithmDevicePairingApproval pairing={pairing} />
    </main>
  );
}
