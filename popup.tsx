import { Plus, Save, Trash2 } from "lucide-react"
import React, { useEffect, useState } from "react"

import "./style.css"
import { StatefulButton } from "~components/StatefulButton"

const IndexPopup = () => {
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [keyword, setKeyword] = useState("/")
  const [value, setValue] = useState("")
  const [isEditing, setIsEditing] = useState(false)

  // Load items from storage on component mount
  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    try {
      // For demo purposes, we'll use localStorage since Chrome storage isn't available in this environment
      // In your actual Plasmo extension, replace this with chrome.storage.local
      const stored = localStorage.getItem("extension-items")
      if (stored) {
        const parsedItems = JSON.parse(stored)
        setItems(parsedItems)
      } else {
        // Set default example item
        const defaultItems = [
          { id: "1", keyword: "/email", value: "john.doe@company.com" },
          { id: "2", keyword: "/phone", value: "+1 (555) 123-4567" },
          {
            id: "3",
            keyword: "/address",
            value: "123 Main St, City, State 12345"
          }
        ]
        setItems(defaultItems)
        localStorage.setItem("extension-items", JSON.stringify(defaultItems))
      }
    } catch (error) {
      console.error("Error loading items:", error)
    }
  }

  const saveItems = async (updatedItems) => {
    try {
      // In your actual Plasmo extension, replace this with:
      // await chrome.storage.local.set({ 'extension-items': updatedItems });
      localStorage.setItem("extension-items", JSON.stringify(updatedItems))
      setItems(updatedItems)
    } catch (error) {
      console.error("Error saving items:", error)
    }
  }

  const addNewItem = () => {
    const newItem = {
      id: Date.now().toString(),
      keyword: "/",
      value: ""
    }
    setSelectedItem(newItem)
    setKeyword("/")
    setValue("")
    setIsEditing(true)
  }

  const handleKeywordChange = (e) => {
    const value = e.target.value
    // Ensure the keyword always starts with '/' and cannot be removed
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

    // Check for duplicate keyword
    const existingKeywordItem = items.find(
      (item) => item.keyword === trimmedKeyword && item.id !== selectedItem.id
    )
    if (existingKeywordItem) {
      alert(
        `Keyword "${trimmedKeyword}" already exists. Please use a different keyword.`
      )
      return
    }

    // Check for duplicate value
    const existingValueItem = items.find(
      (item) => item.value === trimmedValue && item.id !== selectedItem.id
    )
    if (existingValueItem) {
      alert(
        `This value is already mapped to keyword "${existingValueItem.keyword}". Each value must be unique.`
      )
      return
    }

    const updatedItem = {
      ...selectedItem,
      keyword: trimmedKeyword,
      value: trimmedValue
    }

    let updatedItems
    if (isEditing) {
      // Adding new item
      updatedItems = [...items, updatedItem]
    } else {
      // Updating existing item
      updatedItems = items.map((item) =>
        item.id === selectedItem.id ? updatedItem : item
      )
    }

    await saveItems(updatedItems)
    setSelectedItem(updatedItem)
    setIsEditing(false)
  }

  const deleteItem = async (itemToDelete) => {
    const updatedItems = items.filter((item) => item.id !== itemToDelete.id)
    await saveItems(updatedItems)

    if (selectedItem && selectedItem.id === itemToDelete.id) {
      setSelectedItem(null)
      setKeyword("/")
      setValue("")
    }
  }

  return (
    <div className="flex h-[500px] w-[700px] bg-gray-100">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Items</h2>
            <button
              onClick={addNewItem}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
              <Plus size={16} />
              Add New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">
              No items yet. Click "Add New" to create one.
            </div>
          ) : (
            <div className="p-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors border ${
                    selectedItem && selectedItem.id === item.id
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                  }`}
                  onClick={() => selectItem(item)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {item.keyword || "Untitled"}
                      </div>
                      <div className="text-sm text-gray-500 truncate mt-1">
                        {item.value || "No value"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteItem(item)
                      }}
                      className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col">
        {selectedItem ? (
          <>
            <div className="p-6 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-800">
                  {isEditing ? "New Item" : "Edit Item"}
                </h1>

                <StatefulButton onClick={saveCurrentItem}>
  Save
</StatefulButton>
              </div>
            </div>

            <div className="flex-1 p-6 bg-white">
              <div className="max-w-2xl">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Keyword
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={handleKeywordChange}
                    placeholder="/email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Enter a unique keyword that will trigger this item
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Value
                  </label>
                  <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g., john.doe@company.com"
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Enter a unique value that will be inserted when this keyword
                    is used
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <div className="text-gray-400 mb-4">
                <Plus size={48} className="mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                No item selected
              </h3>
              <p className="text-gray-500">
                Select an item from the sidebar or create a new one
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default IndexPopup
