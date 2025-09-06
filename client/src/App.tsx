import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { MessageSquare, Settings, X } from 'lucide-react'
import { ChatMessage } from './components/ChatMessage'
import { FilterControls } from './components/FilterControls'
import { ConnectionStatus } from './components/ConnectionStatus'
import { YouTubeConnectionStatus } from './components/YouTubeConnectionStatus'
import { TwitchConnectionStatus } from './components/TwitchConnectionStatus'
import { useWebSocket } from './hooks/useWebSocket'
import { useChatMessages } from './hooks/useChatMessages'
import { useYouTubeControls } from './hooks/useYouTubeControls'
import { useTwitchControls } from './hooks/useTwitchControls'
import { BadgeProvider } from './contexts/BadgeContext'
import { EmoteProvider } from './contexts/EmoteContext'
import type { PlatformFilters, YouTubeStatus, TwitchStatus } from '../../shared/types'

const App: React.FC = () => {
  const [filters, setFilters] = useState<PlatformFilters>({
    twitch: true,
    youtube: true,
    tiktok: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeStatus | null>(null)
  const [twitchStatus, setTwitchStatus] = useState<TwitchStatus | null>(null)
  const [isPublicMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const modeParam = params.get('mode')
    const privateParam = params.get('private')
    const isPrivateParam =
      typeof privateParam === 'string' && ['1', 'true', 'yes'].includes(privateParam.toLowerCase())
    const path = window.location.pathname.replace(/\/+$/, '')
    const isPrivatePath = path === '/private'
    const isPublicMode = modeParam === 'public'
    return isPublicMode || !(isPrivateParam || isPrivatePath)
  })

  const { connectionStatus, isConnected, twitchBadges, lastWebSocketMessage } = useWebSocket()
  const { messages, clearMessages, expiringIds } = useChatMessages({ autoExpire: isPublicMode })
  const { startYouTube, isLoading: youtubeLoading } = useYouTubeControls()
  const { getTwitchStatus } = useTwitchControls()

  // Handle YouTube and Twitch status updates from WebSocket
  useEffect(() => {
    if (lastWebSocketMessage?.type === 'youtube-status' && lastWebSocketMessage.data) {
      const statusData = lastWebSocketMessage.data as YouTubeStatus
      setYoutubeStatus(statusData)
    }

    if (lastWebSocketMessage?.type === 'twitch-status' && lastWebSocketMessage.data) {
      const statusData = lastWebSocketMessage.data as TwitchStatus
      setTwitchStatus(statusData)
    }
  }, [lastWebSocketMessage])

  // Fetch initial Twitch status when connected
  useEffect(() => {
    if (isConnected && !twitchStatus) {
      getTwitchStatus()
        .then((status) => {
          if (status) {
            setTwitchStatus(status)
          }
        })
        .catch((error) => {
          console.error('Failed to fetch initial Twitch status:', error)
        })
    }
  }, [isConnected, twitchStatus, getTwitchStatus])

  // Filter messages based on filters and search query
  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      // Platform filter
      if (!filters[message.platform]) return false

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          message.username.toLowerCase().includes(query) ||
          message.message.toLowerCase().includes(query)
        )
      }

      return true
    })
  }, [messages, filters, searchQuery])

  const handleFilterChange = useCallback((platform: keyof PlatformFilters, enabled: boolean) => {
    setFilters((prev) => ({ ...prev, [platform]: enabled }))
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev)
  }, [])

  const handleYouTubeStart = useCallback(async () => {
    try {
      await startYouTube()
    } catch (error) {
      console.error('Failed to start YouTube:', error)
    }
  }, [startYouTube])

  // Set up body classes for styling
  useEffect(() => {
    document.body.className = isPublicMode ? 'public' : 'private'
    return () => {
      document.body.className = ''
    }
  }, [isPublicMode])

  return (
    <EmoteProvider>
      <BadgeProvider twitchBadges={twitchBadges}>
        <div
          className={`min-h-screen ${isPublicMode ? 'bg-transparent' : 'bg-black'} font-sans text-chat-text`}
        >
          {/* Header - hidden in public mode */}
          {!isPublicMode && (
            <header className="flex items-center justify-between border-b border-gray-800 p-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                <h1 className="text-lg font-semibold">Multichat</h1>
              </div>

              <div className="flex items-center gap-3">
                <ConnectionStatus status={connectionStatus} />
                <TwitchConnectionStatus status={twitchStatus?.status || null} />
                <YouTubeConnectionStatus
                  status={youtubeStatus}
                  onStart={handleYouTubeStart}
                  disabled={youtubeLoading}
                />
                <button
                  onClick={toggleSettings}
                  className="rounded-lg bg-gray-800 p-2 transition-colors hover:bg-gray-700"
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </header>
          )}

          {/* Settings Panel */}
          {showSettings && !isPublicMode && (
            <div className="border-b border-gray-800 bg-gray-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-chat-muted">Chat Settings</h2>
                <button
                  onClick={toggleSettings}
                  className="rounded p-1 hover:bg-gray-800"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Chat Filters */}
              <div className="mb-6">
                <FilterControls
                  filters={filters}
                  searchQuery={searchQuery}
                  onFilterChange={handleFilterChange}
                  onSearchChange={handleSearchChange}
                />
              </div>

              {/* Stats and Clear */}
              <div className="border-t border-gray-800 pt-3">
                <div className="flex items-center justify-between text-sm text-chat-muted">
                  <span>Total messages: {messages.length}</span>
                  <button
                    onClick={clearMessages}
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <main
            className={`flex-1 ${isPublicMode ? 'h-screen' : 'h-[calc(100vh-80px)]'} overflow-hidden`}
          >
            <div
              className="flex h-full flex-col justify-end space-y-2 overflow-y-auto p-3"
              style={{ scrollBehavior: 'smooth' }}
            >
              {!isPublicMode && filteredMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-chat-muted">
                  <div className="text-center">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>No messages yet...</p>
                    {!isConnected && <p className="mt-1 text-sm">Connecting to chat...</p>}
                    {youtubeStatus?.status === 'stopped' && (
                      <p className="mt-1 text-sm">
                        YouTube monitoring is stopped - click the YouTube icon to start
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                filteredMessages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isPublicMode={isPublicMode}
                    isNew={index === filteredMessages.length - 1}
                    isExpiring={expiringIds.has(message.id)}
                  />
                ))
              )}
            </div>
          </main>
        </div>
      </BadgeProvider>
    </EmoteProvider>
  )
}

export default App
