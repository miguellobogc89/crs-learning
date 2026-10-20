// Pure, read-only identity proposals for a grouped extraction preview.
// Temporary IDs are scoped to this response; they are not database IDs.
export type PreviewLine = {
  ingredient: string; quantity: number; unit: string;
  ivaPercent: number | null; evidenceText: string;
};
export type PreviewBlock = {
  recipe: string; recipeEvidence: string; ingredients: PreviewLine[];
};
type Identity = { id: string; name: string; occurrences: number };
type Link = {
  fromLineId: string; ingredientId: string;
  recipeId: string; ingredientRecipeId: string | null;
  status: "PROPOSED_NAME_MATCH" | "NEEDS_REVIEW";
  reason: string;
};
const normalize = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

export function resolvePreviewIdentities(blocks: PreviewBlock[]) {
  const recipes = blocks.map((block, index) => ({
    id: `preview-recipe-${index + 1}`,
    name: block.recipe,
    evidenceText: block.recipeEvidence,
  }));
  const recipeByName = new Map<string, string[]>();
  for (const recipe of recipes) {
    const key = normalize(recipe.name);
    recipeByName.set(key, [...(recipeByName.get(key) ?? []), recipe.id]);
  }
  const ingredientByName = new Map<string, Identity>();
  const lines: Array<{
    id: string; recipeId: string; ingredientId: string;
    quantity: number; unit: string; ivaPercent: number | null;
    evidenceText: string;
  }> = [];
  const links: Link[] = [];
  let lineNumber = 0;
  for (const [index, block] of blocks.entries()) {
    for (const line of block.ingredients) {
      const key = normalize(line.ingredient);
      let ingredient = ingredientByName.get(key);
      if (!ingredient) {
        ingredient = {
          id: `preview-ingredient-${ingredientByName.size + 1}`,
          name: line.ingredient,
          occurrences: 0,
        };
        ingredientByName.set(key, ingredient);
      }
      ingredient.occurrences++;
      const id = `preview-line-${++lineNumber}`;
      lines.push({
        id, recipeId: recipes[index].id, ingredientId: ingredient.id,
        quantity: line.quantity, unit: line.unit,
        ivaPercent: line.ivaPercent, evidenceText: line.evidenceText,
      });
      const matches = recipeByName.get(key) ?? [];
      links.push({
        fromLineId: id,
        ingredientId: ingredient.id,
        recipeId: recipes[index].id,
        ingredientRecipeId: matches.length === 1 ? matches[0] : null,
        status: matches.length === 1 ? "PROPOSED_NAME_MATCH" : "NEEDS_REVIEW",
        reason: matches.length === 1
          ? "El nombre del ingrediente coincide con una única receta del documento; requiere confirmación."
          : matches.length > 1
            ? "Varias recetas comparten este nombre; no se puede elegir destino."
            : "No hay receta homónima en este documento; identidad de artículo pendiente de revisión.",
      });
    }
  }
  const ingredients = [...ingredientByName.values()];
  return {
    recipes, ingredients, lines, links,
    summary: {
      uniqueIngredients: ingredients.length,
      reusedIngredients: ingredients.filter(item => item.occurrences > 1).length,
      proposedRecipeReferences: links.filter(link => link.status === "PROPOSED_NAME_MATCH").length,
      pendingReview: links.filter(link => link.status === "NEEDS_REVIEW").length,
    },
    identityVerified: false,
    writesPerformed: false,
  };
}
