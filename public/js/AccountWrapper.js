/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class AccountWrapper extends React.Component {

  render() {
    const {
      accountInfo,
      sendWebSocket,
      isAuthenticated,
      openTrades
    } = this.props;

    const accountInfos = accountInfo.map((info, index) => {
      return (
        <AccountInfo
          key={`account-wrapper-` + index}
          info={info}
        ></AccountInfo>
      );
    });

    return (
      <div className='accordion-wrapper account-wrapper'>
        <Accordion>
          <Card bg='dark'>
            <Accordion.Toggle
              as={Card.Header}
              eventKey='0'
              className='px-2 py-1'>
              <button
                type='button'
                className='btn btn-sm btn-link btn-account-balance text-uppercase font-weight-bold text-left'>
                <span className='pr-2'>Account Balance</span>
              </button>
            </Accordion.Toggle>
            <Accordion.Collapse eventKey='0' className='show'>
              <Card.Body className='d-flex flex-column py-2 px-0'>
                <div className='account-balance-assets-wrapper px-2'>
                  {accountInfos}
                </div>

              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
      </div>
    );
  }
}
