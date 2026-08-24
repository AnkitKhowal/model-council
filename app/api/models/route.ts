import { getModelDirectory } from "../../../lib/model-directory";

export async function GET() {
  return Response.json(await getModelDirectory(), {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
  });
}
