/* eslint-disable no-unused-vars */
/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */
class SettingIconGridBuy extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      gridTrade: [],
      validation: []
    };

    this.handleInputChange = this.handleInputChange.bind(this);

    this.onAddGridTrade = this.onAddGridTrade.bind(this);
    this.onRemoveGridTrade = this.onRemoveGridTrade.bind(this);
    this.postProcessGridTrade = this.postProcessGridTrade.bind(this);
    //this.validateGridTrade = this.validateGridTrade.bind(this);
  }

  componentDidUpdate(nextProps) {
    // Only update configuration, when the modal is closed and different.
    if (
      (_.isEmpty(nextProps.gridTrade) === false &&
        _.isEqual(nextProps.gridTrade, this.state.gridTrade) === false)
    ) {
      const { gridTrade } = nextProps;

      const newGridTrade = this.postProcessGridTrade(
        gridTrade
      );
      this.setState({
        gridTrade: newGridTrade
      });
      //this.validateGridTrade(newGridTrade);
    }
  }

  handleInputChange(event) {
    const target = event.target;
    const value =
      target.type === 'checkbox'
        ? target.checked
        : target.type === 'number'
          ? +target.value
          : target.value;
    const stateKey = target.getAttribute('data-state-key');

    const { gridTrade } = this.state;

    const newGridTrade = _.set(gridTrade, stateKey, value);

    this.setState({
      gridTrade: newGridTrade
    });
    //this.validateGridTrade(newGridTrade);

    this.props.handleGridTradeChange('buy', newGridTrade);
  }

  onAddGridTrade(_event) {
    const { gridTrade } = this.state;
    const lastGridTrade = _.cloneDeep(_.last(gridTrade));
    let newGridTrade;
    if (lastGridTrade) {
      // If the logic trade has existing grid data, then use the last row to create new logic trade.
      newGridTrade = _.concat(gridTrade, lastGridTrade);
    } else {
      newGridTrade = _.concat(gridTrade, {
        enabled: false,
        stoploss: 0,
        stoploss_strong: 0
      });
    }

    newGridTrade = this.postProcessGridTrade(
      newGridTrade
    );

    this.setState({
      gridTrade: newGridTrade
    });

    //this.validateGridTrade(newGridTrade);
    this.props.handleGridTradeChange('buy', newGridTrade);
  }

  onRemoveGridTrade(index) {
    const { gridTrade } = this.state;

    _.pullAt(gridTrade, index);

    this.setState({
      gridTrade
    });
    //this.validateGridTrade(gridTrade);
    this.props.handleGridTradeChange('buy', gridTrade);
  }

  postProcessGridTrade(gridTrade) {
    // If any value is empty, then do not post process.
    if (
      _.isEmpty(gridTrade)
    ) {
      return gridTrade;
    }

    return gridTrade.map(grid => {


      return grid;
    });
  }

  /**
   * Validate logic trade for calling
   *
   *  - Only 1st trigger percentage can be above or equal to 1.
   *  - The stop price percentage cannot be higher than the stop price percentage.
   *  - Call amount cannot be less than the minimum notional value.
   */
  validateGridTrade(gridTrade) {

    const validation = [];

    let isValid = true;

    gridTrade.forEach((grid, index) => {
      const v = {
        messages: [],
        enabled: true,
        stoploss: 0,
        stoploss_strong: 0

      };

      const humanisedIndex = index + 1;

      if (index === 0) {
        // If it is the first logic trade and the trigger percentage is less than 1,
        isValid = false;
        v.enabled = false;
        //v.messages.push(
        //  `The trigger percentage for Grid #${humanisedIndex} cannot be less than 1.`
        //);
      }




      validation.push(v);
    });

    this.setState({
      validation
    });
    this.props.handleSetValidation('gridCall', isValid);
  }

  render() {
    const { gridTrade, validation } = this.state;

    const gridRows = gridTrade.map((grid, i) => {

      const validationText = _.get(validation, `${i}.messages`, []).reduce(
        (acc, message, k) => [
          ...acc,
          <div
            key={'error-message-' + i + '-' + k}
            className='field-error-message text-danger'>
            <i className='fas fa-exclamation-circle mx-1'></i>
            {message}
          </div>
        ],
        []
      );

      return (
        <React.Fragment key={'grid-row-call-' + i}>
          <tr>
            <td className='align-middle font-weight-bold' width='90%'>
              <div className='row'>
                <div className='col-xs-12 col-sm-6'>
                  <Form.Group
                    controlId={'field-grid-call-' + i + '-enabled'}
                    className='mb-2'>
                    <Form.Check size='sm'>
                      <Form.Check.Input
                        type='checkbox'
                        data-state-key={`${i}.call.enabled`}
                        value={grid.triggerPercentage}
                        checked={grid.call && grid.call.enabled}
                        onChange={this.handleInputChange}
                      />
                      <Form.Check.Label>
                        Logic CALL #{i + 1} {' '}
                        <OverlayTrigger
                          trigger='click'
                          key='call-enabled-overlay'
                          placement='bottom'
                          overlay={
                            <Popover id={`${i}-call-enabled-overlay-right`}>
                              <Popover.Content>
                                If enabled, the bot will purchase the
                                ticker when it detects the call signal. If
                                disabled, the bot will not purchase the
                                coin, but continue to monitoring. When
                                the market is volatile, you can disable
                                it temporarily.
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
            </td>
            <td className='align-middle text-center'>
              {i !== 0 ? (
                <button
                  type='button'
                  className='btn btn-sm btn-link p-0'
                  onClick={() => this.onRemoveGridTrade(i)}>
                  <i className='fas fa-times-circle text-danger'></i>
                </button>
              ) : (
                ''
              )}
            </td>
          </tr>
          <tr>
            <td colSpan='2'>
              <div className='row'>

                <div className='col-xs-12 col-sm-6'>
                  <Form.Group
                    controlId={'field-grid-call-' + i + '-stop-loss'}
                    className='mb-2'>
                    <Form.Label className='mb-0'>
                      Stop loss{' '}
                      <OverlayTrigger
                        trigger='click'
                        key={
                          'field-grid-call-' +
                          i +
                          '-stop-loss-overlay'
                        }
                        placement='bottom'
                        overlay={
                          <Popover
                            id={
                              'field-grid-call-' +
                              i +
                              '-stop-loss-overlay-right'
                            }>
                            <Popover.Content>
                              Set the stop loss point.
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
                      type='number'
                      placeholder='Enter stop loss'
                      required
                      min='0'
                      step='0.5'
                      isInvalid={
                        _.get(validation, `${i}.stoploss`, true) === false
                      }
                      data-state-key={`${i}.stoploss`}
                      value={grid.stoploss}
                      onChange={this.handleInputChange}
                    />
                  </Form.Group>
                </div>
                <div className='col-xs-12 col-sm-6'>
                  <Form.Group
                    controlId={'field-grid-call-' + i + '-stoploss-strong'}
                    className='mb-2'>
                    <Form.Label className='mb-0'>
                      Stoploss Strong{' '}
                      <OverlayTrigger
                        trigger='click'
                        key={
                          'field-grid-call-' +
                          i +
                          '-stoploss-strong-overlay'
                        }
                        placement='bottom'
                        overlay={
                          <Popover
                            id={
                              'field-grid-call-' +
                              i +
                              '-stoploss-strong-overlay-right'
                            }>
                            <Popover.Content>
                              Set the point in.
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
                      type='number'
                      placeholder='Enter stoploss when market strong'
                      required
                      min='0'
                      step='0.5'
                      isInvalid={
                        _.get(validation, `${i}.stoploss_strong`, true) === false
                      }
                      data-state-key={`${i}.stoploss_strong`}
                      value={grid.stoploss_strong}
                      onChange={this.handleInputChange}
                    />
                  </Form.Group>
                </div>

                {validationText !== '' ? (
                  <div className='col-12'>{validationText}</div>
                ) : (
                  ''
                )}
              </div>
            </td>
          </tr>
        </React.Fragment>
      );
    });

    return (
      <div className='ticker-info-grid-trade-wrapper ticker-info-grid-trade-call-wrapper'>
        <Table striped bordered hover size='sm'>
          <tbody>{gridRows}</tbody>
        </Table>
        <div className='row'>
          <div className='col-12 text-right'>
            <button
              type='button'
              className='btn btn-sm btn-add-new-grid-trade-call'
              onClick={this.onAddGridTrade}>
              Add new logic call
            </button>
          </div>
        </div>
      </div>
    );
  }
}
