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

// req's
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var RSI = require('./indicators/RSI.js');
var SMA = require('./indicators/SMA.js');

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core
		this.name = 'RSI Bull and Bear + ADX';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.resetTrend();

		// debug? set to false to disable all logging/messages/stats (improves performance in backtests)
		this.debug = true;

		// performance
		config.backtest.batchSize = 1000; // increase performance
		config.silent = true; // NOTE: You may want to set this to 'false' @ live
		config.debug = false;

		// SMA
		this.addIndicator('maSlow', 'SMA', this.settings.SMA.long);
		this.addIndicator('maFast', 'SMA', this.settings.SMA.short);

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

		// EXIT (Take Profit Percentage)
		this.TAKE_PROFIT = this.settings.EXIT.take_profit;
		this.GUARD = this.settings.EXIT.guard;
		this.PURCHASE_PRICE = Infinity;

		// debug stuff
		this.startTime = new Date();

		// add min/max if debug
		if (this.debug)
		{
			this.stat = {
				adx: { min: 1000, max: 0 },
				bear: { min: 1000, max: 0 },
				bull: { min: 1000, max: 0 }
			};
		}

		/* MESSAGES */

		// message the user about required history
		log.info("====================================");
		log.info('Running', this.name);
		log.info('====================================');

		// warn users
		if (this.requiredHistory < this.settings.SMA_long)
		{
			log.warn("*** WARNING *** Your Warmup period is lower then SMA_long. If Gekko does not download data automatically when running LIVE the strategy will default to BEAR-mode until it has enough data.");
		}

	}, // init()


	/* RESET TREND */
	resetTrend: function ()
	{
		var trend = {
			duration: 0,
			direction: 'none',
			longPos: false,
		};

		this.trend = trend;
	},


	/* get low/high for backtest-period */
	lowHigh: function (val, type)
	{
		let cur;
		if (type == 'bear')
		{
			cur = this.stat.bear;
			if (val < cur.min) this.stat.bear.min = val; // set new
			else if (val > cur.max) this.stat.bear.max = val;
		}
		else if (type == 'bull')
		{
			cur = this.stat.bull;
			if (val < cur.min) this.stat.bull.min = val; // set new
			else if (val > cur.max) this.stat.bull.max = val;
		}
		else
		{
			cur = this.stat.adx;
			if (val < cur.min) this.stat.adx.min = val; // set new
			else if (val > cur.max) this.stat.adx.max = val;
		}
	},


	/* CHECK */
	check: function (candle)
	{
		// get all indicators
		let ind = this.indicators;
		let maSlow = ind.maSlow.result;
		let maFast = ind.maFast.result;
		let rsi;
		let adx = ind.ADX.result;
		let price = candle.close;

		// BEAR TREND
		// NOTE: maFast will always be under maSlow if maSlow can't be calculated
		if (maFast < maSlow)
		{
			rsi = ind.BEAR_RSI.result;
			let rsi_hi = this.settings.BEAR.high;
			let rsi_low = this.settings.BEAR.low;
			let exit_price = (1 + this.TAKE_PROFIT / 100) * this.PURCHASE_PRICE;
			let guard_price = (1 - this.GUARD / 100) * this.PURCHASE_PRICE;
			let canSell = false;

			// Check whether can sell
			if (price > guard_price && maSlow)
				canSell = true;

			// ADX trend strength?
			if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.BEAR_MOD_high;
			else if (adx < this.settings.ADX.low) rsi_low = rsi_low + this.BEAR_MOD_low;

			if (rsi > rsi_hi && canSell) this.short(price);
			else if (price > exit_price)  
			{
				log.info("taking profits!");
				this.short(price); //take profits
			}
			else if (rsi < rsi_low) this.long(price);

			if (this.debug) this.lowHigh(rsi, 'bear');
			//log.debug('\t', 'Bear Trend: ', maFast, maSlow);
		}

		// BULL TREND
		else
		{
			rsi = ind.BULL_RSI.result;
			let rsi_hi = this.settings.BULL.high,
				rsi_low = this.settings.BULL.low;

			// ADX trend strength?
			if (adx > this.settings.ADX.high) rsi_hi = rsi_hi + this.BULL_MOD_high;
			else if (adx < this.settings.ADX.low) rsi_low = rsi_low + this.BULL_MOD_low;

			if (rsi > rsi_hi) this.short(price);
			else if (rsi < rsi_low) this.long(price);
			if (this.debug) this.lowHigh(rsi, 'bull');
			//log.debug('\t', 'Bull Trend: ', maFast, maSlow);
		}

		// add adx low/high if debug
		if (this.debug) this.lowHigh(adx, 'adx');

	}, // check()


	/* LONG */
	long: function (price)
	{
		if (this.trend.direction !== 'up') // new trend? (only act on new trends)
		{
			this.resetTrend();
			this.trend.direction = 'up';
			this.advice('long');
			this.PURCHASE_PRICE = price;

			if (this.debug) log.info('Going long');
		}

		if (this.debug)
		{
			this.trend.duration++;
			//log.info('Long since', this.trend.duration, 'candle(s)');
		}
	},


	/* SHORT */
	short: function (price)
	{
		// new trend? (else do things)
		if (this.trend.direction !== 'down')
		{
			this.resetTrend();
			this.trend.direction = 'down';
			this.advice('short');
			this.PURCHASE_PRICE = Infinity;

			if (this.debug) log.info('Going short');
		}

		if (this.debug)
		{
			this.trend.duration++;
			//log.info('Short since', this.trend.duration, 'candle(s)');
		}
	},


	/* END backtest */
	end: function ()
	{
		let seconds = ((new Date() - this.startTime) / 1000),
			minutes = seconds / 60,
			str;

		minutes < 1 ? str = seconds.toFixed(2) + ' seconds' : str = minutes.toFixed(2) + ' minutes';

		log.info('====================================');
		log.info('Finished in ' + str);
		log.info('====================================');

		// print stats and messages if debug
		if (this.debug)
		{
			let stat = this.stat;
			log.info('BEAR RSI low/high: ' + stat.bear.min + ' / ' + stat.bear.max);
			log.info('BULL RSI low/high: ' + stat.bull.min + ' / ' + stat.bull.max);
			log.info('ADX min/max: ' + stat.adx.min + ' / ' + stat.adx.max);
		}

	}

};

module.exports = strat;