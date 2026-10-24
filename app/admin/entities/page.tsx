'use client'
import { useState } from 'react'

// These are the actual companies from the database (companies table has RLS so we hardcode)
const COMPANIES = [
  { id: '33a0603c-5b4e-4418-9683-1a5d544560ea', name: 'Acme India Pvt Ltd', code: 'ACIN', currency: 'INR' },
  { id: 'f1d448b1-bc01-4f86-b3fc-6bc0b31c992e', name: 'Acme Singapore Pte Ltd', code: 'ACSG', currency: 'SGD' },
  { id: '485d369d-087f-4776-a70b-6d1203e29c2d', name: 'Acme UAE LLC', code: 'ACAE', currency: 'AED' },
  { id: '8d37db04-7eb7-4b76-afed-df2a50590d7f', name: 'Finmo Tech Pte Ltd', code: 'FTSG', currency: 'SGD' },
  { id: 'fcf15fb0-29e9-466d-aad2-5b0cf2089a0b', name: 'Finmo Tech India Pvt Ltd', code: 'FTIN', currency: 'INR' },
]

const colors = ['#9B72F5', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']

export default function EntitiesPage() {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Manage Entities</h1>
          <p style={{ color: '#666', fontSize: 14, margin: '4px 0 0' }}>{COMPANIES.length} entities configured</p>
        </div>
        <button onClick={() => setShowInfo(true)}
          style={{ background: '#9B72F5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          + Add Entity
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {COMPANIES.map((e, i) => (
          <div key={e.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: colors[i % colors.length] }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: colors[i % colors.length] + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: colors[i % colors.length] }}>
                {e.code.substring(0, 2)}
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a' }}>Active</span>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>{e.name}</h3>
            <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
              <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f3f4f6', color: '#374151', fontWeight: 600, fontFamily: 'monospace' }}>{e.code}</span>
              <span style={{ padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>{e.currency}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: '14px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
        <strong>Note:</strong> Each entity has its own suppliers, purchase orders, and approval matrix. To add a new entity, contact your system administrator to update the database.
      </div>

      {showInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '94vw', padding: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Adding a New Entity</h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 20px' }}>
              New entities need to be added directly in the database. Please contact your system administrator with the following details:
            </p>
            <ul style={{ fontSize: 14, color: '#374151', lineHeight: 2, margin: '0 0 20px', paddingLeft: 20 }}>
              <li>Entity / Company name</li>
              <li>Short code (3–6 letters, e.g. FINSG)</li>
              <li>Currency (INR, SGD, USD, AED…)</li>
            </ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInfo(false)}
                style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#9B72F5', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
