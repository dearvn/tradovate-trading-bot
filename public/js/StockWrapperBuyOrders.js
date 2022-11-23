/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperBuyOrders extends React.Component {
  render() {
    const {
      symbolInfo: {
        symbol,
        symbolInfo: {
          filterPrice: { }
        },
        buy: { openOrders }
      },
      sendWebSocket,
      isAuthenticated
    } = this.props;

    if (openOrders.length === 0) {
      return '';
    }

    const precision = tickSize && parseFloat(tickSize) === 1 ? 0 : tickSize.indexOf(1) - 1;

    const renderOpenOrders = openOrders.map((openOrder, index) => {
      return (
        <div
          key={'ticker-wrapper-buy-orders-' + index}
          className='ticker-info-sub-open-order-wrapper'>
          <div className='ticker-info-column ticker-info-column-title'>
            <div className='ticker-info-label d-flex flex-row'>
              <span>Open Order #{index + 1}</span>{' '}
              <SymbolCancelIcon
                symbol={symbol}
                order={openOrder}
                sendWebSocket={sendWebSocket}
                isAuthenticated={isAuthenticated}
              />
            </div>

            {openOrder.updatedAt && moment(openOrder.updatedAt).isValid() ? (
              <HightlightChange
                className='ticker-info-value'
                title={openOrder.updatedAt}>
                placed at {moment(openOrder.updatedAt).format('HH:mm:ss')}
              </HightlightChange>
            ) : (
              ''
            )}
          </div>
          <div className='ticker-info-column ticker-info-column-order'>
            <span className='ticker-info-label'>Status:</span>
            <HightlightChange className='ticker-info-value'>
              {openOrder.status}
            </HightlightChange>
          </div>
          <div className='ticker-info-column ticker-info-column-order'>
            <span className='ticker-info-label'>Type:</span>
            <HightlightChange className='ticker-info-value'>
              {openOrder.type}
            </HightlightChange>
          </div>
          <div className='ticker-info-column ticker-info-column-order'>
            <span className='ticker-info-label'>Qty:</span>
            <HightlightChange className='ticker-info-value'>
              {parseFloat(openOrder.origQty).toFixed(precision)}
            </HightlightChange>
          </div>
          {openOrder.price > 0 ? (
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Price:</span>
              <HightlightChange className='ticker-info-value'>
                {parseFloat(openOrder.price).toFixed(precision)}
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
          {openOrder.stopPrice > 0 ? (
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Stop Price:</span>
              <HightlightChange className='ticker-info-value'>
                {parseFloat(openOrder.stopPrice).toFixed(precision)}
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
          <div className='ticker-info-column ticker-info-column-price divider'></div>

          {openOrder.limitPrice ? (
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Current limit Price:</span>
              <HightlightChange className='ticker-info-value'>
                {parseFloat(openOrder.limitPrice).toFixed(precision)}
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
          {openOrder.differenceToCancel ? (
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Difference to cancel:</span>
              <HightlightChange className='ticker-info-value'>
                {openOrder.differenceToCancel.toFixed(2)}%
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
          {openOrder.currentPrice ? (
            <div className='ticker-info-column ticker-info-column-price'>
              <span className='ticker-info-label'>Current price:</span>
              <HightlightChange className='ticker-info-value'>
                {openOrder.currentPrice.toFixed(precision)}
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
          {openOrder.differenceToExecute ? (
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Difference to execute:</span>
              <HightlightChange className='ticker-info-value'>
                {openOrder.differenceToExecute.toFixed(2)}%
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
        </div>
      );
    });

    return (
      <div className='ticker-info-sub-wrapper'>
        <div className='ticker-info-column ticker-info-column-title border-bottom-0 mb-0 pb-0'>
          <div className='ticker-info-label'>Buy Open Orders</div>
        </div>
        {renderOpenOrders}
      </div>
    );
  }
}
