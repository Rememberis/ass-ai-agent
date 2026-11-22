// Deploy only after the Gemini document index and search_knowledge_gemini RPC exist.
const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;
const headers = {
  "Access-Control-Allow-Origin": "https://rememberis.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST 요청만 지원합니다." });
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "로그인이 필요합니다." });
  try {
    // Validate the user even when gateway JWT verification is disabled.
    const auth = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", {
      headers: { authorization, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) return reply(401, { error: "로그인이 만료되었습니다. 다시 로그인해주세요." });
    const user = await auth.json();
    if (!user.id) return reply(401, { error: "로그인이 필요합니다." });
    const membership = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/is_member", {
      method: "POST",
      headers: { authorization, apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    if (!membership.ok || await membership.json() !== true) return reply(403, { error: "승인된 회원만 자료를 검색할 수 있습니다." });
    const body = await req.json().catch(() => null);
    if (typeof body?.text !== "string" || !body.text.trim() || body.text.length > 16000) {
      return reply(400, { error: "검색어는 1~16,000자로 입력해주세요." });
    }
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return reply(503, { error: "관리자가 Gemini 임베딩 API 키를 설정해야 합니다." });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: body.text.trim() }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: DIMENSIONS,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return reply(res.status === 429 ? 429 : 502, { error: `Gemini 임베딩 요청 실패 (${res.status})` });
    const data = await res.json();
    const embedding = data.embedding?.values;
    if (!Array.isArray(embedding) || embedding.length !== DIMENSIONS || !embedding.every(Number.isFinite) || !embedding.some(value => value !== 0)) {
      return reply(502, { error: "Gemini 임베딩 응답 형식이 올바르지 않습니다." });
    }
    return reply(200, { embedding, model: MODEL, dimensions: DIMENSIONS });
  } catch (error) {
    const timeout = error instanceof Error && /Timeout|Abort/.test(error.name);
    return reply(timeout ? 504 : 502, { error: timeout ? "Gemini 임베딩 응답 시간이 초과되었습니다." : "임베딩 서버 연결에 실패했습니다." });
  }
});
