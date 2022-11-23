/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class AccountInfo extends React.Component {
  render() {
    const { info } = this.props;

    return (
      <div className='account-wrapper-assets'>
        <div className={`account-wrapper-body`}>
          <div className='account-asset-row'>
            <span className='account-asset-label'>
              <span>Name</span>
            </span>
            <span className='account-asset-value'>
              {info.name}
            </span>
          </div>

          <div className='account-asset-ticker d-flex justify-content-between align-items-center'>
            <span className='account-asset-label'>
              <span>Balance</span>
            </span>
            <span className='account-asset-value text-warning'>
              ${(parseFloat(info.balance)).toFixed(2)}
            </span>
          </div>
          <div className='account-asset-row'>
            <span className='account-asset-label'>
              <span>Status</span>
            </span>
            <span className={`account-asset-value ${info.active == true ? 'text-warning' : ''}`}>
              {info.active == true ? 'Active' : 'Deactive'}
            </span>
          </div>
        </div>
      </div>
    );
  }
}
