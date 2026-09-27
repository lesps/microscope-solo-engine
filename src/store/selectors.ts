import { nextStep, softWarnings, type Game } from '../engine';

export const selectStep = (g: Game) => nextStep(g);
export const selectWarnings = (g: Game) => softWarnings(g);
