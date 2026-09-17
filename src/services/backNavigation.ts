export type BackHandler = () => boolean

const handlers: BackHandler[] = []

export function registerBackHandler(handler: BackHandler) {
  handlers.push(handler)
  return () => {
    const index = handlers.lastIndexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

export function handleBackNavigation() {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index]()) return true
  }
  return false
}
