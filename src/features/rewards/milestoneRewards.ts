/**
 * Milestone reward / Prize Pack groundwork.
 *
 * IMPORTANT: This module is intentionally NOT connected to an interactive UI yet.
 * MILESTONE_REWARDS_ENABLED remains false until server-side eligibility, reward
 * selection and collection grants are approved and wired through a protected RPC.
 */

export const MILESTONE_REWARDS_ENABLED = false as const

export type MilestoneRewardClaimStatus =
  | 'reserved'
  | 'revealed'
  | 'granted'
  | 'cancelled'

export type MilestoneRewardIdentity = {
  seasonKey: string
  category: 'standard' | 'consistency' | 'ladder' | 'community'
  phase: string | null
  milestoneKey: string
}

export type MilestoneRewardDefinition = {
  description: string
  source: 'milestones1925'
  metadata?: Record<string, unknown>
}

export type MilestoneRewardClaim = MilestoneRewardIdentity & {
  id: string
  userId: string
  managerId: number
  status: MilestoneRewardClaimStatus
  idempotencyKey: string
  reward: MilestoneRewardDefinition
  createdAt: string
  revealedAt: string | null
  grantedAt: string | null
}

export type MilestoneRewardItem = {
  claimId: string
  revealOrder: number
  itemType: 'card'
  cardKey: string | null
  metadata: Record<string, unknown>
}

/**
 * Stable key intended to prevent duplicate claims for one manager/milestone.
 * It is mirrored by a UNIQUE constraint in the reward groundwork migration.
 */
export function milestoneRewardIdempotencyKey(
  managerId: number,
  identity: MilestoneRewardIdentity,
) {
  return [
    managerId,
    identity.seasonKey,
    identity.category,
    identity.phase ?? 'all',
    identity.milestoneKey,
  ].join(':')
}
