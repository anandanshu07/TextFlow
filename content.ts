export {}

console.log("✅ Quick Type extension loaded")

const snippets: Record<string, string> = {
  "/email": "deevee47@gmail.com",
  "/phone": "+91-9876543210",
  "/name": "Divyansh Vishwakarma"
}

const createToast = (message: string) => {
     playNotificationSound()
  const wrapper = document.createElement("div")
  wrapper.style.position = "fixed"
  wrapper.style.top = "30px"
  wrapper.style.right = "30px"
  wrapper.style.zIndex = "9999"
  wrapper.style.pointerEvents = "none"

  const toast = document.createElement("div")
  toast.textContent = message

  Object.assign(toast.style, {
    position: "relative",
    padding: "16px 28px",
    fontSize: "20px",
    fontWeight: "400",
    fontFamily: "Segoe UI, sans-serif",
    color: "#fefefe",
    background: "rgba(15, 15, 15, 0.4)",
    borderRadius: "10px",
    borderTopRightRadius: "0px",
    backdropFilter: "blur(18px)",
    border: "1px solid rgba(255, 215, 0, 0.2)",
    boxShadow:
      "0 10px 30px rgba(255, 215, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1)",
    opacity: "1",
    transform: "translateY(0)",
    transition: "opacity 0.4s ease, transform 0.4s ease"
  })

  //Start Emoji
  const triangle = document.createElement("div")
  Object.assign(triangle.style, {
    position: "absolute",
    top: "-10px",
    right: "20px",
    width: "0",
    height: "0",
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderBottom: "10px solid rgba(255, 215, 0, 0.2)",
    filter: "blur(0.5px)"
  })

  toast.appendChild(triangle)
  wrapper.appendChild(toast)
  document.body.appendChild(wrapper)

  setTimeout(() => {
    toast.style.opacity = "0"
    toast.style.transform = "translateY(-10px)"
    setTimeout(() => wrapper.remove(), 400)
  }, 2200)
}

const playNotificationSound = () => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = "sine" // soft and clean
  oscillator.frequency.setValueAtTime(880, ctx.currentTime) // A5 note
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
      createToast(`✨ Quick Type inserted ${key}`)
    }
  }
})
