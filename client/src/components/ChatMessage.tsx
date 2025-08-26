import React from 'react'
import { FaTwitch, FaYoutube } from 'react-icons/fa'
import { SiTiktok } from 'react-icons/si'
import { useBadges } from '../contexts/BadgeContext'
import { getBadgeUrl, getBadgeInfo } from '../utils/badgeUtils'
import type { ChatMessage as ChatMessageType } from '../../../shared/types'

interface ChatMessageProps {
  message: ChatMessageType
  isPublicMode?: boolean
  isNew?: boolean
  isExpiring?: boolean
}

const platformColors = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  tiktok: 'bg-pink-600',
}

const platformIcons = {
  twitch: <FaTwitch className="h-3.5 w-3.5" aria-hidden="true" />,
  youtube: <FaYoutube className="h-3.5 w-3.5" aria-hidden="true" />,
  tiktok: <SiTiktok className="h-3.5 w-3.5" aria-hidden="true" />,
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isPublicMode = true,
  isNew = false,
  isExpiring = false,
}) => {
  const { username, message: text, badges, platform, color, ts, raw } = message
  const { getSubscriptionBadgeUrl, getCheerBadgeUrl } = useBadges()

  // Extract subscription months from Twitch raw data with multiple fallback methods
  const getSubscriptionMonths = (): number | null => {
    if (platform !== 'twitch') return null

    // Method 1: From our processed subscriptionMonths field
    if (raw?.subscriptionMonths) {
      return raw.subscriptionMonths
    }

    // Method 2: From TMI tags.badges.subscriber
    if (raw?.tags?.badges?.subscriber) {
      const months = parseInt(raw.tags.badges.subscriber, 10)
      if (!isNaN(months)) return months
    }

    // Method 3: From raw.badges.subscriber (if processed differently)
    if (raw?.badges?.subscriber) {
      const months = parseInt(raw.badges.subscriber, 10)
      if (!isNaN(months)) return months
    }

    return null
  }

  const subscriptionMonths = getSubscriptionMonths()

  return (
    <div
      className={`
    flex flex-wrap items-start gap-2 rounded-2xl
    transition-opacity duration-300 ease-out
    ${isNew ? 'animate-fade-in' : ''}
    ${isExpiring ? 'opacity-0' : 'opacity-100'}
  `}
    >
      {/* Timestamp */}
      {!isPublicMode && (
        <span className="text-sm leading-relaxed text-chat-muted">
          {new Date(ts).toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}

      {/* Platform indicator */}
      {!isPublicMode && (
        <span
          className={`
        inline-flex items-center justify-center rounded-full p-1 text-white
        ${platformColors[platform]}
      `}
          aria-label={platform}
          title={platform}
        >
          {platformIcons[platform]}
        </span>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex gap-1">
          {badges.map((badge, index) => {
            const badgeLower = badge.toLowerCase()
            const isTwitchSubscriber = platform === 'twitch' && badgeLower === 'subscriber'
            const isTwitchCheer =
              platform === 'twitch' && (badgeLower === 'bits' || badgeLower.startsWith('cheer'))

            // Handle subscription badges with months (special case)
            if (isTwitchSubscriber) {
              // Try to get subscription months, fallback to 1 month if none found
              const months = subscriptionMonths || 1
              const subscriptionBadgeUrl = getSubscriptionBadgeUrl(months)

              if (subscriptionBadgeUrl) {
                return (
                  <img
                    key={index}
                    src={subscriptionBadgeUrl}
                    alt={`Subscriber ${months} months`}
                    title={`Subscriber ${months} months`}
                    className="my-1 size-4 object-contain"
                  />
                )
              }
            }

            // Handle cheer/bits badges (special case - can be customized by streamers)
            if (isTwitchCheer) {
              // Extract bit amount from raw data or use default
              const bits = raw?.cheerAmount || 1
              const cheerBadgeUrl = getCheerBadgeUrl(bits)

              if (cheerBadgeUrl) {
                return (
                  <img
                    key={index}
                    src={cheerBadgeUrl}
                    alt={`Cheered ${bits} bits`}
                    title={`Cheered ${bits} bits`}
                    className="my-1 size-4 object-contain"
                  />
                )
              }
            }

            // Handle all other Twitch global badges dynamically
            // Exclude special cases: subscriber, bits/cheer badges
            if (platform === 'twitch' && !isTwitchSubscriber && !isTwitchCheer) {
              const badgeUrl = getBadgeUrl(badgeLower)
              const badgeInfo = getBadgeInfo(badgeLower)

              if (badgeUrl) {
                return (
                  <img
                    key={index}
                    src={badgeUrl}
                    alt={badgeInfo?.title || badge}
                    title={badgeInfo?.title || badge}
                    className="my-1 size-4 object-contain"
                  />
                )
              }
            }

            if (!isPublicMode) {
              return (
                <span
                  key={index}
                  className="rounded bg-gray-700 px-1.5 py-0.5 text-sm text-gray-300"
                >
                  {badge}
                </span>
              )
            }

            return null
          })}
        </div>
      )}

      {/* Username */}
      <span className="font-bold" style={{ color: color || undefined }}>
        {username}
      </span>

      {/* Message text */}
      <span>{text}</span>
    </div>
  )
}
