import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where, type Firestore } from "firebase/firestore";
import { LogOut, Plus, Save, Trash2, User } from "lucide-react";
import React, { useEffect, useState } from "react";






import "./style.css";



import { StatefulButton } from "~components/StatefulButton";
import { useFirebase } from "~firebase/hook";





const IndexPopup = () => {
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [keyword, setKeyword] = useState("/")
  const [value, setValue] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [deletingItems, setDeletingItems] = useState(new Set())
  const [showLoginAnimation, setShowLoginAnimation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { user, isLoading, onLogin, onLogout, firestore } = useFirebase()

  // Load items from Firestore when user logs in
  useEffect(() => {
    if (user && firestore) {
      loadItems()
    }
  }, [user, firestore])

  // Show login animation when user logs in
  useEffect(() => {
    if (user && !isLoading) {
      setShowLoginAnimation(true)
      setTimeout(() => setShowLoginAnimation(false), 1000)
    }
  }, [user, isLoading])

  const loadItems = async () => {
    if (!user || !firestore) return

    setLoading(true)
    try {
      const itemsCollection = collection(
        firestore,
        `quickTypeItems/${user.uid}/items`
      )

      const q = query(
        itemsCollection,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
      const querySnapshot = await getDocs(q)

      const loadedItems = []
      querySnapshot.forEach((doc) => {
        loadedItems.push({
          id: doc.id,
          ...doc.data()
        })
      })

      setItems(loadedItems)

      // If no items exist, create default ones
      if (loadedItems.length === 0) {
        await createDefaultItems()
      }
    } catch (error) {
      console.error("Error loading items:", error)
      alert("Error loading your items. Please try again."+ error.message || "UNKNOWN")
    } finally {
      setLoading(false)
    }
  }

  const createDefaultItems = async () => {
    if (!user || !firestore) return

    const defaultItems = [
      { keyword: "/email", value: "john.doe@company.com" },
      { keyword: "/phone", value: "+1 (555) 123-4567" },
      { keyword: "/address", value: "123 Main St, City, State 12345" }
    ]

    try {
      const itemsCollection = collection(
        firestore,
        `quickTypeItems/${user.uid}/items`
      )
      const createdItems = []

      for (const item of defaultItems) {
        const docRef = await addDoc(itemsCollection, {
          ...item,
          userId: user.uid,
          createdAt: new Date(),
          updatedAt: new Date()
        })

        createdItems.push({
          id: docRef.id,
          ...item,
          userId: user.uid,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }

      setItems(createdItems)
    } catch (error) {
      console.error("Error creating default items:", error)
    }
  }

  const addNewItem = () => {
    const newItem = {
      id: null, // Will be set when saved to Firestore
      keyword: "/",
      value: "",
      userId: user.uid
    }
    setSelectedItem(newItem)
    setKeyword("/")
    setValue("")
    setIsEditing(true)
  }

  const handleKeywordChange = (e) => {
    const value = e.target.value
    if (value.startsWith("/")) {
      setKeyword(value)
    }
  }

  const selectItem = (item) => {
    setSelectedItem(item)
    setKeyword(item.keyword)
    setValue(item.value)
    setIsEditing(false)
  }

  const saveCurrentItem = async () => {
    if (!user || !firestore) return

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
      (item) => item.keyword === trimmedKeyword && item.id !== selectedItem?.id
    )
    if (existingKeywordItem) {
      alert(
        `Keyword "${trimmedKeyword}" already exists. Please use a different keyword.`
      )
      return
    }

    // Check for duplicate value (excluding current item)
    const existingValueItem = items.find(
      (item) => item.value === trimmedValue && item.id !== selectedItem?.id
    )
    if (existingValueItem) {
      alert(
        `This value is already mapped to keyword "${existingValueItem.keyword}". Each value must be unique.`
      )
      return
    }

    setSaving(true)
    try {
      const itemData = {
        keyword: trimmedKeyword,
        value: trimmedValue,
        userId: user.uid,
        updatedAt: new Date()
      }

      if (isEditing) {
        // Create new item
        const itemsCollection = collection(
          firestore,
          `quickTypeItems/${user.uid}/items`
        )
        const docRef = await addDoc(itemsCollection, {
          ...itemData,
          createdAt: new Date()
        })

        const newItem = {
          id: docRef.id,
          ...itemData,
          createdAt: new Date()
        }

        setItems((prevItems) => [newItem, ...prevItems])
        setSelectedItem(newItem)
      } else {
        // Update existing item
        const itemDoc = doc(firestore, "quickTypeItems", selectedItem.id)
        await updateDoc(itemDoc, itemData)

        const updatedItem = {
          ...selectedItem,
          ...itemData
        }

        setItems((prevItems) =>
          prevItems.map((item) =>
            item.id === selectedItem.id ? updatedItem : item
          )
        )
        setSelectedItem(updatedItem)
      }

      setIsEditing(false)
    } catch (error) {
      console.error("Error saving item:", error)
      alert("Error saving item. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async (itemToDelete) => {
    if (!user || !firestore) return

    // Add to deleting set for animation
    setDeletingItems((prev) => new Set(prev).add(itemToDelete.id))

    // Wait for animation
    setTimeout(async () => {
      try {
        // Delete from Firestore
        const itemDoc = doc(firestore, "quickTypeItems", itemToDelete.id)
        await deleteDoc(itemDoc)

        // Update local state
        setItems((prevItems) =>
          prevItems.filter((item) => item.id !== itemToDelete.id)
        )

        if (selectedItem && selectedItem.id === itemToDelete.id) {
          setSelectedItem(null)
          setKeyword("/")
          setValue("")
        }
      } catch (error) {
        console.error("Error deleting item:", error)
        alert("Error deleting item. Please try again.")
      } finally {
        // Remove from deleting set
        setDeletingItems((prev) => {
          const newSet = new Set(prev)
          newSet.delete(itemToDelete.id)
          return newSet
        })
      }
    }, 300)
  }

  if (!user) {
    return (
      <div className="flex h-[550px] w-[750px] bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 animate-fade-in">
            <div className="w-20 h-20 mx-auto bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-bounce-slow">
              <User size={32} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Welcome to Quick Type
              </h2>
              <p className="text-gray-600 mb-6">
                Sign in to manage your text shortcuts and boost productivity
              </p>
              <button
                onClick={onLogin}
                disabled={isLoading}
                className="group relative px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <span className="relative flex items-center gap-2">
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing in...
                    </>
                  ) : (
                    "Sign in with Google"
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex h-[550px] w-[750px] bg-gray-50 ${showLoginAnimation ? "animate-slide-in" : ""}`}>
      {/* User Header */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">
              {user.displayName}
            </p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200">
          <LogOut size={16} />
        </button>
      </div>

      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col mt-16">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Quick Items</h2>
            <button
              onClick={addNewItem}
              disabled={loading}
              className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 hover:scale-105 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus
                size={16}
                className="group-hover:rotate-90 transition-transform duration-200"
              />
              Add New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center">
              <div className="w-8 h-8 mx-auto border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-500">Loading your shortcuts...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Plus size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 mb-2">No items yet</p>
              <p className="text-sm text-gray-400">
                Click "Add New" to create your first shortcut
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={`
                    group p-3 rounded-xl cursor-pointer transition-all duration-300 border
                    ${
                      selectedItem && selectedItem.id === item.id
                        ? "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 shadow-sm"
                        : "bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200 hover:shadow-sm"
                    }
                    ${deletingItems.has(item.id) ? "animate-slide-out-left opacity-0 transform -translate-x-full" : "animate-slide-in-item"}
                  `}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => selectItem(item)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate mb-1">
                        {item.keyword || "Untitled"}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {item.value || "No value"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteItem(item)
                      }}
                      className="ml-3 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-110">
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
      <div className="flex-1 flex flex-col mt-16">
        {selectedItem ? (
          <div className="flex-1 flex flex-col animate-fade-in">
            <div className="p-6 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">
                  {isEditing ? "Create New Item" : "Edit Item"}
                </h1>
                {value && (
                  <StatefulButton
                    onClick={saveCurrentItem}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 hover:scale-105 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        
                        Save Changes
                      </>
                    )}
                  </StatefulButton>
                )}
              </div>
            </div>

            <div className="flex-1 p-6 bg-gray-50 overflow-y-auto">
              <div className="max-w-2xl space-y-6">
                <div
                  className="animate-slide-up"
                  style={{ animationDelay: "100ms" }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Trigger Keyword
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={keyword}
                      onChange={handleKeywordChange}
                      placeholder="/email"
                      disabled={saving}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-lg font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 pointer-events-none transition-opacity duration-200 focus-within:opacity-5"></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                    <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                    Type this keyword to trigger the shortcut
                  </p>
                </div>

                <div
                  className="animate-slide-up"
                  style={{ animationDelay: "200ms" }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Replacement Text
                  </label>
                  <div className="relative">
                    <textarea
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="Enter the text that will replace your keyword..."
                      rows={8}
                      disabled={saving}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 pointer-events-none transition-opacity duration-200 focus-within:opacity-5"></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                    This text will be inserted when you use the keyword
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center animate-fade-in">
              <div className="w-24 h-24 mx-auto bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-6 animate-pulse-slow">
                <Plus size={32} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Ready to create shortcuts?
              </h3>
              <p className="text-gray-500 max-w-sm">
                Select an item from the sidebar to edit, or create a new
                shortcut to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default IndexPopup