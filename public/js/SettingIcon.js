/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class SettingIcon extends React.Component {
  constructor(props) {
    super(props);

    this.modalToStateMap = {
      setting: 'showSettingModal',
      confirm: 'showConfirmModal'
    };

    this.state = {
      showSettingModal: false,
      showConfirmModal: false,
      configuration: {},
      rawConfiguration: {},
      validation: {},
      exchangeSymbols: {}
    };

    this.handleModalShow = this.handleModalShow.bind(this);
    this.handleModalClose = this.handleModalClose.bind(this);

    this.handleFormSubmit = this.handleFormSubmit.bind(this);
    this.handleInputChange = this.handleInputChange.bind(this);
    this.handleGridTradeChange = this.handleGridTradeChange.bind(this);
    //this.handleBotOptionsChange = this.handleBotOptionsChange.bind(this);

    this.handleSetValidation = this.handleSetValidation.bind(this);
  }


  isConfigChanged(nextProps) {
    if (
      this.state.showSettingModal === false &&
      _.isEmpty(nextProps.configuration) === false &&
      _.isEqual(nextProps.configuration, this.state.rawConfiguration) === false
    ) {
      return true;
    }

    return false;
  }

  isExchangeSymbolsChanged(nextProps) {
    if (
      _.isEmpty(nextProps.exchangeSymbols) === false &&
      _.isEqual(nextProps.exchangeSymbols, this.state.exchangeSymbols) === false
    ) {
      return true;
    }

    return false;
  }

  componentDidUpdate(nextProps) {
    if (this.isExchangeSymbolsChanged(nextProps)) {
      const { exchangeSymbols, configuration } = nextProps;
      const { symbols: selectedSymbols } = configuration;


      this.setState({
        exchangeSymbols
      });
    }

    // Only update configuration, when the modal is closed and different.
    if (this.isConfigChanged(nextProps)) {
      const { configuration: rawConfiguration } = nextProps;
      const configuration = _.cloneDeep(rawConfiguration);

      this.setState({
        configuration,
        rawConfiguration
      });
    }
  }

  handleFormSubmit(extraConfiguration = {}) {
    this.handleModalClose('confirm');
    this.handleModalClose('setting');
    this.props.sendWebSocket('setting-update', {
      ...this.state.configuration,
      ...extraConfiguration
    });
  }

  componentDidMount() {
    this.props.sendWebSocket('exchange-symbols-get');
  }

  handleModalShow(modal) {
    if (modal === 'setting') {
      this.props.sendWebSocket('exchange-symbols-get');
    }

    this.setState({
      [this.modalToStateMap[modal]]: true
    });
  }

  handleModalClose(modal) {
    this.setState({
      [this.modalToStateMap[modal]]: false
    });
  }

  handleInputChange(event) {
    const target = event.target;
    const value =
      target.type === 'checkbox'
        ? target.checked
        : target.type === 'number'
          ? +target.value
          : target.value;

    debugger;
    const stateKey = target.getAttribute('data-state-key');

    const { configuration } = this.state;

    this.setState({
      configuration: _.set(configuration, stateKey, value)
    });
  }

  handleGridTradeChange(type, newGrid) {
    const { configuration } = this.state;

    this.setState({
      configuration: _.set(configuration, `${type}.gridTrade`, newGrid)
    });
  }


  handleBotOptionsChange(newBotOptions) {
    const { configuration } = this.state;

    this.setState({
      configuration: _.set(configuration, 'botOptions', newBotOptions)
    });
  }

  handleSetValidation(type, isValid) {
    const { validation } = this.state;
    this.setState({ validation: { ...validation, [type]: isValid } });
  }

  render() {
    const { isAuthenticated, exchangeSymbols } = this.props;

    const { configuration, validation } = this.state;
    const { symbols: selectedSymbols } = configuration;

    if (_.isEmpty(configuration) || isAuthenticated === false) {
      return '';
    }

    // Check validation if contains any false
    const isValid = Object.values(validation).includes(false) === false;

    return (
      <div className='header-column-icon-wrapper setting-wrapper'>
        <button
          type='button'
          className='btn btn-sm btn-link p-0 pl-1 pr-1'
          onClick={() => this.handleModalShow('setting')}>
          <i className='fas fa-cog'></i>
        </button>
        <Modal
          show={this.state.showSettingModal}
          onHide={() => this.handleModalClose('setting)')}
          size='xl'>
          <Form>
            <Modal.Header className='pt-1 pb-1'>
              <Modal.Title>Global Settings</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Accordion defaultActiveKey='0'>
                <Card className='mt-1'>
                  <Card.Header className='px-2 py-1'>
                    <Accordion.Toggle
                      as={Button}
                      variant='link'
                      eventKey='0'
                      className='p-0 fs-7 text-uppercase'>
                      Bot Setting
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey='0'>
                    <Card.Body className='px-2 py-1'>
                      <div className='row'>
                        <div className='col-6'>
                          <Form.Group
                            controlId='field-force-exit-all-at-13h'
                            className='mb-2'>
                            <Form.Check size='sm'>
                              <Form.Check.Input
                                type='checkbox'
                                data-state-key='botOptions.stop_bot'
                                checked={
                                  configuration.botOptions.stop_bot
                                }
                                onChange={this.handleInputChange}
                              />
                              <Form.Check.Label>
                                Stop Bot
                                <OverlayTrigger
                                  trigger='click'
                                  key='stop-bot'
                                  placement='bottom'
                                  overlay={
                                    <Popover id='stop-bot'>
                                      <Popover.Content>
                                        If enabled, the bot will be stopped trading.
                                      </Popover.Content>
                                    </Popover>
                                  }>
                                  <Button
                                    variant='link'
                                    className='p-0 m-0 ml-1 text-info'>
                                    <i className='fas fa-question-circle fa-sm'></i>
                                  </Button>
                                </OverlayTrigger>
                              </Form.Check.Label>
                            </Form.Check>
                          </Form.Group>
                        </div>

                      </div>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              </Accordion>

              <Accordion defaultActiveKey='0'>
                <Card className='mt-1'>
                  <Card.Header className='px-2 py-1'>
                    <Accordion.Toggle
                      as={Button}
                      variant='link'
                      eventKey='0'
                      className='p-0 fs-7 text-uppercase'>
                      Authentication Setting
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey='0'>
                    <Card.Body className='px-2 py-1'>
                      <div className='row'>
                        <div className='col-6'>
                          <Form.Group
                            controlId='field-candles-limit'
                            className='mb-2'>
                            <Form.Label className='mb-0'>
                              Token
                              <OverlayTrigger
                                trigger='click'
                                key='limit-share'
                                placement='bottom'
                                overlay={
                                  <Popover id='limit-share-right'>
                                    <Popover.Content>
                                      Set user auth token (in 'sessionid' cookie when you login by browsers).
                                    </Popover.Content>
                                  </Popover>
                                }>
                                <Button
                                  variant='link'
                                  className='p-0 m-0 ml-1 text-info'>
                                  <i className='fas fa-question-circle fa-sm'></i>
                                </Button>
                              </OverlayTrigger>
                            </Form.Label>
                            <Form.Control
                              size='sm'

                              placeholder='Enter token'
                              required
                              data-state-key='botOptions.token'
                              value={configuration.botOptions && configuration.botOptions.token}
                              onChange={this.handleInputChange}
                            />
                          </Form.Group>
                        </div>
                      </div>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              </Accordion>

              <Accordion defaultActiveKey='0'>
                <Card className='mt-1' style={{ overflow: 'visible' }}>
                  <Card.Header className='px-2 py-1'>
                    <Accordion.Toggle
                      as={Button}
                      variant='link'
                      eventKey='0'
                      className='p-0 fs-7 text-uppercase'>
                      Symbol Setting
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey='0'>
                    <Card.Body className='px-2 py-1'>
                      <div className='row'>
                        <div className='col-6'>
                          <Form.Group
                            controlId='field-candles-interval'
                            className='mb-2'>
                            <Form.Label className='mb-0'>
                              Symbol
                              <OverlayTrigger
                                trigger='click'
                                key='interval-overlay'
                                placement='bottom'
                                overlay={
                                  <Popover id='interval-overlay-right'>
                                    <Popover.Content>
                                      Set symbol for trading auto.
                                    </Popover.Content>
                                  </Popover>
                                }>
                                <Button
                                  variant='link'
                                  className='p-0 m-0 ml-1 text-info'>
                                  <i className='fas fa-question-circle fa-sm'></i>
                                </Button>
                              </OverlayTrigger>
                            </Form.Label>
                            <Form.Control
                              size='sm'
                              placeholder='Enter symbol'
                              required
                              data-state-key='candles.symbol'
                              value={configuration.candles && configuration.candles.symbol}
                              onChange={this.handleInputChange}
                            />
                          </Form.Group>
                        </div>
                        <div className='col-6'>
                          <Form.Group
                            controlId='field-candles-interval'
                            className='mb-2'>
                            <Form.Label className='mb-0'>
                              Interval
                              <OverlayTrigger
                                trigger='click'
                                key='interval-overlay'
                                placement='bottom'
                                overlay={
                                  <Popover id='interval-overlay-right'>
                                    <Popover.Content>
                                      Set candle interval for trading auto.
                                    </Popover.Content>
                                  </Popover>
                                }>
                                <Button
                                  variant='link'
                                  className='p-0 m-0 ml-1 text-info'>
                                  <i className='fas fa-question-circle fa-sm'></i>
                                </Button>
                              </OverlayTrigger>
                            </Form.Label>
                            <Form.Control
                              size='sm'
                              as='select'
                              required
                              data-state-key='candles.interval'
                              value={configuration.candles && configuration.candles.interval}
                              onChange={this.handleInputChange}>
                              <option value='1'>1m</option>
                              <option value='2'>2m</option>
                              <option value='3'>3m</option>
                              <option value='5'>5m</option>
                              <option value='10'>10m</option>
                              <option value='13'>13m</option>
                              <option value='15'>15m</option>
                              <option value='30'>30m</option>
                              <option value='60'>1h</option>
                              <option value='120'>2h</option>
                              <option value='240'>4h</option>
                              <option value='1D'>1D</option>
                              <option value='1W'>1W</option>
                              <option value='1M'>1M</option>
                            </Form.Control>
                          </Form.Group>
                        </div>
                      </div>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              </Accordion>


              <Accordion defaultActiveKey='0'>
                <Card className='mt-1'>
                  <Card.Header className='px-2 py-1'>
                    <Accordion.Toggle
                      as={Button}
                      variant='link'
                      eventKey='0'
                      className='p-0 fs-7 text-uppercase'>
                      CALL Configurations
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey='0'>
                    <Card.Body className='px-2 py-1'>
                      <div className='row'>
                        <div className='col-12'>
                          <SettingIconGridBuy
                            gridTrade={configuration.buy.gridTrade}
                            handleSetValidation={this.handleSetValidation}
                            handleGridTradeChange={this.handleGridTradeChange}
                          />
                        </div>
                        <div className='col-12'>
                          <hr />
                        </div>




                      </div>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              </Accordion>

              <Accordion defaultActiveKey='0'>
                <Card className='mt-1'>
                  <Card.Header className='px-2 py-1'>
                    <Accordion.Toggle
                      as={Button}
                      variant='link'
                      eventKey='0'
                      className='p-0 fs-7 text-uppercase'>
                      PUT Configurations
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey='0'>
                    <Card.Body className='px-2 py-1'>
                      <div className='row'>
                        <div className='col-12'>
                          <SettingIconGridSell
                            gridTrade={configuration.sell.gridTrade}
                            handleSetValidation={this.handleSetValidation}
                            handleGridTradeChange={this.handleGridTradeChange}
                          />
                        </div>
                        <div className='col-12'>
                          <hr />
                        </div>

                        <div className='col-12'>
                          <Accordion defaultActiveKey='0'>
                            <Card className='mt-1'>
                              <Card.Header className='px-2 py-1'>
                                <Accordion.Toggle
                                  as={Button}
                                  variant='link'
                                  eventKey='0'
                                  className='p-0 fs-7 text-uppercase'>
                                  Exit All
                                </Accordion.Toggle>
                              </Card.Header>
                              <Accordion.Collapse eventKey='0'>
                                <Card.Body className='px-2 py-1'>
                                  <div className='row'>
                                    <div className='col-12'>
                                      <Form.Group
                                        controlId='field-force-exit-all-at-13h'
                                        className='mb-2'>
                                        <Form.Check size='sm'>
                                          <Form.Check.Input
                                            type='checkbox'
                                            data-state-key='sell.tradingView.forceExitAll13h'
                                            checked={
                                              configuration.sell.tradingView.forceExitAll13h
                                            }
                                            onChange={this.handleInputChange}
                                          />
                                          <Form.Check.Label>
                                            Force exit at 13:00
                                            <OverlayTrigger
                                              trigger='click'
                                              key='exit-all-at-13h'
                                              placement='bottom'
                                              overlay={
                                                <Popover id='exit-all-at-13h-right'>
                                                  <Popover.Content>
                                                    If enabled, the bot will exit
                                                    all order at 13:00.
                                                  </Popover.Content>
                                                </Popover>
                                              }>
                                              <Button
                                                variant='link'
                                                className='p-0 m-0 ml-1 text-info'>
                                                <i className='fas fa-question-circle fa-sm'></i>
                                              </Button>
                                            </OverlayTrigger>
                                          </Form.Check.Label>
                                        </Form.Check>
                                      </Form.Group>
                                    </div>

                                  </div>
                                </Card.Body>
                              </Accordion.Collapse>
                            </Card>
                          </Accordion>
                        </div>
                      </div>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              </Accordion>

              {/*                                
              <SettingIconBotOptions
                botOptions={configuration.botOptions}
                handleBotOptionsChange={this.handleBotOptionsChange}
              /> <SettingIconActions />*/}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => this.handleModalClose('setting')}>
                Close
              </Button>
              <Button
                variant='primary'
                size='sm'
                onClick={() => this.handleModalShow('confirm')}>
                Save Changes
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        <Modal
          show={this.state.showConfirmModal}
          onHide={() => this.handleModalClose('confirm')}
          size='md'>
          <Modal.Header className='pt-1 pb-1'>
            <Modal.Title>
              <span className='text-danger'>⚠ Save Changes</span>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Warning: If you apply to save the configuration, the bot will be restarted.
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => this.handleModalClose('confirm')}>
              Cancel
            </Button>
            <Button
              variant='primary'
              size='sm'
              onClick={() =>
                this.handleFormSubmit({
                  action: 'apply-to-global-only'
                })
              }>
              Apply now
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    );
  }
}
