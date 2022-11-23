/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperSymbol extends React.Component {
  isMonitoring() {
    const { configuration, symbolInfo } = this.props;

    const { symbol } = symbolInfo;
    const { symbols } = configuration;
    return symbols.includes(symbol);
  }

  isTradingOnTradovate() {
    const { symbolInfo: symbolCache } = this.props;

    const {
      symbolInfo: { status }
    } = symbolCache;
    return status === 'TRADING';
  }

  render() {
    const {
      symbol,
      symbolInfo,
      lastCandle,
      quoteAsset,
      baseAssetPrecision,
      quotePrecision,
      filterLotSize,
      filterPrice,
      baseAssetStepSize,
      quoteAssetTickSize,
      baseAssetBalance,
      quoteAssetBalance,
      configuration: globalConfiguration,
      sendWebSocket,
      isAuthenticated
    } = this.props;

    let monitoringStatus = '';

    if (this.isMonitoring()) {
      if (this.isTradingOnTradovate()) {
        monitoringStatus = (
          <Spinner animation='border' size='sm' className='ticker-info-spinner' />
        );
      } else {
        monitoringStatus = (
          <OverlayTrigger
            trigger='click'
            key='monitoring-status-alert-overlay'
            placement='bottom'
            overlay={
              <Popover id='monitoring-status-alert-overlay-bottom'>
                <Popover.Content>
                  {symbol} exists in your monitoring list. However, it is not
                  active on Tradovate due to emergency downtime, due to it was
                  actually delisted or due to market move too fast. For more
                  details, check Tradovate announcements.
                  <br />
                  <br />
                  Current Status:{' '}
                  <span className='font-weight-bold'>
                    {symbolInfo.symbolInfo.status}
                  </span>
                </Popover.Content>
              </Popover>
            }>
            <Button
              variant='link'
              className='p-0 m-0 ml-1 d-inline-block'
              style={{ lineHeight: '17px' }}>
              <i className='fas fa-exclamation-circle mx-1 text-warning'></i>
            </Button>
          </OverlayTrigger>
        );
      }
    }

    return (
      <div className='ticker-info-sub-wrapper ticker-info-sub-wrapper-symbol'>
        <div className='ticker-info-column ticker-info-column-name'>
          <a
            href={`https://www.tradingview.com/symbols/${symbol}/`}
            target='_blank'
            rel='noreferrer'
            className='ticker-symbol'>
            {symbol}
          </a>
          {monitoringStatus}
        </div>
        <div className='ticker-info-column ticker-info-column-icon'>



        </div>
      </div>
    );
  }
}
