import type { CardRecord } from '../types/card'
import CardTile from './CardTile'

type CardGridProps = {
  cards: CardRecord[]
}

function CardGrid({
  cards,
}: CardGridProps) {
  return (
    <section className="cards-grid">
      {cards.map((card) => (
        <CardTile
          key={card.card_key}
          card={card}
        />
      ))}
    </section>
  )
}

export default CardGrid
