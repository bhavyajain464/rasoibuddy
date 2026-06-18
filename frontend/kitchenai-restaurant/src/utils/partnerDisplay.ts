import { PartnerWorkerStatus, OutletIntegrationsStatus, integrationWorkers } from '../types';

function partnerDisplayName(partner?: string): string {
  const raw = partner?.trim() || 'zomato';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function partnerStoreTitle(worker: PartnerWorkerStatus | undefined): string {
  const name =
    worker?.partner_store_name?.trim() ||
    worker?.partner_outlet_name?.trim() ||
    worker?.outlet_name?.trim();
  if (name) return name;
  return partnerDisplayName(worker?.partner);
}

/** Home Partners card — short Zomato fetch summary. */
export function formatPartnerFetchSummary(worker: PartnerWorkerStatus | undefined): string {
  const label = partnerDisplayName(worker?.partner);
  const n = worker?.orders_fetched_last_hour ?? 0;
  const orderWord = n === 1 ? 'order' : 'orders';
  return `Fetching from ${label} · ${n} ${orderWord} in the last hour`;
}

export function partnerHomeStatusLine(
  integrations: OutletIntegrationsStatus | null,
  worker: PartnerWorkerStatus | undefined,
  running: boolean,
): string {
  if (running) {
    return formatPartnerFetchSummary(worker);
  }
  if (worker?.last_error?.trim()) {
    return worker.last_error.trim();
  }
  const workers = integrationWorkers(integrations);
  if (workers.some((o) => o.status === 'login_required')) {
    return 'Sign in to Zomato again in Profile';
  }
  if (workers.some((o) => o.status === 'error')) {
    return 'Could not sync orders — check Profile';
  }
  if (integrations?.session_saved) {
    return 'Connected — open Profile to manage';
  }
  return 'Tap Profile → Partners to connect Zomato';
}
