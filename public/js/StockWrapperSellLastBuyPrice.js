/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperSellLastBuyPrice extends React.Component {
  render() {
    const { symbolInfo, sendWebSocket, isAuthenticated } = this.props;

    const {
      symbolInfo: {
        filterPrice: { }
      },
      sell
    } = symbolInfo;

    const precision = tickSize && parseFloat(tickSize) === 1 ? 0 : tickSize.indexOf(1) - 1;

    return (
      <div className='ticker-info-column ticker-info-column-price'>
        <span className='ticker-info-label ticker-info-label-with-icon'>
          Last buy price:
          <SymbolEditLastBuyPriceIcon
            symbolInfo={symbolInfo}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />
        </span>
        {sell.lastBuyPrice > 0 ? (
          <div className='ticker-info-value  ticker-info-value-with-icon'>
            <HightlightChange className='ticker-info-value ticker-info-value-with-icon'>
              {sell.lastBuyPrice.toFixed(precision)}
            </HightlightChange>
          </div>
        ) : (
          <span className='ticker-info-value ticker-info-value-with-icon'>N/A</span>
        )}
      </div>
    );
  }
}
