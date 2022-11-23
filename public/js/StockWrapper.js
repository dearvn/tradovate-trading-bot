/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapper extends React.Component {
  render() {
    const {
      connected,
      symbolInfo,
      sendWebSocket,
      configuration,
      isAuthenticated
    } = this.props;

    const {
      symbol,
      lastCandle,
      symbolInfo: {

      }
    } = symbolInfo;

    const className = 'ticker-wrapper ' + this.props.extraClassName;

    return (

      <div className={className} data-symbol={symbolInfo.symbol}>
        <div className='ticker-info-wrapper'>
          <StockWrapperSymbol
            symbol={symbol}
            symbolInfo={symbolInfo}
            lastCandle={lastCandle}
            configuration={configuration}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />
          <StockWrapperSetting
            symbolInfo={symbolInfo}
            configuration={configuration}
            sendWebSocket={sendWebSocket}
          />

          {/*<StockWrapperAction
            symbolInfo={symbolInfo}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />

          
          <StockWrapperTradingView
            symbolInfo={symbolInfo}
            connected={connected} />

          <StockWrapperBuySignal
            symbolInfo={symbolInfo}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />

          <StockWrapperBuyOrders
            symbolInfo={symbolInfo}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />

          <StockWrapperSellSignal
            symbolInfo={symbolInfo}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />
          <StockWrapperSellOrders
            symbolInfo={symbolInfo}
            sendWebSocket={sendWebSocket}
            isAuthenticated={isAuthenticated}
          />
        */}
        </div>
      </div>
    );
  }
}
