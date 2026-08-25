import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const reviewPath = fileURLToPath(new URL("../evals/results/gateway-outcome-review.json", import.meta.url));
const outputPath = fileURLToPath(new URL("../evals/results/gateway-outcome-scorecard.json", import.meta.url));
const review = JSON.parse(await readFile(reviewPath, "utf8"));
const detailById = new Map(review.routingDetails.map((detail) => [detail.id, detail]));
const summary = { autoPickWins: 0, fixedBaselineWins: 0, ties: 0, unscored: 0 };
const decisions = review.reviewItems.map((item) => {
  const detail = detailById.get(item.id);
  const winner = typeof item.winner === "string" ? item.winner.toUpperCase() : "";
  let resolvedWinner = "unscored";
  if (winner === "TIE") {
    resolvedWinner = "tie";
    summary.ties += 1;
  } else if ((winner === "A" || winner === "B") && detail?.candidateMapping?.[winner]) {
    resolvedWinner = detail.candidateMapping[winner];
    if (resolvedWinner === "auto-pick") summary.autoPickWins += 1;
    else summary.fixedBaselineWins += 1;
  } else {
    summary.unscored += 1;
  }
  return { id: item.id, blindWinner: winner || null, resolvedWinner, notes: item.notes ?? "" };
});
const scored = decisions.length - summary.unscored;
const result = {
  generatedAt: new Date().toISOString(),
  sourceGeneratedAt: review.generatedAt,
  target: review.target,
  totalItems: decisions.length,
  scoredItems: scored,
  ...summary,
  autoPickWinOrTieRate: scored ? (summary.autoPickWins + summary.ties) / scored : null,
  decisions,
  interpretation: "Human pairwise preference is subjective evidence and should be reported with the sample size, prompts, and review protocol.",
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write([
  `Scored: ${scored}/${decisions.length}`,
  `Auto-pick wins: ${summary.autoPickWins}`,
  `Fixed-baseline wins: ${summary.fixedBaselineWins}`,
  `Ties: ${summary.ties}`,
  `Unscored: ${summary.unscored}`,
  `Report: ${outputPath}`,
].join("\n") + "\n");
