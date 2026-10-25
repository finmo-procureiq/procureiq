import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata = {
  title: 'ProcureIQ Enterprise',
  description: 'Purchase order and approval management',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div style={{ display:'flex', minHeight:'100vh' }}>
          <Sidebar />
          <main className="main-content" style={{ marginLeft:'230px', flex:1, minHeight:'100vh', background:'#F3EFFE' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}