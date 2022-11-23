/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class StockWrapperBalance extends React.Component {
  render() {
    const { symbolInfo } = this.props;

    const {
      symbolInfo: {
        //  filterLotSize: { stepSize },
        //  filterPrice: { tickSize }
      },
      //baseAssetBalance,
      //quoteAssetBalance: { asset: quoteAsset }
    } = symbolInfo;

    //const basePrecision =
    //  parseFloat(stepSize) === 1 ? 0 : stepSize.indexOf(1) - 1;
    //const quotePrecision =
    //  parseFloat(tickSize) === 1 ? 0 : tickSize.indexOf(1) - 1;

    return (
      <div className='ticker-info-sub-wrapper'>
        <div className='ticker-info-column ticker-info-column-title'>
          <span className='ticker-info-label'>Balance</span>
          <span className='ticker-info-value'>{baseAssetBalance.asset}</span>
        </div>
        <div className='ticker-info-column ticker-info-column-right ticker-info-column-balance'>
          <span className='ticker-info-label'>Free:</span>
          <HightlightChange className='ticker-info-value'>
            {parseFloat(baseAssetBalance.free).toFixed(basePrecision)}
          </HightlightChange>
        </div>
        <div className='ticker-info-column ticker-info-column-right ticker-info-column-balance'>
          <span className='ticker-info-label'>Locked:</span>
          <HightlightChange className='ticker-info-value'>
            {parseFloat(baseAssetBalance.locked).toFixed(basePrecision)}
          </HightlightChange>
        </div>
        <div className='ticker-info-column ticker-info-column-right ticker-info-column-balance'>
          <span className='ticker-info-label'>Estimated Value:</span>
          <HightlightChange className='ticker-info-value'>
            {parseFloat(baseAssetBalance.estimatedValue).toFixed(
              quotePrecision
            )}{' '}
            {quoteAsset}
          </HightlightChange>
        </div>
      </div>
    );
  }
}
