/*
	RSI Bull and Bear + ADX modifier
	1. Use different RSI-strategies depending on a longer trend
	2. But modify this slighly if shorter BULL/BEAR is detected
	-
	(CC-BY-SA 4.0) Tommie Hansen
	https://creativecommons.org/licenses/by-sa/4.0/
	-
	NOTE: Requires custom indicators found here:
	https://github.com/Gab0/Gekko-extra-indicators
	(c) Gabriel Araujo
	Howto: Download + add to gekko/strategies/indicators

	MODIFIED BY PHILSON
*/

// imports
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var RSI = require('./indicators/RSI.js');
var EMA = require('./indicators/EMA.js');

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core stuff
		this.name = 'RSI_EMA_STOPS';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.PURCHASE_PRICE = Infinity;
		this.prevAction = 'none';

		// SMA
		this.addIndicator('maSlow', 'EMA', this.settings.EMA.long);
		this.addIndicator('maFast', 'EMA', this.settings.EMA.short);

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

		// EXIT (Take Profit and Stoploss)
		this.TAKE_PROFIT = this.settings.EXIT.take_profit || 100;
		this.HODL = this.settings.EXIT.hodl || 0;	
		let stop_percent = this.settings.EXIT.stop || 0.50;
		this.addIndicator('stoploss', 'StopLoss', {
			threshold: stop_percent
		});


		/* INIT DONE MESSAGE */
		log.info("====================================");
		log.info('Running', this.name);
		log.info('====================================');

	}, // init()


	/* CHECK */
	check: function (candle)
	{

		// Get all indicators
		let ind = this.indicators;
		let currentPrice = candle.close;
		let adx = ind.ADX.result;

		// Check whether to stop out 
		this.stopLoss();

		//Check the trend
		let bullTrend = this.checkTrend();

		// BULL TREND
		if (bullTrend)
		{
			rsi = ind.BULL_RSI.result; //get RSI based on BULL values
			let rsi_hi = this.settings.BULL.high;
			let rsi_low = this.settings.BULL.low;

			// ADX trend strength?
			if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.BULL_MOD_high;
			else if (adx < this.settings.ADX.low) rsi_low = rsi_low + this.BULL_MOD_low;

			if (rsi > rsi_hi) this.short();
			else if (rsi < rsi_low) this.long(currentPrice);
		}

		// BEAR TREND
		else
		{
			// Check whether to take profits
			this.takeProfits(currentPrice);

			rsi = ind.BEAR_RSI.result; //get RSI based on BEAR values
			let rsi_hi = this.settings.BEAR.high;
			let rsi_low = this.settings.BEAR.low;

			// Check whether to HODL (just hodl if it falls below hodl_price!)
			let hodl_price = this.HODL * this.PURCHASE_PRICE;
			let canSell = currentPrice > this.PURCHASE_PRICE || currentPrice < hodl_price;  

			// ADX trend strength?
			if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.BEAR_MOD_high;
			else if (adx < this.settings.ADX.low) rsi_low = rsi_low + this.BEAR_MOD_low;

			if (rsi > rsi_hi && canSell) this.short(); //takes into account the HODL flag
			else if (rsi < rsi_low) this.long(currentPrice);
		}

	}, // check()


	/* LONG */
	long: function (price)
	{
		if (this.prevAction !== 'buy')
		{
			this.prevAction = 'buy';
			this.PURCHASE_PRICE = price;
			this.indicators.stoploss.long(price);
			log.info('Going long');

			return this.advice('long');
		}
	},

	/* SHORT */
	short: function ()
	{
		if (this.prevAction !== 'sell')
		{
			this.prevAction = 'sell';
			this.PURCHASE_PRICE = Infinity;
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
		if
		(	'stoploss' === this.indicators.stoploss.action
			&& this.prevAction === 'buy'
		)
		{
			console.log('>>>>>>>>>> STOPLOSS triggered <<<<<<<<<<');
			this.short();
		}
	},

	// Sell off when profits targets are reached
	takeProfits: function (currentPrice)
	{
		let exit_price = (1 + this.TAKE_PROFIT / 100) * this.PURCHASE_PRICE;

		// Take Profits once target is reached
		if (currentPrice > exit_price)
		{
			console.log("Taking Profits!");
			this.short();
		}
	},

	/* END backtest */
	end: function ()
	{
		log.info('====================================');
		log.info('RSI_EMA_STOPS.js Ended');
		log.info('====================================');
	}

};

module.exports = strat;