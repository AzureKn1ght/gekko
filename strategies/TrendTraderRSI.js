/*
	CREATED BY PHILSON
*/

// imports
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var WAE = require('./indicators/WAE.js');
var ATRStopLoss = require('./indicators/ATRStopLoss.js');

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core stuff
		this.name = 'TrendTraderRSI';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.prevAction = 'none';
		this.buyPrice = Infinity;
		this.uptrend = false;

		// indicators for trend following strat
		this.addIndicator('FISHER', 'FISHER', this.settings.FISHER);
		this.addIndicator('HMA', 'HMA', this.settings.BASELINE.hma);
		this.addIndicator('obvSlow', 'OBVEMA', this.settings.OBVEMA.long);
		this.addIndicator('obvFast', 'OBVEMA', this.settings.OBVEMA.short);
		this.addIndicator('WAE', 'WAE', this.settings);
		this.addIndicator('ADX1', 'ADX', this.settings.ADX.adx);
		this.threshold = this.settings.ADX.threshold;

		// stoploss indicator
		this.addIndicator('stoploss', 'ATRStopLoss', this.settings.STOPS);

		// indicators for reversion to the mean
		this.addIndicator('ADX2', 'ADX', this.settings.CLIMAX.adx);
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
	},


	/* CHECK */
	check: function (candle)
	{
		// Check whether to stop out
		this.stopLoss();

		///////////////////////
		//TREND FOLLOWING STRAT
		///////////////////////
		this.trendTrader(candle);

		/////////////////////////////
		//REVERSION TO THE MEAN STRAT
		/////////////////////////////
		if (this.uptrend)
			this.rsiTrader(candle);
	},


	///////////////////////
	//	TREND TRADER 
	///////////////////////	
	trendTrader: function (candle)
	{
		// Get indicator results
		let ind = this.indicators;
		let adx = ind.ADX1.result;
		let wae = ind.WAE.result;
		let hma = ind.HMA.result;
		let obvSlow = ind.obvSlow.result;
		let obvFast = ind.obvFast.result;
		let fish = ind.FISHER.fisher;
		let trigger = ind.FISHER.trigger;
		let currentPrice = candle.close;

		// Make sense of the results 
		let waddahBuy = ((wae == "BUY") && ind.WAE.risingExplosion && ind.WAE.risingHistogram);
		let waddahSell = ((wae == "SELL") && ind.WAE.risingExplosion && ind.WAE.risingHistogram);
		let priceAboveBaseline = (currentPrice > hma);
		let uptrendOBV = (obvFast > obvSlow);
		let fisherUp = (fish > trigger);
		let adxTrend = (adx > this.threshold);

		//CHECK whether we are trending up
		if (waddahBuy && priceAboveBaseline && uptrendOBV && fisherUp && adxTrend)
		{
			this.uptrend = true;
			if (this.prevAction !== "buy")
				return this.long(currentPrice);
		}

		//CHECK whether we are trending down
		if (waddahSell && !priceAboveBaseline && !uptrendOBV && !fisherUp && adxTrend)
		{
			this.uptrend = false;
			if (this.prevAction !== "sell")
				return this.short();
		}

		return;
	},


	///////////////////////
	//	RSI TRADER 
	///////////////////////	
	rsiTrader: function (candle)
	{
		// Check the short term price trend
		let bullTrend = false;
		let ind = this.indicators;
		let maSlow = ind.maSlow.result;
		let maFast = ind.maFast.result;
		if (!maSlow || !maFast) bullTrend = false;
		else if (maSlow === maFast) bullTrend = false;
		else bullTrend = (maFast > maSlow);

		// Get indicator data
		let adx = ind.ADX2.result;
		let currentPrice = candle.close;

		// BULL TREND
		if (bullTrend)
		{
			// Get RSI based on BULL values
			rsi = ind.BULL_RSI.result;
			let rsi_hi = this.settings.BULL.high;
			let rsi_low = this.settings.BULL.low;

			// ADX trend strength modifiers
			if (adx > this.settings.CLIMAX.high) rsi_hi = rsi_hi + this.BULL_MOD_high;
			if (adx > this.settings.CLIMAX.low) rsi_low = rsi_low + this.BULL_MOD_low;

			if (rsi > rsi_hi && currentPrice > this.buyPrice) return this.short();
			else if (rsi < rsi_low) return this.long(currentPrice);
		}

		// BEAR TREND
		else
		{
			// Get RSI based on BEAR values
			rsi = ind.BEAR_RSI.result;
			let rsi_hi = this.settings.BEAR.high;
			let rsi_low = this.settings.BEAR.low;

			// ADX trend strength modifiers
			if (adx > this.settings.CLIMAX.high) rsi_hi = rsi_hi + this.BEAR_MOD_high;
			if (adx > this.settings.CLIMAX.low) rsi_low = rsi_low + this.BEAR_MOD_low;

			if (rsi > rsi_hi && currentPrice > this.buyPrice) return this.short();
			else if (rsi < rsi_low) return this.long(currentPrice);
		}

		return;
	},


	///////////////////////
	//	HELPER FUNCTIONS
	///////////////////////
	/* LONG */
	long: function (price)
	{
		if (this.prevAction !== 'buy')
		{
			this.prevAction = 'buy';
			let sl = this.indicators.stoploss.long(price);
			log.info('Going long');
			log.info('Stoploss: ' + sl);
			try
			{
				this.advice('long');

				return this.advice({
					direction: 'long',
					trigger: {
						type: 'trailingStop',
						trailValue: sl
					}
				});

			}
			catch (error)
			{
				console.log(error);
				return;
			}
		}
		return;
	},
	/* SHORT */
	short: function ()
	{
		if (this.prevAction !== 'sell')
		{
			this.prevAction = 'sell';
			log.info('Going short');
			try
			{
				return this.advice('short');
			}
			catch (error)
			{
				console.log(error);
				return;
			}
		}
		return;
	},
	/* STOPLOSS */
	stopLoss: function ()
	{
		// get indicators
		let ind = this.indicators;
		// determine if need to short
		if (ind.stoploss.result === 'stoploss' && this.prevAction === 'buy')
		{
			console.log('>>>>>>>>>> STOPLOSS triggered <<<<<<<<<<');
			return this.short();
		}
		return;
	},
	/* END */
	end: function ()
	{
		log.info('====================================');
		log.info('TrendTraderRSI.js Ended');
		log.info('====================================');
	}

};

module.exports = strat;