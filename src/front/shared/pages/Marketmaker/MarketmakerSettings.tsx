import React, { Component, Fragment } from 'react'
import CSSModules from 'react-css-modules'

import { BigNumber } from 'bignumber.js'

import { connect } from 'redaction'
import actions from 'redux/actions'

import SwapApp from 'swap.app'
import Swap from 'swap.swap'

import { constants, links } from 'helpers'
import config from 'helpers/externalConfig'


import styles from './MarketmakerSettings.scss'

import { FormattedMessage, injectIntl, defineMessages } from 'react-intl'

import SwapRow from './SwapRow'
import FAQ from './FAQ'

import Toggle from 'components/controls/Toggle/Toggle'
import InlineLoader from 'components/loaders/InlineLoader/InlineLoader'
import Input from 'components/forms/Input/Input'

import { AddressType } from 'domain/address'

import metamask from 'helpers/metamask'
import { Button } from 'components/controls'

const isDark = !!localStorage.getItem(constants.localStorage.isDark)


@CSSModules(styles, { allowMultiple: true })
class MarketmakerSettings extends Component<any, any> {
  _mounted = true
  _handleSwapAttachedHandle = null
  _handleSwapEnterStep = null
  _metamaskEnabled = false

  constructor(props) {
    super(props)

    const {
      items,
      match: {
        params: {
          token: marketToken = "usdt",
        }
      }
    } = props

    const mnemonic = localStorage.getItem(constants.privateKeyNames.twentywords)
    const mnemonicSaved = (mnemonic === `-`)

    this._handleSwapAttachedHandle = this.onSwapAttachedHandle.bind(this)
    this._handleSwapEnterStep = this.onSwapEnterStep.bind(this)

    this.state = {
      swapsIds: [],
      swapsByIds: {},
      marketToken,
      btcWallet: null,
      btcBalance: 0,
      tokenWallet: null,
      tokenBalance: 0,
      ethBalance: 0,
      isBalanceFetching: false,
      isMarketEnabled: false,
      isEthBalanceOk: false,
      isBtcBalanceOk: false,
      isTokenBalanceOk: false,
      marketSpread: 0.1, // 10% spread
      mnemonicSaved,
    }
  }

  extractSwapStatus(swap) {
    const {
      id,
      isMy,
      isTurbo,
      buyCurrency,
      sellCurrency,
      buyAmount,
      sellAmount,
      createUnixTimeStamp,
      flow: {
        state,
      },
    } = swap
    return {
      id,
      isMy,
      buyCurrency,
      sellCurrency,
      buyAmount,
      sellAmount,
      createUnixTimeStamp,
      ...state,
    }
  }

  fetchWalletsWithBalances() {
    const {
      marketToken,
      isBalanceFetching,
    } = this.state

    if (!this._mounted) return

    if (isBalanceFetching) {
      // Если в данный момент идет запрос баланса. ничего не делаем
      // вызываем функуцию повторно через несколько секунд
      // такое может произойти, если пользователь меняет быстро код токена в адресной строке
      // может быть запушен процес запроса баланса для предыдущего токена из адресной строки
      return setTimeout(() => {
        this.fetchWalletsWithBalances()
      }, 2000)
    }
    this.setState({
      isBalanceFetching: true,
    }, () => {
      const btcWallet = actions.core.getWallet({ currency: `btc` })
      const ethWallet = actions.core.getWallet({
        currency: `eth`,
        connected: true,
        addressType: AddressType.Metamask
      })
      const tokenWallet = actions.core.getWallet({
        currency: marketToken,
        connected: true,
        addressType: AddressType.Metamask
      })

      if (!tokenWallet) {
        this.setState({
          isBalanceFetching: false,
        }, () => {
          return setTimeout(() => {
            this.fetchWalletsWithBalances()
          }, 2000)
        })
        return
      }

      this.setState({
        btcWallet,
        ethWallet,
        tokenWallet,
      }, async () => {
        const btcBalance = await actions.core.fetchWalletBalance(btcWallet)
        const ethBalance = await actions.core.fetchWalletBalance(ethWallet)
        const tokenBalance = await actions.core.fetchWalletBalance(tokenWallet)

        // Запрос баланса асинхронный. За это время пользователь мог уже перейти на другую страницу
        // Обновляем стейт только если мы находимся в этом компоненте
        if (this._mounted) {
          this.setState({
            btcBalance,
            ethBalance,
            tokenBalance,
            isBalanceFetching: false
          })
        }
      })
    })
  }

  componentDidUpdate(prevProps) {
    const {
      match: {
        params: {
          token: prevMarketToken = "usdt",
        },
      },
    } = prevProps

    const {
      match: {
        params: {
          token: marketToken = "usdt",
        }
      }
    } = this.props
    if (prevMarketToken.toLowerCase() !== marketToken.toLowerCase()) {
      this.setState({
        marketToken,
        tokenBalance: 0,
        tokenWallet: null,
      }, () => {
        this.fetchWalletsWithBalances()
      })
    }
  }

  componentDidMount() {
    SwapApp.onInit(() => {
      const isMarketEnabled = (SwapApp.shared().services.orders.getMyOrders().length > 0)

      const swapsIds = []
      const swapsByIds = {}

      this.fetchWalletsWithBalances()
      const lsSwapId = JSON.parse(localStorage.getItem('swapId'))

      if (lsSwapId === null || lsSwapId.length === 0) {
        return
      }

      const swapsCore = lsSwapId.map((id) => new Swap(id, SwapApp.shared()))

      SwapApp.shared().attachedSwaps.items.forEach((swap) => {
        const swapState = this.extractSwapStatus(swap)
        swapsIds.push(swapState.id)
        swapsByIds[swapState.id] = swapState
      })

      SwapApp.shared().on('swap attached', this._handleSwapAttachedHandle)
      SwapApp.shared().on('swap enter step', this._handleSwapEnterStep)

      this.setState({
        swapsIds,
        swapsByIds,
        isMarketEnabled,
      })
    })
  }

  onSwapEnterStep(data) {
    if (!this._mounted) return

    const { swap } = data
    const swapState = this.extractSwapStatus(swap)
    const {
      swapsByIds,
    } = this.state
    swapsByIds[swapState.id] = swapState
    this.setState({
      swapsByIds,
    })
  }

  onSwapAttachedHandle(data) {
    if (!this._mounted) return
    const {
      swap,
    } = data

    const {
      swapsIds,
      swapsByIds,
    } = this.state

    if (!swapsByIds[swap.id]) {
      const swapState = this.extractSwapStatus(swap)
      swapsIds.push(swapState.id)
      swapsByIds[swapState.id] = swapState
      this.setState({
        swapsIds,
        swapsByIds,
      })
    }
  }

  componentWillUnmount() {
    this._mounted = false
    SwapApp.shared().off('swap attached', this._handleSwapAttachedHandle)
    SwapApp.shared().off('swap enter step', this._handleSwapEnterStep)
  }

  handleSaveMnemonic() {
    actions.modals.open(constants.modals.SaveMnemonicModal, {
      onClose: () => {
        const mnemonic = localStorage.getItem(constants.privateKeyNames.twentywords)
        const mnemonicSaved = (mnemonic === `-`)

        this.setState({
          mnemonicSaved,
        })
      }
    })
  }

  handleToggleMarketmaker(checked) {
    const { isMarketEnabled } = this.state

    const {
      ethBalance,
      btcBalance,
      tokenBalance,
      marketToken,
    } = this.state

    const isEthBalanceOk = new BigNumber(ethBalance).isGreaterThanOrEqualTo(0.02)
    const isTokenBalanceOk = new BigNumber(tokenBalance).isGreaterThan(0)
    const isBtcBalanceOk = new BigNumber(btcBalance).isGreaterThan(0)

    let hasError = false

    if (!isEthBalanceOk) {
      hasError = true
      actions.modals.open(constants.modals.AlertModal, {
        message: <FormattedMessage id="MM_NotEnoughtEth" defaultMessage="Недостаточно ETH для оплаты коммисии майнеров" />,
      })
    }
    if (!isTokenBalanceOk && !isBtcBalanceOk) {
      hasError = true
      actions.modals.open(constants.modals.AlertModal, {
        message: (
          <FormattedMessage
            id="MM_NotEnoughtCoins"
            defaultMessage="Недостаточно средств. Вам нужно пополнить BTC или {token}"
            values={{
              token: marketToken.toUpperCase(),
            }}
          />
        ),
      })
    }
    if (!hasError) {
      this.setState({
        isMarketEnabled: !isMarketEnabled,
        isBtcBalanceOk,
        isEthBalanceOk,
        isTokenBalanceOk,
      }, () => {
        if (!isMarketEnabled) {
          // New state - On
          this.createMakerMakerOrder()
        } else {
          // New state - Off
          this.cleanupMarketMakerOrder()
        }
      })
    } else {
      this.setState({
        isMarketEnabled: false,
      })
    }
  }

  cleanupMarketMakerOrder() {
    SwapApp.shared().services.orders.getMyOrders().forEach((order) => {
      SwapApp.shared().services.orders.remove(order.id)
    })
  }

  createMakerMakerOrder() {
    // clear old orders
    this.cleanupMarketMakerOrder()
    const {
      tokenBalance,
      marketToken,
      btcBalance,
      ethBalance,
      isBtcBalanceOk,
      isTokenBalanceOk,
      marketSpread,
    } = this.state

    /*
           / 100 - spread[%] \
  price * |  –––––––––––––––  |
           \       100       /
    */
    if (isTokenBalanceOk) {
      const sellTokenExchangeRate =
        new BigNumber(100).minus(
          new BigNumber(100).times(marketSpread)
        ).dividedBy(100).toNumber()

      const sellAmount = new BigNumber(tokenBalance).times(sellTokenExchangeRate).toNumber()

      const sellTokenOrderData = {
        balance: tokenBalance,
        buyAmount: tokenBalance,
        ethBalance,
        exchangeRate: sellTokenExchangeRate,
        isPartial: true,
        isSending: true,
        isTokenBuy: false,
        isTokenSell: true,
        isTurbo: false,
        manualRate: true,
        minimalestAmountForBuy: 0.00038906,
        minimalestAmountForSell: 0.00038906,
        sellAmount,
        buyCurrency: `BTC`,
        sellCurrency: marketToken,
      }
      console.log(sellTokenOrderData)
      const sellOrder = SwapApp.shared().services.orders.create(sellTokenOrderData)
      console.log('sellOrder', sellOrder)
      actions.core.setupPartialOrder(sellOrder)
    }
    if (isBtcBalanceOk) {
      const buyTokenExchangeRate =
        new BigNumber(100).plus(
          new BigNumber(100).times(marketSpread)
        ).dividedBy(100).toNumber()

      const buyAmount = new BigNumber(btcBalance).times(buyTokenExchangeRate).toNumber()

      const buyTokenOrderData = {
        balance: btcBalance,
        sellAmount: btcBalance,
        ethBalance,
        exchangeRate: buyTokenExchangeRate,
        isPartial: true,
        isSending: true,
        isTokenBuy: true,
        isTokenSell: false,
        isTurbo: false,
        manualRate: true,
        minimalestAmountForBuy: 0.00038906,
        minimalestAmountForSell: 0.00038906,
        buyAmount,
        sellCurrency: `BTC`,
        buyCurrency: marketToken,
      }
      console.log(buyTokenOrderData)
      const buyOrder = SwapApp.shared().services.orders.create(buyTokenOrderData)
      console.log('buyOrder', buyOrder)
      actions.core.setupPartialOrder(buyOrder)
    }
  }

  processDisconnectWallet() {
    metamask.handleDisconnectWallet(() => {
      this.fetchWalletsWithBalances()
    })
  }

  processConnectWallet() {
    metamask.handleConnectMetamask({
      dontRedirect: true,
      cbFunction: (isConnected) => {
        if (isConnected) {
          this.fetchWalletsWithBalances()
        }
      },
    })
  }

  render() {
    const {
      swapsIds,
      swapsByIds,
      btcWallet,
      ethWallet,
      btcBalance,
      tokenWallet,
      tokenBalance,
      ethBalance,
      marketToken,
      isBalanceFetching,
      isMarketEnabled,
      mnemonicSaved,
    } = this.state

    const totalBalance = new BigNumber(btcBalance).plus(tokenBalance).toNumber()

    const sortedSwaps = swapsIds.sort((aId, bId) => {
      return swapsByIds[bId].createUnixTimeStamp - swapsByIds[aId].createUnixTimeStamp
    })
    return (
      <div styleName='mm-settings-page'>
        <h2 styleName="section-title">Настройки маркетмейкинга</h2>
        <section styleName={`${isDark ? 'dark' : '' }`}>
        {!mnemonicSaved && (
          <>
            <p>
              <FormattedMessage
                id="MM_NeedSaveMnemonic"
                defaultMessage="We will create BTC,ETH,WBTC hot wallets. You need to write 12 words if you have not done so earlier"
              />
            </p>
            <div styleName='restoreBtn'>
              <Button blue onClick={this.handleSaveMnemonic.bind(this)}>
                <FormattedMessage
                  id="MM_MakeSaveMnemonic"
                  defaultMessage="Сохранить секретную фразу"
                />
              </Button>
            </div>
          </>
        )}
        {!isBalanceFetching && mnemonicSaved ? (
          <div styleName={`section-items ${isDark ? '--dark' : '' }`}>
            <div styleName='section-items__item'>
              <div styleName={`mm-toggle ${isDark ? '--dark' : '' }`}>
                <p styleName='mm-toggle__text'>
                  Маркетмейкинг BTC/WBTC
                </p>
                <span styleName='mm-toggle__switch'>
                  <Toggle checked={isMarketEnabled} onChange={this.handleToggleMarketmaker.bind(this)} />
                </span>
              </div>
              <p styleName='item-text__secondary'>Спред: 0.5% (по умолчанию стоит 0.5%)</p>
            </div>
            <div styleName='section-items__item'>
              <p styleName='item-text__secondary-title'>
                <FormattedMessage
                  id="MM_TotalBalance"
                  defaultMessage="Total balance:"
                />
              </p>
              <p>
                <span styleName='item__balance'>{totalBalance}</span>
                {' '}
                <span styleName='item-text__secondary'>{marketToken.toUpperCase()}, BTC</span>
              </p>
            </div>
            <div styleName='section-items__item'>
              {btcWallet ? (
                  <>
                    <p styleName='item-text__secondary-title'>
                      Баланс BTC:
                    </p>
                    <p>
                      <span id='btcBalance' styleName='item__balance'>{btcBalance}</span>
                      {' '}
                      <span styleName='item-text__secondary'>BTC</span>
                    </p>
                    <p styleName='item-text__secondary'>для попленения переведите на {btcWallet.address}</p>
                  </>
                ) : (
                  <>
                    <p styleName='item-text__secondary-title'>
                      Баланс BTC:
                    </p>
                    <p>
                      <span id='btcBalance' styleName='item__balance'>{btcBalance}</span>
                      {' '}
                      <span styleName='item-text__secondary'>BTC</span>
                    </p>
                  </>
                )
              }
            </div>
            <div styleName='section-items__item'>
              <p styleName='item-text__secondary-title'>
                Баланс {marketToken.toUpperCase()}:
              </p>
              <p>
                <span id='tokenBalance' styleName='item__balance'>{tokenBalance}</span>
                {' '}
                <span styleName='item-text__secondary'>{marketToken.toUpperCase()}</span>
              </p>
              {this._metamaskEnabled && (
                <div style={{ marginBottom: '15px' }}>
                {metamask.isConnected() ? (
                    <Button blue onClick={this.processDisconnectWallet.bind(this)}>Отключить Metamask</Button>
                  ) : (
                    <Button blue onClick={this.processConnectWallet.bind(this)}>Подключить Metamask</Button>
                  )
                }
                </div>
              )}
              {ethWallet ? (
                  <>
                    <span styleName='item-text__secondary'>Баланс ETH: {ethBalance}</span>
                    <p styleName='item-text__secondary'>для пополнения переведите на {ethWallet.address}</p>
                  </>
                ) : (
                  <p styleName='item-text__secondary'>Баланс ETH: {ethBalance}</p>
                )
              }
            </div>
          </div>
        ) : (
          <>
            {mnemonicSaved && (
              <div styleName='controlsLoader'>
                <InlineLoader />
              </div>
            )}
          </>
        )}
        </section>

        {/* Swaps history + Active swaps */}
        <section styleName={`${isDark ? 'dark' : '' }`}>
          <h2 styleName="section-title">Swap history</h2>
          <table styleName="swapHistory">
            <thead>
              <tr>
                <td>
                  <p>You buy</p>
                </td>
                <td>
                  <p>Step</p>
                </td>
                <td>
                  <p>You sell</p>
                </td>
                <td>
                  <p>Lock time</p>
                </td>
                <td>
                  <p>Status</p>
                </td>
                <td></td>
              </tr>
            </thead>
            <tbody>
              {!!sortedSwaps.length && sortedSwaps.map((swapId, rowIndex) => {
                return (
                  <SwapRow
                    key={swapId}
                    row={swapsByIds[swapId]}
                    extractSwapStatus={this.extractSwapStatus}
                  />
                )
              })}
              {!sortedSwaps.length && (
                <tr>
                  <td colSpan={6}>empty</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <FAQ
          isDark={isDark}
        />
      </div>
    )
  }
}

export default injectIntl(MarketmakerSettings)
