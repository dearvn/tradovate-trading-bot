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
    // Only update, when the canUpdate is true.
    const { canUpdate } = this.state;
    if (
      canUpdate === true &&
      _.get(nextProps, 'symbols', null) !== null &&
      _.isEqual(_.get(nextProps, 'symbols', null), this.state.symbols) === false
    ) {
      const { symbols } = nextProps;

      this.setState({
        symbols
      });
    }

    if (
      _.get(nextProps, 'closedTradesSetting', null) !== null &&
      _.isEqual(
        _.get(nextProps, 'closedTradesSetting', null),
        this.state.closedTradesSetting
      ) === false
    ) {
      const { closedTradesSetting } = nextProps;
      this.setState({
        closedTradesSetting
      });
    }

    const { selectedPeriod, selectedPeriodTZ, selectedPeriodLC } = this.state;
    const { loadedPeriod, loadedPeriodTZ, loadedPeriodLC } =
      this.state.closedTradesSetting;

    // Set initial selected period
    if (loadedPeriod !== undefined && selectedPeriod === null) {
      this.setState({
        selectedPeriod: loadedPeriod,
        selectedPeriodTZ: loadedPeriodTZ,
        selectedPeriodLC: loadedPeriodLC
      });
    }

    // If loaded period and selected period, then wait for reloaded
    if (loadedPeriod !== selectedPeriod) {
      if (this.state.closedTradesLoading === false) {
        // Set loading as true
        this.setState({
          closedTradesLoading: true
        });
      }
    } else {
      // If loaded period and selected period, then it's loaded correctly.
      if (this.state.closedTradesLoading === true) {
        // Set loading as false
        this.setState({
          closedTradesLoading: false
        });
      }
    }
  }

  setUpdate(newStatus) {
    this.setState({
      canUpdate: newStatus
    });
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

  render() {
    const { sendWebSocket, isAuthenticated, closedTrades, openTrades } =
      this.props;
    const { symbols, selectedPeriod, closedTradesLoading } = this.state;

    var openTradeWrappers = 'Not Found';
    if (!_.isEmpty(openTrades)) {
      openTradeWrappers = Object.values(openTrades).map(
        (item, index) => {
          var profit = item.profit;
          if (!profit) {
            if (item.order_type == 'CALL') {
              profit = item.exit_price - item.entry_price;
            } else if (item.order_type == 'PUT') {
              profit = item.entry_price - item.exit_price;
            }
          };

          return (
            <div
              key={`open-trade-pnl-` + index}
              className='profit-loss-wrapper pt-2 pl-2 pr-2 pb-0'>
              <div className='profit-loss-wrapper-body'>
                <div className='profit-loss-asset'>
                  {item.symbol}
                  <br />
                  <div
                    className={`${item.order_type == 'CALL'
                      ? 'text-success'
                      : 'text-warning'
                      } text-truncate`}>
                    {item.order_type}
                  </div>
                  <div className='fs-9'>
                    Entry ${item.entry_price}
                  </div>
                  <div className='fs-9 note'>
                    <span>Logic: #{item.logic}</span>{' '}
                    <OverlayTrigger
                      trigger='click'
                      key='profit-loss-overlay'
                      placement='bottom'
                      overlay={
                        <Popover id='profit-loss-overlay-right'>
                          <Popover.Content>
                            {item.note}
                          </Popover.Content>
                        </Popover>
                      }>
                      <Button
                        variant='link'
                        className='p-0 m-0 ml-1 text-info align-baseline'>
                        <i className='fas fa-question-circle fa-sm'></i>
                      </Button>
                    </OverlayTrigger>
                  </div>
                </div>{' '}
                <div><span
                  className={`profit-loss-value ${profit > 0
                    ? 'text-success'
                    : profit < 0
                      ? 'text-danger'
                      : ''
                    }`}>
                  {profit > 0 ? '+' : ''}
                  {profit} points
                </span>
                  <div
                    className='fs-9'
                    title={
                      item.entry_time
                        ? moment(item.entry_time).format()
                        : ''
                    }>
                    {item.entry_time
                      ? moment(item.entry_time).format('MM/DD/YYYY HH:mm')
                      : ''}
                  </div>
                </div>

              </div>
            </div>
          );
        }
      );
    }

    const closedTradeWrappers = Object.values(closedTrades[0]).map(
      (stat, index) => {
        var profit = stat.profit;
        if (!profit) {
          if (stat.order_type == 'CALL') {
            profit = stat.exit_price - stat.entry_price;
          } else if (stat.order_type == 'PUT') {
            profit = stat.entry_price - stat.exit_price;
          }
        };

        return (
          <div
            key={`closed-trade-pnl-` + index}
            className='profit-loss-wrapper pt-2 pl-2 pr-2 pb-0'>
            <div className='profit-loss-wrapper-body'>
              <div>
                <span><b>{stat.symbol}</b></span><br />
                <span className={`${stat.order_type == 'CALL'
                  ? 'text-success'
                  : 'text-warning'
                  } text-truncate`}>{stat.order_type}</span><br />
                <span>Entry ${stat.entry_price}</span><br />
                <span>Exit ${stat.exit_price}</span><br />
                <span>Order Id {stat.entry_order_id}</span><br />
                <div className='fs-9 note'>
                  <span>Logic: #{stat.logic}</span>{' '}
                  <OverlayTrigger
                    trigger='click'
                    key='profit-loss-overlay'
                    placement='bottom'
                    overlay={
                      <Popover id='profit-loss-overlay-right'>
                        <Popover.Content>
                          {stat.note}
                        </Popover.Content>
                      </Popover>
                    }>
                    <Button
                      variant='link'
                      className='p-0 m-0 ml-1 text-info align-baseline'>
                      <i className='fas fa-question-circle fa-sm'></i>
                    </Button>
                  </OverlayTrigger>
                </div>
              </div>

              <div className='profit-loss-value'>
                <span
                  className={`${profit > 0
                    ? 'text-success'
                    : profit < 0
                      ? 'text-danger'
                      : ''
                    }`}>
                  {profit > 0 ? '+' : ''}
                  {profit} points
                </span>
                <div
                  className='fs-9'
                  title={
                    stat.entry_time
                      ? moment(stat.entry_time).format()
                      : ''
                  }>
                  {stat.entry_time
                    ? moment(stat.entry_time).format('MM/DD/YYYY HH:mm')
                    : ''}
                </div>

              </div>
            </div>
          </div>
        );
      }
    );

    return (
      <div className='profit-loss-container'>
        <div className='accordion-wrapper profit-loss-accordion-wrapper profit-loss-open-trades-accordion-wrapper'>
          <Accordion defaultActiveKey='0'>
            <Card bg='dark'>
              <Card.Header className='px-2 py-1'>
                <div className='d-flex flex-row justify-content-between'>
                  <div className='flex-column-left'>
                    <div className='btn-profit-loss text-uppercase text-left font-weight-bold'>
                      <span>Open Orders</span>{' '}
                      <OverlayTrigger
                        trigger='click'
                        key='profit-loss-overlay'
                        placement='bottom'
                        overlay={
                          <Popover id='profit-loss-overlay-right'>
                            <Popover.Content>
                              This section displays the open orders.
                            </Popover.Content>
                          </Popover>
                        }>
                        <Button
                          variant='link'
                          className='p-0 m-0 ml-1 text-info align-baseline'>
                          <i className='fas fa-question-circle fa-sm'></i>
                        </Button>
                      </OverlayTrigger>
                    </div>
                  </div>
                </div>
              </Card.Header>

              <Accordion.Collapse eventKey='0'>
                <Card.Body className='d-flex flex-column py-2 px-0 card-body'>
                  <div className='profit-loss-wrappers profit-loss-open-trades-wrappers'>
                    {_.isEmpty(openTrades) ? (
                      <div className='text-center w-100 m-3'>
                        Not Found Open Order.
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
        <div className='accordion-wrapper profit-loss-accordion-wrapper profit-loss-closed-trades-accordion-wrapper'>
          <Accordion defaultActiveKey='0'>
            <Card bg='dark'>
              <Card.Header className='px-2 py-1'>
                <div className='d-flex flex-row justify-content-between'>
                  <div className='flex-column-left'>
                    <div className='btn-profit-loss text-uppercase font-weight-bold'>
                      Closed Orders
                      <OverlayTrigger
                        trigger='click'
                        key='profit-loss-overlay'
                        placement='bottom'
                        overlay={
                          <Popover id='profit-loss-overlay-right'>
                            <Popover.Content>This section displays the closed orders.</Popover.Content>
                          </Popover>
                        }>
                        <Button
                          variant='link'
                          className='p-0 m-0 ml-1 text-info align-baseline'>
                          <i className='fas fa-question-circle fa-sm'></i>
                        </Button>
                      </OverlayTrigger>
                    </div>
                  </div>
                  <div className='flex-column-right pt-2'>
                    <button
                      type='button'
                      className={`btn btn-period ml-1 btn-sm ${selectedPeriod === 'd' ? 'btn-info' : 'btn-light'
                        }`}
                      onClick={() => this.setSelectedPeriod('d')}
                      title='Day'>
                      D
                    </button>
                    <button
                      type='button'
                      className={`btn btn-period ml-1 btn-sm ${selectedPeriod === 'w' ? 'btn-info' : 'btn-light'
                        }`}
                      onClick={() => this.setSelectedPeriod('w')}
                      title='Week'>
                      W
                    </button>
                    <button
                      type='button'
                      className={`btn btn-period ml-1 btn-sm ${selectedPeriod === 'm' ? 'btn-info' : 'btn-light'
                        }`}
                      onClick={() => this.setSelectedPeriod('m')}
                      title='Month'>
                      M
                    </button>
                    <button
                      type='button'
                      className={`btn btn-period ml-1 btn-sm ${selectedPeriod === 'a' ? 'btn-info' : 'btn-light'
                        }`}
                      onClick={() => this.setSelectedPeriod('a')}
                      title='All'>
                      All
                    </button>
                  </div>
                </div>
              </Card.Header>

              <Accordion.Collapse eventKey='0'>
                <Card.Body className='d-flex flex-column py-2 px-0 card-body'>
                  <div className='profit-loss-wrappers profit-loss-open-trades-wrappers'>
                    {closedTradesLoading === true || _.isEmpty(closedTrades) ? (
                      <div className='text-center w-100 m-3'>
                        <Spinner
                          animation='border'
                          role='status'
                          style={{ width: '3rem', height: '3rem' }}>
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
