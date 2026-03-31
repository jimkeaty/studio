// ── Commentary Engine ──────────────────────────────────────────────────────
// Template-based commentary system that generates dynamic, randomized
// commentary lines for any competition theme.

import type { CompetitionTheme, CommentaryPack } from './types';

// ── Types ─────────────────────────────────────────────────────────────────

type CommentaryTemplate = {
  trigger: string;
  templates: string[];
};

type CommentaryPackDefinition = {
  id: string;
  name: string;
  templates: CommentaryTemplate[];
};

// ── Packs ─────────────────────────────────────────────────────────────────

const nascarClassicPack: CommentaryPackDefinition = {
  id: 'nascar_classic',
  name: 'NASCAR Classic',
  templates: [
    {
      trigger: 'race_start',
      templates: [
        'Ladies and gentlemen, welcome to the {competitionName}! {count} drivers on the grid!',
        'Engines are roaring! {count} racers ready for the {competitionName}!',
        'Start your engines! It\'s time for the {competitionName}!',
      ],
    },
    {
      trigger: 'leader_announce',
      templates: [
        '{name} is out front with {score} points!',
        '{name} leads the pack — {score} points and counting!',
        'The leader board shows {name} at the top with {score} points!',
      ],
    },
    {
      trigger: 'midrace',
      templates: [
        'We\'re at the halfway mark! {name} chasing just {gap} points behind!',
        '{runner} is closing in on {leader}!',
        'What a race! The top {count} are separated by just {gap} points!',
      ],
    },
    {
      trigger: 'achievement',
      templates: [
        '{name} hits a turbo boost from a big closing! What power!',
        '{name} just launched past with a massive deal!',
      ],
    },
    {
      trigger: 'achievement_turbo_boost',
      templates: [
        '{name} hits a turbo boost from a big closing! What power!',
        '{name} just launched past with a massive deal!',
      ],
    },
    {
      trigger: 'penalty',
      templates: [
        'Oh no! {name} hit a flat tire — a deal fell through! That\'s -{points} points!',
        'Trouble for {name}! A cancellation costs them {points} points!',
      ],
    },
    {
      trigger: 'penalty_flat_tire',
      templates: [
        'Oh no! {name} hit a flat tire — a deal fell through! That\'s -{points} points!',
        'Trouble for {name}! A cancellation costs them {points} points!',
      ],
    },
    {
      trigger: 'streak',
      templates: [
        '{name} is on a hot streak! {days} consecutive months with closings!',
        'Look at {name} — {days} months of consistent production!',
      ],
    },
    {
      trigger: 'finish',
      templates: [
        'Checkered flag! {name} wins the {competitionName}! What a season!',
        '{name} takes the crown! {score} points — incredible performance!',
        'And it\'s over! {name} is your champion with {score} points!',
      ],
    },
    {
      trigger: 'podium_2nd',
      templates: [
        'In second place, {name} with {score} points!',
      ],
    },
    {
      trigger: 'podium_3rd',
      templates: [
        'Rounding out the podium, {name} in third!',
      ],
    },
  ],
};

const golfClassicPack: CommentaryPackDefinition = {
  id: 'golf_classic',
  name: 'Golf Classic',
  templates: [
    {
      trigger: 'round_start',
      templates: [
        'Good morning from the {competitionName}! {count} golfers teeing off today.',
        'Welcome to the clubhouse. {count} competitors on the course for the {competitionName}.',
        'It\'s a beautiful day for golf. Let\'s see who can shoot under par.',
      ],
    },
    {
      trigger: 'leader_announce',
      templates: [
        '{name} leads at {score}. A masterclass in consistency.',
        '{name} sits atop the leaderboard at {score}.',
        'At the top of the board, {name} with {score}.',
      ],
    },
    {
      trigger: 'midround',
      templates: [
        'Through the turn, {name} is making a move — now at {score}.',
        'The leaderboard is tightening. Just {gap} strokes separate the top {count}.',
        'Interesting developments on the back nine...',
      ],
    },
    {
      trigger: 'achievement',
      templates: [
        'An eagle for {name}! That\'s a remarkable {metricValue} {metricLabel} today!',
        '{name} with the eagle! Outstanding performance!',
      ],
    },
    {
      trigger: 'achievement_eagle',
      templates: [
        'An eagle for {name}! That\'s a remarkable {metricValue} {metricLabel} today!',
        '{name} with the eagle! Outstanding performance!',
      ],
    },
    {
      trigger: 'achievement_birdie',
      templates: [
        'A birdie for {name}! One under par today.',
        'Nice round from {name} — a birdie at {metricValue} {metricLabel}.',
      ],
    },
    {
      trigger: 'penalty',
      templates: [
        '{name} posts a bogey today. Only {metricValue} {metricLabel}.',
        'A tough day for {name} — bogey with {metricValue}.',
      ],
    },
    {
      trigger: 'penalty_bogey',
      templates: [
        '{name} posts a bogey today. Only {metricValue} {metricLabel}.',
        'A tough day for {name} — bogey with {metricValue}.',
      ],
    },
    {
      trigger: 'penalty_double_bogey',
      templates: [
        'A double bogey for {name}. Zero {metricLabel} today.',
        '{name} with the double bogey. That hurts.',
      ],
    },
    {
      trigger: 'streak',
      templates: [
        '{name} is on a birdie streak! {days} straight days under par!',
        'What consistency from {name} — {days} days running at or below par!',
      ],
    },
    {
      trigger: 'finish',
      templates: [
        'The final scores are in. {name} wins the {competitionName} at {score}!',
        '{name} captures the title at {score}! A well-deserved victory.',
        'And the champion of the {competitionName} is {name} at {score}. Remarkable golf.',
      ],
    },
    {
      trigger: 'podium_2nd',
      templates: [
        'Runner-up: {name} at {score}.',
      ],
    },
    {
      trigger: 'podium_3rd',
      templates: [
        'And in third, {name} at {score}.',
      ],
    },
  ],
};

const genericPack: CommentaryPackDefinition = {
  id: 'generic',
  name: 'Generic',
  templates: [
    {
      trigger: 'race_start',
      templates: [
        'Welcome to the {competitionName}! {count} competitors are ready to go!',
        'The {competitionName} is underway with {count} participants!',
      ],
    },
    {
      trigger: 'round_start',
      templates: [
        'Welcome to the {competitionName}! {count} competitors are ready to go!',
        'The {competitionName} is underway with {count} participants!',
      ],
    },
    {
      trigger: 'leader_announce',
      templates: [
        '{name} leads with {score}!',
        '{name} is in first place at {score}.',
      ],
    },
    {
      trigger: 'midrace',
      templates: [
        '{name} is closing in — just {gap} behind the leader!',
        'The top {count} are within {gap} of each other!',
      ],
    },
    {
      trigger: 'midround',
      templates: [
        '{name} is closing in — just {gap} behind the leader!',
        'The top {count} are within {gap} of each other!',
      ],
    },
    {
      trigger: 'achievement',
      templates: [
        'Great work by {name}!',
        '{name} hits a milestone!',
      ],
    },
    {
      trigger: 'penalty',
      templates: [
        'A setback for {name}.',
        '{name} loses ground.',
      ],
    },
    {
      trigger: 'streak',
      templates: [
        '{name} is on a {days}-day streak!',
        'Consistency pays off — {name} at {days} days running!',
      ],
    },
    {
      trigger: 'finish',
      templates: [
        '{name} wins the {competitionName} with {score}!',
        'Congratulations to {name} — champion of the {competitionName}!',
      ],
    },
    {
      trigger: 'podium_2nd',
      templates: [
        'In second place: {name} with {score}.',
      ],
    },
    {
      trigger: 'podium_3rd',
      templates: [
        'Third place: {name} with {score}.',
      ],
    },
  ],
};

// ── Horse Race Commentary Pack ────────────────────────────────────────────

const horseRaceClassicPack: CommentaryPackDefinition = {
  id: 'horse_race_classic',
  name: 'Horse Race Classic',
  templates: [
    {
      trigger: 'race_start',
      templates: [
        'And they\'re off! {count} horses burst from the gate for the {competitionName}!',
        'The gates are open! {count} thoroughbreds charging down the track!',
        'Welcome to the {competitionName}! {count} horses are racing for glory!',
      ],
    },
    {
      trigger: 'leader_announce',
      templates: [
        '{name} leads by a nose with {score} points!',
        '{name} is out front — {score} points and pulling away!',
        'Down the stretch, {name} holds the lead at {score} points!',
      ],
    },
    {
      trigger: 'midrace',
      templates: [
        'Around the far turn! {name} is closing — just {gap} points behind!',
        'What a race! The top {count} are neck and neck, separated by {gap} points!',
        '{runner} is making a move on {leader}!',
      ],
    },
    {
      trigger: 'achievement',
      templates: [
        '{name} surges ahead with a powerful gallop! A big closing!',
        '{name} breaks away from the pack with a massive deal!',
      ],
    },
    {
      trigger: 'penalty',
      templates: [
        '{name} stumbles! A deal fell through — that\'s -{points} points!',
        'Trouble on the track! {name} loses {points} points from a cancellation!',
      ],
    },
    {
      trigger: 'streak',
      templates: [
        '{name} is in full gallop! {days} consecutive months of closings!',
        'Unstoppable! {name} has been producing for {days} months straight!',
      ],
    },
    {
      trigger: 'finish',
      templates: [
        'Photo finish! {name} wins the {competitionName} with {score} points!',
        '{name} crosses the finish line first! Champion of the {competitionName}!',
        'And the winner is {name} with {score} points! What a race!',
      ],
    },
    {
      trigger: 'podium_2nd',
      templates: [
        'In the place position, {name} with {score} points!',
      ],
    },
    {
      trigger: 'podium_3rd',
      templates: [
        'Showing third, {name} with {score} points!',
      ],
    },
  ],
};

// ── Pack registry ─────────────────────────────────────────────────────────

const PACKS: Record<CommentaryPack, CommentaryPackDefinition> = {
  nascar_classic: nascarClassicPack,
  golf_classic: golfClassicPack,
  horse_race_classic: horseRaceClassicPack,
  generic: genericPack,
};

// ── Engine ─────────────────────────────────────────────────────────────────

export class CommentaryEngine {
  private pack: CommentaryPackDefinition;

  constructor(packId: CommentaryPack) {
    this.pack = PACKS[packId] ?? PACKS.generic;
  }

  /**
   * Generate a commentary line for a given trigger, filling in variable
   * placeholders from the provided `vars` map. Returns an empty string
   * if no templates match the trigger.
   */
  generate(trigger: string, vars: Record<string, string | number>): string {
    // Find templates matching this trigger
    const entry = this.pack.templates.find((t) => t.trigger === trigger);
    if (!entry || entry.templates.length === 0) return '';

    // Pick a random template
    const template = entry.templates[Math.floor(Math.random() * entry.templates.length)];

    // Replace {variable} placeholders
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (key in vars) return String(vars[key]);
      return match; // leave unreplaced if not provided
    });
  }

  /**
   * Return the current pack definition (useful for debugging / UI).
   */
  getPackInfo(): { id: string; name: string } {
    return { id: this.pack.id, name: this.pack.name };
  }

  /**
   * List all trigger types available in the current pack.
   */
  getAvailableTriggers(): string[] {
    return this.pack.templates.map((t) => t.trigger);
  }

  /**
   * Switch to a different commentary pack at runtime.
   */
  setPack(packId: CommentaryPack): void {
    this.pack = PACKS[packId] ?? PACKS.generic;
  }

  /**
   * Format a score for display based on the competition theme.
   * Golf: "+2", "-1", "E" (even par)
   * NASCAR / others: "1,500 pts"
   */
  static formatScore(score: number, theme: CompetitionTheme): string {
    if (theme === 'golf') {
      if (score === 0) return 'E';
      return score > 0 ? `+${score}` : String(score);
    }
    return `${score.toLocaleString()} pts`;
  }
}
