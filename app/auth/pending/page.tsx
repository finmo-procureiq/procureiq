export default function PendingPage() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif',textAlign:'center',padding:'20px'}}>
      <h1 style={{fontSize:'24px',fontWeight:'600',marginBottom:'12px'}}>Access Pending</h1>
      <p style={{color:'#666',maxWidth:'400px',lineHeight:'1.6'}}>
        Your Google account has been verified. Your administrator needs to assign you a role before you can access the system.
      </p>
      <p style={{color:'#999',fontSize:'14px',marginTop:'16px'}}>
        Contact your system administrator and share your email address.
      </p>
    </div>
  )
}