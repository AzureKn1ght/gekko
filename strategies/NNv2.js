var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();

var strategy = {

  init: function ()
  {
    this.name = 'zschro neuralnet with bull bear';
    this.requiredHistory = config.tradingAdvisor.historySize;

    this.addIndicator('maSlow', 'EMA', this.settings.maSlow);
    this.addIndicator('maFast', 'EMA', this.settings.maFast);
    this.market = 'none';
    this.previousAdvice = 'none';

    this.addIndicator('NN', 'SavedNN', this.settings);
    this.addIndicator('zTrailingStop', 'zTrailingStop', this.settings.stoploss_threshold);
    this.bearProfits = 0;
    this.bullProfits = 0;
    this.bearLosses = 0;
    this.bullLosses = 0;
    this.lastBuyPrice = 0;
    this.waitTime = 0
  },

  update: function (candle)
  {
    //Check the trend
    let bullTrend = this.checkTrend();

    // set bull / bear thresholds differently; this part is only to set the modes - no actual trading

    // Trend just changed to BULL
    if (bullTrend && this.market != 'bull')
    {
      this.threshold_sell = this.settings.threshold_sell_bull;
      this.threshold_buy = this.settings.threshold_buy_bull;
      this.market = 'bull';
    }

    // Trend just changed to BEAR
    if (!bullTrend && this.market != 'bear')
    {
      this.threshold_sell = this.settings.threshold_sell_bear;
      this.threshold_buy = this.settings.threshold_buy_bear;
      this.market = 'bear';
    }
  },

  check: function (candle)
  {
    let currentPrice = candle.close;
    let prediction = this.indicators.NN.prediction;
    let predictedPercentChange = (prediction - currentPrice) / currentPrice * 100;

    if (this.waitTime > 0)
    {
      this.waitTime--;
      return;
    }

    log.debug(`
      Current market: ${this.market}
      Percent change predicted: ${predictedPercentChange}
      Current price: ${currentPrice}
      Last buy price: ${this.lastBuyPrice}
      Current position: ${this.previousAdvice}`);

    if (this.indicators.zTrailingStop.shouldSell)
    {
      this.indicators.zTrailingStop.short(currentPrice);
      this.waitTime = 1440;

      if (this.lastBuyPrice < currentPrice)
        this.market == 'bear' ? this.bearProfits++ : this.bullProfits++;
      else
        this.market == 'bear' ? this.bearLosses++ : this.bullLosses++;

      this.previousAdvice = 'short';
      return this.advice('short');
    }

    if ((predictedPercentChange < this.threshold_sell) && this.previousAdvice != 'short')
    {
      this.indicators.zTrailingStop.short(currentPrice);
      if (this.lastBuyPrice < currentPrice)
        this.market == 'bear' ? this.bearProfits++ : this.bullProfits++;
      else
        this.market == 'bear' ? this.bearLosses++ : this.bullLosses++;

      this.previousAdvice = 'short';
      return this.advice('short');
    }
    if (predictedPercentChange > this.threshold_buy && this.previousAdvice != 'long')
    {
      this.indicators.zTrailingStop.long(currentPrice);
      this.lastBuyPrice = currentPrice;
      this.previousAdvice = 'long';
      return this.advice('long');
    }

  },

  // Checks the current trend based on EMA
  checkTrend: function ()
  {
    // get indicators
    let ind = this.indicators;
    let maSlow = ind.maSlow.result;
    let maFast = ind.maFast.result;

    if (!maSlow || !maFast) // Not enough time has passed
      return false;
    else if (maSlow == maFast) // Intersection point
      return false;
    else
      return (maFast > maSlow);
  },

  end: function ()
  {
    log.info("Stoploss triggered: " + this.indicators.zTrailingStop.timesStopped + " times.")
    log.info(`Bear profits: ${this.bearProfits}, Bull profits: ${this.bullProfits}`);
    log.info(`Bear Losses: ${this.bearLosses}, Bull Losses: ${this.bullLosses}`);
  }
};

module.exports = strategy;
