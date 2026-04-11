/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class ProfitLossWrapper extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      canUpdate: true,
      symbols: {},
      closedTradesLoading: false,
      closedTradesSetting: {},
      selectedPeriod: null,
      selectedPeriodTZ: null,
      selectedPeriodLC: null
    };

    this.setUpdate = this.setUpdate.bind(this);
    this.requestClosedTradesSetPeriod =
      this.requestClosedTradesSetPeriod.bind(this);
  }

  componentDidUpdate(nextProps) {
    const { canUpdate } = this.state;
    if (
      canUpdate === true &&
      _.get(nextProps, 'symbols', null) !== null &&
      _.isEqual(_.get(nextProps, 'symbols', null), this.state.symbols) === false
    ) {
      const { symbols } = nextProps;
      this.setState({ symbols });
    }

    if (
      _.get(nextProps, 'closedTradesSetting', null) !== null &&
      _.isEqual(
        _.get(nextProps, 'closedTradesSetting', null),
        this.state.closedTradesSetting
      ) === false
    ) {
      const { closedTradesSetting } = nextProps;
      this.setState({ closedTradesSetting });
    }

    const { selectedPeriod, selectedPeriodTZ, selectedPeriodLC } = this.state;
    const { loadedPeriod, loadedPeriodTZ, loadedPeriodLC } =
      this.state.closedTradesSetting;

    if (loadedPeriod !== undefined && selectedPeriod === null) {
      this.setState({
        selectedPeriod: loadedPeriod,
        selectedPeriodTZ: loadedPeriodTZ,
        selectedPeriodLC: loadedPeriodLC
      });
    }

    if (loadedPeriod !== selectedPeriod) {
      if (this.state.closedTradesLoading === false) {
        this.setState({ closedTradesLoading: true });
      }
    } else {
      if (this.state.closedTradesLoading === true) {
        this.setState({ closedTradesLoading: false });
      }
    }
  }

  setUpdate(newStatus) {
    this.setState({ canUpdate: newStatus });
  }

  requestClosedTradesSetPeriod() {
    const { selectedPeriod, selectedPeriodTZ, selectedPeriodLC } = this.state;
    return axios.post('/closed-trades-set-period', {
      selectedPeriod,
      selectedPeriodTZ,
      selectedPeriodLC
    });
  }

  setSelectedPeriod(newSelectedPeriod) {
    const newSelectedPeriodTZ =
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    const newSelectedPeriodLC = Intl.DateTimeFormat().resolvedOptions().locale;
    this.setState(
      {
        selectedPeriod: newSelectedPeriod,
        selectedPeriodTZ: newSelectedPeriodTZ,
        selectedPeriodLC: newSelectedPeriodLC
      },
      () => this.requestClosedTradesSetPeriod()
    );
  }

  renderTradeCard(item, index, prefix) {
    var profit = item.profit;
    if (!profit) {
      if (item.order_type === 'CALL') {
        profit = item.exit_price - item.entry_price;
      } else if (item.order_type === 'PUT') {
        profit = item.entry_price - item.exit_price;
      }
    }

    const isCall   = item.order_type === 'CALL';
    const pnlClass = profit > 0 ? 'pnl-positive' : profit < 0 ? 'pnl-negative' : 'pnl-neutral';
    const pnlSign  = profit > 0 ? '+' : '';

    return (
      <div key={`${prefix}-` + index} className='profit-loss-wrapper pt-2 pl-2 pr-2 pb-0'>
        <div className='profit-loss-wrapper-body'>

          {/* Header: symbol + badge */}
          <div className='trade-card-header'>
            <span className='trade-card-symbol'>{item.symbol}</span>
            <span className={`badge-order-type ${isCall ? 'badge-call' : 'badge-put'}`}>
              {item.order_type}
            </span>
          </div>

          {/* Prices */}
          <div className='trade-card-prices'>
            <div className='trade-card-price-item'>
              <div className='trade-card-price-label'>Entry</div>
              <div className='trade-card-price-value'>${item.entry_price}</div>
            </div>
            {item.exit_price ? (
              <div className='trade-card-price-item'>
                <div className='trade-card-price-label'>Exit</div>
                <div className='trade-card-price-value'>${item.exit_price}</div>
              </div>
            ) : null}
          </div>

          {/* P&L row */}
          <div className='trade-card-pnl'>
            <div className='trade-card-meta'>
              <span className='trade-card-logic'>#{item.logic}</span>
              <OverlayTrigger
                trigger='click'
                key={`${prefix}-overlay-${index}`}
                placement='bottom'
                overlay={
                  <Popover id={`${prefix}-overlay-pop-${index}`}>
                    <Popover.Content>{item.note}</Popover.Content>
                  </Popover>
                }>
                <Button variant='link' className='p-0 m-0 text-info align-baseline' style={{ lineHeight: 1 }}>
                  <i className='fas fa-question-circle fa-sm'></i>
                </Button>
              </OverlayTrigger>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`trade-card-pnl-value ${pnlClass}`}>
                {pnlSign}{profit !== undefined && profit !== null ? Number(profit).toFixed(2) : '—'} pts
              </div>
              <div className='trade-card-time'>
                {item.entry_time
                  ? moment(item.entry_time).format('MM/DD/YYYY HH:mm')
                  : ''}
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  render() {
    const { sendWebSocket, isAuthenticated, closedTrades, openTrades } =
      this.props;
    const { symbols, selectedPeriod, closedTradesLoading } = this.state;

    /* ── Open orders ── */
    let openTradeWrappers;
    if (!_.isEmpty(openTrades)) {
      openTradeWrappers = Object.values(openTrades).map((item, index) =>
        this.renderTradeCard(item, index, 'open-trade-pnl')
      );
    }

    /* ── Closed orders ── */
    const closedTradeWrappers = Object.values(closedTrades[0]).map((stat, index) =>
      this.renderTradeCard(stat, index, 'closed-trade-pnl')
    );

    /* ── Period selector buttons ── */
    const periods = [
      { key: 'd', label: 'D', title: 'Day' },
      { key: 'w', label: 'W', title: 'Week' },
      { key: 'm', label: 'M', title: 'Month' },
      { key: 'a', label: 'All', title: 'All' }
    ];

    return (
      <div className='profit-loss-container'>

        {/* ── Open Orders ── */}
        <div className='accordion-wrapper profit-loss-accordion-wrapper profit-loss-open-trades-accordion-wrapper'>
          <Accordion defaultActiveKey='0'>
            <Card bg='dark'>
              <Card.Header className='px-2 py-1'>
                <div className='d-flex flex-row justify-content-between align-items-center'>
                  <div className='btn-profit-loss'>
                    <span>Open Orders</span>{' '}
                    <OverlayTrigger
                      trigger='click'
                      key='open-orders-overlay'
                      placement='bottom'
                      overlay={
                        <Popover id='open-orders-pop'>
                          <Popover.Content>
                            This section displays the open orders.
                          </Popover.Content>
                        </Popover>
                      }>
                      <Button variant='link' className='p-0 m-0 ml-1 text-info align-baseline'>
                        <i className='fas fa-question-circle fa-sm'></i>
                      </Button>
                    </OverlayTrigger>
                  </div>
                </div>
              </Card.Header>

              <Accordion.Collapse eventKey='0'>
                <Card.Body className='d-flex flex-column py-2 px-0 card-body'>
                  <div className='profit-loss-wrappers profit-loss-open-trades-wrappers'>
                    {_.isEmpty(openTrades) ? (
                      <div className='empty-state w-100'>
                        <i className='fas fa-inbox'></i>
                        <p>No open orders</p>
                      </div>
                    ) : (
                      openTradeWrappers
                    )}
                  </div>
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
        </div>

        {/* ── Closed Orders ── */}
        <div className='accordion-wrapper profit-loss-accordion-wrapper profit-loss-closed-trades-accordion-wrapper'>
          <Accordion defaultActiveKey='0'>
            <Card bg='dark'>
              <Card.Header className='px-2 py-1'>
                <div className='d-flex flex-row justify-content-between align-items-center'>
                  <div className='btn-profit-loss'>
                    Closed Orders
                    <OverlayTrigger
                      trigger='click'
                      key='closed-orders-overlay'
                      placement='bottom'
                      overlay={
                        <Popover id='closed-orders-pop'>
                          <Popover.Content>This section displays the closed orders.</Popover.Content>
                        </Popover>
                      }>
                      <Button variant='link' className='p-0 m-0 ml-1 text-info align-baseline'>
                        <i className='fas fa-question-circle fa-sm'></i>
                      </Button>
                    </OverlayTrigger>
                  </div>

                  <div className='d-flex align-items-center' style={{ gap: '4px' }}>
                    {periods.map(p => (
                      <button
                        key={p.key}
                        type='button'
                        className={`btn btn-period btn-sm ${selectedPeriod === p.key ? 'btn-info' : 'btn-light'}`}
                        onClick={() => this.setSelectedPeriod(p.key)}
                        title={p.title}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card.Header>

              <Accordion.Collapse eventKey='0'>
                <Card.Body className='d-flex flex-column py-2 px-0 card-body'>
                  <div className='profit-loss-wrappers profit-loss-open-trades-wrappers'>
                    {closedTradesLoading === true || _.isEmpty(closedTrades) ? (
                      <div className='empty-state w-100'>
                        <Spinner animation='border' role='status' style={{ width: '2rem', height: '2rem' }}>
                          <span className='sr-only'>Loading...</span>
                        </Spinner>
                      </div>
                    ) : (
                      <React.Fragment>{closedTradeWrappers}</React.Fragment>
                    )}
                  </div>
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
        </div>

      </div>
    );
  }
}
