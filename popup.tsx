import {
  BarChart3,
  Clock,
  LogOut,
  Plus,
  Save,
  Trash2,
  TrendingUp,
  User,
  X
} from "lucide-react"
import React, { useEffect, useState } from "react"

import "./style.css"

import LightRays from "~components/LightRays/LightRays"
import { StatefulButton } from "~components/StatefulButton"

interface SnippetWithMetadata {
  keyword: string
  value: string
  usageCount: number
  lastUsed?: Date
  docId?: string
}

const IndexPopup = () => {
  const [items, setItems] = useState<SnippetWithMetadata[]>([])
  const [selectedItem, setSelectedItem] = useState<SnippetWithMetadata | null>(
    null
  )
  const [keyword, setKeyword] = useState("/")
  const [value, setValue] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [deletingItems, setDeletingItems] = useState(new Set())
  const [showLoginAnimation, setShowLoginAnimation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sortBy, setSortBy] = useState<"recent" | "usage" | "alphabetical">(
    "recent"
  )
  const [showStats, setShowStats] = useState(false)
  const [showRightPanel, setShowRightPanel] = useState(false)

  // Load items from background script when user logs in
  useEffect(() => {
    if (user) {
      loadItems()
    }
  }, [user])

  // Show login animation when user logs in
  useEffect(() => {
    if (user && !isLoading) {
      setShowLoginAnimation(true)
      setTimeout(() => setShowLoginAnimation(false), 1000)
    }
  }, [user, isLoading])

  // Get user state from background script
  useEffect(() => {
    const getUserState = async () => {
      try {
        // First test if background script is working
        const testResponse = await chrome.runtime.sendMessage({
          type: "TEST_BACKGROUND"
        })
        console.log("Background script test:", testResponse)

        const response = await chrome.runtime.sendMessage({ type: "GET_USER" })
        console.log("User state response:", response)
        setUser(response.user)
        setIsLoading(response.isLoading)

        if (response.user && response.snippetsWithMetadata) {
          setItems(response.snippetsWithMetadata)
        }
      } catch (error) {
        console.error("Error getting user state:", error)
      }
    }

    // Get initial user state only once
    getUserState()

    // Listen for user state changes from background script
    const handleUserStateChange = (message) => {
      if (message.type === "USER_STATE_CHANGED") {
        console.log("User state changed:", message)
        setUser(message.user)
        setIsLoading(message.isLoading)

        if (message.user && message.snippetsWithMetadata) {
          setItems(message.snippetsWithMetadata)
        } else if (!message.user) {
          setItems([])
        }
      } else if (message.type === "USAGE_UPDATED") {
        // Update usage count for specific item
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.keyword === message.keyword
              ? {
                  ...item,
                  usageCount: message.usageCount,
                  lastUsed: message.lastUsed
                }
              : item
          )
        )
      }
    }

    chrome.runtime.onMessage.addListener(handleUserStateChange)

    return () => {
      chrome.runtime.onMessage.removeListener(handleUserStateChange)
    }
  }, [])

  const loadItems = async () => {
    if (!user) return

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_SNIPPETS"
      })

      if (response.snippetsWithMetadata) {
        setItems(response.snippetsWithMetadata)
      }
    } catch (error) {
      console.error("Error loading items:", error)
      alert("Error loading your items. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Sort items based on selected criteria
  const getSortedItems = () => {
    const sortedItems = [...items]

    switch (sortBy) {
      case "usage":
        return sortedItems.sort((a, b) => b.usageCount - a.usageCount)
      case "alphabetical":
        return sortedItems.sort((a, b) => a.keyword.localeCompare(b.keyword))
      case "recent":
      default:
        return sortedItems.sort((a, b) => {
          if (!a.lastUsed && !b.lastUsed) return 0
          if (!a.lastUsed) return 1
          if (!b.lastUsed) return -1
          return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        })
    }
  }

  const formatLastUsed = (lastUsed?: Date) => {
    if (!lastUsed) return "Never used"

    const now = new Date()
    const diffMs = now.getTime() - new Date(lastUsed).getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return new Date(lastUsed).toLocaleDateString()
  }

  const getTotalUsage = () => {
    return items.reduce((sum, item) => sum + item.usageCount, 0)
  }

  const getMostUsedItem = () => {
    return items.reduce(
      (max, item) => (item.usageCount > max.usageCount ? item : max),
      {
        keyword: "",
        value: "",
        usageCount: 0,
        docId: undefined
      } as SnippetWithMetadata
    )
  }

  const closeRightPanel = () => {
    setShowRightPanel(false)
    setSelectedItem(null)
    setKeyword("/")
    setValue("")
    setIsEditing(false)
  }

  const addNewItem = () => {
    const newItem: SnippetWithMetadata = {
      keyword: "/",
      value: "",
      usageCount: 0,
      docId: undefined
    }
    setSelectedItem(newItem)
    setKeyword("/")
    setValue("")
    setIsEditing(true)
    setShowRightPanel(true)
  }

  const handleKeywordChange = (e) => {
    const value = e.target.value
    if (value.startsWith("/")) {
      setKeyword(value)
    }
  }

  const selectItem = (item: SnippetWithMetadata) => {
    setSelectedItem(item)
    setKeyword(item.keyword)
    setValue(item.value)
    setIsEditing(false)
    setShowRightPanel(true)
  }

  const saveCurrentItem = async () => {
    if (!user) return

    const trimmedKeyword = keyword.trim()
    const trimmedValue = value.trim()

    if (!trimmedKeyword || trimmedKeyword === "/") {
      alert('Please enter a keyword after the "/"')
      return
    }

    if (!trimmedValue) {
      alert("Please enter a value")
      return
    }

    // Check for duplicate keyword (excluding current item)
    const existingKeywordItem = items.find(
      (item) =>
        item.keyword === trimmedKeyword && item.docId !== selectedItem?.docId
    )
    if (existingKeywordItem) {
      alert(
        `Keyword "${trimmedKeyword}" already exists. Please use a different keyword.`
      )
      return
    }

    // Check for duplicate value (excluding current item)
    const existingValueItem = items.find(
      (item) =>
        item.value === trimmedValue && item.docId !== selectedItem?.docId
    )
    if (existingValueItem) {
      alert(
        `This value is already mapped to keyword "${existingValueItem.keyword}". Each value must be unique.`
      )
      return
    }

    setSaving(true)
    try {
      if (isEditing) {
        // Create new item - send to background script
        const response = await chrome.runtime.sendMessage({
          type: "SAVE_SNIPPET",
          keyword: trimmedKeyword,
          value: trimmedValue
        })

        if (response.success) {
          const newItem: SnippetWithMetadata = {
            keyword: trimmedKeyword,
            value: trimmedValue,
            usageCount: 0,
            docId: response.docId || `new-${Date.now()}`
          }

          setItems((prevItems) => [newItem, ...prevItems])
          setSelectedItem(newItem)
          setIsEditing(false)
        } else {
          alert(`Error saving item: ${response.error}`)
        }
      } else {
        // Update existing item - send to background script
        const response = await chrome.runtime.sendMessage({
          type: "UPDATE_SNIPPET",
          docId: selectedItem?.docId,
          keyword: trimmedKeyword,
          value: trimmedValue
        })

        if (response.success) {
          const updatedItem: SnippetWithMetadata = {
            ...selectedItem!,
            keyword: trimmedKeyword,
            value: trimmedValue
          }

          setItems((prevItems) =>
            prevItems.map((item) =>
              item.docId === selectedItem?.docId ? updatedItem : item
            )
          )
          setSelectedItem(updatedItem)
          setIsEditing(false)
        } else {
          alert(`Error updating item: ${response.error}`)
        }
      }
    } catch (error) {
      console.error("Error saving item:", error)
      alert("Error saving item. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async (itemToDelete: SnippetWithMetadata) => {
    if (!user) return

    // Add to deleting set for animation
    setDeletingItems((prev) => new Set(prev).add(itemToDelete.docId))

    // Wait for animation
    setTimeout(async () => {
      try {
        // Send delete request to background script
        const response = await chrome.runtime.sendMessage({
          type: "DELETE_SNIPPET",
          keyword: itemToDelete.keyword
        })

        if (response.success) {
          // Update local state
          setItems((prevItems) =>
            prevItems.filter((item) => item.docId !== itemToDelete.docId)
          )

          if (selectedItem && selectedItem.docId === itemToDelete.docId) {
            setSelectedItem(null)
            setKeyword("/")
            setValue("")
          }
        } else {
          alert(`Error deleting item: ${response.error}`)
        }
      } catch (error) {
        console.error("Error deleting item:", error)
        alert("Error deleting item. Please try again.")
      } finally {
        // Remove from deleting set
        setDeletingItems((prev) => {
          const newSet = new Set(prev)
          newSet.delete(itemToDelete.docId)
          return newSet
        })
      }
    }, 300)
  }

  const onLogin = async () => {
    setIsLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: "LOGIN" })
      if (response.success) {
        console.log("Login successful, refreshing user state...")
        // Immediately get updated user state
        const userResponse = await chrome.runtime.sendMessage({
          type: "GET_USER"
        })
        console.log("Updated user state:", userResponse)
        setUser(userResponse.user)
        setIsLoading(userResponse.isLoading)

        if (userResponse.user && userResponse.snippetsWithMetadata) {
          setItems(userResponse.snippetsWithMetadata)
        }
      } else {
        alert(`Login failed: ${response.error}`)
      }
    } catch (error) {
      console.error("Login error:", error)
      alert("Login failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const onLogout = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "LOGOUT" })
      if (response.success) {
        setUser(null)
        setItems([])
        setSelectedItem(null)
        setKeyword("/")
        setValue("")
      } else {
        alert(`Logout failed: ${response.error}`)
      }
    } catch (error) {
      console.error("Logout error:", error)
      alert("Logout failed. Please try again.")
    }
  }

  if (!user) {
    return (
      <div className="flex  h-[550px] w-[750px] bg-[#0a0a0f] relative  overflow-hidden">
        {/* Light Rays Effect */}
        <LightRays
          raysOrigin="top-center"
          raysColor="#b6b9be"
          raysSpeed={0.8}
          lightSpread={1.2}
          rayLength={2.5}
          pulsating={true}
          fadeDistance={1.5}
          saturation={0.8}
          followMouse={true}
          mouseInfluence={0.15}
          noiseAmount={0.1}
          distortion={0.05}
          className="absolute inset-0 h-full w-full"
        />

        {/* Main Content */}
        <div className="w-full h-full mx-auto flex items-center max-w-[540px] justify-center relative z-10">
          <div className="text-center space-y-8 animate-fade-in  mx-auto">
            {/* Icon with subtle glow */}
            <div className="w-16 h-16 mx-auto bg-gradient-to-r from-[#b6b9be] to-[#9ca3af] rounded-full flex items-center justify-center animate-pulse-slow shadow-lg shadow-[#b6b9be]/20">
              <User size={24} className="text-[#0a0a0f]" />
            </div>

            {/* Beautiful heading inspired by the image */}
            <div className="space-y-4">
              <h1 className="w-full text-4xl font-bold text-[#b6b9be] leading-tight font-figtree">
                Slash
                <br />
              </h1>
              <h1 className="w-full text-2xl font-light text-[#b6b9be] leading-tight font-figtree">
                Your shortcuts for everything you type.
                <br />
              </h1>
              <p className="text-[#b6b9be]/70 text-lg font-figtree">
                Turn your frequently typed phrases, emails, and links into
                simple slash (/) shortcuts. Save time and reduce errors with
                every keystroke.
              </p>
            </div>

            {/* Modern login button */}
            <button
              onClick={onLogin}
              disabled={isLoading}
              className="group relative px-10 py-4 bg-[#b6b9be] text-[#0a0a0f] font-medium rounded-2xl transition-all duration-500  hover:shadow-xl hover:shadow-[#b6b9be]/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden font-figtree text-lg">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300 rounded-2xl"></div>
              <span className="relative flex items-center justify-center gap-3">
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin"></div>
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </span>
            </button>

            {/* Subtle subtitle */}
            <p className="text-[#b6b9be]/50 text-sm font-figtree">
              Your shortcuts are 🔒 end-to-end encrypted. <br /> Yes! we cannot
              see any data.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex h-[550px] ${showRightPanel ? "w-[750px]" : "w-80"} bg-[#0a0a0f] relative overflow-hidden transition-all duration-300 ${showLoginAnimation ? "animate-slide-in" : ""}`}>
      {/* Light Rays Effect for logged in state */}
      <LightRays
        raysOrigin="top-left"
        raysColor="#b6b9be"
        raysSpeed={0.5}
        lightSpread={0.8}
        rayLength={1.8}
        pulsating={true}
        fadeDistance={2.0}
        saturation={0.4}
        followMouse={false}
        mouseInfluence={0.05}
        noiseAmount={0.08}
        distortion={0.03}
        className="absolute inset-0 h-full w-full opacity-30"
      />

      {/* User Header */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-[#0a0a0f]/90 backdrop-blur-sm border-b border-[#b6b9be]/10 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-[#b6b9be] to-[#9ca3af] rounded-full flex items-center justify-center shadow-lg shadow-[#b6b9be]/20">
            <User size={16} className="text-[#0a0a0f]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#b6b9be] font-figtree">
              {user.displayName}
            </p>
            <p className="text-xs text-[#b6b9be]/60 font-figtree">
              {user.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="p-2 text-[#b6b9be]/60 hover:text-[#b6b9be] hover:bg-[#b6b9be]/10 rounded-lg transition-all duration-200 backdrop-blur-sm">
            <BarChart3 size={16} />
          </button>
          <button
            onClick={onLogout}
            className="p-2 text-[#b6b9be]/60 hover:text-[#b6b9be] hover:bg-[#b6b9be]/10 rounded-lg transition-all duration-200 backdrop-blur-sm">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      {showStats && (
        <div className="absolute top-16 right-0 w-80 bg-[#0a0a0f]/95 backdrop-blur-md border-l border-[#b6b9be]/10 z-20 p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[#b6b9be] font-figtree flex items-center gap-2">
              <TrendingUp size={18} />
              Usage Statistics
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#b6b9be]/10 rounded-lg p-3 backdrop-blur-sm">
                <div className="text-2xl font-bold text-[#b6b9be] font-figtree">
                  {getTotalUsage()}
                </div>
                <div className="text-xs text-[#b6b9be]/60 font-figtree">
                  Total Uses
                </div>
              </div>

              <div className="bg-[#b6b9be]/10 rounded-lg p-3 backdrop-blur-sm">
                <div className="text-2xl font-bold text-[#b6b9be] font-figtree">
                  {items.length}
                </div>
                <div className="text-xs text-[#b6b9be]/60 font-figtree">
                  Total Shortcuts
                </div>
              </div>
            </div>

            {getMostUsedItem().usageCount > 0 && (
              <div className="bg-[#b6b9be]/5 rounded-lg p-3 backdrop-blur-sm border border-[#b6b9be]/10">
                <div className="text-sm font-medium text-[#b6b9be] font-figtree mb-1">
                  Most Used Shortcut
                </div>
                <div className="text-xs text-[#b6b9be]/80 font-mono">
                  {getMostUsedItem().keyword}
                </div>
                <div className="text-xs text-[#b6b9be]/60 font-figtree">
                  Used {getMostUsedItem().usageCount} times
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Left Sidebar */}
      <div className="w-80 bg-[#0a0a0f]/40 backdrop-blur-md border-r border-[#b6b9be]/10 flex flex-col mt-16 relative z-10">
        <div className="p-4 border-b border-[#b6b9be]/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#b6b9be] font-figtree">
              Quick Items
            </h2>
            <button
              onClick={addNewItem}
              disabled={loading}
              className="group flex items-center gap-2 px-4 py-2 bg-[#b6b9be] text-[#0a0a0f] rounded-xl hover:bg-[#9ca3af] transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-[#b6b9be]/20 disabled:opacity-50 disabled:cursor-not-allowed font-figtree font-medium">
              <Plus
                size={16}
                className="group-hover:rotate-90 transition-transform duration-200"
              />
              Add New
            </button>
          </div>

          {/* Sort Options */}
          <div className="flex gap-1 bg-[#b6b9be]/10 rounded-lg p-1 backdrop-blur-sm">
            {[
              { key: "recent", label: "Recent", icon: Clock },
              { key: "usage", label: "Usage", icon: TrendingUp },
              { key: "alphabetical", label: "A-Z", icon: null }
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSortBy(key as any)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-figtree transition-all duration-200 ${
                  sortBy === key
                    ? "bg-[#b6b9be] text-[#0a0a0f]"
                    : "text-[#b6b9be]/60 hover:text-[#b6b9be] hover:bg-[#b6b9be]/10"
                }`}>
                {Icon && <Icon size={12} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center">
              <div className="w-8 h-8 mx-auto border-2 border-[#b6b9be] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[#b6b9be]/70 font-figtree">
                Loading your shortcuts...
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center animate-fade-in">
              <div
                onClick={addNewItem}
                className="w-16 h-16 mx-auto bg-[#b6b9be]/10 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm cursor-pointer hover:bg-[#b6b9be]/20 transition-all duration-200">
                <Plus size={24} className="text-[#b6b9be]/60" />
              </div>
              <p className="text-[#b6b9be]/70 mb-2 font-figtree">
                No items yet
              </p>
              <p className="text-sm text-[#b6b9be]/50 font-figtree">
                Click "Add New" to create your first shortcut
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {getSortedItems().map((item, index) => (
                <div
                  key={item.docId}
                  className={`
                    group p-2 rounded-xl cursor-pointer transition-all duration-300 border backdrop-blur-sm
                    ${
                      selectedItem && selectedItem.docId === item.docId
                        ? "bg-[#b6b9be]/20 border-[#b6b9be]/30  shadow-[#b6b9be]/10"
                        : "bg-[#b6b9be]/5 border-[#b6b9be]/10 hover:bg-[#b6b9be]/10 hover:border-[#b6b9be]/20  hover:shadow-[#b6b9be]/5"
                    }
                    ${deletingItems.has(item.docId) ? "animate-slide-out-left opacity-0 transform -translate-x-full" : "animate-slide-in-item"}
                  `}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => selectItem(item)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 relative">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-[#b6b9be] truncate font-figtree">
                          {item.keyword || "Untitled"}
                        </div>
                        <div className="text-xs text-[#b6b9be]/40 font-figtree">
                          {formatLastUsed(item.lastUsed)}
                        </div>
                      </div>
                      <div className="relative">
                        <div className="text-sm text-[#b6b9be]/60 truncate font-figtree pr-16">
                          {item.value || "No value"}
                        </div>
                        {item.usageCount > 0 && (
                          <div className="absolute top-0 right-0 flex items-center gap-1 px-2 py-0.5 bg-[#b6b9be]/20 backdrop-blur-md rounded-full border border-[#b6b9be]/30">
                            <TrendingUp
                              size={10}
                              className="text-[#b6b9be]/60"
                            />
                            <span className="text-xs text-[#b6b9be]/60 font-figtree font-medium">
                              {item.usageCount}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteItem(item)
                      }}
                      className="ml-3 p-2 text-[#b6b9be]/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-110">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      {showRightPanel && (
        <div className="flex-1 w-full flex flex-col mt-16 relative z-10">
          {selectedItem ? (
            <div className="flex-1 flex flex-col animate-fade-in">
              <div className="p-6 border-b border-[#b6b9be]/10 bg-[#0a0a0f]/40 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-[#b6b9be] font-figtree">
                      {isEditing ? "Create New Item" : "Edit Item"}
                    </h1>
                    {!isEditing && selectedItem.usageCount > 0 && (
                      <div className="mt-2 flex items-center gap-4 text-sm text-[#b6b9be]/60 font-figtree">
                        <span className="flex items-center gap-1">
                          <TrendingUp size={14} />
                          Used {selectedItem.usageCount} times
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatLastUsed(selectedItem.lastUsed)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {value && (
                      <StatefulButton
                        onClick={saveCurrentItem}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-[#b6b9be] text-[#0a0a0f] font-medium rounded-xl hover:bg-[#9ca3af] transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-[#b6b9be]/20 disabled:opacity-50 disabled:cursor-not-allowed font-figtree">
                        {saving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin"></div>
                            Saving...
                          </>
                        ) : (
                          <>Save Changes</>
                        )}
                      </StatefulButton>
                    )}
                    <button
                      onClick={closeRightPanel}
                      className="p-2 text-[#b6b9be]/60 hover:text-[#b6b9be] hover:bg-[#b6b9be]/10 rounded-lg transition-all duration-200 backdrop-blur-sm">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-6 bg-[#0a0a0f]/20 backdrop-blur-sm overflow-y-auto">
                <div className="max-w-2xl space-y-6">
                  <div
                    className="animate-slide-up"
                    style={{ animationDelay: "100ms" }}>
                    <label className="block text-sm font-semibold text-[#b6b9be] mb-3 font-figtree">
                      Trigger Keyword
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={keyword}
                        onChange={handleKeywordChange}
                        placeholder="/email"
                        disabled={saving}
                        className="w-full px-4 py-3 bg-[#b6b9be]/10 backdrop-blur-sm border border-[#b6b9be]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#b6b9be]/50 focus:border-[#b6b9be]/40 transition-all duration-200 text-lg font-mono text-[#b6b9be] placeholder-[#b6b9be]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#b6b9be]/10 to-[#9ca3af]/10 opacity-0 pointer-events-none transition-opacity duration-200 focus-within:opacity-100"></div>
                    </div>
                    <p className="text-sm text-[#b6b9be]/60 mt-2 flex items-center gap-1 font-figtree">
                      <span className="w-1 h-1 bg-[#b6b9be] rounded-full"></span>
                      Type this keyword to trigger the shortcut
                    </p>
                  </div>

                  <div
                    className="animate-slide-up"
                    style={{ animationDelay: "200ms" }}>
                    <label className="block text-sm font-semibold text-[#b6b9be] mb-3 font-figtree">
                      Replacement Text
                    </label>
                    <div className="relative">
                      <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Enter the text that will replace your keyword..."
                        rows={8}
                        disabled={saving}
                        className="w-full px-4 py-3 bg-[#b6b9be]/10 backdrop-blur-sm border border-[#b6b9be]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#b6b9be]/50 focus:border-[#b6b9be]/40 transition-all duration-200 resize-none text-[#b6b9be] placeholder-[#b6b9be]/40 disabled:opacity-50 disabled:cursor-not-allowed font-figtree"
                      />
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#b6b9be]/10 to-[#9ca3af]/10 opacity-0 pointer-events-none transition-opacity duration-200 focus-within:opacity-100"></div>
                    </div>
                    <p className="text-sm text-[#b6b9be]/60 mt-2 flex items-center gap-1 font-figtree">
                      <span className="w-1 h-1 bg-green-400 rounded-full"></span>
                      This text will be inserted when you use the keyword
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#0a0a0f]/20 backdrop-blur-sm">
              <div className="text-center animate-fade-in">
                <div
                  onClick={addNewItem}
                  className="w-24 h-24 mx-auto bg-gradient-to-r from-[#b6b9be]/20 to-[#9ca3af]/20 rounded-full flex items-center justify-center mb-6 animate-pulse-slow backdrop-blur-sm shadow-lg  cursor-pointer hover:from-[#b6b9be]/30 hover:to-[#9ca3af]/30 transition-all duration-200">
                  <Plus size={32} className="text-[#b6b9be]/60" />
                </div>
                <h3 className="text-xl font-semibold text-[#b6b9be] mb-2 font-figtree">
                  Ready to create shortcuts?
                </h3>
                <p className="text-[#b6b9be]/60 max-w-sm font-figtree">
                  Select an item from the sidebar to edit, or create a new
                  shortcut to get started
                </p>
                {items.length > 0 && (
                  <div className="mt-6 p-4 bg-[#b6b9be]/5 rounded-lg backdrop-blur-sm border border-[#b6b9be]/10">
                    <p className="text-sm text-[#b6b9be]/70 font-figtree mb-2">
                      📊 Your Usage
                    </p>
                    <div className="flex justify-center gap-4 text-xs text-[#b6b9be]/60 font-figtree">
                      <span>{items.length} shortcuts</span>
                      <span>•</span>
                      <span>{getTotalUsage()} total uses</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default IndexPopup
