import type { ReactNode } from 'react'
import { Links, Outlet, Scripts, ScrollRestoration } from 'react-router'
import './tailwind.css'

export function Layout({ children }: LayoutProps) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>試験カウントダウン</title>
        <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

type LayoutProps = {
  children: ReactNode
}
