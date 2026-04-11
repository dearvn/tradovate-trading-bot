/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class AccountInfo extends React.Component {
  render() {
    const { info } = this.props;
    const isActive = info.active === true;

    return (
      <div className='account-wrapper-assets'>
        <div className='account-wrapper-body'>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Account
            </span>
            <span style={{
              display: 'inline-block',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '1px 7px',
              borderRadius: '20px',
              background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.15)',
              color: isActive ? 'var(--call-color)' : 'var(--text-muted)',
              border: isActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(100,116,139,0.2)'
            }}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div style={{ marginBottom: '6px' }}>
            <span className='account-asset-ticker' style={{ fontSize: '0.88rem', color: 'var(--text-white)' }}>
              {info.name}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Balance</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning-color)', letterSpacing: '0.01em' }}>
              ${parseFloat(info.balance).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  }
}
