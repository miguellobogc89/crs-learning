import { resolvePreviewIdentities, type PreviewBlock } from "./preview-identity-resolution";

// Deterministic read-only plan. It is NOT a database duplicate check or approval.
export function buildPreviewImportPlan(blocks: PreviewBlock[], documentText: string) {
  const graph = resolvePreviewIdentities(blocks);
  const issues: { code: string; subjectId: string; message: string }[] = [];
  const recipeKeys = new Map<string, number>();
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
  for (const recipe of graph.recipes) {
    const key = normalize(recipe.name);
    recipeKeys.set(key, (recipeKeys.get(key) ?? 0) + 1);
    if (!documentText.includes(recipe.evidenceText) || !recipe.evidenceText.includes(recipe.name))
      issues.push({ code: "RECIPE_EVIDENCE", subjectId: recipe.id, message: "Evidencia de receta ausente o inconsistente." });
  }
  for (const recipe of graph.recipes) {
    if ((recipeKeys.get(normalize(recipe.name)) ?? 0) > 1)
      issues.push({ code: "DUPLICATE_RECIPE_NAME", subjectId: recipe.id, message: "Nombre de receta repetido; requiere desambiguación." });
  }
  for (const line of graph.lines) {
    if (!documentText.includes(line.evidenceText))
      issues.push({ code: "LINE_EVIDENCE", subjectId: line.id, message: "Evidencia de línea ausente." });
  }
  const references = graph.links.filter(link => link.ingredientRecipeId !== null).map(link => ({
    lineId: link.fromLineId,
    sourceRecipeId: link.recipeId,
    targetRecipeId: link.ingredientRecipeId as string,
    status: "REQUIRES_APPROVAL" as const,
    reason: link.reason,
  }));
  for (const reference of references) {
    if (reference.sourceRecipeId === reference.targetRecipeId)
      issues.push({ code: "SELF_REFERENCE", subjectId: reference.lineId, message: "Referencia de receta a sí misma; revisar." });
  }
  return {
    status: "NEEDS_HUMAN_APPROVAL" as const,
    operations: {
      recipes: graph.recipes.map(recipe => ({ id: recipe.id, name: recipe.name, action: "CREATE_OR_MATCH_EXISTING" as const })),
      ingredients: graph.ingredients.map(ingredient => ({ ...ingredient, action: "CREATE_OR_MATCH_EXISTING" as const })),
      lines: graph.lines.map(line => ({ ...line, action: "CREATE_AFTER_SCHEMA_APPROVAL" as const })),
      references,
    },
    issues,
    summary: {
      recipes: graph.recipes.length,
      uniqueIngredients: graph.ingredients.length,
      ingredientLines: graph.lines.length,
      proposedRecipeReferences: references.length,
      blockingIssues: issues.length,
    },
    checks: {
      sourceEvidence: issues.every(issue => !["RECIPE_EVIDENCE", "LINE_EVIDENCE"].includes(issue.code)),
      duplicateNamesWithinDocument: issues.every(issue => issue.code !== "DUPLICATE_RECIPE_NAME"),
      existingDatabaseRecordsChecked: false,
      schemaApproved: false,
      identitiesApproved: false,
      readyToPersist: false,
    },
    writesPerformed: false,
  };
}
