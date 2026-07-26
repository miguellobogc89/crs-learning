$ErrorActionPreference = "Stop"

$typesPath = Join-Path (Get-Location) "lib\knowledge\import\types.ts"
$proposalPath = Join-Path (Get-Location) "lib\knowledge\import\generate-proposal.ts"

if (-not (Test-Path $typesPath)) {
  throw "Ejecuta el script desde la raíz del proyecto."
}

$types = Get-Content $typesPath -Raw

if ($types -notmatch 'export type KnowledgeImportOrganizationArea') {
  $typeBlock = @'
export type KnowledgeImportOrganizationArea = {
  name: string;
  aliases: string[];
  areaType:
    | "direction"
    | "division"
    | "business_unit"
    | "department"
    | "area"
    | "team"
    | "office"
    | "committee"
    | "operational_center"
    | "unknown";
  description: string;
  parentAreaName: string | null;
  confidence: number;
  evidence: {
    text: string;
    reason: string;
  }[];
};

'@

  $types = [regex]::Replace(
    $types,
    '(?m)^export type KnowledgeImportDocumentAnalysis = \{',
    $typeBlock + 'export type KnowledgeImportDocumentAnalysis = {',
    1
  )
}

if ($types -notmatch 'organizationAreas\s*:\s*KnowledgeImportOrganizationArea\[\]') {
  $updated = [regex]::Replace(
    $types,
    '(?m)^(\s*keywords\s*:\s*string\[\];\s*)$',
    '$1' + "`r`n  organizationAreas: KnowledgeImportOrganizationArea[];",
    1
  )

  if ($updated -eq $types) {
    throw "No se encontró la línea keywords: string[]; en types.ts"
  }

  $types = $updated
}

Set-Content -Path $typesPath -Value $types -Encoding utf8

$proposal = Get-Content $proposalPath -Raw

if (
  $proposal -match '\bKnowledgeImportDocumentInput\b' -and
  $proposal -notmatch 'KnowledgeImportDocumentInput\s*,'
) {
  $updatedProposal = [regex]::Replace(
    $proposal,
    '(?m)^(\s*KnowledgeImportDocumentAnalysis,\s*)$',
    '$1' + "`r`n  KnowledgeImportDocumentInput,",
    1
  )

  if ($updatedProposal -eq $proposal) {
    throw "No se pudo añadir KnowledgeImportDocumentInput al import de generate-proposal.ts"
  }

  $proposal = $updatedProposal
}

Set-Content -Path $proposalPath -Value $proposal -Encoding utf8

Write-Host "Correcciones aplicadas." -ForegroundColor Green
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "TypeScript sin errores." -ForegroundColor Green