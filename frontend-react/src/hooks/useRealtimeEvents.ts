import { useEffect, useState } from "react"

export interface RealtimeEvent {
  event_type: string
  topic?: string
  partition?: number
  offset?: number
  received_at?: string
  message?: string
  data?: Record<string, any>
}

const WS_URL =
  import.meta.env.VITE_API_WS_URL ??
  "ws://127.0.0.1:8000/ws/events"


type Subscriber = (
  event: RealtimeEvent
) => void


let socket: WebSocket | null = null

let reconnectTimer: number | null = null

const subscribers = new Set<Subscriber>()


function connectWebSocket() {
  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return
  }

  console.log(
    "🔄 Connexion WebSocket..."
  )

  socket = new WebSocket(
    WS_URL
  )

  socket.onopen = () => {
    console.log(
      "✅ WebSocket connecté"
    )
  }

  socket.onmessage = (
    message
  ) => {

    try {

      const event =
        JSON.parse(
          message.data
        ) as RealtimeEvent

      console.log(
        "🔔 Événement temps réel reçu :",
        event
      )

      subscribers.forEach(
        (subscriber) => {
          subscriber(event)
        }
      )

    } catch (error) {

      console.error(
        "❌ Erreur parsing WebSocket :",
        error
      )

    }
  }

  socket.onerror = () => {

    console.warn(
      "⚠️ WebSocket indisponible."
    )

  }

  socket.onclose = () => {

    socket = null

    console.log(
      "⚪ WebSocket fermé."
    )

    if (
      reconnectTimer === null
    ) {

      reconnectTimer =
        window.setTimeout(
          () => {

            reconnectTimer = null

            connectWebSocket()

          },
          2000
        )
    }
  }
}


export function useRealtimeEvents() {

  const [event, setEvent] =
    useState<RealtimeEvent | null>(
      null
    )


  useEffect(() => {

    const subscriber:
      Subscriber =
      (newEvent) => {

        setEvent(
          newEvent
        )
      }


    subscribers.add(
      subscriber
    )

    connectWebSocket()


    return () => {

      subscribers.delete(
        subscriber
      )

    }

  }, [])


  return event
}