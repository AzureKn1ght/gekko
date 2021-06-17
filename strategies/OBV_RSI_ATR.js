/*
	CREATED BY PHILSON
*/

// imports
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var RSI = require('./indicators/RSI.js');
var ADX = require('./indicators/ADX.js');
var OBVEMA = require('./indicators/OBVEMA.js');
var ATRStopLoss = require('./indicators/ATRStopLoss.js');

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core stuff
		this.name = 'OBV_RSI_ATR';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.prevAction = 'none';

		// Define the indicators we need
		this.addIndicator('stoploss', 'ATRStopLoss', this.settings.STOPS);

		// EMA
		this.addIndicator('maSlow', 'OBVEMA', this.settings.OBVEMA.long);
		this.addIndicator('maFast', 'OBVEMA', this.settings.OBVEMA.short);

		// RSI
		this.addIndicator('BULL_RSI', 'RSI', { interval: this.settings.BULL.rsi });
		this.addIndicator('BEAR_RSI', 'RSI', { interval: this.settings.BEAR.rsi });

		// ADX
		this.addIndicator('ADX', 'ADX', this.settings.ADX.adx);

		// MOD (RSI modifiers)
		this.BULL_MOD_high = this.settings.BULL.mod_high;
		this.BULL_MOD_low = this.settings.BULL.mod_low;
		this.BEAR_MOD_high = this.settings.BEAR.mod_high;
		this.BEAR_MOD_low = this.settings.BEAR.mod_low;

		/* INIT DONE MESSAGE */
		log.info("====================================");
		log.info('Running', this.name);
		log.info('====================================');

	}, // init()


	/* CHECK */
	check: function (candle)
	{
		// Get indicator results
		let ind = this.indicators;
		let currentPrice = candle.close;
		let adx = ind.ADX.result;

		// Check whether to stop out 
		this.stopLoss();

		// Check the trend
		let bullTrend = this.checkTrend();

		// BULL TREND
		if (bullTrend)
		{
			// Get RSI based on BULL values
			rsi = ind.BULL_RSI.result; 
			let rsi_hi = this.settings.BULL.high;
			let rsi_low = this.settings.BULL.low;

			// ADX trend strength modifiers
			if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.BULL_MOD_high;
			else if (adx > this.settings.ADX.low) rsi_low = rsi_low + this.BULL_MOD_low;

			if (rsi > rsi_hi) this.short();
			else if (rsi < rsi_low) this.long(currentPrice);
		}

		// BEAR TREND
		else
		{
			// Get RSI based on BEAR values
			rsi = ind.BEAR_RSI.result; 
			let rsi_hi = this.settings.BEAR.high;
			let rsi_low = this.settings.BEAR.low;

			// ADX trend strength modifiers
			if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.BEAR_MOD_high;
			else if (adx > this.settings.ADX.low) rsi_low = rsi_low + this.BEAR_MOD_low;

			if (rsi > rsi_hi) this.short();
			else if (rsi < rsi_low) this.long(currentPrice);
		}

	}, // check()


	/* LONG */
	long: function (price)
	{
		if (this.prevAction !== 'buy')
		{
			this.prevAction = 'buy';
			let sl = this.indicators.stoploss.long(price);
			log.info('Going long');
			log.info('Stoploss: ' + sl);

			this.advice({
				direction: 'long', 
				trigger: { 
					type: 'trailingStop',
					trailValue: sl
				}
			});

			return this.advice('long');
		}
	},

	/* SHORT */
	short: function ()
	{
		if (this.prevAction !== 'sell')
		{
			this.prevAction = 'sell';
			log.info('Going short');

			return this.advice('short');
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

	// Sell off when stoploss is triggered
	stopLoss: function ()
	{
		// get indicators
		let ind = this.indicators;

		if (ind.stoploss.result === 'stoploss' && this.prevAction === 'buy')
		{
			console.log('>>>>>>>>>> STOPLOSS triggered <<<<<<<<<<');
			this.short();
		}
	},

	/* END backtest */
	end: function ()
	{
		log.info('====================================');
		log.info('OBV_RSI_ATR.js Ended');
		log.info('====================================');
	}

};

module.exports = strat;