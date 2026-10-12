import { handleAdminBff, readAdminBffConfig } from "@/lib/bff";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function handler(request: Request) {
  return handleAdminBff(request, readAdminBffConfig());
}
export { handler as GET, handler as POST };
