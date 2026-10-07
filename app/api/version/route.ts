import packageJson from "@/package.json";

// The live version, for open apps to notice a new release (never cached).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ version: packageJson.version }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
