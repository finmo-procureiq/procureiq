export default function PurchaseOrdersPage() {
  return (
    <div style={{fontFamily:'sans-serif',padding:'32px',maxWidth:'1200px',margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
        <div>
          <h1 style={{fontSize:'24px',fontWeight:'600',marginBottom:'4px'}}>Purchase Orders</h1>
          <p style={{color:'#666',fontSize:'14px'}}>Create and track all purchase orders</p>
        </div>
        <button style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:'8px',padding:'10px 18px',fontSize:'14px',fontWeight:'500',cursor:'pointer'}}>
          + New PO
        </button>
      </div>

      <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
        {['All','Draft','Pending','Approved','Rejected'].map(f => (
          <button key={f} style={{padding:'6px 14px',borderRadius:'20px',border:'1px solid #e5e7eb',background:'#fff',fontSize:'13px',cursor:'pointer'}}>
            {f}
          </button>
        ))}
      </div>

      <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'12px',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
          <thead style={{background:'#f9fafb'}}>
            <tr>
              {['PO Number','Supplier','Category','Amount','Status','Priority','Submitted','Actions'].map(h => (
                <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:'12px',fontWeight:'600',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.4px',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} style={{padding:'48px',textAlign:'center',color:'#9ca3af'}}>
                No purchase orders yet. Click "+ New PO" to create your first one.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}