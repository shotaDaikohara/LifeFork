import OpenAI from "openai";
import { z } from "zod";
import { buildResearchPrompt } from "@/lib/PromptBuilder";
import { researchResultSchema } from "@/types/research";
import type { ResearchRequest } from "@/types/research";

const client = new OpenAI({
  apiKey: process.env.ORCAROUTER_API_KEY,
  baseURL: process.env.ORCAROUTER_BASE_URL,
});

function toJsonSchema(schema: z.core.$ZodType) {
  const s = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

async function tryModel(model: string, system: string, user: string) {
  console.log(`\n=== trying ${model} ===`);
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "research_result", schema: toJsonSchema(researchResultSchema), strict: false },
      },
    });
    console.log("usage:", JSON.stringify(res.usage));
    const content = res.choices[0]?.message?.content ?? "";
    console.log("content length (chars):", content.length);
    try {
      const parsed = JSON.parse(content);
      const v = researchResultSchema.safeParse(parsed);
      console.log("schema valid:", v.success);
      if (!v.success) console.log(v.error.issues.slice(0, 3));
    } catch (e) {
      console.log("JSON parse failed:", (e as Error).message);
      console.log("content head:", content.slice(0, 300));
    }
  } catch (err) {
    console.log("ERROR:", err instanceof Error ? err.message : err);
  }
}

async function main() {
  const req: ResearchRequest = {
    profile: { fields: {} },
    goal: { type: "independence", description: "いちご農園を始めたい" },
    answers: [
      { questionId: "q1", question: "現在の職業は？", answer: "会社員（営業職）、年収550万円" },
      { questionId: "q2", question: "貯金はどれくらいありますか？", answer: "800万円ほど" },
      { questionId: "q3", question: "農業の経験はありますか？", answer: "特にない。週末に家庭菜園をやる程度" },
    ],
  };
  const rp = await buildResearchPrompt(req);
  await tryModel("openai/gpt-5.5-pro", rp.system, rp.user);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
