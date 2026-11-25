import { useState, useCallback } from 'react'
import { sendAIChat } from '../api/ai'

export function useChatbot(verticalSlug) {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState(null)

  const sendMessage = useCallback(
    async (userInput) => {
      if (!userInput.trim() || isLoading) return

      const userMessage = { role: 'user', content: userInput.trim() }
      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsLoading(true)
      setError(null)

      try {
        const response = await sendAIChat({
          message: userMessage.content,
          verticalSlug,
          history: messages.slice(-10),
        })
        const assistantMessage = {
          role: 'assistant',
          content: response || 'Sorry, I could not generate a response.',
        }
        setMessages([...updatedMessages, assistantMessage])
      } catch (err) {
        const status = err?.response?.status
        const errData = err?.response?.data
        if (status === 429) {
          const assistantMessage = {
            role: 'assistant',
            content: errData?.error ?? 'The AI service is temporarily busy. Please wait a moment and try again.',
          }
          setMessages([...updatedMessages, assistantMessage])
          return
        }
        setError('Something went wrong. Please try again.')
        console.error('[useChatbot]', err)
      } finally {
        setIsLoading(false)
      }
    },
    [messages, isLoading, verticalSlug]
  )

  const clearMessages = useCallback(() => setMessages([]), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return { messages, isLoading, isOpen, error, sendMessage, clearMessages, open, close, toggle }
}
