// components/StatefulButton.tsx
import { Check, Loader2 } from "lucide-react"
import React, { useState } from "react"

interface StatefulButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  className?: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => Promise<void> | void
}

export const StatefulButton: React.FC<StatefulButtonProps> = ({
  children,
  className = "",
  onClick,
  disabled,
  ...props
}) => {
  const [state, setState] = useState<"idle" | "loading" | "success">("idle")

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (state !== "idle" || disabled) return

    setState("loading")

    try {
      await onClick?.(event)
      setState("success")

      setTimeout(() => {
        setState("idle")
      }, 1000)
    } catch (error) {
      console.error("Button action failed:", error)
      setState("idle")
    }
  }

  const getButtonContent = () => {
    switch (state) {
      case "loading":
        return (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>{children}</span>
          </>
        )
      case "success":
        return (
          <>
            <Check size={16} />
            <span>Saved!</span>
          </>
        )
      default:
        return <span>{children}</span>
    }
  }

  const getButtonStyles = () => {
    const baseStyles =
      "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all duration-200 min-w-[120px] justify-center"

    switch (state) {
      case "loading":
        return `${baseStyles} bg-blue-400 text-white cursor-not-allowed`
      case "success":
        return `${baseStyles} bg-green-500 text-white`
      default:
        return `${baseStyles} bg-green-500 text-white hover:bg-green-600 active:scale-95`
    }
  }

  return (
    <button
      {...props}
      className={`${getButtonStyles()} ${className}`}
      onClick={handleClick}
      disabled={disabled || state !== "idle"}>
      {getButtonContent()}
    </button>
  )
}

// Demo component showing how to use it
export const StatefulButtonDemo: React.FC = () => {
  const handleSave = async () => {
    // Simulate API call
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 2000)
    })
  }

  return (
    <div className="flex h-40 w-full items-center justify-center">
      <StatefulButton onClick={handleSave}>Save Changes</StatefulButton>
    </div>
  )
}
