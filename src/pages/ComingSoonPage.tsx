type Props = {
  title: string
  description: string
}

export default function ComingSoonPage({ title, description }: Props) {
  return (
    <main className="coming-soon-page">
      <section>
        <p className="eyebrow">Elements Baseball</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <span>Coming Soon</span>
      </section>
    </main>
  )
}
