import { appendActivityEvent, ServerDataShape } from './store';

export function settleExpiredDuels(store: ServerDataShape): boolean {
  const nowMs = Date.now();
  let mutated = false;

  for (const duel of Object.values(store.duels)) {
    if (duel.status === 'active' && duel.ends_at && new Date(duel.ends_at).getTime() <= nowMs) {
      const cScore =
        duel.metric === 'verified_pages'
          ? duel.challenger.verifiedPages
          : duel.challenger.verifiedMinutes;
      const oScore = duel.opponent
        ? duel.metric === 'verified_pages'
          ? duel.opponent.verifiedPages
          : duel.opponent.verifiedMinutes
        : 0;

      let winnerId: string | null = null;
      if (cScore > oScore) {
        winnerId = duel.challenger.userId;
      } else if (oScore > cScore && duel.opponent) {
        winnerId = duel.opponent.userId;
      } else if (cScore > 0 && duel.opponent) {
        // Tie-breaker: higher average trust score
        winnerId =
          duel.challenger.avgTrustScore >= duel.opponent.avgTrustScore
            ? duel.challenger.userId
            : duel.opponent.userId;
      }

      duel.status = 'completed';
      duel.winner_user_id = winnerId;
      mutated = true;

      if (winnerId) {
        const winner =
          winnerId === duel.challenger.userId ? duel.challenger : duel.opponent!;
        const loser =
          winnerId === duel.challenger.userId ? duel.opponent : duel.challenger;
        appendActivityEvent(store, {
          actorUserId: winner.userId,
          actorUsername: winner.username,
          actorDisplayName: winner.displayName,
          type: 'duel_won',
          summary: `won 1v1 duel "${duel.title}"${loser ? ` vs @${loser.username}` : ''}`,
        });
      }
    }
  }

  return mutated;
}
