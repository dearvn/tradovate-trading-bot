/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperSellOrders extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      collapsed: true
    };

    this.toggleCollapse = this.toggleCollapse.bind(this);
  }

  toggleCollapse() {
    this.setState({
      collapsed: !this.state.collapsed
    });
  }

  render() {
    const { symbolInfo, sendWebSocket, isAuthenticated } = this.props;

    const {
      symbolInfo: {
        symbol,
        filterPrice: { }
      },
      symbolConfiguration,
      quoteAssetBalance: { asset: quoteAsset },
      sell
    } = symbolInfo;

    if (sell.openOrders.length === 0) {
      return '';
    }

    const { collapsed } = this.state;

    const precision = tickSize && parseFloat(tickSize) === 1 ? 0 : tickSize.indexOf(1) - 1;

    const {
      sell: { currentGridTradeIndex, gridTrade }
    } = symbolConfiguration;

    const sellGridRows = gridTrade.map((grid, i) => {
      return (
        <React.Fragment key={'ticker-wrapper-sell-grid-row-' + symbol + '-' + i}>
          <div className='ticker-info-column-grid'>
            <div className='ticker-info-column ticker-info-column-price'>
              <span className='ticker-info-label'>Logic Trade #{i + 1}</span>

              <div className='ticker-info-value'>
                <OverlayTrigger
                  trigger='click'
                  key={'sell-signal-' + symbol + '-' + i + '-overlay'}
                  placement='bottom'
                  overlay={
                    <Popover
                      id={'sell-signal-' + symbol + '-' + i + '-overlay-right'}>
                      <Popover.Content>
                        {grid.executed ? (
                          <React.Fragment>
                            The logic trade #{i + 1} has been executed at.
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            The logic trade #{i + 1} has not been executed.{' '}
                            {currentGridTradeIndex === i
                              ? 'Waiting to be executed.'
                              : `Waiting the logic trade #${i} to be executed.`}
                          </React.Fragment>
                        )}
                      </Popover.Content>
                    </Popover>
                  }>
                  <Button
                    variant='link'
                    className='p-0 m-0 ml-1 text-warning d-inline-block'
                    style={{ lineHeight: '17px' }}>
                    {grid.executed ? (
                      // If already executed, then shows executed icon.
                      <i className='fas fa-check-square'></i>
                    ) : currentGridTradeIndex === i ? (
                      <i className='far fa-clock'></i>
                    ) : (
                      <i className='far fa-clock text-muted'></i>
                    )}
                  </Button>
                </OverlayTrigger>

                <button
                  type='button'
                  className='btn btn-sm btn-link p-0 ml-1'
                  onClick={this.toggleCollapse}>
                  <i
                    className={`fas ${collapsed ? 'fa-arrow-right' : 'fa-arrow-down'
                      }`}></i>
                </button>
              </div>
            </div>

            <div
              className={`ticker-info-content-setting ${collapsed ? 'd-none' : ''
                }`}>
              <div className='ticker-info-column ticker-info-column-order'>
                <span className='ticker-info-label'>
                  - Trigger price percentage:
                </span>
                <div className='ticker-info-value'>
                  {((grid.triggerPercentage - 1) * 100).toFixed(2)}%
                </div>
              </div>
              <div className='ticker-info-column ticker-info-column-order'>
                <span className='ticker-info-label'>
                  - Stop price percentage:
                </span>
                <div className='ticker-info-value'>
                  {((grid.stopPercentage - 1) * 100).toFixed(2)}%
                </div>
              </div>
              <div className='ticker-info-column ticker-info-column-order'>
                <span className='ticker-info-label'>
                  - Limit price percentage:
                </span>
                <div className='ticker-info-value'>
                  {((grid.limitPercentage - 1) * 100).toFixed(2)}%
                </div>
              </div>
              <div className='ticker-info-column ticker-info-column-order'>
                <span className='ticker-info-label'>
                  - Sell quantity percentage:
                </span>
                <div className='ticker-info-value'>
                  {(grid.quantityPercentage * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });

    const renderOpenOrders = sell.openOrders.map((openOrder, index) => {
      return (
        <div
          key={'ticker-wrapper-sell-order-' + index}
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

          {openOrder.currentPrice ? (
            <div className='ticker-info-column ticker-info-column-price'>
              <span className='ticker-info-label'>Current price:</span>
              <HightlightChange className='ticker-info-value'>
                {parseFloat(openOrder.currentPrice).toFixed(precision)}
              </HightlightChange>
            </div>
          ) : (
            ''
          )}
          {openOrder.minimumProfit ? (
            <div className='ticker-info-column ticker-info-column-price'>
              <span className='ticker-info-label'>Minimum profit:</span>
              <HightlightChange className='ticker-info-value'>
                {parseFloat(openOrder.minimumProfit).toFixed(precision)}{' '}
                {quoteAsset} (
                {parseFloat(openOrder.minimumProfitPercentage).toFixed(2)}%)
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
        <div className='ticker-info-column ticker-info-column-title'>
          <div className='ticker-info-label'>
            Sell Open Orders{' '}
            <span className='ticker-info-value'>
              {symbolConfiguration.sell.enabled ? (
                <i className='fas fa-toggle-on'></i>
              ) : (
                <i className='fas fa-toggle-off'></i>
              )}
            </span>
          </div>
        </div>

        <StockWrapperSellLastBuyPrice
          symbolInfo={symbolInfo}
          sendWebSocket={sendWebSocket}
          isAuthenticated={isAuthenticated}></StockWrapperSellLastBuyPrice>

        {sellGridRows}

        {renderOpenOrders}
      </div>
    );
  }
}
