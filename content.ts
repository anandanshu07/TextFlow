export {}

console.log("✅ Quick Type extension loaded")

const snippets: Record<string, string> = {
  "/email": "deevee47@gmail.com",
  "/phone": "+91-9876543210",
  "/name": "Divyansh Vishwakarma"
}

const createToast = (message: string) => {
  playNotificationSound()

  // --- Main container for positioning ---
  const wrapper = document.createElement("div")
  Object.assign(wrapper.style, {
    position: "fixed",
    top: "30px",
    right: "30px",
    zIndex: "9999",
    pointerEvents: "none"
  })

  // --- Toast element ---
  const toast = document.createElement("div")

  // --- Professional SVG Icon ---
  const iconSVG = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#34d399"/>
    </svg>
  `
  // --- Text message element ---
  const text = document.createElement("span")
  text.textContent = message

  // --- Dynamic Accent/Timer Bar ---
  const accentBar = document.createElement("div")

  // Using innerHTML to add the SVG icon and text
  toast.innerHTML = iconSVG
  toast.appendChild(text)
  toast.appendChild(accentBar)

  const toastDuration = 2200 // in ms

  // --- Style the Toast for a creative & professional look ---
  Object.assign(toast.style, {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 20px",
    backgroundColor: "#fff",
    fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif`,
    fontSize: "17px",
    fontWeight: "500",
    color: "#2d3748",
    borderRadius: "10px",
    borderTopRightRadius:"0px",
    boxShadow: "0 7px 25px rgba(0, 0, 0, 0.08)",
    border: "1px solid #f0f0f0",
    overflow: "hidden", // Important for the accent bar's rounded corners
    opacity: "0", // Start hidden for entry animation
    transform: "translateX(20px)", // Start off-screen for entry animation
    transition: "opacity 0.4s ease, transform 0.4s ease"
  })

  // --- Style the Accent Bar ---
  Object.assign(accentBar.style, {
    position: "absolute",
    bottom: "0",
    left: "0",
    height: "4px",
    width: "100%",
    backgroundColor: "#34d399",
    background: "linear-gradient(90deg, #34d399, #22c55e)", // A professional gradient
    transition: `width ${toastDuration}ms linear`
  })

  wrapper.appendChild(toast)
  document.body.appendChild(wrapper)

  // --- Animate the toast in and start the timer ---
  setTimeout(() => {
    toast.style.opacity = "1"
    toast.style.transform = "translateX(0)"
    accentBar.style.width = "0%" // Start the timer bar animation
  }, 10) // Small delay to ensure transition is applied

  // --- Remove the toast after its duration ---
  setTimeout(() => {
    toast.style.opacity = "0"
    toast.style.transform = "translateX(20px)"
    setTimeout(() => wrapper.remove(), 400) // Wait for exit animation to finish
  }, toastDuration)
}

const playNotificationSound = () => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(880, ctx.currentTime)
  gain.gain.setValueAtTime(0.001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.5)
}

// Snippet Detection
document.addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | null

  if (!target || !("value" in target)) return

  for (const key in snippets) {
    if (target.value.includes(key)) {
      target.value = target.value.replace(key, snippets[key])
      createToast(`Quick Type inserted ${key}`) // Cleaner message
    }
  }
})
