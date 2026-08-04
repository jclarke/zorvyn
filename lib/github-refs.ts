import type { LinkedPull } from './changes';
import type { GithubRepo } from './github';

export function linkedPullNumbersForRepo(
  repo: GithubRepo,
  pulls: LinkedPull[],
): number[] {
  const numbers = new Set<number>();
  for (const pull of pulls) {
    if (typeof pull.number !== 'number') continue;
    if (!pull.owner || !pull.repo) continue;
    if (pull.owner.toLowerCase() !== repo.owner.toLowerCase()) continue;
    if (pull.repo.replace(/\.git$/i, '').toLowerCase() !== repo.repo.toLowerCase()) {
      continue;
    }
    numbers.add(pull.number);
  }
  return Array.from(numbers);
}
