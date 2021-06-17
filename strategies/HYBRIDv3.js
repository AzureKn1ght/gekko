/*
	Neural Net Strategy + Take Profits and Crash Recovery

  This is a basic neural network strategy based on gekko-neuralnet
  originally created by SirTificate. I have modified it to optimize 
  the algorithm and add on several features. 
	-
	Created by Philson Nah
	https://www.facebook.com/philson.nah
	-
	NOTE: Requires the following NPM modules to be installed
	npm install convnetjs mathjs
*/


var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var RSI = require('./indicators/RSI.js'); //need this indicator for RSI strat
var EMA = require('./indicators/EMA.js'); //uses EMA instead of SMA


// strategy
var strategy = {

  // Declare Global Variables
  prevAction: 'start',
  prevPrice: Infinity,


  /* INIT */
  init: function ()
  {
    log.info(this.settings.toString());

    // Init Variables
    this.name = 'HYBRIDv3';
    this.requiredHistory = config.tradingAdvisor.historySize;

    // Initialize neuralnet indicator
    this.addIndicator('NN', 'SavedNN', this.settings);

    // Initialize stopless indicator
    this.addIndicator('zTrailingStop', 'zTrailingStop', this.settings.TRADE.stoploss_threshold); //UPDATE TOML

    // EMA indicators to determine trends
    this.addIndicator('maSlow', 'EMA', this.settings.EMA.long);
    this.addIndicator('maFast', 'EMA', this.settings.EMA.short);

    // RSI
    this.addIndicator('RSI', 'RSI', { interval: this.settings.RSI.rsi });

    // ADX
    this.addIndicator('ADX', 'ADX', this.settings.ADX.adx);

    // MOD (RSI modifiers)
    this.MOD_high = this.settings.RSI.mod_high;
    this.MOD_low = this.settings.RSI.mod_low;

    // TRADE Settings
    this.TAKE_PROFIT = this.settings.TRADE.take_profit || 100; //locks in profits in bear trends
    this.ENTRY_GUARD = this.settings.TRADE.entry_guard || -100; //prevents buys in a bull trend when price is predicted to go down x%

  }, // init()


  /* CHECK */
  check: function (candle)
  {
    // Get all indicators
    let ind = this.indicators;
    let currentPrice = candle.close;

    // Get NN price predictions
    let prediction = ind.NN.prediction;
    let predictedPercentChange = (prediction - currentPrice) / currentPrice * 100;

    // Check whether to stop out 
    this.stopLoss(currentPrice);

    //Check the trend
    let bullTrend = this.checkTrend();

    // BULL TREND
    if (bullTrend)
    {
      let adx = ind.ADX.result;
      let rsi = ind.RSI.result;
      let rsi_hi = this.settings.RSI.high;
      let rsi_low = this.settings.RSI.low;

      // Check ADX strength and modify accordingly
      if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.MOD_high;
      else if (adx < this.settings.ADX.low) rsi_low = rsi_low + this.MOD_low;

      if ('sell' !== this.prevAction && rsi > rsi_hi)
      {
        log.info("RSI says SELL: ", rsi);
        return this.advice('short');
      }
      else if ('buy' !== this.prevAction && rsi < rsi_low)
      {
        if (predictedPercentChange > this.ENTRY_GUARD)
        {
          log.info("RSI says BUY: ", rsi);
          return this.advice('long');
        }
      }
    }

    // BEAR TREND
    else
    {
      // Check whether to take profits
      this.takeProfits(currentPrice);

      // Use the NN once it has been trained
      if (this.predictionCount > this.settings.NN.min_predictions)
      {
        // Buy Signal
        if ('buy' !== this.prevAction && predictedPercentChange > this.settings.NN.threshold_buy)
        {
          console.log("Buy - Predicted variation: ", predictedPercentChange);
          return this.advice('long');
        }

        //Sell Signal
        else if ('sell' !== this.prevAction && predictedPercentChange <= this.settings.NN.threshold_sell)
        {
          console.log("Sell - Predicted variation: ", predictedPercentChange);
          return this.advice('short');
        }
      }
    }

  },// check()


  /* HELPER FUNCTIONS */
  // Used to facilitate operations
  onTrade: function (event)
  {
    if ('buy' === event.action)
    {
      this.indicators.zTrailingStop.long(event.price);
    }
    else if ('sell' === event.action)
    {
      this.indicators.zTrailingStop.short(event.price);
    }
    // store the previous action (buy/sell)
    this.prevAction = event.action;
    // store the price of the previous trade
    this.prevPrice = event.price;
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
  stopLoss: function (currentPrice)
  {
    if (this.indicators.zTrailingStop.shouldSell)
    {
      this.indicators.zTrailingStop.short(currentPrice);
      console.log("--- Stoploss Hit ---");
      return this.advice('short');
    }
  },
  takeProfits: function (currentPrice)
  {
    let exit_price = (1 + this.TAKE_PROFIT / 100) * this.prevPrice;

    // Take Profits once target is reached
    if ('buy' === this.prevAction && currentPrice > exit_price)
    {
      console.log("Taking Profits!");
      return this.advice('short');
    }
  },

  /* END */
  end: function ()
  { }

};

module.exports = strategy;
