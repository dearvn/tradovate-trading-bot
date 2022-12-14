/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperSetting extends React.Component {
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

  isCustomised = configurationKeyName =>
    configurationKeyName !== 'configuration';

  render() {
    const { collapsed } = this.state;
    const { symbolInfo } = this.props;
    const { symbolConfiguration } = symbolInfo;

    const {
      symbol
      //quoteAssetBalance: { asset: quoteAsset }
    } = symbolInfo;

    const {
      key: configurationKeyName,
      buy: { gridTrade: buyGridTrade },
      sell: { gridTrade: sellGridTrade }
    } = symbolConfiguration;

    const buyGridRows = buyGridTrade.map((grid, i) => {
      return (
        <React.Fragment
          key={'ticker-wrapper-setting-buy-grid-row-' + symbol + '-' + i}>
          <div className='ticker-info-column-grid'>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Logic Trade #{i + 1}</span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Trigger percentage{' '}
                <strong>
                  {i === 0 ? `(lowest price)` : `(last buy price)`}
                </strong>
                :
              </span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.triggerPercentage - 1) * 100).toFixed(2)}%
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Stop percentage:</span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.stopPercentage - 1) * 100).toFixed(2)}%
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Limit percentage:</span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.limitPercentage - 1) * 100).toFixed(2)}%
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Min purchase amount:</span>
              <div className='ticker-info-value'>
                {grid.minPurchaseAmount}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Max purchase amount:</span>
              <div className='ticker-info-value'>
                {grid.maxPurchaseAmount}
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });

    const sellGridRows = sellGridTrade.map((grid, i) => {
      return (
        <React.Fragment
          key={'ticker-wrapper-setting-sell-grid-row-' + symbol + '-' + i}>
          <div className='ticker-info-column-grid'>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Logic CALL #{i + 1}</span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Trigger percentage:</span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.triggerPercentage - 1) * 100).toFixed(2)}%
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Stop percentage:</span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.stopPercentage - 1) * 100).toFixed(2)}%
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Limit percentage:</span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.limitPercentage - 1) * 100).toFixed(2)}%
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Quantity Percentage:</span>
              <div className='ticker-info-value'>
                {(parseFloat(grid.quantityPercentage) * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });

    return (
      <div className='ticker-info-sub-wrapper ticker-info-sub-wrapper-setting'>
        <div className='ticker-info-column ticker-info-column-title ticker-info-column-title-setting'>
          <div className='ticker-info-label'>
            <div className='mr-1'>
              Setting{' '}
              {this.isCustomised(configurationKeyName) ? (
                <Badge pill variant='warning'>
                  Customised
                </Badge>
              ) : (
                <Badge pill variant='light'>
                  Global
                </Badge>
              )}
            </div>
          </div>

          <button
            type='button'
            className='btn btn-sm btn-link p-0 ml-1'
            onClick={this.toggleCollapse}>
            <i
              className={`fas ${collapsed ? 'fa-arrow-right' : 'fa-arrow-down'
                }`}></i>
          </button>
        </div>
        <div
          className={`ticker-info-content-setting ${collapsed ? 'd-none' : ''}`}>
          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Candles</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Interval:</span>
              <div className='ticker-info-value'>
                {symbolConfiguration.candles.interval}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Limit:</span>
              <div className='ticker-info-value'>
                {symbolConfiguration.candles.share}
              </div>
            </div>
          </div>

          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Buy</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Trading enabled:</span>
              <span className='ticker-info-value'>
                {symbolConfiguration.buy.enabled ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            {buyGridRows}
          </div>
          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>
              Buy - Last buy price removal threshold
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Remove last buy price under:
              </span>
              <div className='ticker-info-value'>
                {symbolConfiguration.buy.lastBuyPriceRemoveThreshold}{' '}
              </div>
            </div>
          </div>
          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>
              Buy - Restriction with ATH
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Restriction Enabled:</span>
              <span className='ticker-info-value'>
                {symbolConfiguration.buy.athRestriction.enabled ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Candles - Interval:</span>
              <div className='ticker-info-value'>
                {symbolConfiguration.buy.athRestriction.candles.interval}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Candles - Limit:</span>
              <div className='ticker-info-value'>
                {symbolConfiguration.buy.athRestriction.candles.share}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Restriction Percentage:</span>
              <div className='ticker-info-value'>
                {(
                  (symbolConfiguration.buy.athRestriction
                    .restrictionPercentage -
                    1) *
                  100
                ).toFixed(2)}
                %
              </div>
            </div>
          </div>
          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Buy - TradingView</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Allow when recommendation is <code>Strong buy</code>:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.buy.tradingView.whenStrongBuy ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Allow when recommendation is <code>Buy</code>:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.buy.tradingView.whenBuy ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
          </div>

          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Sell</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Trading enabled:</span>
              <span className='ticker-info-value'>
                {symbolConfiguration.sell.enabled ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            {sellGridRows}
          </div>

          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Sell - Stop Loss</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Stop Loss Enabled:</span>
              <span className='ticker-info-value'>
                {symbolConfiguration.sell.stopLoss.enabled ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Max Loss Percentage:</span>
              <div className='ticker-info-value'>
                {(
                  (symbolConfiguration.sell.stopLoss.maxLossPercentage - 1) *
                  100
                ).toFixed(2)}
                %
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Temporary disable buy:</span>
              <div className='ticker-info-value'>
                {moment
                  .duration(
                    symbolConfiguration.sell.stopLoss.disableBuyMinutes,
                    'minutes'
                  )
                  .humanize()}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Order Type:</span>
              <div className='ticker-info-value'>
                {symbolConfiguration.sell.stopLoss.orderType}
              </div>
            </div>
          </div>

          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Sell - TradingView</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Force sell when recommendation is <code>Neutral</code>:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.sell.tradingView
                  .forceExitAll13h.whenNeutral ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Force sell when recommendation is <code>Sell</code>:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.sell.tradingView
                  .forceExitAll13h ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Force sell when recommendation is <code>Strong sell</code>:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.sell.tradingView
                  .forceExitAll13h.whenStrongSell ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
          </div>

          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>
              Bot Options - Auto Trigger Buy
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Enabled:</span>
              <span className='ticker-info-value'>
                {symbolConfiguration.botOptions.autoTriggerBuy.enabled ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Trigger after:</span>
              <div className='ticker-info-value'>
                {moment
                  .duration(
                    symbolConfiguration.botOptions.autoTriggerBuy.triggerAfter,
                    'minutes'
                  )
                  .humanize()}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Re-schedule when the current price is over ATH restriction:
              </span>
              <div className='ticker-info-value'>
                {symbolConfiguration.botOptions.autoTriggerBuy.conditions
                  .whenLessThanATHRestriction ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Re-schedule when the action is disabled:
              </span>
              <div className='ticker-info-value'>
                {symbolConfiguration.botOptions.autoTriggerBuy.conditions
                  .afterDisabledPeriod ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                TradingView Overriden Interval:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.botOptions.autoTriggerBuy.conditions
                  .tradingView.overrideInterval !== ''
                  ? symbolConfiguration.botOptions.autoTriggerBuy.conditions
                    .tradingView.overrideInterval
                  : 'Use TradingView'}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Allow when TradingView recommendation is <code>Strong buy</code>
                :
              </span>
              <div className='ticker-info-value'>
                {symbolConfiguration.botOptions.autoTriggerBuy.conditions
                  .tradingView.whenStrongBuy ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </div>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Allow when TradingView recommendation is <code>Buy</code>:
              </span>
              <div className='ticker-info-value'>
                {symbolConfiguration.botOptions.autoTriggerBuy.conditions
                  .tradingView.whenBuy ? (
                  <i className='fas fa-toggle-on'></i>
                ) : (
                  <i className='fas fa-toggle-off'></i>
                )}
              </div>
            </div>
          </div>

          <div className='ticker-info-sub-wrapper'>
            <div className='ticker-info-sub-label'>Bot Options - TradingView</div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>Interval:</span>
              <span className='ticker-info-value'>
                {symbolConfiguration.botOptions.tradingView.interval !== ''
                  ? symbolConfiguration.botOptions.tradingView.interval
                  : symbolConfiguration.candles.interval}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                Use data only updated within:
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.botOptions.tradingView.useOnlyWithin}
              </span>
            </div>
            <div className='ticker-info-column ticker-info-column-order'>
              <span className='ticker-info-label'>
                If data passed "Use data only updated within":
              </span>
              <span className='ticker-info-value'>
                {symbolConfiguration.botOptions.tradingView.ifExpires ===
                  'ignore'
                  ? 'Ignore data'
                  : 'Do not buy'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
