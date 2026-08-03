import { useEffect, useRef, useState, type ReactNode } from 'react'
import './defense-stage.css'

type DefenseSlot = {
  id: string
  label: string
}

type DefenseStageProps<TSlot extends DefenseSlot> = {
  filled: number
  required: number
  slots: TSlot[]
  dhSlot?: TSlot
  renderSlot: (slot: TSlot) => ReactNode
}

const STAGE_WIDTH = 1269
const STAGE_HEIGHT = 1135

function DefenseStage<TSlot extends DefenseSlot>({
  filled: _filled,
  required: _required,
  slots,
  dhSlot,
  renderSlot,
}: DefenseStageProps<TSlot>) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateScale = () => {
      const { width, height } = viewport.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      setScale(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const visibleSlots = slots.filter(
    (slot) => slot.label.toUpperCase() !== 'P',
  )

  return (
    <section className="elements-defense">
      <div className="elements-defense__viewport" ref={viewportRef}>
        <div
          className="elements-defense__stage"
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <img
            className="elements-defense__template"
            src="/elements-defense-template.png"
            alt=""
            aria-hidden="true"
            draggable={false}
          />

          {visibleSlots.map((slot) => (
            <div
              className={`elements-defense__slot elements-defense__slot--${slot.label.toLowerCase()}`}
              key={slot.id}
            >
              {renderSlot(slot)}
            </div>
          ))}

          {dhSlot && (
            <div className="elements-defense__slot elements-defense__slot--dh">
              {renderSlot(dhSlot)}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default DefenseStage
