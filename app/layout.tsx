import { Inter } from 'next/font/google'
import Sidebar from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin:0, padding:0, fontFamily:'sans-serif', background:'#F3EFFE' }}>
        <div style={{ display:'flex', minHeight:'100vh' }}>
          <Sidebar />
          <main style={{ marginLeft:'230px', flex:1, minHeight:'100vh', background:'#F3EFFE' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}