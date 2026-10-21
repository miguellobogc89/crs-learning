import type { SchemaDiscoveryProposal } from "./validation";

/**
 * Resolve explicit, domain-neutral key aliases against the active schema.
 * Never merge two simultaneously proposed entities or overwrite fields.
 * Unknown names remain untouched for review by the existing workflow.
 */
const ALIASES: readonly (readonly string[])[] = [
  ["business_hours", "opening_hours", "opening_times", "business_opening_hours"],
];

export function stabilizeDiscoveredSchema(
  proposal: SchemaDiscoveryProposal,
  existingKeys: readonly string[],
): { proposal: SchemaDiscoveryProposal; renamed: ReadonlyMap<string, string> } {
  const existing = new Set(existingKeys);
  const proposed = new Set(proposal.entities.map(entity => entity.key));
  const renamed = new Map<string, string>();
  for (const entity of proposal.entities) {
    if (existing.has(entity.key)) continue;
    const family = ALIASES.find(group => group.includes(entity.key));
    if (!family) continue;
    const matches = family.filter(key => existing.has(key));
    if (matches.length !== 1 || proposed.has(matches[0])) continue;
    renamed.set(entity.key, matches[0]);
  }
  if (!renamed.size) return { proposal, renamed };
  return {
    proposal: {
      ...proposal,
      entities: proposal.entities.map(entity => ({
        ...entity, key: renamed.get(entity.key) ?? entity.key,
      })),
      relations: proposal.relations.map(relation => ({
        ...relation,
        fromEntity: renamed.get(relation.fromEntity) ?? relation.fromEntity,
        toEntity: renamed.get(relation.toEntity) ?? relation.toEntity,
      })),
    },
    renamed,
  };
}
