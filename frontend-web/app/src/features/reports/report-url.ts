export function reportPdfHref(homeId: string, from: string, to: string): string {
  const query = new URLSearchParams({ from, to });
  return `/api/bff/homes/${encodeURIComponent(homeId)}/reports/energy.pdf?${query.toString()}`;
}
