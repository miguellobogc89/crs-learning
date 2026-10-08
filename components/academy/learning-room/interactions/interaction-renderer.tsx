'use client';
// components/academy/learning-room/interactions/interaction-renderer.tsx
import type {InteractionData,InteractionProps} from './types';
import {FlipCards} from './flip-cards';
import {FlipChallenge} from './flip-challenge';
import {MatchPairs} from './match-pairs';
import {SortIt} from './sort-it';
import {PutInOrder} from './put-in-order';
import {QuickQuiz} from './quick-quiz';
import {ChooseYourPath} from './choose-your-path';
export function InteractionRenderer(props:InteractionProps){
 const components:Record<InteractionData['kind'],typeof FlipCards>={'flip-cards':FlipCards,'flip-challenge':FlipChallenge,'match-pairs':MatchPairs,'sort-it':SortIt,'put-in-order':PutInOrder,'quick-quiz':QuickQuiz,'choose-your-path':ChooseYourPath};
 const Component=components[props.data.kind];return <Component {...props}/>;
}
