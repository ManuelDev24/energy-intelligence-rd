import { handleBff, readBffConfig } from "@/lib/auth/bff";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function handler(request: Request) {
  // Fail closed even if deployment bypassed the Next startup guard.
  return handleBff(request, readBffConfig());
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
