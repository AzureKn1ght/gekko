/*
	CREATED BY PHILSON
*/

// imports
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var FISHER = require('./indicators/FISHER.js');
var WAE = require('./indicators/WAE.js');
var HMA = require('./indicators/HMA.js');
var RSI = require('./indicators/RSI.js');
var EMA = require('./indicators/EMA.js');
var ATRStopLoss = require('./indicators/ATRStopLoss.js');

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core stuff
		this.name = 'RSIExplosion';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.prevAction = 'none';
		this.buyPrice = Infinity;
		this.uptrend = false;

		// indicators for trend following strat
		this.addIndicator('WAE', 'WAE', this.settings);
		this.addIndicator('FISHER', 'FISHER', this.settings.FISHER);
		this.addIndicator('stoploss', 'ATRStopLoss', this.settings.STOPS);
		this.addIndicator('HMA', 'HMA', this.settings.BASELINE.hma);

		// indicators for reversion to the mean
		this.addIndicator('ADX', 'ADX', this.settings.ADX.adx);
		this.addIndicator('maSlow', 'EMA', this.settings.EMA.long);
		this.addIndicator('maFast', 'EMA', this.settings.EMA.short);
		this.addIndicator('BULL_RSI', 'RSI', { interval: this.settings.BULL.rsi });
		this.addIndicator('BEAR_RSI', 'RSI', { interval: this.settings.BEAR.rsi });

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
		// Check whether to stop out
		this.stopLoss();

		///////////////////////
		//TREND FOLLOWING STRAT
		///////////////////////

		// Get indicator results
		let ind = this.indicators;
		let wae = ind.WAE.result;
		let hma = ind.HMA.result;
		let fish = ind.FISHER.fisher;
		let trigger = ind.FISHER.trigger;
		let currentPrice = candle.close;
		let adx = ind.ADX.result;

		//CHECK whether we are trending up
		if (fish > trigger && currentPrice > hma && wae == "BUY")
		{
			this.uptrend = true;
			if (this.prevAction !== "buy")
				this.long(currentPrice);
		}

		//CHECK whether we are trending down
		if (fish < trigger && currentPrice < hma && wae == "SELL")
		{
			this.uptrend = false;
			if (this.prevAction !== "sell")
				this.short();
		}


		/////////////////////////////
		//REVERSION TO THE MEAN STRAT
		/////////////////////////////
		if (this.uptrend) 
		{
			// Check the short term trend
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
				if (adx > this.settings.ADX.low) rsi_low = rsi_low + this.BULL_MOD_low;

				if (rsi > rsi_hi && currentPrice > this.buyPrice) this.short();
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
				if (adx > this.settings.ADX.low) rsi_low = rsi_low + this.BEAR_MOD_low;

				if (rsi > rsi_hi && currentPrice > this.buyPrice) this.short();
				else if (rsi < rsi_low) this.long(currentPrice);
			}
		}


	}, // check()


	/* LONG */
	long: function (price)
	{
		if (this.prevAction !== 'buy')
		{
			this.prevAction = 'buy';
			this.buyPrice = price;
			let sl = this.indicators.stoploss.long(price);
			log.info('Going long');
			log.info('Stoploss: ' + sl);

			this.advice('long');

			return this.advice({
				direction: 'long',
				trigger: {
					type: 'trailingStop',
					trailValue: sl
				}
			});
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

	// Checks the short term trend based on EMA
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

	/* END backtest */
	end: function ()
	{
		log.info('====================================');
		log.info('RSIExplosion.js Ended');
		log.info('====================================');
	}

};

module.exports = strat;