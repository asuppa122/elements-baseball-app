import type { ReactNode } from 'react'
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

function DefenseStage<TSlot extends DefenseSlot>({
  filled,
  required,
  slots,
  dhSlot,
  renderSlot,
}: DefenseStageProps<TSlot>) {
  return (
    <section className="elements-defense">
      <div className="elements-defense__heading">
        <h2>Defense</h2>
        <span>
          {filled}/{required}
        </span>
      </div>

      <div className="elements-defense__viewport">
        <div className="elements-defense__stage">
          <img
            className="elements-defense__field"
            src="/elements-squad-field.svg"
            alt=""
            aria-hidden="true"
          />

          {slots.map((slot) => (
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
