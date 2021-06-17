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


var convnetjs = require('convnetjs'); //need to npm install this
var math = require('mathjs'); //need to npm install this
var fs = require('fs');
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var SMMA = require('./indicators/SMMA.js'); //need this indicator for NN strat
var RSI = require('./indicators/RSI.js'); //need this indicator for RSI strat
var EMA = require('./indicators/EMA.js'); //uses EMA instead of SMA


// Save trained NN in case server crash
var nndatafile;
var filepath = {
  nnfilepath: __dirname + "/nn_files/"
};


// strategy
var strategy = {

  // Declare NN Variables
  priceBuffer: [],
  predictionCount: 0,
  batchsize: 1,
  layer_neurons: 0,
  layer_activation: 'tanh',
  scale: 1,

  prevAction: 'start',
  prevPrice: Infinity,
  stoplossCounter: 0,


  /* INIT */
  init: function ()
  {
    log.info(this.settings.toString());

    // Init NN Variables
    this.name = 'HYBRIDv2';
    this.requiredHistory = config.tradingAdvisor.historySize;
    this.SMMA = new SMMA(this.settings.NN.SMMA);
    this.nn = new convnetjs.Net();

    // Create the NN
    // If stored file exists, retrieve from file
    nndatafile = filepath.nnfilepath + this.settings.FILE.strat_name + '_trained.js';
    if (fs.existsSync(nndatafile))
    {
      log.debug('Stored NN Exists!');
      this.nn.fromJSON(JSON.parse(fs.readFileSync(nndatafile, 'utf8')));
    }
    else
    {
      let layers = [
        { type: 'input', out_sx: 1, out_sy: 1, out_depth: 1 },
        { type: 'fc', num_neurons: this.layer_neurons, activation: this.layer_activation },
        { type: 'regression', num_neurons: 1 }
      ];

      this.nn.makeLayers(layers);
    }

    this.trainer = new convnetjs.Trainer(this.nn, {
      method: 'adadelta',
      batch_size: 1,
      eps: 1e-6,
      ro: 0.95,
      l2_decay: this.settings.NN.decay
    });

    // Initialize stopless indicator
    this.addIndicator('stoploss', 'StopLoss', {
      threshold: this.settings.TRADE.stoploss_threshold
    });

    // SMA indicators to determine trends
    this.addIndicator('maSlow', 'EMA', this.settings.EMA.long);
    this.addIndicator('maFast', 'EMA', this.settings.EMA.short);

    // RSI
    this.addIndicator('RSI', 'RSI', { interval: this.settings.RSI.rsi });

    // ADX
    this.addIndicator('ADX', 'ADX', this.settings.ADX.adx);

    // MOD (RSI modifiers)
    this.MOD_high = this.settings.RSI.mod_high;
    this.MOD_low = this.settings.RSI.mod_low;

    // HODL and Take Profit Settings
    this.TAKE_PROFIT = this.settings.TRADE.take_profit || 100;

  }, // init()


  /* CHECK */
  check: function (candle)
  {
    // Get all indicators
    let ind = this.indicators;
    let currentPrice = candle.close;

    // Check whether to stop out 
    this.stopLoss();

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
        log.info("RSI says BUY: ", rsi);
        return this.advice('long');
      }
    }

    // BEAR TREND
    else
    {
      // Check whether to take profits
      this.takeProfits(currentPrice);

      // Make price predictions using NN
      let prediction = this.predictCandle() * this.scale;
      let meanp = math.mean(prediction, currentPrice);
      let meanAlpha = (meanp - currentPrice) / currentPrice * 100;
      let signal = meanp < currentPrice;

      // Buy Signal
      if ('buy' !== this.prevAction && signal === false && meanAlpha > this.settings.NN.threshold_buy)
      {
        console.log("Buy - Predicted variation: ", meanAlpha);
        return this.advice('long');
      }

      //Sell Signal
      else if ('sell' !== this.prevAction && signal === true && meanAlpha < this.settings.NN.threshold_sell)
      {
        console.log("Sell - Predicted variation: ", meanAlpha);
        return this.advice('short');
      }

    }

  },// check()


  /* HELPER FUNCTIONS */
  // Used to facilitate operations
  storeNN: function ()
  {
    var fileoutput = JSON.stringify(this.nn.toJSON());
    fs.writeFileSync(nndatafile, fileoutput, function (err)
    {
      if (err) throw err;
      console.log('Learn state saved!');
    });
  },
  onTrade: function (event)
  {
    if ('buy' === event.action)
    {
      this.indicators.stoploss.long(event.price);
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
  stopLoss: function ()
  {
    if
      (
      'buy' === this.prevAction
      && this.settings.TRADE.stoploss_enabled
      && 'stoploss' === this.indicators.stoploss.action
    )
    {
      this.stoplossCounter++;
      console.log('>>>>>>>>>> STOPLOSS triggered <<<<<<<<<<');
      this.advice('short');
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

  /* NN FUNCTIONS */
  // Used to train the neural net 
  learn: function ()
  {
    for (let i = 0; i < this.priceBuffer.length - 1; i++)
    {
      let data = [this.priceBuffer[i]];
      let current_price = [this.priceBuffer[i + 1]];
      let vol = new convnetjs.Vol(data);
      this.trainer.train(vol, current_price);
      this.predictionCount++;
    }
  },
  setNormalizeFactor: function (candle)
  {
    this.scale = Math.pow(10, Math.trunc(candle.high).toString().length + 2);
    log.debug('Set normalization factor to', this.scale);
  },
  update: function (candle)
  {
    this.SMMA.update((candle.high + candle.close + candle.low + candle.vwp) / 4);
    let smmaFast = this.SMMA.result;

    if (1 === this.scale && 1 < candle.high && 0 === this.predictionCount) this.setNormalizeFactor(candle);

    this.priceBuffer.push(smmaFast / this.scale);
    if (2 > this.priceBuffer.length) return;

    for (i = 0; i < 3; ++i)
      this.learn();

    while (this.settings.NN.price_buffer_len < this.priceBuffer.length) this.priceBuffer.shift();
        
    // backup the nn file regularly in case of crash
    this.storeNN();
  },
  predictCandle: function ()
  {
    let vol = new convnetjs.Vol(this.priceBuffer);
    let prediction = this.nn.forward(vol);
    return prediction.w[0];
  },


  /* END */
  // Happens at the end of backtests
  end: function ()
  {
    log.debug("NN output to store: ", JSON.stringify(this.nn.toJSON()));
    this.storeNN();
    log.debug('Triggered stoploss', this.stoplossCounter, 'times');
  }

};

module.exports = strategy;
