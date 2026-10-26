// Achievements: 66 in total, some hidden. Feature-gated ones stay invisible until that feature ships.

export type Stats = Record<string, number>

export interface AchievementDef {
  id: string
  ru: string
  en: string
  desc: string
  xp: number
  hidden?: boolean
  feature?: string
  /** [current, target] for progress display. */
  progress: (s: Stats) => [number, number]
}

const v = (s: Stats, k: string) => s[k] ?? 0
const count = (key: string, target: number) => (s: Stats) => [Math.min(v(s, key), target), target] as [number, number]
const def = (
  id: string, ru: string, en: string, desc: string, key: string, target: number,
  extra: Partial<Pick<AchievementDef, 'hidden' | 'feature' | 'xp'>> = {},
): AchievementDef => ({ id, ru, en, desc, xp: extra.xp ?? (target >= 100 ? 100 : 50), progress: count(key, target), ...extra })

export const ACHIEVEMENTS: AchievementDef[] = [
  def('first-step', 'Пе́рвый шаг', 'First step', 'Answer your first item correctly.', 'correct', 1, { xp: 20 }),
  def('correct-100', 'Со́тня', 'A hundred', '100 correct answers.', 'correct', 100),
  def('correct-1000', 'Ты́сяча', 'A thousand', '1,000 correct answers.', 'correct', 1000),
  def('correct-5000', 'Пять ты́сяч', 'Five thousand', '5,000 correct answers.', 'correct', 5000, { xp: 250 }),
  def('correct-20000', 'Неутоми́мый', 'Tireless', '20,000 correct answers.', 'correct', 20000, { xp: 500 }),
  def('combo-10', 'Разго́н', 'Picking up speed', '10 correct in a row.', 'bestCombo', 10, { xp: 30 }),
  def('combo-25', 'Без про́маха', 'Never missing', '25 correct in a row.', 'bestCombo', 25),
  def('combo-50', 'Сна́йпер', 'Sharpshooter', '50 correct in a row.', 'bestCombo', 50),
  def('combo-100', 'Неудержи́мый', 'Unstoppable', '100 correct in a row.', 'bestCombo', 100, { hidden: true, xp: 250 }),
  def('session-1', 'Нача́ло поло́жено', 'Off we go', 'Finish your first session.', 'sessions', 1, { xp: 20 }),
  def('sessions-10', 'Привы́чка', 'A habit', 'Finish 10 sessions.', 'sessions', 10),
  def('sessions-100', 'Ветера́н', 'Veteran', 'Finish 100 sessions.', 'sessions', 100, { xp: 250 }),
  def('perfect-1', 'Без еди́ной оши́бки', 'Flawless', 'Finish a session of 8+ items without a mistake.', 'perfectSessions', 1),
  def('perfect-10', 'Перфекциони́ст', 'Perfectionist', 'Finish 10 flawless sessions.', 'perfectSessions', 10, { xp: 150 }),
  def('streak-3', 'Три дня подря́д', 'Three in a row', 'A 3-day streak.', 'longestStreak', 3, { xp: 30 }),
  def('streak-7', 'Неде́ля', 'One week', 'A 7-day streak.', 'longestStreak', 7),
  def('streak-30', 'Ме́сяц', 'One month', 'A 30-day streak.', 'longestStreak', 30, { xp: 200 }),
  def('streak-100', 'Сто дней', 'A hundred days', 'A 100-day streak.', 'longestStreak', 100, { xp: 500 }),
  def('streak-365', 'Год', 'A whole year', 'A 365-day streak.', 'longestStreak', 365, { xp: 1000 }),
  def('freeze-used', 'Морозоусто́йчивый', 'Frost-proof', 'A streak freeze saved your streak.', 'freezesUsed', 1, { hidden: true }),
  def('rank-student', 'Студе́нт', 'Student', 'Reach the rank of Студе́нт (level 5).', 'level', 5),
  def('rank-sobesednik', 'Собесе́дник', 'Conversationalist', 'Reach the rank of Собесе́дник (level 10).', 'level', 10, { xp: 150 }),
  def('rank-znatok', 'Знато́к', 'Connoisseur', 'Reach the rank of Знато́к (level 18).', 'level', 18, { xp: 250 }),
  def('rank-pisatel', 'Писа́тель', 'Writer', 'Reach the rank of Писа́тель (level 28).', 'level', 28, { xp: 400 }),
  def('rank-klassik', 'Кла́ссик', 'Classic', 'Reach the rank of Кла́ссик (level 40).', 'level', 40, { xp: 1000 }),
  def('xp-10000', 'Де́сять ты́сяч очко́в', 'Ten thousand points', 'Earn 10,000 XP.', 'xp', 10000, { xp: 150 }),
  def('golden-1', 'Золота́я ры́бка', 'Goldfish', 'Answer a golden question.', 'golden', 1, { xp: 30 }),
  def('golden-25', 'Золотоиска́тель', 'Gold digger', 'Answer 25 golden questions.', 'golden', 25),
  def('golden-x5', 'Ца́рская награ́да', "A tsar's reward", 'Answer a golden question during a ×5 combo.', 'goldenAtX5', 1, { hidden: true, xp: 150 }),
  def('chest-10', 'Кладоиска́тель', 'Treasure hunter', 'Open 10 chests.', 'chests', 10),
  def('chest-epic', 'Эпи́ческая нахо́дка', 'Epic find', 'Open an epic chest.', 'chest_epic', 1),
  def('chest-legendary', 'Легенда́рный клад', 'Legendary hoard', 'Open a legendary chest.', 'chest_legendary', 1, { hidden: true, xp: 150 }),
  def('skins-3', 'Франт', 'Dandy', 'Own 3 themes.', 'skins', 3),
  def('happy-hour', 'Счастли́вый час', 'Happy hour', 'Finish a session during a Счастли́вый час.', 'happyHourSessions', 1),
  def('night-owl', 'Сова́', 'Night owl', 'Finish a session between 23:00 and 04:00.', 'nightSessions', 1, { hidden: true }),
  def('early-bird', 'Жа́воронок', 'Early bird', 'Finish a session between 05:00 and 07:00.', 'earlySessions', 1, { hidden: true }),
  def('weekend', 'Без выходны́х', 'No days off', 'Practise on both days of a weekend.', 'weekendWarrior', 1),
  def('perfect-gen-pl', 'Роди́тельный мно́жественный', 'Genitive plural, flawless', 'A perfect round of 5+ genitive plurals in one session.', 'perfect_pl_gen', 1, { hidden: true, xp: 100 }),
  def('perfect-ins', 'Твори́тельный без оши́бок', 'Instrumental, flawless', 'A perfect round of 5+ instrumentals in one session.', 'perfect_ins', 1),
  def('perfect-prep', 'Предло́жный без оши́бок', 'Prepositional, flawless', 'A perfect round of 5+ prepositionals in one session.', 'perfect_prep', 1),
  def('perfect-dat', 'Да́тельный без оши́бок', 'Dative, flawless', 'A perfect round of 5+ datives in one session.', 'perfect_dat', 1),
  {
    id: 'all-cases', ru: 'Все шесть падеже́й', en: 'All six cases', desc: '50 correct answers in each of the six cases.', xp: 200,
    progress: (s) => {
      const c = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'].map((k) => Math.min(v(s, `case_${k}`), 50))
      return [c.reduce((a, b) => a + b, 0), 300]
    },
  },
  def('stress-100', 'Ударе́ние', 'Stress spotter', 'Place the stress correctly 100 times.', 'stressCorrect', 100),
  def('stress-500', 'Ма́стер ударе́ний', 'Stress master', 'Place the stress correctly 500 times.', 'stressCorrect', 500, { xp: 200 }),
  def('typo-forgiven', 'Опеча́тка', 'Butterfingers', 'Have a typo in a stem forgiven.', 'typos', 1, { hidden: true, xp: 10 }),
  def('yo-50', 'Ёжик', 'Hedgehog', 'Write ё correctly 50 times.', 'yo', 50, { hidden: true }),
  def('comeback', 'Второ́е дыха́ние', 'Second wind', 'Get 5 right in a row straight after 3 mistakes.', 'comebacks', 1, { hidden: true }),
  def('speed', 'Мо́лния', 'Lightning', '20 correct answers in under 3 seconds each.', 'fastCorrect', 20),
  def('typed-500', 'Писа́ка', 'Scribbler', 'Type 500 correct answers.', 'typedCorrect', 500, { xp: 150 }),
  def('minutes-600', 'Де́сять часо́в', 'Ten hours', 'Practise for 10 hours in total.', 'minutes', 600, { xp: 250 }),
  def('exported', 'Бережёного бог бережёт', 'Better safe than sorry', 'Export a backup of your progress.', 'exported', 1, { hidden: true, xp: 20 }),
  def('words-100', 'Пе́рвая со́тня слов', 'First hundred words', 'Know 100 words in your deck.', 'knownWords', 100, { feature: 'vocab' }),
  def('words-1000', 'Ты́сяча слов', 'A thousand words', 'Know 1,000 words.', 'knownWords', 1000, { feature: 'vocab', xp: 300 }),
  def('words-5000', 'Пять ты́сяч слов', 'Five thousand words', 'Know 5,000 words.', 'knownWords', 5000, { feature: 'vocab', xp: 1000 }),
  def('reviews-1000', 'Повторе́ние — мать уче́ния', 'Repetition is the mother of learning', 'Do 1,000 reviews.', 'reviews', 1000, { feature: 'vocab', xp: 200 }),
  def('story-1', 'Чита́тель', 'Reader', 'Read your first story.', 'stories', 1, { feature: 'reader' }),
  def('stories-10', 'Кни́жный червь', 'Bookworm', 'Read 10 stories.', 'stories', 10, { feature: 'reader', xp: 150 }),
  def('stories-40', 'Библиофи́л', 'Bibliophile', 'Read 40 stories.', 'stories', 40, { feature: 'reader', xp: 400 }),
  def('dictation-10', 'Чу́ткое у́хо', 'Keen ear', '10 perfect dictations.', 'dictationPerfect', 10, { feature: 'listening' }),
  def('unit-1', 'Пе́рвый уро́к', 'First lesson', 'Complete a course unit.', 'units', 1, { feature: 'course' }),
  def('a2-done', 'Ба́зовый у́ровень', 'A2 complete', 'Complete every A2 unit.', 'unitsA2', 20, { feature: 'course', xp: 500 }),
  def('trainer-1', 'Тренажёр', 'Warm-up', 'Finish a trainer session.', 'trainerSessions', 1, { feature: 'trainers' }),
  def('trainer-50', 'Трудя́га', 'Hard worker', 'Finish 50 trainer sessions.', 'trainerSessions', 50, { feature: 'trainers', xp: 300 }),
  def('trainers-all', 'Многобо́рец', 'All-rounder', 'Try all five trainers.', 'trainersTried', 5, { feature: 'trainers', xp: 150 }),
  def('boss-1', 'Пе́рвая побе́да', 'First victory', 'Defeat a unit boss.', 'bosses', 1, { feature: 'bosses' }),
  def('boss-10', 'Богаты́рь', 'Hero', 'Defeat 10 bosses.', 'bosses', 10, { feature: 'bosses', xp: 200 }),
  def('crossword-1', 'Кроссворди́ст', 'Crossworder', 'Solve a declension crossword.', 'crosswords', 1, { feature: 'crossword' }),
  def('crossword-10', 'Разга́дчик', 'Puzzle solver', 'Solve 10 crosswords.', 'crosswords', 10, { feature: 'crossword', xp: 150 }),
  def('arcade-500', 'Ме́ткость', 'Sharpshooter', 'Score 500 in the case arcade.', 'arcadeBest', 500, { feature: 'arcade', xp: 100 }),
  def('arcade-2000', 'Чемпио́н', 'Champion', 'Score 2,000 in the case arcade.', 'arcadeBest', 2000, { feature: 'arcade', xp: 300 }),
  def('speed-25', 'Скорогово́рка', 'Tongue twister', 'Match 25 pairs in one speed round.', 'speedBest', 25, { feature: 'speed', xp: 100 }),
  def('adventure-1', 'Сы́щик', 'Sleuth', 'Finish the first chapter of «Де́ло».', 'adventureChapters', 1, { feature: 'adventure' }),
  def('adventure-5', 'Де́ло закры́то', 'Case closed', 'Finish all five chapters of «Де́ло».', 'adventureChapters', 5, { feature: 'adventure', xp: 300 }),
  def('set-complete', 'Коллекционе́р', 'Collector', 'Complete a card set.', 'cardSets', 1, { feature: 'cards', xp: 200 }),
  def('cards-all', 'Храни́тель', 'Keeper', 'Collect all 32 cards.', 'cardsOwned', 32, { feature: 'cards', xp: 500, hidden: true }),
  def('town-25', 'Градострои́тель', 'Town planner', 'Reach 25 building levels in your town.', 'townLevels', 25, { feature: 'town', xp: 300 }),
]

export const isUnlocked = (a: AchievementDef, s: Stats) => {
  const [cur, target] = a.progress(s)
  return cur >= target
}

export function visibleAchievements(features: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !a.feature || features.has(a.feature))
}

/** Achievements whose condition holds now but that aren't recorded as unlocked yet. */
export function newlyUnlocked(s: Stats, unlocked: Set<string>, features: Set<string>): AchievementDef[] {
  return visibleAchievements(features).filter((a) => !unlocked.has(a.id) && isUnlocked(a, s))
}
