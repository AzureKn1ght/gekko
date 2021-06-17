/*
	CREATED BY PHILSON
*/

// imports
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var FISHER = require('./indicators/FISHER.js');
var WAE = require('./indicators/WAE.js');
var HMA = require('./indicators/HMA.js');
var ATRStopLoss = require('./indicators/ATRStopLoss.js');

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core stuff
		this.name = 'FisherExplosion';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.prevAction = 'none';

		// define the indicators we need
		this.addIndicator('WAE', 'WAE', this.settings);
		this.addIndicator('FISHER', 'FISHER', this.settings.FISHER);
		this.addIndicator('stoploss', 'ATRStopLoss', this.settings.STOPS);
		this.addIndicator('HMA', 'HMA', this.settings.BASELINE.hma);

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
		let wae = ind.WAE.result;
		let hma = ind.HMA.result;
		let fish = ind.FISHER.fisher;
		let trigger = ind.FISHER.trigger;
		let currentPrice = candle.close;

		// Check whether to stop out
		this.stopLoss();

		//CHECK WHEN TO BUY
		if (this.prevAction !== "buy")
		{
			if (fish > trigger && currentPrice > hma && wae == "BUY")
			{
				this.long(currentPrice);
			}
		}

		//CHECK WHEN TO SELL
		if (this.prevAction !== "sell")
		{
			if (fish < trigger && currentPrice < hma && wae == "SELL")
				this.short();
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

	/* END backtest */
	end: function ()
	{
		log.info('====================================');
		log.info('FisherExplosion.js Ended');
		log.info('====================================');
	}

};

module.exports = strat;