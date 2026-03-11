import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bug Bounty Platform',
  description: 'Plataforma de gerenciamento de bug bounty com IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
