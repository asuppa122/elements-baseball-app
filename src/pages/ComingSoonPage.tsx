import { useNavigate } from 'react-router-dom'

type Props = {
  title: string
  description: string
}

export default function ComingSoonPage({ title, description }: Props) {
  const navigate = useNavigate()
  return (
    <main className="coming-soon-page">
      <button type="button" className="back-button" onClick={() => navigate('/')}>
        ← Home
      </button>
      <section>
        <p className="eyebrow">Elements Baseball</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <span>Coming Soon</span>
      </section>
    </main>
  )
}
