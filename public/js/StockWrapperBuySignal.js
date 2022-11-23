/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperBuySignal extends React.Component {
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
    const {
      symbolInfo: {
        symbolInfo: {
          symbol,
          filterPrice: { }
        },
        quoteAssetBalance: { asset: quoteAsset },
        symbolConfiguration,
        buy,
        sell
      },
      sendWebSocket,
      isAuthenticated
    } = this.props;
    const { collapsed } = this.state;

    const precision = tickSize && parseFloat(tickSize) === 1 ? 0 : tickSize.indexOf(1) - 1;

    const {
      buy: { currentGridTradeIndex, gridTrade }
    } = symbolConfiguration;

    let hiddenCount = 0;

    const buyGridRows = gridTrade.map((grid, i) => {
      const modifiedGridTradeIndex = Math.min(
        Math.max(currentGridTradeIndex, 5),
        gridTrade.length - 5
      );

      function hiddenRow(i) {
        return (
          i >= 3 &&
          (i <= modifiedGridTradeIndex - 3 ||
            i >= modifiedGridTradeIndex + 4) &&
          i < gridTrade.length - 1
        );
      }

      const isNextHidden = hiddenRow(i + 1);
      const isHidden = isNextHidden || hiddenRow(i);

      if (isHidden === true) {
        hiddenCount++;

        return isNextHidden === true ? (
          ''
        ) : (
          <React.Fragment
            key={'ticker-wrapper-buy-grid-row-hidden-' + symbol + '-' + (i - 1)}>
            <div className='ticker-info-column-grid'>
              <div className='ticker-info-column ticker-info-column-price'>
                <div className='ticker-info-label text-center text-muted'>
                  ... {hiddenCount} logic trade{hiddenCount === 1 ? '' : 's'}{' '}
                  hidden ...
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      } else {
        hiddenCount = 0;
      }

      return (
        <React.Fragment key={'ticker-wrapper-buy-grid-row-' + symbol + '-' + i}>
          <div className='ticker-info-column-grid'>
            <div className='ticker-info-column ticker-info-column-price'>
              <div className='ticker-info-label'>Logic Trade #{i + 1}</div>

              <div className='ticker-info-value'>
                {buy.openOrders.length === 0 &&
                  sell.openOrders.length === 0 &&
                  currentGridTradeIndex === i ? (
                  <SymbolTriggerBuyIcon
                    symbol={symbol}
                    sendWebSocket={sendWebSocket}
                    isAuthenticated={isAuthenticated}></SymbolTriggerBuyIcon>
                ) : (
                  ''
                )}

                <OverlayTrigger
                  trigger='click'
                  key={'buy-signal-' + symbol + '-' + i + '-overlay'}
                  placement='bottom'
                  overlay={
                    <Popover
                      id={'buy-signal-' + symbol + '-' + i + '-overlay-right'}>
                      <Popover.Content>
                        {grid.executed ? (
                          <React.Fragment>
                            <span>
                              The logic trade #{i + 1} has been executed{' '}
                              {moment(grid.executedOrder.updateTime).fromNow()}{' '}
                              ({moment(grid.executedOrder.updateTime).format()}
                              ).
                            </span>
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            The logic trade #{i + 1} has not been executed.{' '}
                            {sell.lastBuyPrice > 0
                              ? i === 0
                                ? 'This logic trade will not be executed because the last buy price is recorded and the first logic trade is not executed.'
                                : currentGridTradeIndex === i
                                  ? `Waiting to be executed.`
                                  : `Waiting the logic trade #${i} to be executed.`
                              : currentGridTradeIndex === i
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
                    ) : sell.lastBuyPrice > 0 ? (
                      i === 0 ? (
                        <i className='far fa-clock text-muted'></i>
                      ) : currentGridTradeIndex === i ? (
                        <i className='far fa-clock'></i>
                      ) : (
                        <i className='far fa-clock text-muted'></i>
                      )
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

            {buy.triggerPrice && currentGridTradeIndex === i ? (
              <div className='ticker-info-column ticker-info-column-price'>
                <div
                  className='ticker-info-label d-flex flex-row justify-content-start'
                  style={{ flex: '0 100%' }}>
                  <span>
                    &#62; Trigger price (
                    {(parseFloat(grid.triggerPercentage - 1) * 100).toFixed(2)}
                    %):
                  </span>
                  {i === 0 &&
                    symbolConfiguration.buy.athRestriction.enabled &&
                    parseFloat(buy.triggerPrice) >
                    parseFloat(buy.athRestrictionPrice) ? (
                    <OverlayTrigger
                      trigger='click'
                      key='buy-trigger-price-overlay'
                      placement='bottom'
                      overlay={
                        <Popover id='buy-trigger-price-overlay-right'>
                          <Popover.Content>
                            The trigger price{' '}
                            <code>
                              {parseFloat(buy.triggerPrice).toFixed(precision)}
                            </code>{' '}
                            is higher than the ATH buy restricted price{' '}
                            <code>
                              {parseFloat(buy.athRestrictionPrice).toFixed(
                                precision
                              )}
                            </code>
                            . The bot will not place an order even if the
                            current price reaches the trigger price.
                          </Popover.Content>
                        </Popover>
                      }>
                      <Button
                        variant='link'
                        className='p-0 m-0 ml-1 text-warning d-inline-block'
                        style={{ lineHeight: '17px' }}>
                        <i className='fas fa-info-circle fa-sm'></i>
                      </Button>
                    </OverlayTrigger>
                  ) : (
                    ''
                  )}
                </div>
                <HightlightChange
                  className={`ticker-info-value ${symbolConfiguration.buy.athRestriction.enabled &&
                    parseFloat(buy.triggerPrice) >
                    parseFloat(buy.athRestrictionPrice)
                    ? 'text-warning'
                    : ''
                    }`}>
                  {parseFloat(buy.triggerPrice).toFixed(precision)}
                </HightlightChange>
              </div>
            ) : (
              ''
            )}
            {buy.difference && currentGridTradeIndex === i ? (
              <div className='ticker-info-column ticker-info-column-price'>
                <span className='ticker-info-label'>Difference to buy:</span>
                <HightlightChange
                  className={`ticker-info-value ${buy.difference > 0
                    ? 'text-success'
                    : buy.difference < 0
                      ? 'text-danger'
                      : ''
                    }`}
                  id='buy-difference'>
                  {parseFloat(buy.difference).toFixed(2)}%
                </HightlightChange>
              </div>
            ) : (
              ''
            )}

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
              {grid.minPurchaseAmount > 0 ? (
                <div className='ticker-info-column ticker-info-column-order'>
                  <span className='ticker-info-label'>
                    - Min purchase amount:
                  </span>
                  <div className='ticker-info-value'>
                    {grid.minPurchaseAmount} {quoteAsset}
                  </div>
                </div>
              ) : (
                ''
              )}
              <div className='ticker-info-column ticker-info-column-order'>
                <span className='ticker-info-label'>- Max purchase amount:</span>
                <div className='ticker-info-value'>
                  {grid.maxPurchaseAmount} {quoteAsset}
                </div>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });

    return (
      <div className='ticker-info-sub-wrapper'>
        <div className='ticker-info-column ticker-info-column-title'>
          <div className='ticker-info-label'>
            Buy Signal ({symbolConfiguration.candles.interval}/
            {symbolConfiguration.candles.share}){' '}
            <span className='ticker-info-value'>
              {symbolConfiguration.buy.enabled ? (
                <i className='fas fa-toggle-on'></i>
              ) : (
                <i className='fas fa-toggle-off'></i>
              )}
            </span>{' '}
          </div>
          {symbolConfiguration.buy.enabled === false ? (
            <HightlightChange className='ticker-info-message badge-pill badge-danger'>
              Trading is disabled.
            </HightlightChange>
          ) : (
            ''
          )}
        </div>
        {symbolConfiguration.buy.athRestriction.enabled ? (
          <div className='d-flex flex-column w-100'>
            {buy.athPrice ? (
              <div className='ticker-info-column ticker-info-column-price'>
                <span className='ticker-info-label'>
                  ATH price (
                  {symbolConfiguration.buy.athRestriction.candles.interval}/
                  {symbolConfiguration.buy.athRestriction.candles.share}):
                </span>
                <HightlightChange className='ticker-info-value'>
                  {parseFloat(buy.athPrice).toFixed(precision)}
                </HightlightChange>
              </div>
            ) : (
              ''
            )}
            {buy.athRestrictionPrice ? (
              <div className='ticker-info-column ticker-info-column-price'>
                <div
                  className='ticker-info-label d-flex flex-row justify-content-start'
                  style={{ flex: '0 100%' }}>
                  <span>
                    &#62; Restricted price (
                    {(
                      parseFloat(
                        symbolConfiguration.buy.athRestriction
                          .restrictionPercentage - 1
                      ) * 100
                    ).toFixed(2)}
                    %):
                  </span>
                  <OverlayTrigger
                    trigger='click'
                    key='buy-ath-restricted-price-overlay'
                    placement='bottom'
                    overlay={
                      <Popover id='buy-ath-restricted-price-overlay-right'>
                        <Popover.Content>
                          The bot will place a buy order when the trigger price
                          is lower than ATH restricted price. Even if the
                          current price reaches the trigger price, the bot will
                          not purchase the ticker if the current price is higher
                          than the ATH restricted price. If you don't want to
                          restrict the purchase with ATH, please disable the ATH
                          price restriction in the setting.
                        </Popover.Content>
                      </Popover>
                    }>
                    <Button
                      variant='link'
                      className='p-0 m-0 ml-1 text-info d-inline-block'
                      style={{ lineHeight: '17px' }}>
                      <i className='fas fa-question-circle fa-sm'></i>
                    </Button>
                  </OverlayTrigger>
                </div>
                <HightlightChange
                  className={`ticker-info-value ${symbolConfiguration.buy.athRestriction.enabled &&
                    parseFloat(buy.triggerPrice) >
                    parseFloat(buy.athRestrictionPrice)
                    ? 'text-warning'
                    : ''
                    }`}>
                  {parseFloat(buy.athRestrictionPrice).toFixed(precision)}
                </HightlightChange>
              </div>
            ) : (
              ''
            )}
            <div className='ticker-info-column ticker-info-column-price divider'></div>
          </div>
        ) : (
          ''
        )}

        {buy.highestPrice ? (
          <div className='ticker-info-column ticker-info-column-price'>
            <span className='ticker-info-label'>Highest price:</span>
            <HightlightChange className='ticker-info-value'>
              {parseFloat(buy.highestPrice).toFixed(precision)}
            </HightlightChange>
          </div>
        ) : (
          ''
        )}
        {buy.currentPrice ? (
          <div className='ticker-info-column ticker-info-column-price'>
            <span className='ticker-info-label'>Current price:</span>
            <HightlightChange className='ticker-info-value'>
              {parseFloat(buy.currentPrice).toFixed(precision)}
            </HightlightChange>
          </div>
        ) : (
          ''
        )}
        {buy.lowestPrice ? (
          <div className='ticker-info-column ticker-info-column-lowest-price'>
            <span className='ticker-info-label'>Lowest price:</span>
            <HightlightChange className='ticker-info-value'>
              {parseFloat(buy.lowestPrice).toFixed(precision)}
            </HightlightChange>
          </div>
        ) : (
          ''
        )}
        <div className='ticker-info-column ticker-info-column-price divider mb-1'></div>
        {buyGridRows}
        {buy.processMessage ? (
          <div className='d-flex flex-column w-100'>
            <div className='ticker-info-column ticker-info-column-price divider'></div>
            <div className='ticker-info-column ticker-info-column-message text-warning'>
              <HightlightChange className='ticker-info-message'>
                {buy.processMessage}
              </HightlightChange>
            </div>
          </div>
        ) : (
          ''
        )}
      </div>
    );
  }
}
