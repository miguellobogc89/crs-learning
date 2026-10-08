from pathlib import Path
import shutil
root=Path.cwd()
source=Path(__file__).resolve().parent
for name in ['lib/academy/interaction-schema.ts','components/academy/learning-room/academy-interaction.tsx']:
 target=root/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/name,target)

def patch(name,old,new):
 p=root/name;s=p.read_text(encoding='utf8')
 if new in s:return
 if old not in s:raise RuntimeError(f'No encuentro fragmento esperado en {name}: {old[:90]}')
 p.write_text(s.replace(old,new),encoding='utf8')

package='lib/academy/didactic-package.ts'
patch(package,'// lib/academy/didactic-package.ts','// lib/academy/didactic-package.ts\nimport {validateInteraction, type InteractionData} from "./interaction-schema";')
patch(package,'  activity: DidacticActivity | null; learningGoal?', '  activity: DidacticActivity | null; interaction?: InteractionData | null; learningGoal?')
patch(package,'  if (v.learningGoal !== undefined && !str(v.learningGoal)) return false;', '  if (v.interaction !== undefined && v.interaction !== null && !validateInteraction(v.interaction)) return false;\n  if (v.learningGoal !== undefined && !str(v.learningGoal)) return false;')
patch(package,'screens.some(s => s.phase === "assessment" && s.activity)', 'screens.some(s => s.phase === "assessment" && (s.activity || s.interaction))')

gen='lib/academy/didactic-generator.ts'
patch(gen,'import OpenAI from "openai";', 'import OpenAI from "openai";\nimport {validateInteraction, type InteractionData, INTERACTION_KINDS} from "./interaction-schema";')
patch(gen,'interaction: "none" | "quiz" | "sorting" | "decision"','interaction: "none" | "quiz" | "sorting" | "decision" | InteractionData["kind"]')
patch(gen,'Usa interaction: none | quiz | sorting | decision.', 'Usa interaction: none | quiz | sorting | decision | flip-cards | flip-challenge | match-pairs | sort-it | put-in-order | quick-quiz | choose-your-path.')
patch(gen,'["none", "quiz", "sorting", "decision"].includes(String(s.interaction))','["none", "quiz", "sorting", "decision", ...INTERACTION_KINDS].includes(String(s.interaction))')
patch(gen,'al menos dos interacciones quiz/sorting/decision.', 'al menos dos interacciones. interaction debe ser uno de los tipos permitidos.')
patch(gen,'Si interaction="none", activity=null.', '''Si interaction es uno de los siete tipos nuevos, devuelve activity=null y además un objeto interactionData:
{"kind":"flip-cards","instruction":"...","items":[{"id":"a","label":"...","description":"..."}]}.
Reglas por kind:
flip-cards: 2-6 items con id,label,description.
flip-challenge: 2-4 options con id,label,isPreferred,feedback,consequence; exactamente una correcta y explica todas.
match-pairs: 2-6 items izquierdos con matchId apuntando al id de un item derecho, más los items derechos sin matchId; todos con id,label, sin duplicados.
sort-it: 2-4 groups con id,label; 3-8 items con id,label,groupId válido,feedback.
put-in-order: 3-7 items con id,label EN ORDEN CORRECTO; el reproductor los mezcla.
quick-quiz: 2-4 options con exactamente una isPreferred=true y feedback para todas.
choose-your-path: 2-4 options con exactamente una isPreferred=true y consequence y feedback para todas.
No generes datos ambiguos. Los ids deben ser únicos. Para los tipos antiguos quiz, sorting y decision, usa activity como antes.
Si interaction="none", activity=null e interactionData=null.''')
patch(gen,'  if (plan.interaction === "none") return null;', '  if (plan.interaction === "none" || INTERACTION_KINDS.includes(plan.interaction as InteractionData["kind"])) return null;')
patch(gen,'    activity: normalizeActivity(d.activity, plan),','    activity: normalizeActivity(d.activity, plan),\n    interaction: INTERACTION_KINDS.includes(plan.interaction as InteractionData["kind"]) ? d.interactionData : null,')
patch(gen,'(plan.interaction === "none" || candidate.activity?.kind === plan.interaction)', '(plan.interaction === "none" || (INTERACTION_KINDS.includes(plan.interaction as InteractionData["kind"]) ? validateInteraction(candidate.interaction) && candidate.interaction.kind === plan.interaction : candidate.activity?.kind === plan.interaction))')
patch(gen,'Si es none, activity=null. No omitas campos.', 'Si es un tipo nuevo, activity=null e interactionData válido según las reglas. Si es none, activity=null e interactionData=null. No omitas campos.')

room='components/academy/learning-room/academy-didactic-room.tsx'
patch(room,'import { DidacticActivity } from "./didactic-activity";', 'import { DidacticActivity } from "./didactic-activity";\nimport { AcademyInteraction } from "./academy-interaction";')
patch(room,'const ready = !screen?.activity || Boolean(reviewed[screen.id]);','const ready = (!screen?.activity && !screen?.interaction) || Boolean(reviewed[screen.id]);')
needle='          {screen.activity && <DidacticActivity'
patch(room,needle,'          {screen.interaction && <AcademyInteraction key={`${lessonId}:${screen.id}`} data={screen.interaction} completed={Boolean(reviewed[screen.id])} onComplete={() => setReviewed(p => ({ ...p, [screen.id]: true }))}/>}\n'+needle)
print('Integración aplicada a 3 archivos existentes y 2 nuevos.')
