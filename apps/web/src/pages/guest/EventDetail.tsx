import React from 'react'
import EventDetailPage from '../EventDetailPage'

export default function GuestEventDetail() {
  return (
    <EventDetailPage
      backPath="/guest/events"
      backAriaLabel="Back to events"
      outerClassName="px-4 py-8"
    />
  )
}
